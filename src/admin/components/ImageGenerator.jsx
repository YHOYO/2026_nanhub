import React, { useState, useEffect, useCallback } from 'react';

/**
 * ImageGenerator - Admin page for generating images with FLUX.2
 * Renders inside AdminJS at /admin/pages/image-generator
 *
 * Features:
 * - Prompt textarea with aspect ratio selector
 * - Automatic 4-variant generation
 * - Gallery with grouped variants (Local + NaN Cloud tabs)
 * - Image detail modal with full metadata
 * - Remote image sync from NaN Cloud platform
 */

const ASPECT_RATIOS = [
  { key: '1:1', label: '1:1', w: 18, h: 18 },
  { key: '16:9', label: '16:9', w: 22, h: 12 },
  { key: '9:16', label: '9:16', w: 12, h: 22 },
];

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '280px minmax(0, 1fr)',
    gap: '24px',
    alignItems: 'start',
  },
  // Left panel
  panel: {
    position: 'sticky',
    top: '24px',
    background: '#0a0a0a',
    border: '1px solid rgba(30,30,46,0.6)',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  label: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#71717a',
    marginBottom: '6px',
    display: 'block',
  },
  textarea: {
    width: '100%',
    resize: 'none',
    borderRadius: '8px',
    border: '1px solid #27272a',
    background: '#000',
    padding: '10px 12px',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '13px',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    lineHeight: '1.5',
  },
  ratioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '6px',
  },
  ratioBtn: (active) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    borderRadius: '8px',
    border: active ? '1px solid rgba(139,92,246,0.6)' : '1px solid #27272a',
    background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
    color: active ? '#a78bfa' : '#71717a',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  generateBtn: (disabled) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: disabled ? 'rgba(139,92,246,0.5)' : '#8b5cf6',
    color: '#fff',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.15s',
    marginTop: '8px',
  }),
  quotaText: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '11px',
    color: '#52525b',
    textAlign: 'center',
    marginTop: '4px',
  },
  // Right section
  sectionHeader: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#71717a',
    marginBottom: '12px',
  },
  galleryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  // Group card
  groupCard: {
    border: '1px solid rgba(30,30,46,0.6)',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#0a0a0a',
    cursor: 'pointer',
    transition: 'transform 0.15s, border-color 0.15s',
  },
  groupPreview: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px',
    background: '#18181b',
  },
  groupPreviewImg: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    display: 'block',
  },
  groupInfo: {
    padding: '10px 12px',
  },
  groupPrompt: {
    fontSize: '12px',
    color: '#d4d4d8',
    lineHeight: '1.4',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    margin: 0,
  },
  groupMeta: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '10px',
    color: '#52525b',
    marginTop: '6px',
    display: 'flex',
    gap: '12px',
  },
  // Modal overlay
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  modalContent: {
    background: '#0a0a0a',
    border: '1px solid #27272a',
    borderRadius: '12px',
    maxWidth: '1100px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
  },
  modalImageSection: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderRight: '1px solid #27272a',
  },
  modalImage: {
    width: '100%',
    borderRadius: '8px',
    objectFit: 'contain',
    maxHeight: '60vh',
    background: '#000',
  },
  modalThumbs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px',
  },
  modalThumb: (active) => ({
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    borderRadius: '6px',
    border: active ? '2px solid #8b5cf6' : '2px solid transparent',
    cursor: 'pointer',
    opacity: active ? 1 : 0.6,
    transition: 'all 0.15s',
  }),
  modalDetails: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    maxHeight: '90vh',
  },
  detailSection: {
    borderBottom: '1px solid #27272a',
    paddingBottom: '12px',
  },
  detailLabel: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#52525b',
    marginBottom: '4px',
  },
  detailValue: {
    fontSize: '13px',
    color: '#d4d4d8',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  jsonBlock: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '10px',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '10px',
    color: '#a1a1aa',
    lineHeight: '1.5',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    maxHeight: '200px',
    overflowY: 'auto',
    margin: 0,
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid #27272a',
    background: '#18181b',
    color: '#a1a1aa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    zIndex: 10000,
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#52525b',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  // Tab styles
  tabBar: {
    display: 'flex',
    gap: '2px',
    marginBottom: '16px',
    background: '#18181b',
    borderRadius: '10px',
    padding: '3px',
    border: '1px solid rgba(30,30,46,0.6)',
  },
  tab: (active) => ({
    flex: 1,
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: active ? '#8b5cf6' : 'transparent',
    color: active ? '#fff' : '#71717a',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  }),
  syncBtn: (disabled) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(34,197,94,0.3)',
    background: disabled ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)',
    color: disabled ? '#22c55e' : '#4ade80',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
    width: '100%',
  }),
  syncBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '12px',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: '10px',
    color: '#4ade80',
  },
};

// Inject keyframes for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
if (!document.querySelector('#image-gen-styles')) {
  styleSheet.id = 'image-gen-styles';
  document.head.appendChild(styleSheet);
}

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [variants, setVariants] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [groups, setGroups] = useState([]);
  const [quota, setQuota] = useState({ total: 50, used: 0, remaining: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab state
  const [activeTab, setActiveTab] = useState('local'); // 'local' | 'remote'

  // Remote gallery state
  const [remoteGroups, setRemoteGroups] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteSyncing, setRemoteSyncing] = useState(false);
  const [remoteSyncResult, setRemoteSyncResult] = useState(null);
  const [remoteSyncState, setRemoteSyncState] = useState(null);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [remoteNextOffset, setRemoteNextOffset] = useState(0);
  const [remoteTotalAvailable, setRemoteTotalAvailable] = useState(0);

  // Modal state
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);

  // Fetch grouped images (local)
  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/nancloud/images/grouped?limit=50');
      const data = await res.json();
      if (data.success) {
        setGroups(data.data.groups || []);
        setQuota(data.data.quota || { total: 50, used: 0, remaining: 50 });
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch remote grouped images
  const fetchRemoteGroups = useCallback(async () => {
    setRemoteLoading(true);
    try {
      const res = await fetch('/api/nancloud/images/remote-grouped?limit=50');
      const data = await res.json();
      if (data.success) {
        // Ensure groups is always a plain array of serializable objects
        const groups = Array.isArray(data.data.groups)
          ? data.data.groups.map(g => ({
              ...g,
              images: Array.isArray(g.images) ? g.images.map(img => ({
                id: img.id,
                db_id: img.db_id,
                url: img.url || '',
                seed: img.seed,
                size_bytes: img.size_bytes,
                created_at: img.created_at,
              })) : [],
            }))
          : [];
        setRemoteGroups(groups);
        const sync = data.data.sync || null;
        setRemoteSyncState(sync ? {
          total_synced: sync.total_synced || 0,
          last_synced_at: sync.last_synced_at || null,
          last_sync_new: sync.last_sync_new || 0,
          last_sync_skipped: sync.last_sync_skipped || 0,
        } : null);
      }
    } catch (err) {
      console.error('Failed to fetch remote groups:', err);
    } finally {
      setRemoteLoading(false);
    }
  }, []);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/nancloud/images/sync-status');
      const data = await res.json();
      if (data.success) {
        setRemoteSyncState(data.data.sync_state);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Fetch remote data when switching to remote tab
  useEffect(() => {
    if (activeTab === 'remote') {
      fetchRemoteGroups();
    }
  }, [activeTab, fetchRemoteGroups]);

  // Generate images
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/nancloud/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          variants: variants,
          enhance_prompt: true,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Generation failed');
      }

      // Refresh gallery
      await fetchGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Sync remote images from NaN Cloud (supports pagination)
  const handleSync = async (useOffset = null) => {
    if (remoteSyncing) return;

    setRemoteSyncing(true);
    if (useOffset === null) {
      setRemoteSyncResult(null); // Reset only on fresh sync
    }
    setError(null);

    try {
      const currentOffset = useOffset !== null ? useOffset : 0;
      const res = await fetch('/api/nancloud/images/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50, offset: currentOffset }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Sync failed');
      }

      // Store only plain data to avoid circular reference issues with React state
      const syncData = data.data || {};
      setRemoteSyncResult({
        new_images: syncData.new_images || 0,
        skipped_duplicates: syncData.skipped_duplicates || 0,
        total_remote: syncData.total_remote || 0,
        duration_ms: syncData.duration_ms || 0,
      });
      setRemoteHasMore(data.data.has_more || false);
      setRemoteNextOffset(data.data.next_offset || 0);
      setRemoteTotalAvailable(data.data.total_available || 0);

      // Refresh remote gallery
      await fetchRemoteGroups();
      await fetchSyncStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoteSyncing(false);
    }
  };

  // Open modal for a group
  const openGroup = (group, idx = 0) => {
    setSelectedGroup(group);
    setSelectedImageIdx(idx);
  };

  // Close modal
  const closeModal = () => {
    setSelectedGroup(null);
    setSelectedImageIdx(0);
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  // Get image URL - siempre usa el proxy local
  // El proxy es necesario porque NaN Cloud tiene CORS restrictivo (solo acepta cloud.nan.builders)
  const getImageUrl = (image) => {
    return `/api/nancloud/images/${image.id}/file`;
  };

  // Current groups based on active tab
  const currentGroups = activeTab === 'local' ? groups : remoteGroups;
  const currentLoading = activeTab === 'local' ? loading : remoteLoading;

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {/* LEFT PANEL */}
        <div style={styles.panel}>
          <div>
            <label style={styles.label}>Prompt</label>
            <textarea
              rows={6}
              placeholder="A futuristic data center on Mars at sunset, cinematic light"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={styles.textarea}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleGenerate();
                }
              }}
            />
          </div>

          <div>
            <p style={styles.label}>Aspect ratio</p>
            <div style={styles.ratioGrid}>
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setAspectRatio(r.key)}
                  style={styles.ratioBtn(aspectRatio === r.key)}
                >
                  <div
                    style={{
                      border: `1px solid ${aspectRatio === r.key ? 'rgba(139,92,246,0.6)' : '#3f3f46'}`,
                      background: aspectRatio === r.key ? 'rgba(139,92,246,0.2)' : '#27272a',
                      width: `${r.w}px`,
                      height: `${r.h}px`,
                    }}
                  />
                  <span style={{ fontFamily: "'SF Mono', monospace", fontSize: '10px' }}>
                    {r.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={styles.label}>Variants</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '6px' }}>
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  onClick={() => setVariants(n)}
                  style={{
                    padding: '6px',
                    borderRadius: '8px',
                    border: n === variants ? '1px solid rgba(139,92,246,0.6)' : '1px solid #27272a',
                    background: n === variants ? 'rgba(139,92,246,0.1)' : 'transparent',
                    color: n === variants ? '#a78bfa' : '#52525b',
                    fontFamily: "'SF Mono', monospace",
                    fontSize: '11px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {n}×
                </div>
              ))}
            </div>
            <p style={{ ...styles.quotaText, marginTop: '6px' }}>
              One request, regardless of how many you generate.
            </p>
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '11px' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={!prompt.trim() || generating}
            onClick={handleGenerate}
            style={styles.generateBtn(!prompt.trim() || generating)}
          >
            {generating ? (
              <>
                <div style={styles.spinner} />
                Generating...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                  <path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />
                </svg>
                Generate
              </>
            )}
          </button>

          <div style={styles.quotaText}>
            Quota: {quota.used} / {quota.total} images used
          </div>

          {/* Sync section - only visible on remote tab */}
          {activeTab === 'remote' && (
            <div style={{ borderTop: '1px solid #27272a', paddingTop: '12px', marginTop: '4px' }}>
              <p style={styles.label}>NaN Cloud Sync</p>

              {remoteSyncState && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={styles.syncBadge}>
                    {remoteSyncState.last_synced_at
                      ? `Last sync: ${formatDate(remoteSyncState.last_synced_at)}`
                      : 'Never synced'}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={remoteSyncing}
                onClick={() => handleSync()}
                style={styles.syncBtn(remoteSyncing)}
              >
                {remoteSyncing ? (
                  <>
                    <div style={styles.spinner} />
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                    Sync from NaN Cloud
                  </>
                )}
              </button>

              {remoteSyncResult && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.15)',
                  fontSize: '11px',
                  color: '#a1a1aa',
                  fontFamily: "'SF Mono', monospace",
                  lineHeight: '1.6',
                }}>
                  <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>Sync completed</div>
                  <div>New: {remoteSyncResult.new_images} | Duplicates: {remoteSyncResult.skipped_duplicates}</div>
                  {remoteTotalAvailable > 0 && (
                    <div>Available: {remoteTotalAvailable} | Synced: {remoteSyncResult.total_remote}</div>
                  )}
                  <div style={{ color: '#52525b' }}>{remoteSyncResult.duration_ms}ms</div>
                </div>
              )}

              {remoteHasMore && (
                <button
                  type="button"
                  disabled={remoteSyncing}
                  onClick={() => handleSync(remoteNextOffset)}
                  style={{
                    ...styles.syncBtn(remoteSyncing),
                    marginTop: '6px',
                    background: remoteSyncing ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    color: '#60a5fa',
                  }}
                >
                  {remoteSyncing ? (
                    <>
                      <div style={styles.spinner} />
                      Loading more...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Load more images
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT SECTION - GALLERY */}
        <div>
          {/* Tab bar */}
          <div style={styles.tabBar}>
            <button
              type="button"
              style={styles.tab(activeTab === 'local')}
              onClick={() => setActiveTab('local')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Local ({groups.length})
            </button>
            <button
              type="button"
              style={styles.tab(activeTab === 'remote')}
              onClick={() => setActiveTab('remote')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              NaN Cloud ({remoteGroups.length})
            </button>
          </div>

          {/* Gallery header */}
          <p style={styles.sectionHeader}>
            {activeTab === 'local'
              ? `Generated locally (${groups.length} generations)`
              : `Synced from NaN Cloud (${remoteGroups.length} groups)`
            }
          </p>

          {currentLoading ? (
            <div style={styles.emptyState}>Loading gallery...</div>
          ) : currentGroups.length === 0 ? (
            <div style={styles.emptyState}>
              {activeTab === 'local' ? (
                <>
                  <p style={{ fontSize: '14px', marginBottom: '8px' }}>No images yet</p>
                  <p style={{ fontSize: '12px', color: '#3f3f46' }}>
                    Write a prompt and click Generate to create your first images
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '14px', marginBottom: '8px' }}>No synced images</p>
                  <p style={{ fontSize: '12px', color: '#3f3f46', marginBottom: '16px' }}>
                    Click "Sync from NaN Cloud" to import images generated at cloud.nan.builders
                  </p>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                </>
              )}
            </div>
          ) : (
            <div style={styles.galleryGrid}>
              {currentGroups.map((group) => (
                <div
                  key={group.request_id}
                  style={styles.groupCard}
                  onClick={() => openGroup(group, 0)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.01)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.borderColor = 'rgba(30,30,46,0.6)';
                  }}
                >
                  {/* 2x2 preview grid */}
                  <div style={styles.groupPreview}>
                    {(group.images || []).slice(0, 4).map((img, i) => (
                      <img
                        key={img.id}
                        src={getImageUrl(img)}
                        alt=""
                        loading="lazy"
                        style={styles.groupPreviewImg}
                      />
                    ))}
                    {/* Fill empty slots if less than 4 */}
                    {Array.from({ length: Math.max(0, 4 - (group.images || []).length) }).map((_, i) => (
                      <div key={`empty-${i}`} style={{ ...styles.groupPreviewImg, background: '#18181b' }} />
                    ))}
                  </div>
                  <div style={styles.groupInfo}>
                    <p style={styles.groupPrompt}>
                      {group.original_prompt || group.prompt}
                    </p>
                    <div style={styles.groupMeta}>
                      <span>{group.variants}× variants</span>
                      <span>{group.width}×{group.height}</span>
                      {group.source === 'remote' && (
                        <span style={{ color: '#4ade80' }}>☁ remote</span>
                      )}
                      <span>{formatDate(group.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL - GROUP DETAIL */}
      {selectedGroup && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={{ ...styles.modalContent, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeBtn} onClick={closeModal}>✕</button>

            {/* Left: Image + thumbnails */}
            <div style={styles.modalImageSection}>
              {selectedGroup.images[selectedImageIdx] && (
                <img
                  src={getImageUrl(selectedGroup.images[selectedImageIdx])}
                  alt={selectedGroup.original_prompt || ''}
                  style={styles.modalImage}
                />
              )}
              {selectedGroup.images.length > 1 && (
                <div style={styles.modalThumbs}>
                  {selectedGroup.images.map((img, i) => (
                    <img
                      key={img.id}
                      src={getImageUrl(img)}
                      alt={`Variant ${i + 1}`}
                      style={styles.modalThumb(i === selectedImageIdx)}
                      onClick={() => setSelectedImageIdx(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Details */}
            <div style={styles.modalDetails}>
              {/* Source badge */}
              {selectedGroup.source === 'remote' && (
                <div style={styles.syncBadge}>
                  ☁ Synced from NaN Cloud
                </div>
              )}

              {/* Original Prompt */}
              <div style={styles.detailSection}>
                <div style={styles.detailLabel}>Original Prompt</div>
                <div style={styles.detailValue}>
                  {selectedGroup.original_prompt || '—'}
                </div>
              </div>

              {/* Expanded Prompt */}
              {selectedGroup.expanded_prompt && (
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>Expanded Prompt (FLUX.2)</div>
                  <div style={{ ...styles.detailValue, fontSize: '11px', color: '#a1a1aa' }}>
                    {selectedGroup.expanded_prompt}
                  </div>
                </div>
              )}

              {/* Expansion Info */}
              {selectedGroup.expansion_model && (
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>Prompt Expansion</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Model</div>
                      <div style={styles.detailValue}>{selectedGroup.expansion_model}</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Tokens</div>
                      <div style={styles.detailValue}>{selectedGroup.expansion_tokens}</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Time</div>
                      <div style={styles.detailValue}>{selectedGroup.expansion_time_ms}ms</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Mode</div>
                      <div style={styles.detailValue}>{selectedGroup.expansion_mode}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Image Details */}
              {selectedGroup.images[selectedImageIdx] && (
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>Image Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Dimensions</div>
                      <div style={styles.detailValue}>{selectedGroup.width} × {selectedGroup.height}</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Seed</div>
                      <div style={styles.detailValue}>{selectedGroup.images[selectedImageIdx].seed || '—'}</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Size</div>
                      <div style={styles.detailValue}>{formatSize(selectedGroup.images[selectedImageIdx].size_bytes)}</div>
                    </div>
                    <div>
                      <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Variant</div>
                      <div style={styles.detailValue}>{selectedImageIdx + 1} of {selectedGroup.images.length}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generation Settings */}
              <div style={styles.detailSection}>
                <div style={styles.detailLabel}>Generation Settings</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Model</div>
                    <div style={styles.detailValue}>{selectedGroup.model}</div>
                  </div>
                  <div>
                    <div style={{ ...styles.detailLabel, marginBottom: '2px' }}>Guidance</div>
                    <div style={styles.detailValue}>{selectedGroup.guidance}</div>
                  </div>
                </div>
              </div>

              {/* Created */}
              <div>
                <div style={styles.detailLabel}>Created</div>
                <div style={styles.detailValue}>{formatDate(selectedGroup.created_at)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
