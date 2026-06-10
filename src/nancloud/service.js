/**
 * NaN Cloud Image Generation - Service
 * 
 * This module acts as a bridge to the NaN Cloud API for image generation.
 * It handles all HTTP requests to the NaN Cloud backend.
 */

import nanCloudConfig from './config.js';
import SessionManager from './sessionManager.js';
import logger from '../utils/logger.js';

const NaNCloudService = {
  /**
   * Make an authenticated request to NaN Cloud API
   */
  async request(method, path, body = null, options = {}) {
    const sessionCookie = SessionManager.getSessionCookie();

    if (!sessionCookie && !options.skipAuth) {
      throw new Error('NO_SESSION: No hay sesión activa de NaN Cloud');
    }

    const url = `${nanCloudConfig.apiBase}${path}`;

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'es-419,es;q=0.5',
      'Origin': 'https://cloud.nan.builders',
      'Referer': 'https://cloud.nan.builders/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    if (sessionCookie) {
      // Send session as both cookie and Authorization header for compatibility
      headers['Cookie'] = `nan_session=${sessionCookie}`;
      headers['Authorization'] = `Bearer ${sessionCookie}`;
    }

    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        // Don't set Content-Type for FormData (browser sets it with boundary)
      } else {
        headers['Content-Type'] = 'application/json';
      }
    }

    const fetchOptions = {
      method,
      headers,
      signal: AbortSignal.timeout(nanCloudConfig.timeout),
    };

    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    logger.debug('NaN Cloud API request', { method, url });

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error('NaN Cloud API error', {
        status: response.status,
        url,
        error: errorText,
      });

      const error = new Error(`NaN Cloud API error: ${response.status}`);
      error.status = response.status;
      error.body = errorText;
      throw error;
    }

    // Check if response is JSON or binary
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    // Return raw response for binary data
    return response;
  },

  /**
   * Generate images using NaN Cloud
   */
  async generateImages(params) {
    const {
      prompt,
      aspectRatio = '1:1',
      variants = 1,
      guidance = 3.5,
      referenceImageIds = [],
    } = params;

    // Get dimensions from aspect ratio
    const dimensions = nanCloudConfig.aspectRatios[aspectRatio] || nanCloudConfig.aspectRatios['1:1'];

    // Build request body
    const body = {
      prompt,
      width: dimensions.width,
      height: dimensions.height,
      variants: Math.min(variants, 10), // Max 10 variants
      guidance,
      referenceImageIds: referenceImageIds.slice(0, nanCloudConfig.maxReferenceImages),
    };

    logger.info('Generating images via NaN Cloud', {
      prompt: prompt.substring(0, 50) + '...',
      aspectRatio,
      variants,
    });

    const response = await this.request('POST', '/api/images/generate', body);

    // Parse response if it's a string
    const data = typeof response === 'string' ? JSON.parse(response) : response;

    logger.info('Images generated successfully', {
      count: data.images?.length || 0,
      quota: data.quota,
      used: data.used,
    });

    return data;
  },

  /**
   * Get image file from NaN Cloud
   */
  async getImageFile(imageId) {
    const response = await this.request('GET', `/api/images/${imageId}/file`, null, {
      rawResponse: true,
    });

    return response;
  },

  /**
   * List images from NaN Cloud
   */
  async listImages(limit = 24, offset = 0) {
    const response = await this.request('GET', `/api/images?limit=${limit}&offset=${offset}`);
    return response;
  },

  /**
   * Verify session with NaN Cloud
   */
  async verifySession() {
    try {
      const response = await this.request('GET', '/api/auth/me');
      return {
        valid: true,
        data: response,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  },

  /**
   * Get current quota from NaN Cloud
   */
  async getQuota() {
    try {
      const response = await this.request('GET', '/api/images?limit=1&offset=0');

      // Extract quota from the response or make a separate request
      // For now, we'll track it locally
      return {
        total: nanCloudConfig.monthlyQuota,
        used: response.used || 0,
        remaining: nanCloudConfig.monthlyQuota - (response.used || 0),
      };
    } catch (error) {
      logger.error('Failed to get quota', { error: error.message });
      return null;
    }
  },
};

export default NaNCloudService;
