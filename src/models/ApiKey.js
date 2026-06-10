import db from '../config/database.js';
import { generateId, generateApiKey, hashApiKey } from '../utils/encryption.js';

/**
 * ApiKey model - manages dashboard API keys
 */
const ApiKey = {
  /** Table name in the database */
  tableName: 'dashboard_api_keys',

  /**
   * Create a new dashboard API key
   */
  create(data) {
    const id = generateId();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const stmt = db.prepare(`
      INSERT INTO dashboard_api_keys (id, key_hash, name, project_id, permissions, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      apiKeyHash,
      data.name,
      data.projectId || null,
      JSON.stringify(data.permissions || { read: true, write: false }),
      data.expiresAt || null
    );

    // Return with plain API key (only time it's visible)
    return {
      id,
      name: data.name,
      apiKey,
      projectId: data.projectId,
      permissions: data.permissions || { read: true, write: false },
      expiresAt: data.expiresAt,
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Find API key by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM dashboard_api_keys WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Find API key by hash
   */
  findByHash(apiKeyHash) {
    const stmt = db.prepare('SELECT * FROM dashboard_api_keys WHERE key_hash = ? AND is_active = 1');
    return stmt.get(row);
  },

  /**
   * Get all API keys
   */
  findAll() {
    const stmt = db.prepare('SELECT * FROM dashboard_api_keys ORDER BY created_at DESC');
    return stmt.all();
  },

  /**
   * Update last used timestamp
   */
  updateLastUsed(id) {
    const stmt = db.prepare(`
      UPDATE dashboard_api_keys SET last_used_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  },

  /**
   * Deactivate API key
   */
  deactivate(id) {
    const stmt = db.prepare(`
      UPDATE dashboard_api_keys SET is_active = 0 WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Delete API key
   */
  delete(id) {
    const stmt = db.prepare('DELETE FROM dashboard_api_keys WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Validate API key
   */
  validate(apiKey) {
    const apiKeyHash = hashApiKey(apiKey);
    const key = this.findByHash(apiKeyHash);

    if (!key) {
      return null;
    }

    // Check if expired
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    // Update last used
    this.updateLastUsed(key.id);

    return {
      id: key.id,
      name: key.name,
      projectId: key.project_id,
      permissions: JSON.parse(key.permissions),
    };
  },
};

export default ApiKey;