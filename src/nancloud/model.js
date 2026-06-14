/**
 * NaN Cloud Image Generation - Image Model
 * 
 * This module manages image generation records in the database.
 * It stores metadata about each generated image for tracking and history.
 */

import db from '../config/database.js';
import { generateId } from '../utils/encryption.js';

const ImageGeneration = {
  tableName: 'image_generations',

  /**
   * Create a new image generation record
   */
  create(data) {
    const id = generateId();

    const stmt = db.prepare(`
      INSERT INTO ${this.tableName} (
        id, request_id, project_id, nan_image_id, prompt,
        width, height, model, seed, size_bytes,
        variants, guidance, reference_image_ids,
        original_prompt, expanded_prompt, expansion_model,
        expansion_mode, expansion_time_ms, expansion_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.requestId,
      data.projectId || null,
      data.nanImageId,
      data.prompt,
      data.width || 1024,
      data.height || 1024,
      data.model || 'flux-2-klein-9b',
      data.seed || null,
      data.sizeBytes || null,
      data.variants || 1,
      data.guidance || 3.5,
      data.referenceImageIds ? JSON.stringify(data.referenceImageIds) : null,
      data.originalPrompt || null,
      data.expandedPrompt || null,
      data.expansionModel || null,
      data.expansionMode || null,
      data.expansionTimeMs || null,
      data.expansionTokens || 0
    );

    return id;
  },

  /**
   * Create multiple image records from a generation response
   */
  createBatch(images, requestId, projectId) {
    const ids = [];

    for (const image of images) {
      const id = this.create({
        requestId,
        projectId,
        nanImageId: image.id,
        prompt: image.prompt,
        width: image.width,
        height: image.height,
        model: image.model,
        seed: image.seed,
        sizeBytes: image.sizeBytes,
      });

      ids.push(id);
    }

    return ids;
  },

  /**
   * Find image by ID
   */
  findById(id) {
    const stmt = db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    const row = stmt.get(id);

    if (row && row.reference_image_ids) {
      row.reference_image_ids = JSON.parse(row.reference_image_ids);
    }

    return row;
  },

  /**
   * Find image by NaN Cloud image ID
   */
  findByNanImageId(nanImageId) {
    const stmt = db.prepare(`SELECT * FROM ${this.tableName} WHERE nan_image_id = ?`);
    const row = stmt.get(nanImageId);

    if (row && row.reference_image_ids) {
      row.reference_image_ids = JSON.parse(row.reference_image_ids);
    }

    return row;
  },

  /**
   * Get images with pagination and filters
   */
  findAll(filters = {}, page = 1, limit = 24) {
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

    if (filters.prompt) {
      whereClause += ' AND prompt LIKE ?';
      params.push(`%${filters.prompt}%`);
    }

    if (filters.startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    const offset = (page - 1) * limit;

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`);
    const { total } = countStmt.get(...params);

    // Get paginated results
    const dataStmt = db.prepare(`
      SELECT * FROM ${this.tableName} ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);

    // Parse JSON fields
    rows.forEach(row => {
      if (row.reference_image_ids) {
        row.reference_image_ids = JSON.parse(row.reference_image_ids);
      }
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
   * Get images for a project
   */
  findByProjectId(projectId, page = 1, limit = 24) {
    return this.findAll({ projectId }, page, limit);
  },

  /**
   * Get image count by project
   */
  countByProject(projectId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE project_id = ?
    `);

    const result = stmt.get(projectId);
    return result ? result.count : 0;
  },

  /**
   * Get total image count
   */
  countAll() {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const result = stmt.get();
    return result ? result.count : 0;
  },

  /**
   * Delete image by ID
   */
  delete(id) {
    const stmt = db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Get recent images for a project
   */
  getRecent(projectId, limit = 10) {
    const stmt = db.prepare(`
      SELECT * FROM ${this.tableName}
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(projectId, limit);

    rows.forEach(row => {
      if (row.reference_image_ids) {
        row.reference_image_ids = JSON.parse(row.reference_image_ids);
      }
    });

    return rows;
  },

  /**
   * Get image statistics
   */
  getStats(projectId = null) {
    let whereClause = '';
    const params = [];

    if (projectId) {
      whereClause = 'WHERE project_id = ?';
      params.push(projectId);
    }

    const stmt = db.prepare(`
      SELECT
        COUNT(*) as totalImages,
        SUM(size_bytes) as totalSizeBytes,
        AVG(size_bytes) as avgSizeBytes,
        COUNT(DISTINCT project_id) as totalProjects
      FROM ${this.tableName}
      ${whereClause}
    `);

    return stmt.get(...params);
  },

  /**
   * Get images grouped by request_id (for gallery display)
   * Each group represents one generation request with its variants
   */
  findGroupedByRequestId(filters = {}, page = 1, limit = 20) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    // Get distinct request_ids with their latest created_at for ordering
    const groupQuery = `
      SELECT request_id, MIN(created_at) as created_at
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY request_id
      ORDER BY MIN(created_at) DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (page - 1) * limit;
    const groups = db.prepare(groupQuery).all(...params, limit, offset);

    // Get total count of groups
    const countQuery = `SELECT COUNT(DISTINCT request_id) as total FROM ${this.tableName} ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // For each group, get all images
    const result = [];
    for (const group of groups) {
      if (!group.request_id) continue;

      const images = db.prepare(
        `SELECT * FROM ${this.tableName} WHERE request_id = ? ORDER BY created_at ASC`
      ).all(group.request_id);

      // Use the first image's metadata for the group (all images in a group share the same prompt/settings)
      const first = images[0];

      result.push({
        request_id: group.request_id,
        original_prompt: first.original_prompt || first.prompt,
        expanded_prompt: first.expanded_prompt || null,
        expansion_model: first.expansion_model || null,
        expansion_mode: first.expansion_mode || null,
        expansion_time_ms: first.expansion_time_ms || null,
        expansion_tokens: first.expansion_tokens || 0,
        prompt: first.prompt,
        width: first.width,
        height: first.height,
        model: first.model,
        guidance: first.guidance,
        variants: images.length,
        created_at: group.created_at,
        images: images.map(img => ({
          id: img.nan_image_id,
          db_id: img.id,
          url: `/api/nancloud/images/${img.nan_image_id}/file`,
          seed: img.seed,
          size_bytes: img.size_bytes,
          created_at: img.created_at,
        })),
      });
    }

    return {
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get generation quota stats
   */
  getQuotaStats() {
    const stmt = db.prepare(`
      SELECT
        COUNT(DISTINCT request_id) as totalGenerations,
        COUNT(*) as totalImages
      FROM ${this.tableName}
    `);
    return stmt.get();
  },

  // ============================================================
  // Remote Image Sync Methods
  // ============================================================

  /**
   * Find existing images by a batch of NaN Cloud image IDs (for deduplication)
   * Returns a Set of nan_image_ids that already exist in the DB
   */
  findByNanImageIds(nanImageIds) {
    if (!nanImageIds || nanImageIds.length === 0) return new Set();

    // SQLite has a limit on IN clause parameters; batch in groups of 500
    const existingIds = new Set();
    for (let i = 0; i < nanImageIds.length; i += 500) {
      const batch = nanImageIds.slice(i, i + 500);
      const placeholders = batch.map(() => '?').join(',');
      const stmt = db.prepare(
        `SELECT nan_image_id FROM ${this.tableName} WHERE nan_image_id IN (${placeholders})`
      );
      const rows = stmt.all(...batch);
      for (const row of rows) {
        existingIds.add(row.nan_image_id);
      }
    }
    return existingIds;
  },

  /**
   * Insert remote images from NaN Cloud into the local DB
   * Uses source='remote' to distinguish from locally generated images
   * Returns { inserted: number, skipped: number, ids: string[] }
   */
  insertRemoteBatch(images, projectId = null) {
    const ids = [];
    let skipped = 0;

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO ${this.tableName} (
        id, request_id, project_id, nan_image_id, prompt,
        width, height, model, seed, size_bytes,
        variants, guidance, reference_image_ids,
        original_prompt, source, nan_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'remote', ?)
    `);

    const insertAll = db.transaction((imgs) => {
      for (const image of imgs) {
        // Skip if nan_image_id already exists (INSERT OR IGNORE + pre-check)
        const id = generateId();
        try {
          stmt.run(
            id,
            null, // request_id: NULL for remote images (no FK reference)
            projectId || null,
            image.id || image.nan_image_id || id,
            image.prompt || '',
            image.width || 1024,
            image.height || 1024,
            image.model || 'flux-2-klein-9b',
            image.seed || null,
            image.sizeBytes || image.size_bytes || null,
            image.variants || 1,
            image.guidance || 3.5,
            null, // reference_image_ids
            image.prompt || null, // original_prompt
            image.requestId || null // nan_request_id from NaN Cloud API
          );
          ids.push(id);
        } catch (err) {
          // Duplicate nan_image_id or other constraint violation
          skipped++;
          console.error('[Model] insertRemoteBatch error:', err.message, {
            nan_image_id: image.id,
            prompt_length: (image.prompt || '').length,
          });
        }
      }
    });

    insertAll(images);
    return { inserted: ids.length, skipped, ids };
  },

  /**
   * Get remote images grouped for gallery display
   * Groups by prompt similarity + time window (5 min) for remote images
   */
  findRemoteGrouped(filters = {}, page = 1, limit = 20) {
    let whereClause = "WHERE source = 'remote'";
    const params = [];

    if (filters.projectId) {
      whereClause += ' AND project_id = ?';
      params.push(filters.projectId);
    }

    // Group by nan_request_id (images from same NaN Cloud generation request)
    // Images without nan_request_id are grouped by their own nan_image_id
    const groupQuery = `
      SELECT COALESCE(nan_request_id, nan_image_id) as group_id, MIN(created_at) as created_at, COUNT(*) as image_count
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY COALESCE(nan_request_id, nan_image_id)
      ORDER BY MIN(created_at) DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (page - 1) * limit;
    const groups = db.prepare(groupQuery).all(...params, limit, offset);

    // Get total count of groups
    const countQuery = `SELECT COUNT(DISTINCT COALESCE(nan_request_id, nan_image_id)) as total FROM ${this.tableName} ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // For each group, get all images
    const result = [];
    for (const group of groups) {
      // Try to get images by nan_request_id first, fallback to nan_image_id
      let images = [];
      if (group.group_id && !group.group_id.startsWith('nan-')) {
        // It's a nan_request_id (UUID format)
        images = db.prepare(
          `SELECT * FROM ${this.tableName} WHERE nan_request_id = ? AND source = 'remote' ORDER BY created_at ASC`
        ).all(group.group_id);
      }
      if (images.length === 0) {
        // Fallback: get by nan_image_id (for images without nan_request_id)
        images = db.prepare(
          `SELECT * FROM ${this.tableName} WHERE nan_image_id = ? AND source = 'remote' ORDER BY created_at ASC`
        ).all(group.group_id);
      }

      if (images.length === 0) continue;

      const first = images[0];

      result.push({
        request_id: first.nan_request_id || `remote_${first.nan_image_id}`,
        original_prompt: first.original_prompt || first.prompt,
        prompt: first.prompt,
        width: first.width,
        height: first.height,
        model: first.model,
        guidance: first.guidance,
        variants: images.length,
        source: 'remote',
        created_at: group.created_at,
        images: images.map(img => ({
          id: img.nan_image_id,
          db_id: img.id,
          url: `https://cloud-api.nan.builders/api/images/${img.nan_image_id}/file`,
          proxy_url: `/api/nancloud/images/${img.nan_image_id}/file`,
          seed: img.seed,
          size_bytes: img.size_bytes,
          created_at: img.created_at,
        })),
      });
    }

    return {
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get sync state from nancloud_sync_state table
   */
  getSyncState() {
    try {
      const row = db.prepare('SELECT * FROM nancloud_sync_state ORDER BY updated_at DESC LIMIT 1').get();
      return row || null;
    } catch {
      return null;
    }
  },

  /**
   * Update sync state after a sync operation
   */
  updateSyncState(stats) {
    const id = generateId();
    try {
      const existing = this.getSyncState();
      if (existing) {
        db.prepare(`
          UPDATE nancloud_sync_state SET
            last_synced_at = datetime('now'),
            total_synced = total_synced + ?,
            total_new = total_new + ?,
            total_skipped = total_skipped + ?,
            last_sync_duration_ms = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          stats.totalSynced || 0,
          stats.newImages || 0,
          stats.skipped || 0,
          stats.durationMs || 0,
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO nancloud_sync_state (id, last_synced_at, total_synced, total_new, total_skipped, last_sync_duration_ms)
          VALUES (?, datetime('now'), ?, ?, ?, ?)
        `).run(
          id,
          stats.totalSynced || 0,
          stats.newImages || 0,
          stats.skipped || 0,
          stats.durationMs || 0
        );
      }
    } catch (err) {
      console.error('[Model] Error updating sync state:', err.message);
    }
  },

  /**
   * Count images by source
   */
  countBySource(source) {
    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE source = ?`
    );
    const result = stmt.get(source);
    return result ? result.count : 0;
  },
};

export default ImageGeneration;
