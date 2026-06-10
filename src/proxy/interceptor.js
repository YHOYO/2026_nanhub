import Request from '../models/Request.js';
import Metric from '../models/Metric.js';
import logger from '../utils/logger.js';

/**
 * Request Interceptor - captures and stores all API request data
 */
class RequestInterceptor {
  constructor() {
    this.pendingRequests = new Map();
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
    });

    // Clean up
    this.pendingRequests.delete(requestId);

    logger.proxy('Request completed', {
      requestId,
      status: responseData.status,
      responseTimeMs,
      tokensTotal,
      model,
    });

    return {
      ...captureData,
      responseTimeMs,
      tokensTotal,
      model,
    };
  }

  /**
   * Handle streaming response (for SSE)
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
    });

    // Clean up
    this.pendingRequests.delete(requestId);

    logger.proxy('Streaming request completed', {
      requestId,
      responseTimeMs,
      tokensTotal,
      model,
    });

    return {
      ...captureData,
      responseTimeMs,
      tokensTotal,
      model,
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