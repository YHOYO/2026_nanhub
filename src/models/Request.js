import db from '../config/database.js';
import { generateId, hashApiKey } from '../utils/encryption.js';

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
   * Get consumption by endpoint
   */
  getByEndpoint(filters = {}) {
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
        endpoint,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime
      FROM requests ${whereClause}
      GROUP BY endpoint
      ORDER BY tokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get consumption grouped by API key hash
   * Returns list of API keys with their usage stats, models used, and project info
   */
  getByApiKeyHash(filters = {}) {
    let whereClause = "WHERE api_key_hash IS NOT NULL AND api_key_hash != ''";
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
        api_key_hash,
        project_id,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as promptTokens,
        COALESCE(SUM(tokens_completion), 0) as completionTokens,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END), 0) as errorCount,
        GROUP_CONCAT(DISTINCT model) as modelsUsed,
        MAX(timestamp) as lastUsed
      FROM requests ${whereClause}
      GROUP BY api_key_hash, project_id
      ORDER BY tokens DESC
    `);

    const rows = stmt.all(...params);

    // Enrich with project name and key name from project_api_keys
    // Note: requests.api_key_hash stores the RAW bearer token, project_api_keys.key_hash stores SHA256(token)
    const projectStmt = db.prepare('SELECT id, name FROM projects WHERE id = ?');
    const keyNameStmt = db.prepare('SELECT name FROM project_api_keys WHERE key_hash = ? LIMIT 1');

    return rows.map(row => {
      const project = projectStmt.get(row.project_id);
      // Hash the raw token to match against project_api_keys.key_hash
      let keyInfo = null;
      try {
        const hashedToken = hashApiKey(row.api_key_hash);
        keyInfo = keyNameStmt.get(hashedToken);
      } catch (e) {
        // Ignore hash errors
      }
      return {
        apiKeyHash: row.api_key_hash,
        apiKeyMasked: row.api_key_hash ? '...' + row.api_key_hash.slice(-8) : 'N/A',
        keyName: keyInfo?.name || null,
        projectId: row.project_id,
        projectName: project?.name || 'Sin proyecto',
        requests: row.requests,
        tokens: row.tokens,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        avgResponseTime: Math.round(row.avgResponseTime || 0),
        errorCount: row.errorCount,
        modelsUsed: row.modelsUsed ? row.modelsUsed.split(',') : [],
        lastUsed: row.lastUsed,
      };
    });
  },

  /**
   * Get detailed stats for a specific API key hash
   * Returns: summary, byModel, byProject, dailyTrend
   */
  getApiKeyDetail(apiKeyHash, filters = {}) {
    let whereClause = 'WHERE api_key_hash = ?';
    const params = [apiKeyHash];

    if (filters.startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    // Summary
    const summaryStmt = db.prepare(`
      SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(tokens_total), 0) as totalTokens,
        COALESCE(SUM(tokens_prompt), 0) as totalPrompt,
        COALESCE(SUM(tokens_completion), 0) as totalCompletion,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as errorRate
      FROM requests ${whereClause}
    `);
    const summary = summaryStmt.get(...params);

    // By model
    const byModelStmt = db.prepare(`
      SELECT
        COALESCE(model, 'unknown') as model,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokensPrompt,
        COALESCE(SUM(tokens_completion), 0) as tokensCompletion,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as errorRate
      FROM requests ${whereClause}
      GROUP BY model
      ORDER BY tokens DESC
    `);
    const byModel = byModelStmt.all(...params);

    // Daily trend
    const dailyStmt = db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokensPrompt,
        COALESCE(SUM(tokens_completion), 0) as tokensCompletion
      FROM requests ${whereClause}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `);
    const dailyTrend = dailyStmt.all(...params);

    // Get project info
    const projectIds = [...new Set(db.prepare(`SELECT DISTINCT project_id FROM requests ${whereClause}`).all(...params).map(r => r.project_id))];
    const projectLookup = db.prepare('SELECT id, name FROM projects WHERE id = ?');
    const projects = projectIds.map(id => projectLookup.get(id)).filter(Boolean);
    // Hash the raw token to match against project_api_keys.key_hash
    const keyNameStmt = db.prepare('SELECT name FROM project_api_keys WHERE key_hash = ? LIMIT 1');
    let keyInfo = null;
    try {
      const hashedToken = hashApiKey(apiKeyHash);
      keyInfo = keyNameStmt.get(hashedToken);
    } catch (e) {
      // Ignore hash errors
    }

    return {
      summary: {
        totalRequests: summary.totalRequests || 0,
        totalTokens: summary.totalTokens || 0,
        totalPrompt: summary.totalPrompt || 0,
        totalCompletion: summary.totalCompletion || 0,
        avgResponseTime: Math.round(summary.avgResponseTime || 0),
        errorRate: Math.round((summary.errorRate || 0) * 100) / 100,
      },
      byModel,
      dailyTrend,
      projects: projects.map(p => p.name),
      keyName: keyInfo?.name || null,
      apiKeyMasked: '...' + apiKeyHash.slice(-8),
    };
  },

  /**
   * Get detailed stats for a specific model
   * Returns: summary, dailyTrend, byProject, byApiKey
   */
  getModelDetail(model, filters = {}) {
    let whereClause = 'WHERE model = ?';
    const params = [model];

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

    // Summary
    const summaryStmt = db.prepare(`
      SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(tokens_total), 0) as totalTokens,
        COALESCE(SUM(tokens_prompt), 0) as totalPrompt,
        COALESCE(SUM(tokens_completion), 0) as totalCompletion,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as errorRate
      FROM requests ${whereClause}
    `);
    const summary = summaryStmt.get(...params);

    // Daily trend
    const dailyStmt = db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokensPrompt,
        COALESCE(SUM(tokens_completion), 0) as tokensCompletion
      FROM requests ${whereClause}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `);
    const dailyTrend = dailyStmt.all(...params);

    // By project
    const byProjectStmt = db.prepare(`
      SELECT
        project_id,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokensPrompt,
        COALESCE(SUM(tokens_completion), 0) as tokensCompletion,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime
      FROM requests ${whereClause}
      GROUP BY project_id
      ORDER BY tokens DESC
    `);
    const byProjectRaw = byProjectStmt.all(...params);
    const projectStmt = db.prepare('SELECT id, name FROM projects WHERE id = ?');
    const byProject = byProjectRaw.map(row => {
      const p = projectStmt.get(row.project_id);
      return {
        projectId: row.project_id,
        projectName: p?.name || 'Sin proyecto',
        requests: row.requests,
        tokens: row.tokens,
        tokensPrompt: row.tokensPrompt,
        tokensCompletion: row.tokensCompletion,
        avgResponseTime: Math.round(row.avgResponseTime || 0),
      };
    });

    // By API key
    const byApiKeyStmt = db.prepare(`
      SELECT
        api_key_hash,
        project_id,
        COUNT(*) as requests,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokensPrompt,
        COALESCE(SUM(tokens_completion), 0) as tokensCompletion,
        COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
        MAX(timestamp) as lastUsed
      FROM requests ${whereClause}
      GROUP BY api_key_hash
      ORDER BY tokens DESC
    `);
    const byApiKeyRaw = byApiKeyStmt.all(...params);
    const keyNameStmt = db.prepare('SELECT name FROM project_api_keys WHERE key_hash = ? LIMIT 1');
    const byApiKey = byApiKeyRaw.map(row => {
      let keyInfo = null;
      try {
        const hashedToken = hashApiKey(row.api_key_hash);
        keyInfo = keyNameStmt.get(hashedToken);
      } catch (e) {
        // Ignore hash errors
      }
      return {
        apiKeyHash: row.api_key_hash,
        apiKeyMasked: row.api_key_hash ? '...' + row.api_key_hash.slice(-8) : 'N/A',
        keyName: keyInfo?.name || null,
        projectId: row.project_id,
        requests: row.requests,
        tokens: row.tokens,
        tokensPrompt: row.tokensPrompt,
        tokensCompletion: row.tokensCompletion,
        avgResponseTime: Math.round(row.avgResponseTime || 0),
        lastUsed: row.lastUsed,
      };
    });

    return {
      summary: {
        totalRequests: summary.totalRequests || 0,
        totalTokens: summary.totalTokens || 0,
        totalPrompt: summary.totalPrompt || 0,
        totalCompletion: summary.totalCompletion || 0,
        avgResponseTime: Math.round(summary.avgResponseTime || 0),
        errorRate: Math.round((summary.errorRate || 0) * 100) / 100,
      },
      dailyTrend,
      byProject,
      byApiKey,
      model,
    };
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