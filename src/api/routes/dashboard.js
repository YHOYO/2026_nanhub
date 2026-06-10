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

export default router;