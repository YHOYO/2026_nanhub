import { createProxyMiddleware } from 'http-proxy-middleware';
import interceptor from './interceptor.js';
import compressor from './compressor.js';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import ProjectApiKey from '../models/ProjectApiKey.js';

/**
 * Create and configure the proxy middleware
 */
export function createProxy() {
  const proxyMiddleware = createProxyMiddleware({
    target: config.nanApiBaseUrl,
    changeOrigin: true,
    timeout: config.proxyTimeout,
    proxyTimeout: config.proxyTimeout,

    // Handle errors
    onError(err, req, res) {
      logger.error('Proxy error', { error: err.message, url: req.url });
      
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            message: 'Proxy error: Unable to reach NaN API',
            type: 'proxy_error',
            code: 'PROXY_ERROR',
          },
        });
      }
    },

    // Replace client API key with server API key before forwarding
    onProxyReq(proxyReq, req, res) {
      // Replace Authorization header: client's npx_ key → server's sk- key
      proxyReq.setHeader('Authorization', `Bearer ${config.nanApiKey}`);

      logger.proxy('Forwarding request', {
        method: req.method,
        url: req.url,
        target: config.nanApiBaseUrl,
      });
    },

    onProxyRes(proxyRes, req, res) {
      logger.proxy('Received response', {
        statusCode: proxyRes.statusCode,
        url: req.url,
      });
    },
  });

  return proxyMiddleware;
}

/**
 * Authentication middleware - validates API keys from project_api_keys table
 * Must run before interceptMiddleware for /v1/* routes
 */
export function authMiddleware(req, res, next) {
  // Skip auth for admin panel, API routes, and health check
  if (req.url.startsWith('/admin') || req.url.startsWith('/api') || req.url === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid Authorization header', { url: req.url });
    return res.status(401).json({
      error: {
        message: 'Missing or invalid API key. Use Authorization: Bearer npx_...',
        type: 'authentication_error',
        code: 'INVALID_API_KEY',
      },
    });
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyInfo = ProjectApiKey.validate(apiKey);

  if (!keyInfo) {
    logger.warn('Invalid or expired API key', { url: req.url });
    return res.status(401).json({
      error: {
        message: 'Invalid or expired API key',
        type: 'authentication_error',
        code: 'INVALID_API_KEY',
      },
    });
  }

  // Attach project info to the request for the interceptor
  req.projectId = keyInfo.projectId;
  req.projectKeyId = keyInfo.id;
  req.projectKeyName = keyInfo.name;

  logger.proxy('API key validated', {
    projectId: keyInfo.projectId,
    keyName: keyInfo.name,
    url: req.url,
  });

  next();
}

/**
 * Middleware to intercept requests before proxying
 */
export function interceptMiddleware(req, res, next) {
  // Skip interception for admin panel and API routes
  if (req.url.startsWith('/admin') || req.url.startsWith('/api') || req.url === '/health') {
    return next();
  }

  // Start capturing request data
  const requestId = interceptor.startCapture(req);
  req.requestId = requestId;

  // Capture original res.json and res.send to intercept response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let responseCaptured = false;

  res.json = function(data) {
    if (!responseCaptured) {
      responseCaptured = true;
      interceptor.completeCapture(requestId, {
        status: res.statusCode,
        body: data,
        error: res.statusCode >= 400 ? data?.error?.message : null,
      });
    }
    return originalJson(data);
  };

  res.send = function(data) {
    if (!responseCaptured) {
      responseCaptured = true;
      let body = data;
      
      // Try to parse if it's a string
      if (typeof data === 'string') {
        try {
          body = JSON.parse(data);
        } catch (e) {
          body = data;
        }
      }

      interceptor.completeCapture(requestId, {
        status: res.statusCode,
        body,
        error: res.statusCode >= 400 ? body?.error?.message : null,
      });
    }
    return originalSend(data);
  };

  // Handle stream completion
  const originalEnd = res.end.bind(res);
  res.end = function(...args) {
    if (!responseCaptured) {
      responseCaptured = true;
      interceptor.completeCapture(requestId, {
        status: res.statusCode,
        body: null,
        error: null,
      });
    }
    return originalEnd(...args);
  };

  next();
}

/**
 * Compression middleware - compresses context before proxying
 * Applied to /v1/chat/completions only
 */
export async function compressionMiddleware(req, res, next) {
  // Only compress chat completions requests
  if (req.method === 'POST' && req.url === '/chat/completions') {
    try {
      if (req.body && req.body.messages) {
        const originalMsgCount = req.body.messages.length;
        req.body = await compressor.compress(req.body);
        const compressedMsgCount = req.body.messages.length;
        
        if (originalMsgCount !== compressedMsgCount) {
          logger.info('Messages compressed', {
            original: originalMsgCount,
            compressed: compressedMsgCount,
            phase: compressor.getPhase(),
          });
        }
      }
    } catch (error) {
      logger.error('Compression error, passing through', { error: error.message });
      // Don't block the request on compression errors
    }
  }
  next();
}

/**
 * Health check endpoint
 */
export function healthCheck(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pendingRequests: interceptor.getPendingCount(),
    phase: compressor.getPhase(),
  });
}

/**
 * Stats endpoint - proxy metrics and compression stats
 */
export function statsEndpoint(req, res) {
  try {
    const compressionStats = compressor.getStats();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pendingRequests: interceptor.getPendingCount(),
      compression: compressionStats,
      config: {
        phase: config.phase,
        target: config.nanApiBaseUrl,
        port: config.port,
      },
    });
  } catch (error) {
    logger.error('Failed to get stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

/**
 * GET /v1/models - passthrough to NaN API
 */
export async function modelsPassthrough(req, res) {
  try {
    const response = await fetch(`${config.nanApiBaseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.nanApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('Models passthrough error', { error: error.message });
    res.status(502).json({
      error: {
        message: 'Failed to fetch models from NaN API',
        type: 'proxy_error',
        code: 'PROXY_ERROR',
      },
    });
  }
}

/**
 * POST /v1/embeddings - passthrough to NaN API
 */
export async function embeddingsPassthrough(req, res) {
  try {
    const response = await fetch(`${config.nanApiBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.nanApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('Embeddings passthrough error', { error: error.message });
    res.status(502).json({
      error: {
        message: 'Failed to forward embeddings request to NaN API',
        type: 'proxy_error',
        code: 'PROXY_ERROR',
      },
    });
  }
}

/**
 * POST /v1/index/upload - Upload files for RAG indexing
 */
export function indexUpload(req, res) {
  try {
    const { filePath, content, metadata } = req.body;

    if (!filePath || !content) {
      return res.status(400).json({
        error: {
          message: 'filePath and content are required',
          type: 'validation_error',
          code: 'MISSING_FIELDS',
        },
      });
    }

    compressor.addFileToIndex(filePath, content, metadata);

    res.json({
      success: true,
      message: `File indexed: ${filePath}`,
      indexStatus: compressor.getIndexStatus(),
    });
  } catch (error) {
    logger.error('Index upload error', { error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to index file',
        type: 'internal_error',
        code: 'INDEX_ERROR',
      },
    });
  }
}

/**
 * GET /v1/index/status - Get RAG index status
 */
export function indexStatus(req, res) {
  try {
    const status = compressor.getIndexStatus();
    res.json(status);
  } catch (error) {
    logger.error('Index status error', { error: error.message });
    res.status(500).json({ error: 'Failed to get index status' });
  }
}

/**
 * POST /v1/index/search - Search the RAG index
 */
export function indexSearch(req, res) {
  try {
    const { query, maxResults } = req.body;

    if (!query) {
      return res.status(400).json({
        error: {
          message: 'query is required',
          type: 'validation_error',
          code: 'MISSING_FIELDS',
        },
      });
    }

    const results = compressor.searchIndex(query, maxResults || 5);

    res.json({
      query,
      results,
      totalResults: results.length,
    });
  } catch (error) {
    logger.error('Index search error', { error: error.message });
    res.status(500).json({ error: 'Failed to search index' });
  }
}
