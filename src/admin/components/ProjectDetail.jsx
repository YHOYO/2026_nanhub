import React, { useState, useEffect, useCallback } from 'react';
import DailyTrendChart from './charts/DailyTrendChart.jsx';

/**
 * ProjectDetail - Detailed view for a specific project
 * Shows: summary KPIs, daily trend, usage by model, usage by API key, cache/ savings metrics
 */

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '16px',
    transition: 'all 0.15s',
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
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  projectBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    background: 'rgba(52, 211, 153, 0.15)',
    color: '#34d399',
    fontSize: '14px',
    fontWeight: '600',
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
    cursor: 'pointer',
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
  tokenIn: {
    color: '#22d3ee',
    fontSize: '13px',
  },
  tokenOut: {
    color: '#a78bfa',
    fontSize: '13px',
  },
  savingsCard: {
    background: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
    border: '1px solid #10b981',
    borderRadius: '12px',
    padding: '20px',
  },
};

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatMs(ms) {
  if (!ms) return '0ms';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

function formatPct(p) {
  if (!p && p !== 0) return '0%';
  return p.toFixed(2) + '%';
}

function formatDate(d) {
  if (!d) return '';
  return d.length > 10 ? d.split(' ')[0] : d;
}

const BAR_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#818cf8', '#2dd4bf'];

const ProjectDetail = ({ projectId, projectName, period, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/super/project/${encodeURIComponent(projectId)}?period=${period}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (newPeriod) => {
    // Update the parent's period state by dispatching a custom event
    window.dispatchEvent(new CustomEvent('metrics-period-change', { detail: newPeriod }));
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={onBack}>← Volver</button>
        <div style={styles.loading}>Cargando detalle del proyecto...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={onBack}>← Volver</button>
        <div style={styles.error}>Error: {error}</div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const dailyTrend = data?.dailyTrend || [];
  const byModel = data?.byModel || [];
  const byApiKey = data?.byApiKey || [];
  const cacheStats = data?.cacheStats || {};
  const tokenFlow = data?.tokenFlow || {};

  const maxModelTokens = Math.max(...byModel.map(m => m.tokens || 0), 1);
  const maxApiKeyTokens = Math.max(...byApiKey.map(k => k.tokens || 0), 1);

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onBack}>← Volver al Dashboard</button>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Detalle del Proyecto
            <span style={styles.projectBadge}>{projectName || data?.projectName || projectId}</span>
          </h1>
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
        </div>
      </div>

      {/* Savings Card - Cache & Token Flow */}
      {(cacheStats.cacheHits > 0 || tokenFlow.tokensSentToUpstream > 0) && (
        <div style={{ ...styles.savingsCard, marginBottom: '32px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#34d399', marginBottom: '16px' }}>
            💰 Métricas de Ahorro y Cache
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6ee7b7', textTransform: 'uppercase', marginBottom: '4px' }}>Cache Hit Rate</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>{formatPct(cacheStats.cacheHitRate)}</div>
              <div style={{ fontSize: '12px', color: '#6ee7b7' }}>{cacheStats.cacheHits} hits de {summary.totalRequests || 0} requests</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6ee7b7', textTransform: 'uppercase', marginBottom: '4px' }}>Tokens Ahorrados</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>{formatNumber(cacheStats.tokenSavings)}</div>
              <div style={{ fontSize: '12px', color: '#6ee7b7' }}>tokens request - response</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6ee7b7', textTransform: 'uppercase', marginBottom: '4px' }}>Tokens Enviados</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>{formatNumber(tokenFlow.tokensSentToUpstream)}</div>
              <div style={{ fontSize: '12px', color: '#6ee7b7' }}>al upstream</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6ee7b7', textTransform: 'uppercase', marginBottom: '4px' }}>Tokens Recibidos</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>{formatNumber(tokenFlow.tokensReceivedFromUpstream)}</div>
              <div style={{ fontSize: '12px', color: '#6ee7b7' }}>del upstream</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts: Daily Trend for this project */}
      <DailyTrendChart dailyTrend={dailyTrend} />

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>📊</div>
          <div style={styles.kpiLabel}>Total Requests</div>
          <div style={styles.kpiValue}>{formatNumber(summary.totalRequests)}</div>
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
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>💾</div>
          <div style={styles.kpiLabel}>Cache Hit Rate</div>
          <div style={{ ...styles.kpiValue, color: (cacheStats.cacheHitRate || 0) >= 80 ? '#34d399' : (cacheStats.cacheHitRate || 0) >= 50 ? '#fbbf24' : '#f87171' }}>
            {formatPct(cacheStats.cacheHitRate)}
          </div>
          <div style={styles.kpiSubtext}>{cacheStats.cacheHits} hits</div>
        </div>
      </div>

      {/* By Model */}
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
                <tr key={m.model || i} style={{ ...styles.trHover, cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-model', { detail: m.model }))}>
                  <td style={{ ...styles.tdName, textDecoration: 'underline', textUnderlineOffset: '3px' }}>{m.model}</td>
                  <td style={styles.tdRight}>{formatNumber(m.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(m.tokens)}</td>
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
                        width: `${((m.tokens || 0) / maxModelTokens * 100)}%`,
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

      {/* By API Key */}
      {byApiKey.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🔑 Por API KEY</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>API KEY</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Tokens Totales</th>
                <th style={styles.thRight}>Entrada</th>
                <th style={styles.thRight}>Salida</th>
                <th style={styles.thRight}>Tiempo</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {byApiKey.map((k, i) => (
                <tr key={k.apiKeyHash || i} style={{ ...styles.trHover, cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-apikey', { detail: k.apiKeyHash }))}>
                  <td style={{ ...styles.tdName, fontFamily: 'monospace', textDecoration: 'underline', textUnderlineOffset: '3px' }} title={k.apiKeyHash}>
                    {k.keyName || k.apiKeyMasked || 'N/A'}
                  </td>
                  <td style={styles.tdRight}>{formatNumber(k.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(k.tokens)}</td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(k.tokensPrompt)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(k.tokensCompletion)}</span>
                  </td>
                  <td style={styles.tdRight}>{formatMs(k.avgResponseTime)}</td>
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

      {/* Daily Trend */}
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
                  <td style={styles.td}>{formatDate(d.date)}</td>
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

      {/* Empty state */}
      {byModel.length === 0 && byApiKey.length === 0 && dailyTrend.length === 0 && (
        <div style={styles.section}>
          <div style={styles.empty}>
            No hay datos de uso para el proyecto <strong>{projectName || data?.projectName || projectId}</strong> en este período.
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

export default ProjectDetail;
