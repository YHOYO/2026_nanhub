import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

import config from './config/environment.js';
import { initializeDatabase } from './config/database.js';
import logger from './utils/logger.js';
import {
  createProxy,
  authMiddleware,
  interceptMiddleware,
  compressionMiddleware,
  healthCheck,
  statsEndpoint,
  modelsPassthrough,
  embeddingsPassthrough,
  indexUpload,
  indexStatus,
  indexSearch,
} from './proxy/server.js';
import dashboardRoutes from './api/routes/dashboard.js';
import projectsRoutes from './api/routes/projects.js';

// ES Module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow AdminJS to work
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api', limiter);

// Health check endpoint (before other middleware)
app.get('/health', healthCheck);

// Stats endpoint - proxy metrics and compression stats
app.get('/stats', statsEndpoint);

// Dashboard API routes
app.use('/api/dashboard', dashboardRoutes);

// Projects API routes
app.use('/api/projects', projectsRoutes);

// AdminJS setup (lazy load to avoid startup issues)
let adminRouter = null;

async function setupAdmin() {
  try {
    const AdminJS = (await import('adminjs')).default;
    const AdminJSExpress = (await import('@adminjs/express')).default;
    
    const adminOptions = (await import('./admin/options.js')).default;
    
    const admin = new AdminJS(adminOptions);
    adminRouter = AdminJSExpress.buildRouter(admin);
    
    app.use('/admin', adminRouter);
    logger.info('AdminJS panel initialized at /admin');
  } catch (error) {
    logger.error('Failed to initialize AdminJS', { error: error.message });
    // Don't crash, just skip admin panel
  }
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Root route - redirect to admin or dashboard
app.get('/', (req, res) => {
  if (adminRouter) {
    res.redirect('/admin');
  } else {
    res.json({
      name: 'NaNProxy',
      version: '1.0.0',
      status: 'running',
      admin: adminRouter ? '/admin' : 'unavailable',
      api: '/api/dashboard',
    });
  }
});

// Authentication middleware for all /v1/* routes (validates API keys)
app.use('/v1', authMiddleware);

// Apply interception middleware for all /v1/* routes
app.use('/v1', interceptMiddleware);

// === Specific /v1 routes (handled before generic proxy) ===

// GET /v1/models - passthrough to NaN API
app.get('/v1/models', modelsPassthrough);

// POST /v1/embeddings - passthrough to NaN API
app.post('/v1/embeddings', embeddingsPassthrough);

// POST /v1/index/upload - upload files for RAG indexing
app.post('/v1/index/upload', indexUpload);

// GET /v1/index/status - get RAG index status
app.get('/v1/index/status', indexStatus);

// POST /v1/index/search - search the RAG index
app.post('/v1/index/search', indexSearch);

// === Compression middleware for chat completions ===
app.use('/v1', compressionMiddleware);

// Proxy middleware for NaN API routes (catch-all for /v1/*)
app.use('/v1', createProxy());

// NOTE: The 404 handler and error handler are registered AFTER
// setupAdmin() completes (inside start()) so that the AdminJS
// router at /admin is matched before the catch-all 404.

// Start server
async function start() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    initializeDatabase();

    // Setup AdminJS — registers /admin router
    logger.info('Setting up AdminJS...');
    await setupAdmin();

    // 404 handler — must come AFTER adminJS router registration
    app.use((req, res) => {
      res.status(404).json({
        error: {
          message: 'Not found',
          code: 'NOT_FOUND',
        },
      });
    });

    // Error handler — must come AFTER the 404 handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error', { error: err.message, stack: err.stack });
      
      res.status(500).json({
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      });
    });

    // Start listening
    app.listen(config.port, () => {
      logger.info(`NaNProxy server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Admin panel: http://localhost:${config.port}/admin`);
      logger.info(`API: http://localhost:${config.port}/api/dashboard`);
      logger.info(`Proxy target: ${config.nanApiBaseUrl}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.toString() });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Start the server
start();