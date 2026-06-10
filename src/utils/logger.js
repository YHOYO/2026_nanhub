import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/environment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure log directory exists
const logDir = path.resolve(config.logPath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;

// Format timestamp
function getTimestamp() {
  return new Date().toISOString();
}

// Format log message
function formatMessage(level, message, data = null) {
  const timestamp = getTimestamp();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

// Write to file
function writeToFile(filename, content) {
  const filePath = path.join(logDir, filename);
  fs.appendFileSync(filePath, content + '\n', 'utf8');
}

// Logger object
const logger = {
  error(message, data = null) {
    if (currentLevel >= LOG_LEVELS.error) {
      const formatted = formatMessage('error', message, data);
      console.error(formatted);
      writeToFile('error.log', formatted);
      writeToFile('combined.log', formatted);
    }
  },

  warn(message, data = null) {
    if (currentLevel >= LOG_LEVELS.warn) {
      const formatted = formatMessage('warn', message, data);
      console.warn(formatted);
      writeToFile('warn.log', formatted);
      writeToFile('combined.log', formatted);
    }
  },

  info(message, data = null) {
    if (currentLevel >= LOG_LEVELS.info) {
      const formatted = formatMessage('info', message, data);
      console.log(formatted);
      writeToFile('info.log', formatted);
      writeToFile('combined.log', formatted);
    }
  },

  debug(message, data = null) {
    if (currentLevel >= LOG_LEVELS.debug) {
      const formatted = formatMessage('debug', message, data);
      console.log(formatted);
      writeToFile('debug.log', formatted);
      writeToFile('combined.log', formatted);
    }
  },

  // Log HTTP request
  request(method, url, statusCode, responseTimeMs, metadata = {}) {
    const message = `${method} ${url} ${statusCode} ${responseTimeMs}ms`;
    const data = { method, url, statusCode, responseTimeMs, ...metadata };
    
    if (statusCode >= 500) {
      this.error(message, data);
    } else if (statusCode >= 400) {
      this.warn(message, data);
    } else {
      this.info(message, data);
    }
  },

  // Log proxy event
  proxy(event, data = {}) {
    this.debug(`[Proxy] ${event}`, data);
  },

  // Log database event
  database(event, data = {}) {
    this.debug(`[Database] ${event}`, data);
  },
};

export default logger;