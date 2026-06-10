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
};

export default ImageGeneration;
