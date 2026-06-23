import crypto from 'crypto';
import Request from '../models/Request.js';
import Metric from '../models/Metric.js';
import timeQuantizer from './timeQuantizer.js';
import logger from '../utils/logger.js';

/**
 * Request Interceptor - captures and stores all API request data
 * Enhanced with cache metrics and token flow tracking
 */
class RequestInterceptor {
  constructor() {
    this.pendingRequests = new Map();
    // Track response times per endpoint for cache hit detection
    this.endpointResponseTimes = new Map();
  }

  /**
   * Start intercepting a request
   */
  startCapture(req) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    const captureData = {
      id: requestId,
      method: req.method,
      endpoint: req.originalUrl || req.url,
      apiKeyHash: req.headers.authorization?.replace('Bearer ', '') || null,
      clientIp: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestBody: req.body || null,
      projectId: req.projectId || null,
      startTime,
      req, // Keep reference to request for metadata access
    };

    this.pendingRequests.set(requestId, captureData);

    // Store request in database
    const dbId = Request.create({
      method: captureData.method,
      endpoint: captureData.endpoint,
      apiKeyHash: captureData.apiKeyHash,
      clientIp: captureData.clientIp,
      userAgent: captureData.userAgent,
      requestBody: captureData.requestBody,
      projectId: captureData.projectId,
    });

    captureData.dbId = dbId;

    logger.proxy('Request captured', {
      requestId,
      method: captureData.method,
      endpoint: captureData.endpoint,
    });

    return requestId;
  }

  /**
   * Complete request capture with response data
   * Enhanced with cache metrics and token flow tracking
   */
  completeCapture(requestId, responseData) {
    const captureData = this.pendingRequests.get(requestId);

    if (!captureData) {
      logger.warn('Request not found for completion', { requestId });
      return null;
    }

    const responseTimeMs = Date.now() - captureData.startTime;

    // Parse response body for token counts
    let tokensPrompt = 0;
    let tokensCompletion = 0;
    let tokensTotal = 0;
    let model = null;

    if (responseData.body) {
      try {
        const body = typeof responseData.body === 'string'
          ? JSON.parse(responseData.body)
          : responseData.body;

        if (body.usage) {
          tokensPrompt = body.usage.prompt_tokens || 0;
          tokensCompletion = body.usage.completion_tokens || 0;
          tokensTotal = body.usage.total_tokens || 0;
        }

        if (body.model) {
          model = body.model;
        }
      } catch (e) {
        // Response body might not be JSON (e.g., streaming)
      }
    }

    // Extract cache/quantization metadata from request
    const quantizationMetadata = captureData.req?.quantizationMetadata || null;
    const quantizationBlock = quantizationMetadata?.quantizationBlock || null;
    const originalTimestamp = quantizationMetadata?.originalTimestamp || null;
    const tokensRequestSent = quantizationMetadata?.tokensAfter || 0;
    const tokensResponseReceived = tokensTotal;

    // Detect cache hit based on response time
    const cacheDetection = this._detectCacheHit(captureData.endpoint, responseTimeMs);
    const cacheHit = cacheDetection.hit ? 1 : 0;
    const cacheHitConfidence = cacheDetection.confidence || 0;

    // Update request in database
    Request.updateResponse(captureData.dbId, {
      responseStatus: responseData.status,
      responseBody: responseData.body,
      responseTimeMs,
      tokensPrompt,
      tokensCompletion,
      tokensTotal,
      model,
      errorMessage: responseData.error || null,
      // Cache metrics
      tokensRequestSent,
      tokensResponseReceived,
      originalTimestamp,
      quantizationBlock,
      cacheHit,
      cacheHitConfidence,
    });

    // Update daily metrics in real-time
    try {
      Metric.upsert({
        date: new Date().toISOString().split('T')[0],
        projectId: captureData.projectId,
        model: model || 'unknown',
        endpoint: captureData.endpoint,
        totalRequests: 1,
        totalTokens: tokensTotal,
        tokensPrompt,
        tokensCompletion,
        avgResponseTimeMs: responseTimeMs,
        errorRate: responseData.status >= 400 ? 100 : 0,
        // Cache metrics
        cacheHit,
        cacheHitConfidence,
      });
    } catch (metricError) {
      logger.error('Failed to upsert metric', { error: metricError.message });
    }

    // Clean up
    this.pendingRequests.delete(requestId);

    logger.proxy('Request completed', {
      requestId,
      status: responseData.status,
      responseTimeMs,
      tokensTotal,
      model,
      quantizationBlock,
      cacheHit: cacheDetection.hit,
      cacheConfidence: cacheDetection.confidence,
    });

    return {
      ...captureData,
      responseTimeMs,
      tokensTotal,
      model,
      quantizationBlock,
      cacheHit: cacheDetection.hit,
    };
  }

  /**
   * Detect cache hit based on response time comparison
   * @param {string} endpoint - The API endpoint
   * @param {number} responseTimeMs - Current response time
   * @returns {object} Detection result
   */
  _detectCacheHit(endpoint, responseTimeMs) {
    // Track response times per endpoint
    if (!this.endpointResponseTimes.has(endpoint)) {
      this.endpointResponseTimes.set(endpoint, []);
    }
    
    const times = this.endpointResponseTimes.get(endpoint);
    times.push(responseTimeMs);
    
    // Keep only last 20 responses for averaging
    if (times.length > 20) {
      times.shift();
    }
    
    // Need at least 3 responses for reliable detection
    if (times.length < 3) {
      return { hit: false, confidence: 0, reason: 'insufficient_data' };
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    
    // If current response is < 50% of average, likely cache hit
    if (avgTime > 0) {
      const ratio = responseTimeMs / avgTime;
      if (ratio < 0.3) {
        return { hit: true, confidence: 0.95, reason: 'very_fast' };
      } else if (ratio < 0.5) {
        return { hit: true, confidence: 0.8, reason: 'fast' };
      } else if (ratio < 0.7) {
        return { hit: true, confidence: 0.5, reason: 'moderate' };
      }
    }
    
    return { hit: false, confidence: 0, reason: 'normal' };
  }

  /**
   * Handle streaming response (for SSE)
   * Enhanced with cache metrics and token flow tracking
   */
  handleStreamingResponse(requestId, chunks) {
    const captureData = this.pendingRequests.get(requestId);

    if (!captureData) {
      return null;
    }

    // Concatenate all chunks and try to parse final response
    const fullResponse = chunks.join('');

    // Try to extract usage from the last complete SSE message
    let tokensPrompt = 0;
    let tokensCompletion = 0;
    let tokensTotal = 0;
    let model = null;

    // Look for [DONE] marker and extract usage if available
    const lines = fullResponse.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.usage) {
            tokensPrompt = data.usage.prompt_tokens || 0;
            tokensCompletion = data.usage.completion_tokens || 0;
            tokensTotal = data.usage.total_tokens || 0;
          }
          if (data.model) {
            model = data.model;
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }
    }

    const responseTimeMs = Date.now() - captureData.startTime;

    // Extract cache/quantization metadata from request
    const quantizationMetadata = captureData.req?.quantizationMetadata || null;
    const quantizationBlock = quantizationMetadata?.quantizationBlock || null;
    const originalTimestamp = quantizationMetadata?.originalTimestamp || null;
    const tokensRequestSent = quantizationMetadata?.tokensAfter || 0;

    // Detect cache hit based on response time
    const cacheDetection = this._detectCacheHit(captureData.endpoint, responseTimeMs);
    const cacheHit = cacheDetection.hit ? 1 : 0;
    const cacheHitConfidence = cacheDetection.confidence || 0;

    // Update request in database
    Request.updateResponse(captureData.dbId, {
      responseStatus: 200,
      responseBody: null, // Don't store full streaming response
      responseTimeMs,
      tokensPrompt,
      tokensCompletion,
      tokensTotal,
      model,
      errorMessage: null,
      // Cache metrics
      tokensRequestSent,
      tokensResponseReceived: tokensTotal,
      originalTimestamp,
      quantizationBlock,
      cacheHit,
      cacheHitConfidence,
    });

    // Update daily metrics in real-time
    try {
      Metric.upsert({
        date: new Date().toISOString().split('T')[0],
        projectId: captureData.projectId,
        model: model || 'unknown',
        endpoint: captureData.endpoint,
        totalRequests: 1,
        totalTokens: tokensTotal,
        tokensPrompt,
        tokensCompletion,
        avgResponseTimeMs: responseTimeMs,
        errorRate: 0, // Streaming responses are typically successful
        // Cache metrics
        cacheHit,
        cacheHitConfidence,
      });
    } catch (metricError) {
      logger.error('Failed to upsert streaming metric', { error: metricError.message });
    }

    // Clean up
    this.pendingRequests.delete(requestId);

    logger.proxy('Streaming request completed', {
      requestId,
      responseTimeMs,
      tokensTotal,
      model,
      quantizationBlock,
      cacheHit: cacheDetection.hit,
    });

    return {
      ...captureData,
      responseTimeMs,
      tokensTotal,
      model,
      quantizationBlock,
      cacheHit: cacheDetection.hit,
    };
  }

  /**
   * Get pending requests count
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }
}

export default new RequestInterceptor();