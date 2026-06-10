import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';

/**
 * Project model - manages projects that use the proxy
 */
const Project = {
  /** Table name in the database */
  tableName: 'projects',

  /**
   * Create a new project (without API key - use ProjectApiKey.create() for keys)
   */
  create(data) {
    const id = generateId();

    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, data.name, data.description || null);

    return {
      id,
      name: data.name,
      description: data.description,
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Find project by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Get all projects
   */
  findAll() {
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return stmt.all();
  },

  /**
   * Update project
   */
  update(id, data) {
    const fields = [];
    const params = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }

    if (data.description !== undefined) {
      fields.push('description = ?');
      params.push(data.description);
    }

    if (data.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (fields.length === 0) {
      return false;
    }

    fields.push("updated_at = datetime('now')");
    params.push(id);

    const stmt = db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...params);

    return result.changes > 0;
  },

  /**
   * Delete project (soft delete)
   */
  delete(id) {
    return this.update(id, { isActive: false });
  },

  /**
   * Hard delete project
   */
  hardDelete(id) {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Get project statistics
   */
  getStats(id) {
    const stmt = db.prepare(`
      SELECT
        COUNT(DISTINCT r.id) as totalRequests,
        COALESCE(SUM(r.tokens_total), 0) as totalTokens,
        COALESCE(AVG(r.response_time_ms), 0) as avgResponseTime,
        MIN(r.timestamp) as firstRequest,
        MAX(r.timestamp) as lastRequest
      FROM requests r
      WHERE r.project_id = ?
    `);

    return stmt.get(id);
  },

  /**
   * Find project by API key hash (looks up via project_api_keys table)
   */
  findByApiKeyHash(apiKeyHash) {
    const stmt = db.prepare(`
      SELECT p.* FROM projects p
      INNER JOIN project_api_keys pak ON pak.project_id = p.id
      WHERE pak.key_hash = ? AND pak.is_active = 1 AND p.is_active = 1
    `);
    return stmt.get(apiKeyHash);
  },
};

export default Project;
