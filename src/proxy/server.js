import { createProxyMiddleware } from 'http-proxy-middleware';
import interceptor from './interceptor.js';
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

      // Re-serialize body if express.json() already consumed the stream
      // http-proxy-middleware uses req.pipe(proxyReq) internally, but the stream
      // is exhausted after body parsing. We must write the body manually.
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }

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

  // Detect if this is a streaming request
  const isStreaming = req.body && req.body.stream === true;

  // Accumulate SSE chunks for streaming responses
  const streamingChunks = [];

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

  // For streaming: intercept res.write to accumulate SSE chunks
  if (isStreaming) {
    const originalWrite = res.write.bind(res);
    res.write = function(chunk, ...rest) {
      if (!responseCaptured) {
        try {
          const str = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
          streamingChunks.push(str);
        } catch (e) {
          // Ignore chunk parsing errors
        }
      }
      return originalWrite(chunk, ...rest);
    };
  }

  // Handle stream completion
  const originalEnd = res.end.bind(res);
  res.end = function(...args) {
    if (!responseCaptured) {
      responseCaptured = true;

      if (isStreaming && streamingChunks.length > 0) {
        // Use handleStreamingResponse to extract tokens from SSE chunks
        interceptor.handleStreamingResponse(requestId, streamingChunks);
      } else {
        interceptor.completeCapture(requestId, {
          status: res.statusCode,
          body: null,
          error: null,
        });
      }
    }
    return originalEnd(...args);
  };

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
  });
}

/**
 * Stats endpoint - proxy metrics
 */
export function statsEndpoint(req, res) {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pendingRequests: interceptor.getPendingCount(),
      config: {
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
 * POST /v1/chat/completions - passthrough to NaN API (with streaming support)
 */
export async function chatCompletionsPassthrough(req, res) {
  try {
    const isStreaming = req.body?.stream === true;

    const response = await fetch(`${config.nanApiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.nanApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json(errorData);
    }

    if (isStreaming) {
      // Stream SSE response back to client
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        logger.error('Stream error', { error: streamError.message });
      }

      res.end();
    } else {
      // Non-streaming: return full JSON response
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    logger.error('Chat completions passthrough error', { error: error.message });
    res.status(502).json({
      error: {
        message: 'Failed to forward chat completion to NaN API',
        type: 'proxy_error',
        code: 'PROXY_ERROR',
      },
    });
  }
}

