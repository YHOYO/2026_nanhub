/**
 * NaN Cloud Image Generation - Session Manager
 * 
 * This module manages the NaN Cloud session cookie (nan_session JWT).
 * It handles storage, validation, and renewal of the session.
 */

import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';
import logger from '../utils/logger.js';
import nanCloudConfig from './config.js';

const SessionManager = {
  tableName: 'nancloud_sessions',

  /**
   * Create a new session
   */
  create(data) {
    const id = generateId();

    const stmt = db.prepare(`
      INSERT INTO ${this.tableName} (id, session_cookie, username, email, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.sessionCookie,
      data.username || null,
      data.email || null,
      data.expiresAt
    );

    logger.info('NaN Cloud session created', {
      id,
      username: data.username,
      email: data.email,
      expiresAt: data.expiresAt,
    });

    return id;
  },

  /**
   * Get the active session
   */
  getActiveSession() {
    const stmt = db.prepare(`
      SELECT * FROM ${this.tableName}
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return stmt.get();
  },

  /**
   * Check if the active session is valid (not expired)
   * Checks ENV variable first, then DB session
   */
  isSessionValid() {
    // 1. Check ENV variable first
    if (nanCloudConfig.sessionCookie) {
      const jwtData = this.parseJWT(nanCloudConfig.sessionCookie);
      if (jwtData) {
        const now = new Date();
        const expiresAt = new Date(jwtData.expiresAt);

        if (now < expiresAt) {
          const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60);
          return {
            valid: true,
            session: {
              session_cookie: nanCloudConfig.sessionCookie,
              username: jwtData.username,
              email: jwtData.email,
              expires_at: jwtData.expiresAt,
            },
            hoursRemaining: Math.round(hoursRemaining * 10) / 10,
            expiresAt: jwtData.expiresAt,
            source: 'env',
          };
        }
      }
    }

    // 2. Fall back to DB session
    const session = this.getActiveSession();

    if (!session) {
      return { valid: false, reason: 'NO_SESSION', message: 'No hay sesión activa' };
    }

    const now = new Date();
    const expiresAt = new Date(session.expires_at);

    if (now >= expiresAt) {
      return {
        valid: false,
        reason: 'EXPIRED',
        message: 'La sesión ha expirado',
        expiresAt: session.expires_at,
      };
    }

    const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60);

    return {
      valid: true,
      session,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      expiresAt: session.expires_at,
      source: 'db',
    };
  },

  /**
   * Get the session cookie for API requests
   * Priority: 1) ENV variable NAN_CLOUD_SESSION_COOKIE, 2) DB session
   */
  getSessionCookie() {
    // 1. Check ENV variable first (for containerized deployments)
    if (nanCloudConfig.sessionCookie) {
      // Validate the ENV token is not expired
      const jwtData = this.parseJWT(nanCloudConfig.sessionCookie);
      if (jwtData && new Date(jwtData.expiresAt) > new Date()) {
        return nanCloudConfig.sessionCookie;
      }
      // If ENV token is expired, fall through to DB
    }

    // 2. Fall back to DB session
    const validation = this.isSessionValid();

    if (!validation.valid) {
      return null;
    }

    return validation.session.session_cookie;
  },

  /**
   * Deactivate all sessions
   */
  deactivateAll() {
    const stmt = db.prepare(`
      UPDATE ${this.tableName} SET is_active = 0
    `);

    const result = stmt.run();
    logger.info('All NaN Cloud sessions deactivated', { changes: result.changes });
    return result.changes;
  },

  /**
   * Update session verification timestamp
   */
  updateLastVerified(id) {
    const stmt = db.prepare(`
      UPDATE ${this.tableName} SET last_verified_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(id);
  },

  /**
   * Get session status for API response
   */
  getStatus() {
    const validation = this.isSessionValid();

    if (!validation.valid) {
      return {
        has_session: false,
        is_expired: validation.reason === 'EXPIRED',
        expires_at: validation.expiresAt || null,
        hours_remaining: 0,
        message: validation.message,
      };
    }

    // Get quota info from NaN Cloud if session is valid
    const session = validation.session;

    return {
      has_session: true,
      is_expired: false,
      username: session.username,
      email: session.email,
      expires_at: session.expires_at,
      hours_remaining: validation.hoursRemaining,
      last_verified_at: session.last_verified_at,
    };
  },

  /**
   * Parse JWT to extract user info
   */
  parseJWT(token) {
    try {
      // JWT has 3 parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode the payload (second part)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      return {
        username: payload.username,
        email: payload.email,
        handle: payload.handle,
        roles: payload.roles,
        region: payload.region,
        tier: payload.tier,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      };
    } catch (error) {
      logger.error('Failed to parse JWT', { error: error.message });
      return null;
    }
  },

  /**
   * Clean up expired sessions
   */
  cleanupExpired() {
    const stmt = db.prepare(`
      UPDATE ${this.tableName}
      SET is_active = 0
      WHERE is_active = 1 AND expires_at < datetime('now')
    `);

    const result = stmt.run();
    if (result.changes > 0) {
      logger.info('Expired NaN Cloud sessions cleaned up', { count: result.changes });
    }
    return result.changes;
  },
};

export default SessionManager;
