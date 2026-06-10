import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate required environment variables
const requiredEnvVars = [
  'NAN_API_KEY',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error(`[Config] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Export configuration
const config = {
  // Server
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // NaN API
  nanApiBaseUrl: process.env.NAN_BASE_URL || 'https://api.nan.builders/v1',
  nanApiKey: process.env.NAN_API_KEY || '',

  // Database
  databasePath: process.env.DATABASE_PATH || '/data/nanproxy.db',

  // Admin Panel
  adminEmail: process.env.ADMIN_EMAIL || 'admin@nanproxy.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  jwtSecret: process.env.JWT_SECRET || 'nanproxy-default-secret-change-me',

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logPath: process.env.LOG_PATH || './logs',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Proxy
  proxyTimeout: parseInt(process.env.PROXY_TIMEOUT || '120000', 10),
};

export default config;