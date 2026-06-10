import { Router } from 'express';
import Request from '../../models/Request.js';
import Project from '../../models/Project.js';
import Metric from '../../models/Metric.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * GET /api/dashboard/stats
 * Get dashboard overview statistics
 */
router.get('/stats', (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;

    // Get overall stats
    const overallStats = Request.getStats({
      projectId,
      startDate,
      endDate,
    });

    // Get stats by model
    const byModel = Request.getByModel({
      projectId,
      startDate,
      endDate,
    });

    // Get total projects
    const projects = Project.findAll();
    const totalProjects = projects.length;

    // Get active requests (pending)
    const activeRequests = 0; // TODO: Get from interceptor

    res.json({
      totalRequests: overallStats.totalRequests || 0,
      totalTokens: overallStats.totalTokens || 0,
      avgResponseTime: overallStats.avgResponseTime || 0,
      errorRate: overallStats.errorRate || 0,
      totalProjects,
      activeRequests,
      byModel,
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * GET /api/dashboard/recent
 * Get recent requests
 */
router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const requests = Request.getRecent(limit);

    res.json({
      data: requests,
      total: requests.length,
    });
  } catch (error) {
    logger.error('Failed to get recent requests', { error: error.message });
    res.status(500).json({ error: 'Failed to get recent requests' });
  }
});

/**
 * GET /api/dashboard/consumption
 * Get consumption data for charts
 */
router.get('/consumption', (req, res) => {
  try {
    const { projectId, startDate, endDate, model } = req.query;

    const hourlyData = Request.getHourlyConsumption({
      projectId,
      startDate,
      endDate,
      model,
    });

    res.json({
      data: hourlyData,
    });
  } catch (error) {
    logger.error('Failed to get consumption data', { error: error.message });
    res.status(500).json({ error: 'Failed to get consumption data' });
  }
});

/**
 * GET /api/dashboard/models
 * Get model usage breakdown
 */
router.get('/models', (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;

    const modelStats = Request.getByModel({
      projectId,
      startDate,
      endDate,
    });

    res.json({
      data: modelStats,
    });
  } catch (error) {
    logger.error('Failed to get model stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get model stats' });
  }
});

/**
 * GET /api/dashboard/tokens
 * Get token consumption over time
 */
router.get('/tokens', (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;

    // Default to last 7 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const trend = Metric.getDailyTrend(start, end, { projectId });

    res.json({
      data: trend,
      period: { start, end },
    });
  } catch (error) {
    logger.error('Failed to get token data', { error: error.message });
    res.status(500).json({ error: 'Failed to get token data' });
  }
});

/**
 * GET /api/dashboard/requests
 * Get requests with filters and pagination
 */
router.get('/requests', (req, res) => {
  try {
    const { projectId, model, endpoint, startDate, endDate, status, page, limit } = req.query;

    const result = Request.findAll(
      {
        projectId,
        model,
        endpoint,
        startDate,
        endDate,
        status: status ? parseInt(status) : null,
      },
      parseInt(page) || 1,
      parseInt(limit) || 50
    );

    res.json(result);
  } catch (error) {
    logger.error('Failed to get requests', { error: error.message });
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

/**
 * GET /api/dashboard/projects
 * Get all projects with stats
 */
router.get('/projects', (req, res) => {
  try {
    const projects = Project.findAll();
    
    const projectsWithStats = projects.map(project => {
      const stats = Project.getStats(project.id);
      return {
        ...project,
        stats,
      };
    });

    res.json({
      data: projectsWithStats,
    });
  } catch (error) {
    logger.error('Failed to get projects', { error: error.message });
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

/**
 * GET /api/dashboard/super/apikeys
 * Get all API keys with usage stats
 * Query params: period, projectId
 */
router.get('/super/apikeys', (req, res) => {
  try {
    const { period, projectId } = req.query;

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const endDateTime = endDate + ' 23:59:59';

    let start;
    switch (period) {
      case '1d':
        start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        start = '2000-01-01';
        break;
      case '7d':
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
    }

    const apiKeys = Request.getByApiKeyHash({
      projectId,
      startDate: start,
      endDate: endDateTime,
    });

    res.json({
      data: apiKeys,
      period: { start, end: endDate },
    });
  } catch (error) {
    logger.error('Failed to get API keys usage', { error: error.message });
    res.status(500).json({ error: 'Failed to get API keys usage' });
  }
});

/**
 * GET /api/dashboard/super/model/:model
 * Get detailed stats for a specific model
 * Query params: period, projectId
 */
router.get('/super/model/:model', (req, res) => {
  try {
    const { model } = req.params;
    const { period, projectId } = req.query;

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const endDateTime = endDate + ' 23:59:59';

    let start;
    switch (period) {
      case '1d':
        start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        start = '2000-01-01';
        break;
      case '7d':
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
    }

    // Try metrics_daily first, fallback to requests table
    const dailyTrend = Metric.getModelDailyTrend(model, start, endDate, { projectId });
    const byProject = Metric.getModelByProject(model, start, endDate, { projectId });

    // Get summary and byApiKey from requests table (more complete data)
    const requestDetail = Request.getModelDetail(model, {
      projectId,
      startDate: start,
      endDate: endDateTime,
    });

    res.json({
      summary: requestDetail.summary,
      dailyTrend: dailyTrend.length > 0 ? dailyTrend : requestDetail.dailyTrend,
      byProject: byProject.length > 0 ? byProject : requestDetail.byProject,
      byApiKey: requestDetail.byApiKey,
      model,
      period: { start, end: endDate, label: period || '7d' },
    });
  } catch (error) {
    logger.error('Failed to get model detail', { error: error.message });
    res.status(500).json({ error: 'Failed to get model detail' });
  }
});

/**
 * GET /api/dashboard/super/apikey/:apiKeyHash/detail
 * Get detailed stats for a specific API key
 * Query params: period
 */
router.get('/super/apikey/:apiKeyHash/detail', (req, res) => {
  try {
    const { apiKeyHash } = req.params;
    const { period } = req.query;

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const endDateTime = endDate + ' 23:59:59';

    let start;
    switch (period) {
      case '1d':
        start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        start = '2000-01-01';
        break;
      case '7d':
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
    }

    const detail = Request.getApiKeyDetail(apiKeyHash, {
      startDate: start,
      endDate: endDateTime,
    });

    res.json({
      ...detail,
      period: { start, end: endDate, label: period || '7d' },
    });
  } catch (error) {
    logger.error('Failed to get API key detail', { error: error.message });
    res.status(500).json({ error: 'Failed to get API key detail' });
  }
});

/**
 * GET /api/dashboard/super
 * Full dashboard data: summary + byProject + byModel + byEndpoint + dailyTrend + byApiKey
 * Query params: period (7d|30d|90d|all), projectId
 */
router.get('/super', (req, res) => {
  try {
    const { period, projectId } = req.query;

    // Calculate date range based on period
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    // Use full datetime for requests table queries (timestamps include time)
    const endDateTime = endDate + ' 23:59:59';

    let start;
    switch (period) {
      case '1d':
        start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
        start = '2000-01-01';
        break;
      case '7d':
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
    }

    const filters = {};
    if (projectId) {
      filters.projectId = projectId;
    }

    // Get full dashboard data from metrics_daily (uses date-only strings)
    const dashboardData = Metric.getFullDashboard(start, endDate, filters);

    // Supplement with data from requests table if metrics_daily is empty
    if (dashboardData.summary.totalRequests === 0) {
      const requestStats = Request.getStats({ projectId, startDate: start, endDate: endDateTime });
      if (requestStats.totalRequests > 0) {
        dashboardData.summary = {
          totalRequests: requestStats.totalRequests || 0,
          totalTokens: requestStats.totalTokens || 0,
          totalPrompt: 0, // Not available from old requests without metrics_daily
          totalCompletion: 0,
          avgResponseTime: Math.round(requestStats.avgResponseTime || 0),
          errorRate: Math.round((requestStats.errorRate || 0) * 100) / 100,
        };

        // Get by model from requests
        dashboardData.byModel = Request.getByModel({ projectId, startDate: start, endDate: endDateTime }).map(m => ({
          model: m.model || 'unknown',
          totalRequests: m.requests,
          totalTokens: m.tokens,
          tokensPrompt: 0,
          tokensCompletion: 0,
          avgResponseTime: Math.round(m.avgResponseTime || 0),
          errorRate: 0,
        }));

        // Get hourly consumption as daily trend fallback
        const hourlyData = Request.getHourlyConsumption({ projectId, startDate: start, endDate: endDateTime });
        // Aggregate hourly into daily
        const dailyMap = {};
        for (const h of hourlyData) {
          const day = h.hour ? h.hour.split(' ')[0] : h.hour;
          if (!dailyMap[day]) {
            dailyMap[day] = { date: day, requests: 0, tokens: 0, tokensPrompt: 0, tokensCompletion: 0 };
          }
          dailyMap[day].requests += h.requests || 0;
          dailyMap[day].tokens += h.tokens || 0;
        }
        dashboardData.dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        // Get by project from requests
        const projects = Project.findAll();
        dashboardData.byProject = projects.map(p => {
          const stats = Project.getStats(p.id);
          return {
            projectId: p.id,
            projectName: p.name,
            totalRequests: stats.totalRequests || 0,
            totalTokens: stats.totalTokens || 0,
            tokensPrompt: 0,
            tokensCompletion: 0,
            avgResponseTime: Math.round(stats.avgResponseTime || 0),
            errorRate: 0,
          };
        }).filter(p => p.totalRequests > 0);

        // By endpoint from requests
        dashboardData.byEndpoint = Request.getByEndpoint({ projectId, startDate: start, endDate: endDateTime }).map(e => ({
          endpoint: e.endpoint || 'unknown',
          totalRequests: e.requests,
          totalTokens: e.tokens,
          tokensPrompt: 0,
          tokensCompletion: 0,
          avgResponseTime: Math.round(e.avgResponseTime || 0),
          errorRate: 0,
        }));
      }
    }

    // Get API keys usage
    const byApiKey = Request.getByApiKeyHash({
      projectId,
      startDate: start,
      endDate: endDateTime,
    });

    // Get total counts for summary cards
    const totalProjects = Project.findAll().length;
    const uniqueModels = dashboardData.byModel.length;

    res.json({
      ...dashboardData,
      byApiKey,
      summary: {
        ...dashboardData.summary,
        totalProjects,
        totalModels: uniqueModels,
      },
      period: { start, end: endDate, label: period || '7d' },
    });
  } catch (error) {
    logger.error('Failed to get super dashboard data', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

export default router;