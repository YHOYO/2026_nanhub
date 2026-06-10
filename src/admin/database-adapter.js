/**
 * Custom AdminJS Database Adapter for better-sqlite3
 *
 * Implements the AdminJS dual-adapter pattern:
 *   - SqliteResource (extends BaseResource) — wraps a single table
 *   - SqliteDatabase (extends BaseDatabase) — wraps the whole DB
 *
 * Both are registered via AdminJS.registerAdapter() so that the
 * ResourcesFactory can match raw model objects to the right adapter.
 */

import AdminJS, { BaseResource, BaseDatabase, BaseProperty } from 'adminjs';
import db from '../config/database.js';

// ── SQL operator map ────────────────────────────────────────────
const CONDITIONS = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'LIKE',
};

// ── Map SQLite column types → AdminJS property types ────────────
function mapSqliteType(sqliteType) {
  if (!sqliteType) return 'string';
  const t = sqliteType.toUpperCase();
  if (t.includes('INT')) return 'number';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) return 'number';
  if (t.includes('BLOB')) return 'byte';
  if (t.includes('DATETIME') || t.includes('TIMESTAMP') || t.includes('DATE')) return 'datetime';
  if (t.includes('BOOLEAN')) return 'boolean';
  return 'string';
}

// ═══════════════════════════════════════════════════════════════
//  SqliteResource — wraps one SQLite table as an AdminJS Resource
// ═══════════════════════════════════════════════════════════════
class SqliteResource extends BaseResource {
  #tableName;
  #databaseName;
  #cachedProperties;

  /**
   * AdminJS calls this to decide which adapter handles a given
   * raw resource object.  Our models are plain objects with a
   * `tableName` string property, so we match on that.
   */
  static isAdapterFor(rawResource) {
    return (
      rawResource != null &&
      typeof rawResource === 'object' &&
      typeof rawResource.tableName === 'string'
    );
  }

  constructor(rawResource) {
    super(rawResource);
    this.#tableName = rawResource.tableName;
    this.#databaseName = 'NaNProxy';
    this.#cachedProperties = null;
  }

  // ── Identity ───────────────────────────────────────────────
  databaseName() {
    return this.#databaseName;
  }

  databaseType() {
    return 'sqlite';
  }

  id() {
    return this.#tableName;
  }

  // ── Schema introspection ───────────────────────────────────
  properties() {
    if (!this.#cachedProperties) {
      const stmt = db.prepare(`PRAGMA table_info(${this.#tableName})`);
      const columns = stmt.all();
      this.#cachedProperties = columns.map(
        (col, idx) =>
          new BaseProperty({
            path: col.name,
            type: mapSqliteType(col.type),
            isId: col.pk === 1,
            isSortable: true,
            position: idx + 1,
          }),
      );
    }
    return this.#cachedProperties;
  }

  property(path) {
    return this.properties().find((p) => p.name() === path) || null;
  }

  // ── Helpers ────────────────────────────────────────────────
  #buildWhere(filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return { sql: '', params: [] };
    }

    const clauses = [];
    const params = [];

    for (const [field, entry] of Object.entries(filters)) {
      const value = entry?.value;
      if (value === null || value === undefined || value === '') continue;

      // Handle date-range objects { from, to }
      if (typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value)) {
        if (value.from) {
          clauses.push(`"${field}" >= ?`);
          params.push(value.from);
        }
        if (value.to) {
          clauses.push(`"${field}" <= ?`);
          params.push(value.to);
        }
        continue;
      }

      // Handle array / IN
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        const placeholders = value.map(() => '?').join(', ');
        clauses.push(`"${field}" IN (${placeholders})`);
        params.push(...value);
        continue;
      }

      // Handle LIKE / ILIKE
      if (typeof value === 'string' && (value.includes('%') || value.includes('_'))) {
        clauses.push(`"${field}" LIKE ?`);
        params.push(value);
        continue;
      }

      // Default: equality
      clauses.push(`"${field}" = ?`);
      params.push(value);
    }

    if (clauses.length === 0) return { sql: '', params: [] };
    return { sql: `WHERE ${clauses.join(' AND ')}`, params };
  }

  // ── CRUD ───────────────────────────────────────────────────

  async find(filter, options = {}, _context) {
    let query = `SELECT * FROM "${this.#tableName}"`;
    const params = [];

    // Filter
    const where = this.#buildWhere(filter?.filters);
    if (where.sql) {
      query += ` ${where.sql}`;
      params.push(...where.params);
    }

    // Sort
    if (options.sort?.sortBy) {
      const dir = options.sort.direction === 'desc' ? 'DESC' : 'ASC';
      query += ` ORDER BY "${options.sort.sortBy}" ${dir}`;
    }

    // Pagination
    if (options.limit != null) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset != null) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    try {
      const rows = db.prepare(query).all(...params);
      // AdminJS expects BaseRecord instances from find()
      return rows.map((row) => this.build(row));
    } catch (err) {
      console.error('[AdminJS SqliteResource] find error:', err.message, { query, params });
      throw err;
    }
  }

  async findOne(id, _context) {
    // Determine the primary-key column name
    const idProp = this.properties().find((p) => p.isId());
    const pk = idProp ? idProp.name() : 'id';
    const row = db.prepare(`SELECT * FROM "${this.#tableName}" WHERE "${pk}" = ?`).get(id);
    return row ? this.build(row) : null;
  }

  async findMany(ids, _context) {
    const idProp = this.properties().find((p) => p.isId());
    const pk = idProp ? idProp.name() : 'id';
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT * FROM "${this.#tableName}" WHERE "${pk}" IN (${placeholders})`)
      .all(...ids);
    return rows.map((row) => this.build(row));
  }

  async count(filter, _context) {
    let query = `SELECT COUNT(*) AS total FROM "${this.#tableName}"`;
    const params = [];

    const where = this.#buildWhere(filter?.filters);
    if (where.sql) {
      query += ` ${where.sql}`;
      params.push(...where.params);
    }

    const result = db.prepare(query).get(...params);
    return result?.total ?? 0;
  }

  async create(params, _context) {
    const keys = Object.keys(params).filter((k) => params[k] !== undefined);
    if (keys.length === 0) return params;

    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => params[k]);
    const sql = `INSERT INTO "${this.#tableName}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`;

    try {
      const result = db.prepare(sql).run(...values);
      // Return the newly created row
      const idProp = this.properties().find((p) => p.isId());
      if (idProp && result.lastInsertRowid) {
        const row = db
          .prepare(`SELECT * FROM "${this.#tableName}" WHERE "${idProp.name()}" = ?`)
          .get(result.lastInsertRowid);
        if (row) return row;
      }
      return params;
    } catch (err) {
      console.error('[AdminJS SqliteResource] create error:', err.message, { sql, params });
      throw err;
    }
  }

  async update(id, params, _context) {
    const idProp = this.properties().find((p) => p.isId());
    const pk = idProp ? idProp.name() : 'id';

    const keys = Object.keys(params).filter((k) => k !== pk && params[k] !== undefined);
    if (keys.length === 0) {
      // Nothing to update — just return current row
      const row = db.prepare(`SELECT * FROM "${this.#tableName}" WHERE "${pk}" = ?`).get(id);
      return row || params;
    }

    const setClauses = keys.map((k) => `"${k}" = ?`);
    const values = keys.map((k) => params[k]);
    values.push(id);
    const sql = `UPDATE "${this.#tableName}" SET ${setClauses.join(', ')} WHERE "${pk}" = ?`;

    try {
      db.prepare(sql).run(...values);
      const row = db.prepare(`SELECT * FROM "${this.#tableName}" WHERE "${pk}" = ?`).get(id);
      return row || params;
    } catch (err) {
      console.error('[AdminJS SqliteResource] update error:', err.message, { sql, params });
      throw err;
    }
  }

  async delete(id, _context) {
    const idProp = this.properties().find((p) => p.isId());
    const pk = idProp ? idProp.name() : 'id';
    db.prepare(`DELETE FROM "${this.#tableName}" WHERE "${pk}" = ?`).run(id);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SqliteDatabase — wraps the whole better-sqlite3 instance
// ═══════════════════════════════════════════════════════════════
class SqliteDatabase extends BaseDatabase {
  static isAdapterFor(database) {
    return (
      database != null &&
      typeof database.prepare === 'function' &&
      typeof database.pragma === 'function'
    );
  }

  constructor(database) {
    super(database);
  }

  resources() {
    // When using the `databases` admin option, AdminJS calls this
    // to auto-discover all tables.
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();

    return tables.map(
      (t) =>
        new SqliteResource({
          tableName: t.name,
        }),
    );
  }
}

// ── Register the adapter pair with AdminJS ──────────────────────
AdminJS.registerAdapter({ Database: SqliteDatabase, Resource: SqliteResource });

export default SqliteDatabase;
