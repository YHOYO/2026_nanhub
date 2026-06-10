import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';

/**
 * Metric model - stores daily aggregated metrics
 */
const Metric = {
  /** Table name in the database */
  tableName: 'metrics_daily',

  /**
   * Upsert daily metric (insert or update)
   */
  upsert(data) {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO metrics_daily (id, date, project_id, model, total_requests, total_tokens, avg_response_time_ms, error_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, project_id, model) DO UPDATE SET
        total_requests = total_requests + excluded.total_requests,
        total_tokens = total_tokens + excluded.total_tokens,
        avg_response_time_ms = (avg_response_time_ms + excluded.avg_response_time_ms) / 2,
        error_rate = excluded.error_rate
    `);

    stmt.run(
      id,
      data.date,
      data.projectId || null,
      data.model || 'unknown',
      data.totalRequests || 0,
      data.totalTokens || 0,
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

    const stmt = db.prepare(`
      SELECT
        SUM(total_requests) as totalRequests,
        SUM(total_tokens) as totalTokens,
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
        SUM(total_requests) as requests,
        SUM(total_tokens) as tokens,
        AVG(avg_response_time_ms) as avgResponseTime
      FROM metrics_daily ${whereClause}
      GROUP BY model
      ORDER BY tokens DESC
    `);

    return stmt.all(...params);
  },

  /**
   * Get daily trend
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

    const stmt = db.prepare(`
      SELECT
        date,
        SUM(total_requests) as requests,
        SUM(total_tokens) as tokens
      FROM metrics_daily ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `);

    return stmt.all(...params);
  },

  /**
   * Aggregate raw requests into daily metrics
   */
  aggregateFromRequests(date) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO metrics_daily (id, date, project_id, model, total_requests, total_tokens, avg_response_time_ms, error_rate)
      SELECT
        ? as id,
        DATE(timestamp) as date,
        project_id,
        COALESCE(model, 'unknown') as model,
        COUNT(*) as total_requests,
        COALESCE(SUM(tokens_total), 0) as total_tokens,
        COALESCE(AVG(response_time_ms), 0) as avg_response_time_ms,
        COALESCE(SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as error_rate
      FROM requests
      WHERE DATE(timestamp) = ?
      GROUP BY DATE(timestamp), project_id, model
    `);

    const id = generateId();
    const result = stmt.run(id, date);
    return result.changes;
  },
};

export default Metric;