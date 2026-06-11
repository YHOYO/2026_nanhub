/**
 * NaN Cloud Image Generation - Image Routes
 *
 * This module handles image generation, download, and listing.
 * All routes require authentication via API key (Bearer npx_...).
 *
 * Supports optional LLM-based prompt expansion for enhanced image quality.
 */

import { Router } from 'express';
import { Readable } from 'stream';
import crypto from 'crypto';
import SessionManager from './sessionManager.js';
import NaNCloudService from './service.js';
import ImageGeneration from './model.js';
import PromptExpander from './promptExpander.js';
import Request from '../models/Request.js';
import Metric from '../models/Metric.js';
import logger from '../utils/logger.js';
import nanCloudConfig from './config.js';

const router = Router();

/**
 * POST /api/nancloud/images/generate
 * Generate images using NaN Cloud FLUX.2 Klein 9B
 */
router.post('/generate', async (req, res) => {
  const startTime = Date.now();
  let requestId = null;

  try {
    const {
      prompt,
      aspect_ratio = '1:1',
      variants = 1,
      guidance = 3.5,
      reference_images = [],
      enhance_prompt = nanCloudConfig.promptExpansion.enabled,
      prompt_model,
      enhance_mode = 'json',
    } = req.body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROMPT',
          message: 'El prompt es requerido y no puede estar vacío',
        },
      });
    }

    // Validate aspect ratio
    if (!nanCloudConfig.aspectRatios[aspect_ratio]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ASPECT_RATIO',
          message: `Ratio de aspecto no válido. Opciones: ${Object.keys(nanCloudConfig.aspectRatios).join(', ')}`,
        },
      });
    }

    // Validate variants
    const variantsNum = Math.min(Math.max(parseInt(variants) || 1, 1), 10);
    const referenceIds = Array.isArray(reference_images) 
      ? reference_images.slice(0, nanCloudConfig.maxReferenceImages)
      : [];

    // Check if NaN Cloud session is valid (check DB first, then ENV variable)
    let sessionStatus = SessionManager.getStatus();
    if (!sessionStatus.has_session || sessionStatus.is_expired) {
      // Fallback: check ENV variable directly (for containerized deployments)
      if (process.env.NAN_CLOUD_SESSION_COOKIE) {
        const jwtData = SessionManager.parseJWT(process.env.NAN_CLOUD_SESSION_COOKIE);
        if (jwtData && new Date(jwtData.expiresAt) > new Date()) {
          sessionStatus = {
            has_session: true,
            is_expired: false,
            username: jwtData.username,
            email: jwtData.email,
            expires_at: jwtData.expiresAt,
            source: 'env',
          };
        }
      }
    }
    if (!sessionStatus.has_session || sessionStatus.is_expired) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No hay sesión válida de NaN Cloud. Renueva la sesión primero.',
          instructions: 'POST /api/nancloud/auth/set-session',
        },
      });
    }

    // Create request record for tracking
    const requestDbId = Request.create({
      method: 'POST',
      endpoint: '/api/nancloud/images/generate',
      apiKeyHash: req.headers.authorization?.replace('Bearer ', '') || null,
      clientIp: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestBody: req.body || null,
      projectId: req.projectId || null,
    });
    requestId = requestDbId;

    // ============================================================
    // PHASE 1: Optional LLM Prompt Expansion
    // ============================================================
    let finalPrompt = prompt.trim();
    let expansionResult = null;

    if (enhance_prompt && nanCloudConfig.promptExpansion.enabled) {
      try {
        logger.info('Expanding prompt via LLM', {
          model: prompt_model || nanCloudConfig.promptExpansion.defaultModel,
          mode: enhance_mode,
          inputLength: prompt.trim().length,
        });

        expansionResult = await PromptExpander.expandPrompt(prompt.trim(), {
          model: prompt_model,
          mode: enhance_mode,
        });

        finalPrompt = expansionResult.expandedPrompt;

        logger.info('Prompt expansion completed', {
          model: expansionResult.model,
          inputLength: prompt.trim().length,
          outputLength: finalPrompt.length,
          elapsedMs: expansionResult.elapsedMs,
          tokens: expansionResult.tokens,
        });
      } catch (expansionError) {
        // If expansion fails, fall back to the original prompt
        logger.error('Prompt expansion failed, using original prompt', {
          error: expansionError.message,
          fallbackMode: nanCloudConfig.promptExpansion.fallbackMode,
        });

        if (nanCloudConfig.promptExpansion.fallbackMode === 'passthrough') {
          finalPrompt = prompt.trim();
          expansionResult = { error: expansionError.message, fallback: true };
        } else {
          throw expansionError;
        }
      }
    }

    // ============================================================
    // PHASE 2: Image Generation via FLUX.2
    // ============================================================
    const nanResponse = await NaNCloudService.generateImages({
      prompt: finalPrompt,
      aspectRatio: aspect_ratio,
      variants: variantsNum,
      guidance,
      referenceImageIds: referenceIds,
    });

    // Get image files and store in our database
    const images = [];
    if (nanResponse.images && nanResponse.images.length > 0) {
      for (const nanImage of nanResponse.images) {
        // Store image record in our database
        const dbImageId = ImageGeneration.create({
          requestId: requestId,
          projectId: req.projectId || null,
          nanImageId: nanImage.id,
          prompt: nanImage.prompt,
          width: nanImage.width,
          height: nanImage.height,
          model: nanImage.model,
          seed: nanImage.seed,
          sizeBytes: nanImage.sizeBytes,
          // Prompt expansion tracking fields
          originalPrompt: prompt.trim(),
          expandedPrompt: expansionResult && !expansionResult.error && !expansionResult.fallback
            ? expansionResult.expandedPrompt : null,
          expansionModel: expansionResult && !expansionResult.error && !expansionResult.fallback
            ? expansionResult.model : null,
          expansionMode: expansionResult && !expansionResult.error && !expansionResult.fallback
            ? expansionResult.mode : null,
          expansionTimeMs: expansionResult && !expansionResult.error && !expansionResult.fallback
            ? expansionResult.elapsedMs : null,
          expansionTokens: expansionResult && !expansionResult.error && !expansionResult.fallback
            ? expansionResult.tokens?.total || 0 : 0,
        });

        images.push({
          id: nanImage.id,
          db_id: dbImageId,
          url: `/api/nancloud/images/${nanImage.id}/file`,
          width: nanImage.width,
          height: nanImage.height,
          model: nanImage.model,
          prompt: nanImage.prompt,
          seed: nanImage.seed,
          size_bytes: nanImage.sizeBytes,
          created_at: nanImage.createdAt,
        });
      }
    }

    const responseTimeMs = Date.now() - startTime;

    // Update request record with response data
    Request.updateResponse(requestId, {
      responseStatus: 201,
      responseBody: { model: 'flux-2-klein-9b', images_count: images.length },
      responseTimeMs,
      tokensPrompt: 0,
      tokensCompletion: 0,
      tokensTotal: 0,
      model: 'flux-2-klein-9b',
      errorMessage: null,
    });

    // Update daily metrics
    try {
      Metric.upsert({
        date: new Date().toISOString().split('T')[0],
        projectId: req.projectId,
        model: 'flux-2-klein-9b',
        endpoint: '/api/nancloud/images/generate',
        totalRequests: 1,
        totalTokens: 0,
        tokensPrompt: 0,
        tokensCompletion: 0,
        avgResponseTimeMs: responseTimeMs,
        errorRate: 0,
      });
    } catch (metricError) {
      logger.error('Failed to upsert metric', { error: metricError.message });
    }

    logger.info('Images generated successfully', {
      projectId: req.projectId,
      count: images.length,
      responseTimeMs,
    });

    res.status(201).json({
      success: true,
      data: {
        images,
        quota: {
          total: nanCloudConfig.monthlyQuota,
          used: nanResponse.used || 0,
          remaining: nanCloudConfig.monthlyQuota - (nanResponse.used || 0),
        },
        request_id: nanResponse.requestId,
      },
      // Include prompt expansion metadata when enhancement was used
      ...(expansionResult && !expansionResult.error && !expansionResult.fallback ? {
        prompt_expansion: {
          enabled: true,
          model: expansionResult.model,
          mode: expansionResult.mode,
          original_prompt: prompt.trim(),
          expanded_prompt: expansionResult.expandedPrompt,
          structured_data: expansionResult.structuredData,
          tokens: expansionResult.tokens,
          expansion_time_ms: expansionResult.elapsedMs,
        },
      } : expansionResult?.fallback ? {
        prompt_expansion: {
          enabled: true,
          model: null,
          original_prompt: prompt.trim(),
          expanded_prompt: null,
          fallback: true,
          error: expansionResult.error,
        },
      } : {}),
      tracking: {
        project_id: req.projectId,
        nanhub_request_id: requestId,
        response_time_ms: responseTimeMs,
      },
    });
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    logger.error('Image generation failed', {
      error: error.message,
      responseTimeMs,
    });

    // Update request record with error
    if (requestId) {
      Request.updateResponse(requestId, {
        responseStatus: error.status || 500,
        responseBody: null,
        responseTimeMs,
        tokensPrompt: 0,
        tokensCompletion: 0,
        tokensTotal: 0,
        model: 'flux-2-klein-9b',
        errorMessage: error.message,
      });

      // Update error metrics
      try {
        Metric.upsert({
          date: new Date().toISOString().split('T')[0],
          projectId: req.projectId,
          model: 'flux-2-klein-9b',
          endpoint: '/api/nancloud/images/generate',
          totalRequests: 1,
          totalTokens: 0,
          tokensPrompt: 0,
          tokensCompletion: 0,
          avgResponseTimeMs: responseTimeMs,
          errorRate: 100,
        });
      } catch (metricError) {
        logger.error('Failed to upsert error metric', { error: metricError.message });
      }
    }

    // Handle specific error types
    if (error.message?.includes('NO_SESSION')) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'La sesión de NaN Cloud ha expirado. Renueva la sesión.',
          instructions: 'POST /api/nancloud/auth/request-login',
        },
      });
    }

    res.status(error.status || 500).json({
      success: false,
      error: {
        code: 'GENERATION_FAILED',
        message: 'Error al generar las imágenes',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/images/:id/file
 * Download image file from NaN Cloud
 */
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's a NaN Cloud image ID or our DB ID
    let nanImageId = id;

    // Try to find in our database first
    const dbImage = ImageGeneration.findByNanImageId(id);
    if (!dbImage) {
      // Try by our DB ID
      const dbImageById = ImageGeneration.findById(id);
      if (dbImageById) {
        nanImageId = dbImageById.nan_image_id;
      }
    }

    // Get image file from NaN Cloud
    const response = await NaNCloudService.getImageFile(nanImageId);

    // Check if response is a Response object
    if (response instanceof Response) {
      // Stream the response
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const contentLength = response.headers.get('content-length');
      const contentDisposition = response.headers.get('content-disposition');

      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      }

      // Convert ReadableStream to Node.js stream and pipe
      const reader = response.body.getReader();
      const stream = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(Buffer.from(value));
            }
          } catch (err) {
            this.destroy(err);
          }
        },
      });

      stream.pipe(res);
    } else {
      // If it's already a buffer or other data
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(response);
    }
  } catch (error) {
    logger.error('Failed to download image', {
      id: req.params.id,
      error: error.message,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        code: 'DOWNLOAD_FAILED',
        message: 'Error al descargar la imagen',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/images/grouped
 * List images grouped by request_id (for gallery display)
 */
router.get('/grouped', (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
    } = req.query;

    const filters = {
      projectId: req.projectId,
    };

    const page = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const limitNum = Math.min(parseInt(limit) || 20, 50);

    const result = ImageGeneration.findGroupedByRequestId(filters, page, limitNum);

    // Get quota stats
    const quotaStats = ImageGeneration.getQuotaStats();

    res.json({
      success: true,
      data: {
        groups: result.data,
        total: result.pagination.total,
        limit: limitNum,
        offset: parseInt(offset) || 0,
        page: result.pagination.page,
        total_pages: result.pagination.totalPages,
        quota: {
          total: nanCloudConfig.monthlyQuota,
          used: quotaStats.totalImages || 0,
          remaining: nanCloudConfig.monthlyQuota - (quotaStats.totalImages || 0),
          total_generations: quotaStats.totalGenerations || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to list grouped images', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'GROUPED_LIST_FAILED',
        message: 'Error al listar imágenes agrupadas',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/images
 * List images (from our database)
 */
router.get('/', (req, res) => {
  try {
    const {
      limit = 24,
      offset = 0,
      prompt,
      start_date,
      end_date,
    } = req.query;

    const filters = {
      projectId: req.projectId,
    };

    if (prompt) {
      filters.prompt = prompt;
    }

    if (start_date) {
      filters.startDate = start_date;
    }

    if (end_date) {
      filters.endDate = end_date;
    }

    const page = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const limitNum = Math.min(parseInt(limit) || 24, 100);

    const result = ImageGeneration.findAll(filters, page, limitNum);

    res.json({
      success: true,
      data: {
        images: result.data.map(img => ({
          id: img.nan_image_id,
          db_id: img.id,
          prompt: img.prompt,
          original_prompt: img.original_prompt || null,
          expanded_prompt: img.expanded_prompt || null,
          expansion_model: img.expansion_model || null,
          expansion_mode: img.expansion_mode || null,
          expansion_time_ms: img.expansion_time_ms || null,
          expansion_tokens: img.expansion_tokens || 0,
          width: img.width,
          height: img.height,
          model: img.model,
          seed: img.seed,
          size_bytes: img.size_bytes,
          created_at: img.created_at,
        })),
        total: result.pagination.total,
        limit: limitNum,
        offset: parseInt(offset) || 0,
        page: result.pagination.page,
        total_pages: result.pagination.totalPages,
      },
    });
  } catch (error) {
    logger.error('Failed to list images', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_FAILED',
        message: 'Error al listar las imágenes',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/images/expand-prompt
 * Preview prompt expansion without generating images (for debugging/testing)
 */
router.post('/expand-prompt', async (req, res) => {
  try {
    const {
      prompt,
      model,
      mode = 'json',
    } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROMPT',
          message: 'El prompt es requerido para la expansión',
        },
      });
    }

    const startTime = Date.now();

    const result = await PromptExpander.expandPrompt(prompt.trim(), {
      model,
      mode,
    });

    const totalMs = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        original_prompt: prompt.trim(),
        expanded_prompt: result.expandedPrompt,
        structured_data: result.structuredData,
        model: result.model,
        mode: result.mode,
        tokens: result.tokens,
        expansion_time_ms: result.elapsedMs,
        total_time_ms: totalMs,
      },
    });
  } catch (error) {
    logger.error('Prompt expansion preview failed', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'EXPANSION_FAILED',
        message: 'Error al expandir el prompt',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/images/expansion-status
 * Check if the prompt expansion service is available
 */
router.get('/expansion-status', async (req, res) => {
  try {
    const status = await PromptExpander.healthCheck();

    res.json({
      success: true,
      data: {
        ...status,
        config: {
          enabled: nanCloudConfig.promptExpansion.enabled,
          default_model: nanCloudConfig.promptExpansion.defaultModel,
          available_models: nanCloudConfig.promptExpansion.availableModels,
          timeout_ms: nanCloudConfig.promptExpansion.timeout,
          fallback_mode: nanCloudConfig.promptExpansion.fallbackMode,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_CHECK_FAILED',
        message: 'Error al verificar el estado del expansor',
        details: error.message,
      },
    });
  }
});

export default router;
