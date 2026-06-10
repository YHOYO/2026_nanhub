import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_PATH = process.env.DATABASE_PATH || './database/nanproxy.db';

// Ensure database directory exists
const dbDir = path.dirname(path.resolve(DATABASE_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
const db = new Database(path.resolve(DATABASE_PATH));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
  console.log('[Database] Initializing schema...');

  db.exec(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_key_hash TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Requests table (main interception data)
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      timestamp TEXT DEFAULT (datetime('now')),
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key_hash TEXT,
      client_ip TEXT,
      user_agent TEXT,
      request_body TEXT,
      response_status INTEGER,
      response_body TEXT,
      response_time_ms INTEGER,
      tokens_prompt INTEGER DEFAULT 0,
      tokens_completion INTEGER DEFAULT 0,
      tokens_total INTEGER DEFAULT 0,
      model TEXT,
      project_id TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Daily metrics table (aggregated by date + project + model + endpoint)
    CREATE TABLE IF NOT EXISTS metrics_daily (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      project_id TEXT,
      model TEXT,
      endpoint TEXT DEFAULT 'unknown',
      total_requests INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      tokens_prompt INTEGER DEFAULT 0,
      tokens_completion INTEGER DEFAULT 0,
      avg_response_time_ms REAL DEFAULT 0,
      error_rate REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, project_id, model, endpoint),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Dashboard API keys
    CREATE TABLE IF NOT EXISTS dashboard_api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      project_id TEXT,
      permissions TEXT DEFAULT '{"read": true, "write": false}',
      last_used_at TEXT,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Project API keys (multiple keys per project)
    CREATE TABLE IF NOT EXISTS project_api_keys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      name TEXT DEFAULT 'Default',
      is_active INTEGER DEFAULT 1,
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- NaN Cloud Sessions table
    CREATE TABLE IF NOT EXISTS nancloud_sessions (
      id TEXT PRIMARY KEY,
      session_cookie TEXT NOT NULL,
      username TEXT,
      email TEXT,
      expires_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- NaN Cloud Image Generations table
    CREATE TABLE IF NOT EXISTS image_generations (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      project_id TEXT,
      nan_image_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      model TEXT DEFAULT 'flux-2-klein-9b',
      seed INTEGER,
      size_bytes INTEGER,
      variants INTEGER DEFAULT 1,
      guidance REAL DEFAULT 3.5,
      reference_image_ids TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES requests(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_project ON requests(project_id);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
    CREATE INDEX IF NOT EXISTS idx_requests_api_key ON requests(api_key_hash);
    CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON metrics_daily(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_daily_project ON metrics_daily(project_id);
    CREATE INDEX IF NOT EXISTS idx_projects_api_key ON projects(api_key_hash);
    CREATE INDEX IF NOT EXISTS idx_project_api_keys_hash ON project_api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_project_api_keys_project ON project_api_keys(project_id);
    CREATE INDEX IF NOT EXISTS idx_nancloud_sessions_active ON nancloud_sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_nancloud_sessions_expiry ON nancloud_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_image_gen_request ON image_generations(request_id);
    CREATE INDEX IF NOT EXISTS idx_image_gen_project ON image_generations(project_id);
    CREATE INDEX IF NOT EXISTS idx_image_gen_nan_id ON image_generations(nan_image_id);
  `);

  // Migration: move existing api_key_hash from projects to project_api_keys
  migrateProjectApiKeys();

  // Migration: add new columns to metrics_daily for existing databases
  migrateMetricsDaily();

  // Migration: add prompt expansion columns to image_generations
  migrateImageGenerationsExpansion();

  console.log('[Database] Schema initialized successfully');
}

/**
 * Migrate existing single API key from projects table to project_api_keys table
 * This is idempotent: checks per-project if the hash already exists before inserting.
 */
function migrateProjectApiKeys() {
  try {
    // Check if projects table has api_key_hash column
    const tableInfo = db.prepare("PRAGMA table_info(projects)").all();
    const hasApiKeyHash = tableInfo.some(col => col.name === 'api_key_hash');

    if (!hasApiKeyHash) {
      console.log('[Migration] projects.api_key_hash column not found, skipping migration');
      return;
    }

    // Find projects with existing api_key_hash
    const projects = db.prepare(
      "SELECT id, api_key_hash FROM projects WHERE api_key_hash IS NOT NULL AND api_key_hash != ''"
    ).all();

    if (projects.length === 0) {
      console.log('[Migration] No existing API keys to migrate');
      return;
    }

    let migrated = 0;

    const insert = db.prepare(`
      INSERT INTO project_api_keys (id, project_id, key_hash, name, is_active, created_at)
      VALUES (?, ?, ?, 'Primera Key', 1, datetime('now'))
    `);

    const checkExists = db.prepare(
      'SELECT COUNT(*) as cnt FROM project_api_keys WHERE project_id = ? AND key_hash = ?'
    );

    // Also clean up duplicates: keep only the first key per project
    cleanupDuplicateKeys();

    const migrateTransaction = db.transaction(() => {
      for (const project of projects) {
        const existing = checkExists.get(project.id, project.api_key_hash);
        if (existing.cnt === 0) {
          insert.run(
            crypto.randomUUID(),
            project.id,
            project.api_key_hash
          );
          migrated++;
        }
      }
    });

    migrateTransaction();

    if (migrated > 0) {
      console.log(`[Migration] Migrated ${migrated} new API key(s) from projects to project_api_keys`);
    } else {
      console.log('[Migration] All API keys already migrated');
    }
  } catch (error) {
    console.error('[Migration] Error migrating API keys:', error.message);
    // Don't crash - migration failure shouldn't prevent startup
  }
}

/**
 * Migrate metrics_daily table: add tokens_prompt, tokens_completion, endpoint columns
 * for databases created before the dashboard metrics enhancement.
 */
function migrateMetricsDaily() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(metrics_daily)").all();
    const existingColumns = tableInfo.map(col => col.name);

    // Check if the UNIQUE constraint includes 'endpoint'
    // If not, we need to recreate the table (SQLite doesn't support ALTER CONSTRAINT)
    const constraints = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='metrics_daily'").get();
    const hasEndpointUnique = constraints && constraints.sql && constraints.sql.includes('UNIQUE(date, project_id, model, endpoint)');

    if (!hasEndpointUnique) {
      // Recreate the table with the correct UNIQUE constraint
      const rowCount = db.prepare("SELECT COUNT(*) as cnt FROM metrics_daily").get();
      console.log(`[Migration] Recreating metrics_daily table (current rows: ${rowCount.cnt})`);

      // Save existing data if any
      const existingData = db.prepare("SELECT * FROM metrics_daily").all();

      db.exec("DROP TABLE IF EXISTS metrics_daily");
      db.exec(`
        CREATE TABLE metrics_daily (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          project_id TEXT,
          model TEXT,
          endpoint TEXT DEFAULT 'unknown',
          total_requests INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          tokens_prompt INTEGER DEFAULT 0,
          tokens_completion INTEGER DEFAULT 0,
          avg_response_time_ms REAL DEFAULT 0,
          error_rate REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(date, project_id, model, endpoint),
          FOREIGN KEY (project_id) REFERENCES projects(id)
        )
      `);

      // Restore data if there was any
      if (existingData.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO metrics_daily
            (id, date, project_id, model, endpoint, total_requests, total_tokens, tokens_prompt, tokens_completion, avg_response_time_ms, error_rate, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of existingData) {
          insert.run(row.id, row.date, row.project_id, row.model, row.endpoint || 'unknown', row.total_requests, row.total_tokens, row.tokens_prompt || 0, row.tokens_completion || 0, row.avg_response_time_ms, row.error_rate, row.created_at);
        }
        console.log(`[Migration] Restored ${existingData.length} rows to metrics_daily`);
      }

      console.log('[Migration] Recreated metrics_daily with correct UNIQUE constraint');
    }

    // Create new indexes if they don't exist
    db.exec("CREATE INDEX IF NOT EXISTS idx_metrics_daily_model ON metrics_daily(model)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_metrics_daily_endpoint ON metrics_daily(endpoint)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_requests_endpoint ON requests(endpoint)");
  } catch (error) {
    console.error('[Migration] Error migrating metrics_daily:', error.message);
    // Don't crash - migration failure shouldn't prevent startup
  }
}

/**
 * Remove duplicate keys: keep only the oldest key per project_id + key_hash combination
 */
function cleanupDuplicateKeys() {
  try {
    const duplicates = db.prepare(`
      SELECT id FROM project_api_keys
      WHERE id NOT IN (
        SELECT MIN(id) FROM project_api_keys GROUP BY project_id, key_hash
      )
    `).all();

    if (duplicates.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM project_api_keys WHERE id = ?');
      const deleteTransaction = db.transaction(() => {
        for (const dup of duplicates) {
          deleteStmt.run(dup.id);
        }
      });
      deleteTransaction();
      console.log(`[Migration] Cleaned up ${duplicates.length} duplicate key(s)`);
    }
  } catch (error) {
    console.error('[Migration] Error cleaning duplicates:', error.message);
  }
}

/**
 * Migration: add prompt expansion tracking columns to image_generations table
 * Stores original prompt, LLM-expanded prompt, model used, and token costs.
 */
function migrateImageGenerationsExpansion() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(image_generations)").all();
    const existingColumns = tableInfo.map(col => col.name);

    const newColumns = [
      { name: 'original_prompt', definition: 'TEXT' },
      { name: 'expanded_prompt', definition: 'TEXT' },
      { name: 'expansion_model', definition: 'TEXT' },
      { name: 'expansion_mode', definition: 'TEXT' },
      { name: 'expansion_time_ms', definition: 'INTEGER' },
      { name: 'expansion_tokens', definition: 'INTEGER DEFAULT 0' },
    ];

    let added = 0;
    for (const col of newColumns) {
      if (!existingColumns.includes(col.name)) {
        db.exec(`ALTER TABLE image_generations ADD COLUMN ${col.name} ${col.definition}`);
        added++;
        console.log(`[Migration] Added image_generations.${col.name}`);
      }
    }

    if (added > 0) {
      console.log(`[Migration] Added ${added} prompt expansion columns to image_generations`);
    } else {
      console.log('[Migration] image_generations expansion columns already exist');
    }
  } catch (error) {
    console.error('[Migration] Error migrating image_generations expansion:', error.message);
    // Don't crash - migration failure shouldn't prevent startup
  }
}

export default db;