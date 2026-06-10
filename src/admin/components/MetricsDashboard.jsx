import React, { useState, useEffect, useCallback } from 'react';
import ModelDetail from './ModelDetail.jsx';
import ApiKeyUsage from './ApiKeyUsage.jsx';
import ModelUsageChart from './charts/ModelUsageChart.jsx';
import TokenBarChart from './charts/TokenBarChart.jsx';
import DistributionDonut from './charts/DistributionDonut.jsx';
import DailyTrendChart from './charts/DailyTrendChart.jsx';
import ProjectBarChart from './charts/ProjectBarChart.jsx';

/**
 * MetricsDashboard - Super dashboard for NaNProxy metrics
 * Renders inside AdminJS at /admin/pages/metrics
 * Shows metrics by project, model, endpoint with token breakdown
 */

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
    color: '#f8fafc',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  controls: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  periodBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.15s',
  },
  periodBtnActive: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #22d3ee',
    background: '#22d3ee',
    color: '#0f172a',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  refreshBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '13px',
    marginLeft: '8px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  kpiCard: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '20px',
  },
  kpiLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  kpiSubtext: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  kpiIcon: {
    fontSize: '20px',
    marginBottom: '8px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#1e293b',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    background: '#334155',
    color: '#94a3b8',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
    borderBottom: '1px solid #475569',
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 16px',
    background: '#334155',
    color: '#94a3b8',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
    borderBottom: '1px solid #475569',
  },
  td: {
    padding: '10px 16px',
    borderBottom: '1px solid #1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
  },
  tdRight: {
    padding: '10px 16px',
    borderBottom: '1px solid #1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  tdName: {
    padding: '10px 16px',
    borderBottom: '1px solid #1e293b',
    color: '#22d3ee',
    fontSize: '14px',
    fontWeight: '500',
  },
  trHover: {
    transition: 'background 0.15s',
  },
  bar: {
    height: '6px',
    borderRadius: '3px',
    background: '#334155',
    overflow: 'hidden',
    minWidth: '60px',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#64748b',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#94a3b8',
    fontSize: '16px',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    color: '#ef4444',
    fontSize: '14px',
  },
  tokenBreakdown: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  tokenIn: {
    color: '#22d3ee',
    fontSize: '13px',
  },
  tokenOut: {
    color: '#a78bfa',
    fontSize: '13px',
  },
  tokenSep: {
    color: '#475569',
    fontSize: '13px',
  },
};

// Format large numbers: 1234 -> "1,234" / 1234567 -> "1.2M"
function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Format milliseconds: 1234 -> "1.2s" / 500 -> "500ms"
function formatMs(ms) {
  if (!ms) return '0ms';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

// Format percentage: 2.345 -> "2.35%"
function formatPct(p) {
  if (!p && p !== 0) return '0%';
  return p.toFixed(2) + '%';
}

// Color for token bar
const BAR_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#818cf8', '#2dd4bf'];

const MetricsDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('7d');
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/super?period=${period}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  // Navigation handlers
  const handleModelClick = (modelName) => {
    setSelectedModel(modelName);
    setSelectedApiKey(null);
  };

  const handleApiKeyClick = (apiKeyHash) => {
    setSelectedApiKey(apiKeyHash);
    setSelectedModel(null);
  };

  const handleBackToDashboard = () => {
    setSelectedModel(null);
    setSelectedApiKey(null);
  };

  // If a model is selected, show ModelDetail
  if (selectedModel) {
    return (
      <ModelDetail
        model={selectedModel}
        period={period}
        onBack={handleBackToDashboard}
      />
    );
  }

  // If an API key is selected, show ApiKeyUsage
  if (selectedApiKey) {
    return (
      <ApiKeyUsage
        apiKeyHash={selectedApiKey}
        period={period}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Cargando dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Metrics Dashboard</h1>
            <p style={styles.subtitle}>Error cargando datos</p>
          </div>
        </div>
        <div style={styles.error}>Error: {error}</div>
        <button style={styles.refreshBtn} onClick={fetchData}>Reintentar</button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const byProject = data?.byProject || [];
  const byModel = data?.byModel || [];
  const byEndpoint = data?.byEndpoint || [];
  const byApiKey = data?.byApiKey || [];
  const dailyTrend = data?.dailyTrend || [];

  // Find max values for bar charts
  const maxProjectTokens = Math.max(...byProject.map(p => p.totalTokens || 0), 1);
  const maxModelTokens = Math.max(...byModel.map(m => m.totalTokens || 0), 1);
  const maxEndpointTokens = Math.max(...byEndpoint.map(e => e.totalTokens || 0), 1);
  const maxApiKeyTokens = Math.max(...byApiKey.map(k => k.tokens || 0), 1);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Metrics Dashboard</h1>
          <p style={styles.subtitle}>
            Datos del {data?.period?.start} al {data?.period?.end}
          </p>
        </div>
        <div style={styles.controls}>
          {['1d', '7d', '30d', '90d', 'all'].map((p) => (
            <button
              key={p}
              style={period === p ? styles.periodBtnActive : styles.periodBtn}
              onClick={() => handlePeriodChange(p)}
            >
              {p === 'all' ? 'Todo' : p}
            </button>
          ))}
          <button style={styles.refreshBtn} onClick={fetchData}>
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>📊</div>
          <div style={styles.kpiLabel}>Total Requests</div>
          <div style={styles.kpiValue}>{formatNumber(summary.totalRequests)}</div>
          <div style={styles.kpiSubtext}>{summary.totalModels || 0} modelos activos</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>🔤</div>
          <div style={styles.kpiLabel}>Total Tokens</div>
          <div style={styles.kpiValue}>{formatNumber(summary.totalTokens)}</div>
          <div style={styles.kpiSubtext}>
            <span style={styles.tokenIn}>Entrada: {formatNumber(summary.totalPrompt)}</span>
            {' · '}
            <span style={styles.tokenOut}>Salida: {formatNumber(summary.totalCompletion)}</span>
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>⚡</div>
          <div style={styles.kpiLabel}>Tiempo Respuesta</div>
          <div style={styles.kpiValue}>{formatMs(summary.avgResponseTime)}</div>
          <div style={styles.kpiSubtext}>promedio</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>⚠️</div>
          <div style={styles.kpiLabel}>Tasa Errores</div>
          <div style={styles.kpiValue}>{formatPct(summary.errorRate)}</div>
          <div style={styles.kpiSubtext}>{summary.totalProjects || 0} proyectos</div>
        </div>
      </div>

      {/* Charts Row 1: Model Usage + Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <ModelUsageChart dailyTrend={dailyTrend} byModel={byModel} />
        <DistributionDonut byModel={byModel} />
      </div>

      {/* Charts Row 2: Token Bar + Project Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <TokenBarChart byModel={byModel} />
        <ProjectBarChart byProject={byProject} />
      </div>

      {/* Charts Row 3: Daily Trend */}
      <DailyTrendChart dailyTrend={dailyTrend} />

      {/* By Project Table */}
      {byProject.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📁 Por Proyecto</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Proyecto</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
                <th style={styles.thRight}>Tiempo</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((p, i) => (
                <tr key={p.projectId || i} style={styles.trHover}>
                  <td style={styles.tdName}>{p.projectName || p.projectId || 'Sin proyecto'}</td>
                  <td style={styles.tdRight}>{formatNumber(p.totalRequests)}</td>
                  <td style={styles.tdRight}>{formatNumber(p.totalTokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(p.tokensPrompt)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(p.tokensCompletion)}</span>
                  </td>
                  <td style={styles.tdRight}>{formatMs(p.avgResponseTime)}</td>
                  <td style={styles.td}>
                    <div style={styles.bar}>
                      <div style={{
                        ...styles.barFill,
                        width: `${((p.totalTokens || 0) / maxProjectTokens * 100)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Model Table */}
      {byModel.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🤖 Por Modelo</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Modelo</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
                <th style={styles.thRight}>Tiempo</th>
                <th style={styles.thRight}>Errores</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m, i) => (
                <tr key={m.model || i} style={{ ...styles.trHover, cursor: 'pointer' }} onClick={() => handleModelClick(m.model)}>
                  <td style={{ ...styles.tdName, textDecoration: 'underline', textUnderlineOffset: '3px' }}>{m.model}</td>
                  <td style={styles.tdRight}>{formatNumber(m.totalRequests)}</td>
                  <td style={styles.tdRight}>{formatNumber(m.totalTokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(m.tokensPrompt)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(m.tokensCompletion)}</span>
                  </td>
                  <td style={styles.tdRight}>{formatMs(m.avgResponseTime)}</td>
                  <td style={styles.tdRight}>{formatPct(m.errorRate)}</td>
                  <td style={styles.td}>
                    <div style={styles.bar}>
                      <div style={{
                        ...styles.barFill,
                        width: `${((m.totalTokens || 0) / maxModelTokens * 100)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Endpoint Table */}
      {byEndpoint.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🔌 Por Endpoint</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Endpoint</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
                <th style={styles.thRight}>Tiempo</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {byEndpoint.map((e, i) => (
                <tr key={e.endpoint || i} style={styles.trHover}>
                  <td style={styles.tdName}>{e.endpoint}</td>
                  <td style={styles.tdRight}>{formatNumber(e.totalRequests)}</td>
                  <td style={styles.tdRight}>{formatNumber(e.totalTokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(e.tokensPrompt)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(e.tokensCompletion)}</span>
                  </td>
                  <td style={styles.tdRight}>{formatMs(e.avgResponseTime)}</td>
                  <td style={styles.td}>
                    <div style={styles.bar}>
                      <div style={{
                        ...styles.barFill,
                        width: `${((e.totalTokens || 0) / maxEndpointTokens * 100)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Daily Trend Table */}
      {dailyTrend.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📈 Tendencia Diaria</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Fecha</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
              </tr>
            </thead>
            <tbody>
              {dailyTrend.map((d, i) => (
                <tr key={d.date || i} style={styles.trHover}>
                  <td style={styles.td}>{d.date}</td>
                  <td style={styles.tdRight}>{formatNumber(d.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(d.tokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(d.tokensPrompt)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(d.tokensCompletion)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By API Key Table */}
      {byApiKey.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🔑 Por API KEY</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>API KEY</th>
                <th style={styles.th}>Proyecto</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
                <th style={styles.thRight}>Tiempo</th>
                <th style={styles.th}>Modelos</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {byApiKey.map((k, i) => (
                <tr key={k.apiKeyHash || i} style={{ ...styles.trHover, cursor: 'pointer' }} onClick={() => handleApiKeyClick(k.apiKeyHash)}>
                  <td style={{ ...styles.tdName, fontFamily: 'monospace', textDecoration: 'underline', textUnderlineOffset: '3px' }} title={k.apiKeyHash}>
                    {k.keyName || k.apiKeyMasked || 'N/A'}
                  </td>
                  <td style={styles.td}>{k.projectName || 'Sin proyecto'}</td>
                  <td style={styles.tdRight}>{formatNumber(k.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(k.tokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(k.promptTokens)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(k.completionTokens)}</span>
                  </td>
                  <td style={styles.tdRight}>{formatMs(k.avgResponseTime)}</td>
                  <td style={styles.td}>
                    {(k.modelsUsed || []).map((model, j) => (
                      <span key={j} style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(34, 211, 238, 0.1)',
                        color: '#22d3ee',
                        fontSize: '11px',
                        marginRight: '4px',
                        marginBottom: '2px',
                      }}>{model}</span>
                    ))}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.bar}>
                      <div style={{
                        ...styles.barFill,
                        width: `${((k.tokens || 0) / maxApiKeyTokens * 100)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && byProject.length === 0 && byModel.length === 0 && byEndpoint.length === 0 && byApiKey.length === 0 && (
        <div style={styles.section}>
          <div style={styles.empty}>
            No hay datos de métricas para este período. Las métricas se generan automáticamente cuando se realizan requests a través del proxy.
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
        <span><span style={{ color: '#22d3ee' }}>●</span> Tokens de entrada (prompt)</span>
        <span><span style={{ color: '#a78bfa' }}>●</span> Tokens de salida (completion)</span>
        <span style={{ color: '#475569' }}>|</span>
        <span>Haz clic en un <span style={{ color: '#22d3ee' }}>modelo</span> o <span style={{ color: '#22d3ee' }}>API KEY</span> para ver el detalle</span>
      </div>
    </div>
  );
};

export default MetricsDashboard;
