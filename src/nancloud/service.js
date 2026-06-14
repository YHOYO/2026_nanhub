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
      // CRITICAL: Do NOT follow redirects automatically for image files
      // NaN Cloud may redirect to CDN and we need to capture the redirect URL
      redirect: options.skipRedirect ? 'manual' : 'follow',
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
        statusText: response.statusText,
        url,
        error: errorText.substring(0, 500),
        headers: Object.fromEntries(response.headers.entries()),
      });

      const error = new Error(`NaN Cloud API error: ${response.status} ${response.statusText}`);
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
    const path = `/api/images/${imageId}/file`;
    const fullUrl = `${nanCloudConfig.apiBase}${path}`;
    logger.info('[NaNCloudService] getImageFile', { imageId, path, fullUrl, apiBase: nanCloudConfig.apiBase });

    const response = await this.request('GET', path, null, {
      rawResponse: true,
      skipRedirect: true,
    });

    // Log ALL headers to diagnose redirect/CDN behavior
    if (response instanceof Response) {
      const headers = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      logger.info('[NaNCloudService] getImageFile response', {
        type: typeof response,
        isResponse: response instanceof Response,
        ok: response?.ok,
        status: response?.status,
        statusText: response?.statusText,
        redirected: response?.redirected,
        url: response?.url,
        contentType: response?.headers?.get?.('content-type'),
        contentLength: response?.headers?.get?.('content-length'),
        location: response?.headers?.get?.('location'),
        allHeaders: headers,
      });

      // If it's a redirect (302/303), follow it manually and log the CDN URL
      if (response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) {
        const redirectUrl = response.headers.get('location');
        logger.info('[NaNCloudService] Redirect detected!', {
          from: fullUrl,
          to: redirectUrl,
          status: response.status,
        });
      }
    } else {
      logger.info('[NaNCloudService] getImageFile non-Response', {
        type: typeof response,
        isBuffer: Buffer.isBuffer(response),
        length: response?.length,
      });
    }

    return response;
  },

  /**
   * List images from NaN Cloud (legacy method, kept for compatibility)
   */
  async listImages(limit = 24, offset = 0) {
    const response = await this.request('GET', `/api/images?limit=${limit}&offset=${offset}`);
    return response;
  },

  /**
   * List remote images from NaN Cloud Platform with pagination
   * Returns images generated directly at https://cloud.nan.builders/generate
   * @param {number} limit - Max images per page (default 50)
   * @param {number} offset - Pagination offset (default 0)
   * @returns {Promise<{images: Array, total: number, hasMore: boolean}>}
   */
  async listRemoteImages(limit = 50, offset = 0) {
    try {
      const response = await this.request('GET', `/api/images?limit=${limit}&offset=${offset}`);

      // Normalize response - NaN Cloud API uses 'items' as the key and 'hasMore' for pagination
      const images = response.items || response.images || response.data || response || [];
      const total = response.total || response.count || images.length;
      const hasMore = response.hasMore === true || offset + (Array.isArray(images) ? images.length : 0) < total;

      logger.info('[NaNCloudService] listRemoteImages', {
        count: Array.isArray(images) ? images.length : 0,
        total,
        offset,
        apiHasMore: response.hasMore,
        calculatedHasMore: hasMore,
      });

      return {
        images: Array.isArray(images) ? images : [],
        total,
        offset,
        hasMore,
        quota: response.quota || null,
        used: response.used || 0,
      };
    } catch (error) {
      logger.error('[NaNCloudService] listRemoteImages failed', {
        error: error.message,
        status: error.status,
      });
      throw error;
    }
  },

  /**
   * Fetch all remote images with automatic pagination
   * @param {number} maxImages - Maximum total images to fetch (default 200)
   * @returns {Promise<Array>} All images combined
   */
  async listAllRemoteImages(maxImages = 200) {
    const allImages = [];
    let offset = 0;
    const batchSize = 50;
    let hasMore = true;

    while (hasMore && allImages.length < maxImages) {
      const result = await this.listRemoteImages(batchSize, offset);
      allImages.push(...result.images);
      hasMore = result.hasMore;
      offset += batchSize;

      logger.debug('[NaNCloudService] listAllRemoteImages pagination', {
        fetched: allImages.length,
        total: result.total,
        hasMore,
      });
    }

    return allImages.slice(0, maxImages);
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
