import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';

/**
 * Request model - captures all intercepted API requests
 */
const Request = {
  /** Table name in the database */
  tableName: 'requests',

  /**
   * Create a new request record
   */
  create(data) {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO requests (
        id, method, endpoint, api_key_hash, client_ip,
        user_agent, request_body, project_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.method,
      data.endpoint,
      data.apiKeyHash || null,
      data.clientIp || null,
      data.userAgent || null,
      data.requestBody ? JSON.stringify(data.requestBody) : null,
      data.projectId || null
    );

    return id;
  },

  /**
   * Update request with response data
   */
  updateResponse(id, data) {
    const stmt = db.prepare(`
      UPDATE requests SET
        response_status = ?,
        response_body = ?,
        response_time_ms = ?,
        tokens_prompt = ?,
        tokens_completion = ?,
        tokens_total = ?,
        model = ?,
        error_message = ?
      WHERE id = ?
    `);

    stmt.run(
      data.responseStatus || null,
      data.responseBody ? JSON.stringify(data.responseBody) : null,
      data.responseTimeMs || null,
      data.tokensPrompt || 0,
      data.tokensCompletion || 0,
      data.tokensTotal || 0,
      data.model || null,
      data.errorMessage || null,
      id
    );
  },

  /**
   * Find request by ID
   */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM requests WHERE id = ?');
    const row = stmt.get(id);
    if (row) {
      row.request_body = row.request_body ? JSON.parse(row.request_body) : null;
      row.response_body = row.response_body ? JSON.parse(row.response_body) : null;
    }
    return row;
  },

  /**
   * Get requests with pagination and filters
   */
  findAll(filters = {}, page = 1, limit = 50) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    if (filters.endpoint) {
      whereClause += ' AND endpoint LIKE ?';
      params.push(`%${filters.endpoint}%`);
    }

    if (filters.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    if (filters.status) {
      whereClause += ' AND response_status = ?';
      params.push(filters.status);
    }

    const offset = (page - 1) * limit;

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM requests ${whereClause}`);
    const { total } = countStmt.get(...params);

    // Get paginated results
    const dataStmt = db.prepare(`
      SELECT * FROM requests ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...params, limit, offset);

    // Parse JSON fields
    rows.forEach(row => {
      row.request_body = row.request_body ? JSON.parse(row.request_body) : null;
      row.response_body = row.response_body ? JSON.parse(row.response_body) : null;
    });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get consumption statistics
   */
  getStats(filters = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    const stmt = db.prepare(`
      SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(tokens_total), 0) as totalTokens,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END), 0) as errorCount,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as errorRate
      FROM requests ${whereClause}
    `);

    return stmt.get(...params);
  },

  /**
   * Get consumption by model
   */
  getByModel(filters = {}) {
    let whereClause = 'WHERE model IS NOT NULL';
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    const stmt = db.prepare(`
      SELECT
        model,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime
      FROM requests ${whereClause}
      GROUP BY model
      ORDER BY tokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get hourly consumption for charts
   */
  getHourlyConsumption(filters = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    const stmt = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens
      FROM requests ${whereClause}
      GROUP BY hour
      ORDER BY hour ASC
    `);

    return stmt.all(...params);
  },

  /**
   * Get recent requests
   */
  getRecent(limit = 10) {
    const stmt = db.prepare(`
      SELECT * FROM requests
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit);
    rows.forEach(row => {
      row.request_body = row.request_body ? JSON.parse(row.request_body) : null;
      row.response_body = row.response_body ? JSON.parse(row.response_body) : null;
    });

    return rows;
  },

  /**
   * Delete old requests (cleanup)
   */
  deleteOlderThan(days) {
    const stmt = db.prepare(`
      DELETE FROM requests
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(days);
    return result.changes;
  },
};

export default Request;