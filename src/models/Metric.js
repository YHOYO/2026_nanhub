import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';

/**
 * Metric model - stores daily aggregated metrics
 * Enhanced with tokens_prompt, tokens_completion, and endpoint breakdown
 */
const Metric = {
  /** Table name in the database */
  tableName: 'metrics_daily',

  /**
   * Upsert daily metric (insert or update)
   * Aggregates by date + project + model + endpoint
   */
  upsert(data) {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO metrics_daily (id, date, project_id, model, endpoint, total_requests, total_tokens, tokens_prompt, tokens_completion, avg_response_time_ms, error_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, project_id, model, endpoint) DO UPDATE SET
        total_requests = total_requests + excluded.total_requests,
        total_tokens = total_tokens + excluded.total_tokens,
        tokens_prompt = tokens_prompt + excluded.tokens_prompt,
        tokens_completion = tokens_completion + excluded.tokens_completion,
        avg_response_time_ms = (avg_response_time_ms + excluded.avg_response_time_ms) / 2,
        error_rate = excluded.error_rate
    `);

    stmt.run(
      id,
      data.date,
      data.projectId || null,
      data.model || 'unknown',
      data.endpoint || 'unknown',
      data.totalRequests || 0,
      data.totalTokens || 0,
      data.tokensPrompt || 0,
      data.tokensCompletion || 0,
      data.avgResponseTimeMs || 0,
      data.errorRate || 0
    );
  },

  /**
   * Get metrics for a date range
   */
  findByDateRange(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    if (filters.endpoint) {
      whereClause += ' AND endpoint = ?';
      params.push(filters.endpoint);
    }

    const stmt = db.prepare(`
      SELECT * FROM metrics_daily ${whereClause}
      ORDER BY date ASC
    `);

    return stmt.all(...params);
  },

  /**
   * Get aggregated metrics for a period
   */
  getAggregated(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    if (filters.endpoint) {
      whereClause += ' AND endpoint = ?';
      params.push(filters.endpoint);
    }

    const stmt = db.prepare(`
      SELECT
        SUM(total_requests) as totalRequests,
        SUM(total_tokens) as totalTokens,
        SUM(tokens_prompt) as totalPrompt,
        SUM(tokens_completion) as totalCompletion,
        AVG(avg_response_time_ms) as avgResponseTime,
        AVG(error_rate) as avgErrorRate
      FROM metrics_daily ${whereClause}
    `);

    return stmt.get(...params);
  },

  /**
   * Get consumption by model for a period
   */
  getByModel(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    const stmt = db.prepare(`
      SELECT
        model,
        SUM(total_requests) as totalRequests,
        SUM(total_tokens) as totalTokens,
        SUM(tokens_prompt) as tokensPrompt,
        SUM(tokens_completion) as tokensCompletion,
        AVG(avg_response_time_ms) as avgResponseTime,
        AVG(error_rate) as errorRate
      FROM metrics_daily ${whereClause}
      GROUP BY model
      ORDER BY totalTokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get consumption by project for a period
   */
  getByProject(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    const stmt = db.prepare(`
      SELECT
        m.project_id,
        p.name as projectName,
        SUM(m.total_requests) as totalRequests,
        SUM(m.total_tokens) as totalTokens,
        SUM(m.tokens_prompt) as tokensPrompt,
        SUM(m.tokens_completion) as tokensCompletion,
        AVG(m.avg_response_time_ms) as avgResponseTime,
        AVG(m.error_rate) as errorRate
      FROM metrics_daily m
      LEFT JOIN projects p ON p.id = m.project_id
      ${whereClause}
      GROUP BY m.project_id
      ORDER BY totalTokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get consumption by endpoint for a period
   */
  getByEndpoint(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    const stmt = db.prepare(`
      SELECT
        endpoint,
        SUM(total_requests) as totalRequests,
        SUM(total_tokens) as totalTokens,
        SUM(tokens_prompt) as tokensPrompt,
        SUM(tokens_completion) as tokensCompletion,
        AVG(avg_response_time_ms) as avgResponseTime,
        AVG(error_rate) as errorRate
      FROM metrics_daily ${whereClause}
      GROUP BY endpoint
      ORDER BY totalTokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get daily trend with prompt/completion breakdown
   */
  getDailyTrend(startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.model) {
      whereClause += ' AND model = ?';
      params.push(filters.model);
    }

    if (filters.endpoint) {
      whereClause += ' AND endpoint = ?';
      params.push(filters.endpoint);
    }

    const stmt = db.prepare(`
      SELECT
        date,
        SUM(total_requests) as requests,
        SUM(total_tokens) as tokens,
        SUM(tokens_prompt) as tokensPrompt,
        SUM(tokens_completion) as tokensCompletion
      FROM metrics_daily ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `);

    return stmt.all(...params);
  },

  /**
   * Get full dashboard data - all aggregations in one call
   * Returns summary, byProject, byModel, byEndpoint, dailyTrend
   */
  getFullDashboard(startDate, endDate, filters = {}) {
    const summary = this.getAggregated(startDate, endDate, filters);
    const byProject = this.getByProject(startDate, endDate, filters);
    const byModel = this.getByModel(startDate, endDate, filters);
    const byEndpoint = this.getByEndpoint(startDate, endDate, filters);
    const dailyTrend = this.getDailyTrend(startDate, endDate, filters);

    return {
      summary: {
        totalRequests: summary.totalRequests || 0,
        totalTokens: summary.totalTokens || 0,
        totalPrompt: summary.totalPrompt || 0,
        totalCompletion: summary.totalCompletion || 0,
        avgResponseTime: Math.round(summary.avgResponseTime || 0),
        errorRate: Math.round((summary.avgErrorRate || 0) * 100) / 100,
      },
      byProject,
      byModel,
      byEndpoint,
      dailyTrend,
    };
  },

  /**
   * Get daily trend for a specific model
   */
  getModelDailyTrend(model, startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ? AND model = ?';
    const params = [startDate, endDate, model];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    const stmt = db.prepare(`
      SELECT
        date,
        SUM(total_requests) as requests,
        SUM(total_tokens) as tokens,
        SUM(tokens_prompt) as tokensPrompt,
        SUM(tokens_completion) as tokensCompletion
      FROM metrics_daily ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `);

    return stmt.all(...params);
  },

  /**
   * Get consumption by project for a specific model
   */
  getModelByProject(model, startDate, endDate, filters = {}) {
    let whereClause = 'WHERE date BETWEEN ? AND ? AND model = ?';
    const params = [startDate, endDate, model];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    const stmt = db.prepare(`
      SELECT
        m.project_id,
        p.name as projectName,
        SUM(m.total_requests) as totalRequests,
        SUM(m.total_tokens) as totalTokens,
        SUM(m.tokens_prompt) as tokensPrompt,
        SUM(m.tokens_completion) as tokensCompletion,
        AVG(m.avg_response_time_ms) as avgResponseTime
      FROM metrics_daily m
      LEFT JOIN projects p ON p.id = m.project_id
      ${whereClause}
      GROUP BY m.project_id
      ORDER BY totalTokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Aggregate raw requests into daily metrics
   */
  aggregateFromRequests(date) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO metrics_daily 
        (id, date, project_id, model, endpoint, total_requests, total_tokens, tokens_prompt, tokens_completion, avg_response_time_ms, error_rate)
      SELECT
        ? as id,
        DATE(timestamp) as date,
        project_id,
        COALESCE(model, 'unknown') as model,
        COALESCE(endpoint, 'unknown') as endpoint,
        COUNT(*) as total_requests,
        COALESCE(SUM(tokens_total), 0) as total_tokens,
        COALESCE(SUM(tokens_prompt), 0) as tokens_prompt,
        COALESCE(SUM(tokens_completion), 0) as tokens_completion,
        COALESCE(AVG(response_time_ms), 0) as avg_response_time_ms,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as error_rate
      FROM requests
      WHERE DATE(timestamp) = ?
      GROUP BY DATE(timestamp), project_id, model, endpoint
    `);

    const id = generateId();
    const result = stmt.run(id, date);
    return result.changes;
  },
};

export default Metric;
