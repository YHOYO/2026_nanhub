import db from '../config/database.js';
import { generateId, generateApiKey, hashApiKey } from '../utils/encryption.js';

/**
 * ProjectApiKey model - manages multiple API keys per project
 */
const ProjectApiKey = {
  /** Table name in the database */
  tableName: 'project_api_keys',

  /**
   * Create a new API key for a project
   * Returns the plain API key (only time it's visible)
   */
  create(data) {
    const id = generateId();
    const apiKey = data.apiKey || generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const stmt = db.prepare(`
      INSERT INTO project_api_keys (id, project_id, key_hash, name, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.projectId,
      apiKeyHash,
      data.name || 'Default',
      data.expiresAt || null
    );

    return {
      id,
      projectId: data.projectId,
      name: data.name || 'Default',
      apiKey,
      expiresAt: data.expiresAt || null,
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Find API key by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM project_api_keys WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Find API key by hash (for proxy validation)
   */
  findByHash(apiKeyHash) {
    const stmt = db.prepare(
      'SELECT * FROM project_api_keys WHERE key_hash = ? AND is_active = 1'
    );
    return stmt.get(apiKeyHash);
  },

  /**
   * Get all API keys for a project
   */
  findByProjectId(projectId) {
    const stmt = db.prepare(
      'SELECT * FROM project_api_keys WHERE project_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(projectId);
  },

  /**
   * Get all API keys
   */
  findAll() {
    const stmt = db.prepare('SELECT * FROM project_api_keys ORDER BY created_at DESC');
    return stmt.all();
  },

  /**
   * Update API key metadata (name, active status, expiry)
   */
  update(id, data) {
    const fields = [];
    const params = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }

    if (data.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (data.expiresAt !== undefined) {
      fields.push('expires_at = ?');
      params.push(data.expiresAt);
    }

    if (fields.length === 0) {
      return false;
    }

    fields.push("updated_at = datetime('now')");
    params.push(id);

    const stmt = db.prepare(
      `UPDATE project_api_keys SET ${fields.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);

    return result.changes > 0;
  },

  /**
   * Activate an API key
   */
  activate(id) {
    return this.update(id, { isActive: true });
  },

  /**
   * Deactivate an API key
   */
  deactivate(id) {
    return this.update(id, { isActive: false });
  },

  /**
   * Delete an API key permanently
   */
  delete(id) {
    const stmt = db.prepare('DELETE FROM project_api_keys WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Rotate an API key (generate new hash, keep metadata)
   */
  rotateKey(id) {
    const newApiKey = generateApiKey();
    const newApiKeyHash = hashApiKey(newApiKey);

    const stmt = db.prepare(`
      UPDATE project_api_keys SET key_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    const result = stmt.run(newApiKeyHash, id);

    if (result.changes === 0) {
      return null;
    }

    const key = this.findById(id);

    return {
      id: key.id,
      projectId: key.project_id,
      name: key.name,
      apiKey: newApiKey,
      isActive: key.is_active === 1,
      expiresAt: key.expires_at,
      createdAt: key.created_at,
    };
  },

  /**
   * Update last used timestamp
   */
  updateLastUsed(id) {
    const stmt = db.prepare(`
      UPDATE project_api_keys SET last_used_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  },

  /**
   * Validate an API key and return project info
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
      projectId: key.project_id,
      name: key.name,
    };
  },

  /**
   * Get key counts for a project
   */
  getStats(projectId) {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
      FROM project_api_keys
      WHERE project_id = ?
    `);

    return stmt.get(projectId);
  },

  /**
   * Get key counts for all projects (keyed by project_id)
   */
  getAllStats() {
    const stmt = db.prepare(`
      SELECT
        project_id,
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
      FROM project_api_keys
      GROUP BY project_id
    `);

    const rows = stmt.all();
    const stats = {};
    for (const row of rows) {
      stats[row.project_id] = {
        total: row.total,
        active: row.active,
        inactive: row.inactive,
      };
    }
    return stats;
  },
};

export default ProjectApiKey;
