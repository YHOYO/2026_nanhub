/**
 * NaN Cloud Image Generation - Auth Routes
 * 
 * This module handles authentication with NaN Cloud,
 * including requesting login emails and managing sessions.
 */

import { Router } from 'express';
import SessionManager from './sessionManager.js';
import NaNCloudService from './service.js';
import nanCloudConfig from './config.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * POST /api/nancloud/auth/set-session
 * Set the NaN Cloud session cookie
 *
 * Instructions for the user:
 * 1. Go to https://cloud.nan.builders/login
 * 2. Enter your email and click "Send magic link"
 * 3. Check your email and click the link
 * 4. Open DevTools (F12) > Application > Cookies
 * 5. Copy the value of "nan_session" cookie
 * 6. Send it to this endpoint
 */
router.post('/set-session', async (req, res) => {
  try {
    const { session_cookie, expires_at } = req.body;

    if (!session_cookie) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_COOKIE',
          message: 'El session_cookie es requerido. Instructions:\n1. Go to https://cloud.nan.builders/login\n2. Login with your email\n3. Copy nan_session cookie from DevTools > Application > Cookies',
        },
      });
    }

    // Parse JWT to extract user info
    const jwtData = SessionManager.parseJWT(session_cookie);

    if (!jwtData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'El token JWT no es válido',
        },
      });
    }

    // Use expiry from JWT if not provided
    const expiresAt = expires_at || jwtData.expiresAt;

    // Deactivate all existing sessions
    SessionManager.deactivateAll();

    // Create new session
    const sessionId = SessionManager.create({
      sessionCookie: session_cookie,
      username: jwtData.username,
      email: jwtData.email,
      expiresAt,
    });

    // Calculate hours remaining
    const now = new Date();
    const expiresDate = new Date(expiresAt);
    const hoursRemaining = Math.round(((expiresDate - now) / (1000 * 60 * 60)) * 10) / 10;

    logger.info('NaN Cloud session configured', {
      sessionId,
      username: jwtData.username,
      email: jwtData.email,
      expiresAt,
      hoursRemaining,
    });

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        username: jwtData.username,
        email: jwtData.email,
        expires_at: expiresAt,
        hours_remaining: hoursRemaining,
      },
    });
  } catch (error) {
    logger.error('Failed to set session', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'SET_SESSION_FAILED',
        message: 'Error al configurar la sesión',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/auth/status
 * Get the current session status
 */
router.get('/status', async (req, res) => {
  try {
    const status = SessionManager.getStatus();

    // If session is valid, try to get quota
    if (status.has_session && !status.is_expired) {
      try {
        const quota = await NaNCloudService.getQuota();
        status.quota = quota;
      } catch (error) {
        // Quota fetch failed, but session is still valid
        status.quota = null;
      }
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get session status', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_FAILED',
        message: 'Error al obtener el estado de la sesión',
        details: error.message,
      },
    });
  }
});

/**
 * GET /api/nancloud/auth/verify
 * Verify the session with NaN Cloud
 */
router.get('/verify', async (req, res) => {
  try {
    const result = await NaNCloudService.verifySession();

    if (result.valid) {
      // Update last_verified_at
      const session = SessionManager.getActiveSession();
      if (session) {
        SessionManager.updateLastVerified(session.id);
      }

      res.json({
        success: true,
        data: {
          valid: true,
          username: result.data?.username || result.data?.user?.username,
          message: 'Sesión válida en NaN Cloud',
        },
      });
    } else {
      // Mark session as invalid
      SessionManager.deactivateAll();

      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_INVALID',
          message: 'La sesión de NaN Cloud no es válida o ha expirado. Necesitas obtener una nueva cookie.',
          instructions: [
            '1. Ve a https://cloud.nan.builders/login',
            '2. Ingresa tu email y haz clic en "Send magic link"',
            '3. Revisa tu correo y haz clic en el link',
            '4. Una vez en la plataforma, abre DevTools (F12)',
            '5. Ve a Application > Cookies > cloud-api.nan.builders',
            '6. Copia el valor completo de la cookie "nan_session"',
            '7. Usa POST /api/nancloud/auth/set-session con ese valor',
          ].join('\n'),
          details: result.error,
        },
      });
    }
  } catch (error) {
    logger.error('Failed to verify session', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFY_FAILED',
        message: 'Error al verificar la sesión',
        details: error.message,
      },
    });
  }
});

/**
 * DELETE /api/nancloud/auth/session
 * Deactivate the current session
 */
router.delete('/session', (req, res) => {
  try {
    const deactivated = SessionManager.deactivateAll();

    logger.info('NaN Cloud session deactivated', { count: deactivated });

    res.json({
      success: true,
      message: 'Sesión desactivada correctamente',
    });
  } catch (error) {
    logger.error('Failed to deactivate session', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: 'Error al desactivar la sesión',
        details: error.message,
      },
    });
  }
});

export default router;
