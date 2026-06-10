import React, { useState, useEffect, useCallback } from 'react';

/**
 * ApiKeysManager - Centralized API key management component
 * Renders inside the AdminJS page at /admin/pages/api-keys
 */

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a202c',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#718096',
    marginTop: '4px',
  },
  projectCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  projectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f7fafc',
  },
  projectName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2d3748',
  },
  projectMeta: {
    fontSize: '13px',
    color: '#718096',
  },
  statusBadge: (active) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    background: active ? '#c6f6d5' : '#fed7d7',
    color: active ? '#22543d' : '#9b2c2c',
    marginRight: '8px',
  }),
  keysContainer: {
    padding: '12px 20px',
  },
  keyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f7fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  keyInfo: {
    flex: 1,
  },
  keyName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
  },
  keyMeta: {
    fontSize: '12px',
    color: '#a0aec0',
    marginTop: '2px',
  },
  keyActions: {
    display: 'flex',
    gap: '4px',
  },
  btn: {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.2s',
  },
  btnPrimary: {
    background: '#3182ce',
    color: '#fff',
  },
  btnSuccess: {
    background: '#38a169',
    color: '#fff',
  },
  btnWarning: {
    background: '#d69e2e',
    color: '#fff',
  },
  btnDanger: {
    background: '#e53e3e',
    color: '#fff',
  },
  btnGray: {
    background: '#e2e8f0',
    color: '#4a5568',
  },
  emptyKeys: {
    textAlign: 'center',
    padding: '16px',
    color: '#a0aec0',
    fontSize: '13px',
  },
  addKeyRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 20px',
    borderTop: '1px solid #e2e8f0',
  },
  input: {
    padding: '6px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#2d3748',
    outline: 'none',
    width: '200px',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
  },
  keyDisplay: {
    background: '#1a202c',
    color: '#68d391',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '13px',
    wordBreak: 'break-all',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  warning: {
    background: '#fefcbf',
    border: '1px solid #f6e05e',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#744210',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#a0aec0',
    fontSize: '14px',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    color: '#e53e3e',
    fontSize: '14px',
  },
};

const ApiKeysManager = () => {
  const [projects, setProjects] = useState([]);
  const [projectKeys, setProjectKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState(null);
  const [newKeyInputs, setNewKeyInputs] = useState({});
  const [showKeyModal, setShowKeyModal] = useState(null);
  const [copied, setCopied] = useState(false);

  // Fetch all projects
  const fetchProjects = useCallback(async () => {
    try {
      const resp = await fetch('/api/projects');
      const data = await resp.json();
      setProjects(data.data || []);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  }, []);

  // Fetch keys for a specific project
  const fetchKeys = useCallback(async (projectId) => {
    try {
      const resp = await fetch(`/api/projects/${projectId}/keys`);
      const data = await resp.json();
      setProjectKeys(prev => ({ ...prev, [projectId]: data.data || [] }));
    } catch (e) {
      console.error('Failed to fetch keys', e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchProjects();
      setLoading(false);
    };
    init();
  }, [fetchProjects]);

  // Expand project and fetch its keys
  const toggleProject = async (projectId) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
      return;
    }
    setExpandedProject(projectId);
    if (!projectKeys[projectId]) {
      await fetchKeys(projectId);
    }
  };

  // Create a new key for a project
  const createKey = async (projectId) => {
    const name = newKeyInputs[projectId] || 'Default';
    try {
      const resp = await fetch(`/api/projects/${projectId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await resp.json();
      if (data.apiKey) {
        setShowKeyModal({ key: data.apiKey, name: data.name, projectId });
        setNewKeyInputs(prev => ({ ...prev, [projectId]: '' }));
        await fetchKeys(projectId);
        await fetchProjects(); // refresh key counts
      }
    } catch (e) {
      console.error('Failed to create key', e);
    }
  };

  // View (rotate) a key
  const viewKey = async (projectId, keyId) => {
    try {
      const resp = await fetch(`/api/projects/${projectId}/keys/${keyId}/view`, {
        method: 'POST',
      });
      const data = await resp.json();
      if (data.apiKey) {
        setShowKeyModal({ key: data.apiKey, name: 'Key regenerada', projectId });
        await fetchKeys(projectId);
      }
    } catch (e) {
      console.error('Failed to view key', e);
    }
  };

  // Rotate a key
  const rotateKey = async (projectId, keyId) => {
    if (!window.confirm('¿Rotar esta key? La key anterior dejará de funcionar inmediatamente.')) return;
    try {
      const resp = await fetch(`/api/projects/${projectId}/keys/${keyId}/rotate`, {
        method: 'POST',
      });
      const data = await resp.json();
      if (data.apiKey) {
        setShowKeyModal({ key: data.apiKey, name: data.name, projectId });
        await fetchKeys(projectId);
      }
    } catch (e) {
      console.error('Failed to rotate key', e);
    }
  };

  // Deactivate a key
  const deactivateKey = async (projectId, keyId) => {
    if (!window.confirm('¿Desactivar esta key? Dejará de funcionar inmediatamente.')) return;
    try {
      await fetch(`/api/projects/${projectId}/keys/${keyId}/deactivate`, {
        method: 'POST',
      });
      await fetchKeys(projectId);
      await fetchProjects();
    } catch (e) {
      console.error('Failed to deactivate key', e);
    }
  };

  // Activate a key
  const activateKey = async (projectId, keyId) => {
    try {
      await fetch(`/api/projects/${projectId}/keys/${keyId}/activate`, {
        method: 'POST',
      });
      await fetchKeys(projectId);
      await fetchProjects();
    } catch (e) {
      console.error('Failed to activate key', e);
    }
  };

  // Delete a key
  const deleteKey = async (projectId, keyId) => {
    if (!window.confirm('¿Eliminar esta key permanentemente? Esta acción no se puede deshacer.')) return;
    try {
      await fetch(`/api/projects/${projectId}/keys/${keyId}`, {
        method: 'DELETE',
      });
      await fetchKeys(projectId);
      await fetchProjects();
    } catch (e) {
      console.error('Failed to delete key', e);
    }
  };

  // Copy key to clipboard
  const copyKey = () => {
    if (showKeyModal?.key) {
      navigator.clipboard.writeText(showKeyModal.key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      });
    }
  };

  if (loading) {
    return <div style={styles.loading}>Cargando proyectos...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🔑 API Keys</h1>
          <p style={styles.subtitle}>Gestiona las API keys de tus proyectos</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div style={styles.emptyKeys}>
          No hay proyectos creados aún.{' '}
          <a href="/admin/resources/projects/actions/new" style={{ color: '#3182ce' }}>
            Crear uno →
          </a>
        </div>
      ) : (
        projects.map(project => (
          <div key={project.id} style={styles.projectCard}>
            <div
              style={{
                ...styles.projectHeader,
                cursor: 'pointer',
              }}
              onClick={() => toggleProject(project.id)}
            >
              <div>
                <span style={styles.projectName}>{project.name}</span>
                <span style={styles.statusBadge(project.isActive)}>
                  {project.isActive ? '● Activo' : '● Inactivo'}
                </span>
                <span style={styles.projectMeta}>
                  — {project.activeKeysCount || 0} key(s) activa(s) / {project.keysCount || 0} total
                </span>
              </div>
              <span style={{ fontSize: '18px', color: '#a0aec0' }}>
                {expandedProject === project.id ? '▲' : '▼'}
              </span>
            </div>

            {expandedProject === project.id && (
              <div>
                <div style={styles.keysContainer}>
                  {!projectKeys[project.id] ? (
                    <div style={styles.loading}>Cargando keys...</div>
                  ) : projectKeys[project.id].length === 0 ? (
                    <div style={styles.emptyKeys}>No hay keys para este proyecto</div>
                  ) : (
                    projectKeys[project.id].map(key => (
                      <div key={key.id} style={styles.keyItem}>
                        <div style={styles.keyInfo}>
                          <div style={styles.keyName}>{key.name}</div>
                          <div style={styles.keyMeta}>
                            ID: {key.id.substring(0, 8)}... | 
                            Último uso: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('es') : 'Nunca'} | 
                            Creada: {new Date(key.createdAt).toLocaleString('es')}
                          </div>
                        </div>
                        <div style={styles.keyActions}>
                          <button
                            style={{ ...styles.btn, ...styles.btnPrimary }}
                            onClick={() => viewKey(project.id, key.id)}
                            title="Ver key (regenera)"
                          >
                            👁️ Ver
                          </button>
                          <button
                            style={{ ...styles.btn, ...styles.btnWarning }}
                            onClick={() => rotateKey(project.id, key.id)}
                            title="Rotar key"
                          >
                            🔄 Rotar
                          </button>
                          {key.isActive ? (
                            <button
                              style={{ ...styles.btn, ...styles.btnGray }}
                              onClick={() => deactivateKey(project.id, key.id)}
                              title="Desactivar"
                            >
                              ⏸️
                            </button>
                          ) : (
                            <button
                              style={{ ...styles.btn, ...styles.btnSuccess }}
                              onClick={() => activateKey(project.id, key.id)}
                              title="Activar"
                            >
                              ▶️
                            </button>
                          )}
                          <button
                            style={{ ...styles.btn, ...styles.btnDanger }}
                            onClick={() => deleteKey(project.id, key.id)}
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={styles.addKeyRow}>
                  <input
                    type="text"
                    style={styles.input}
                    placeholder="Nombre de la key..."
                    value={newKeyInputs[project.id] || ''}
                    onChange={(e) => setNewKeyInputs(prev => ({ ...prev, [project.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') createKey(project.id); }}
                  />
                  <button
                    style={{ ...styles.btn, ...styles.btnSuccess }}
                    onClick={() => createKey(project.id)}
                  >
                    + Nueva Key
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Key display modal */}
      {showKeyModal && (
        <div style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) setShowKeyModal(null); }}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: '0 0 8px 0', color: '#1a202c' }}>🔑 Nueva API Key</h3>
            <p style={{ color: '#718096', fontSize: '14px', marginBottom: '16px' }}>
              {showKeyModal.name} — Cópiala ahora, no se volverá a mostrar
            </p>
            <div style={styles.warning}>
              ⚠️ <strong>¡Copia esta key ahora!</strong> Si cierras esta ventana, deberás regenerarla.
            </div>
            <div style={styles.keyDisplay}>{showKeyModal.key}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary, padding: '8px 20px', fontSize: '14px' }}
                onClick={copyKey}
              >
                📋 Copiar Key
              </button>
              {copied && <span style={{ color: '#38a169', fontSize: '13px' }}>✓ Copiada!</span>}
              <button
                style={{ ...styles.btn, ...styles.btnGray, padding: '8px 20px', fontSize: '14px', marginLeft: 'auto' }}
                onClick={() => setShowKeyModal(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeysManager;
