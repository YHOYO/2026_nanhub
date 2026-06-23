import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

/**
 * CacheMetrics - Dashboard component for cache optimization metrics
 * Shows: cache hit rate, quantization blocks, token flow, model cache performance
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
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginTop: '4px',
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
  chartContainer: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  tokenIn: {
    color: '#22d3ee',
    fontSize: '13px',
  },
  tokenOut: {
    color: '#a78bfa',
    fontSize: '13px',
  },
};

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatPct(p) {
  if (!p && p !== 0) return '0%';
  return p.toFixed(2) + '%';
}

function getCacheColor(rate) {
  if (rate >= 80) return '#34d399'; // Green
  if (rate >= 50) return '#fbbf24'; // Yellow
  return '#f87171'; // Red
}

const CacheMetrics = ({ period = '7d' }) => {
  const [cacheData, setCacheData] = useState(null);
  const [blocksData, setBlocksData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cacheRes, blocksRes] = await Promise.all([
        fetch(`/api/dashboard/cache-stats?period=${period}`),
        fetch(`/api/dashboard/quantization-blocks?period=${period}`),
      ]);

      if (!cacheRes.ok || !blocksRes.ok) throw new Error('Failed to fetch cache data');

      const cacheJson = await cacheRes.json();
      const blocksJson = await blocksRes.json();

      setCacheData(cacheJson);
      setBlocksData(blocksJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Cargando métricas de caché...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Error: {error}</div>
      </div>
    );
  }

  const stats = cacheData?.stats || {};
  const byModel = cacheData?.byModel || [];
  const tokenFlow = cacheData?.tokenFlow || {};
  const blocks = blocksData?.data || [];

  const maxBlockTokens = Math.max(...blocks.map(b => b.tokensSent || 0), 1);

  // Chart data for cache hit rate by model
  const modelChartData = {
    labels: byModel.map(m => m.model),
    datasets: [
      {
        label: 'Cache Hit Rate %',
        data: byModel.map(m => m.cacheHitRate || 0),
        backgroundColor: byModel.map(m => getCacheColor(m.cacheHitRate || 0)),
        borderColor: byModel.map(m => getCacheColor(m.cacheHitRate || 0)),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const modelChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `Cache Hit: ${formatPct(ctx.raw)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(51, 65, 85, 0.5)' },
        ticks: { color: '#64748b', callback: v => v + '%' },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#e2e8f0', font: { size: 11 } },
      },
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            💾 Cache Optimization Metrics
          </h1>
          <p style={styles.subtitle}>
            Time quantization and cache hit rate analysis
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>🎯</div>
          <div style={styles.kpiLabel}>Cache Hit Rate</div>
          <div style={{ ...styles.kpiValue, color: getCacheColor(stats.cacheHitRate || 0) }}>
            {formatPct(stats.cacheHitRate)}
          </div>
          <div style={styles.kpiSubtext}>
            {stats.cacheHits || 0} hits de {stats.totalRequests || 0} requests
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>📤</div>
          <div style={styles.kpiLabel}>Tokens Enviados</div>
          <div style={styles.kpiValue}>{formatNumber(tokenFlow.tokensSentToUpstream || 0)}</div>
          <div style={styles.kpiSubtext}>al upstream (sanitizado)</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>📥</div>
          <div style={styles.kpiLabel}>Tokens Recibidos</div>
          <div style={styles.kpiValue}>{formatNumber(tokenFlow.tokensReceivedFromUpstream || 0)}</div>
          <div style={styles.kpiSubtext}>del upstream (response)</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiIcon}>💰</div>
          <div style={styles.kpiLabel}>Tokens Ahorrados</div>
          <div style={styles.kpiValue}>{formatNumber((tokenFlow.tokensSentToUpstream || 0) - (tokenFlow.tokensReceivedFromUpstream || 0))}</div>
          <div style={styles.kpiSubtext}>diferencia enviado - recibido</div>
        </div>
      </div>

      {/* Cache Hit Rate by Model Chart */}
      {byModel.length > 0 && (
        <div style={styles.chartContainer}>
          <h3 style={styles.sectionTitle}>📊 Cache Hit Rate por Modelo</h3>
          <div style={{ height: '300px' }}>
            <Line
              data={{
                labels: byModel.map(m => m.model),
                datasets: [{
                  label: 'Cache Hit Rate %',
                  data: byModel.map(m => m.cacheHitRate || 0),
                  borderColor: byModel.map(m => getCacheColor(m.cacheHitRate || 0)),
                  backgroundColor: byModel.map(m => getCacheColor(m.cacheHitRate || 0) + '20'),
                  fill: true,
                  tension: 0.4,
                  pointRadius: 5,
                  pointHoverRadius: 8,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: '#334155',
                    borderWidth: 1,
                    callbacks: {
                      label: (ctx) => `Cache Hit: ${formatPct(ctx.raw)}`,
                    },
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(51, 65, 85, 0.5)' },
                    ticks: { color: '#64748b', callback: v => v + '%' },
                  },
                  x: {
                    grid: { display: false },
                    ticks: { color: '#e2e8f0', font: { size: 11 } },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Quantization Blocks Table */}
      {blocks.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⏰ Quantization Blocks</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Bloque Horario</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Cache Hits</th>
                <th style={styles.thRight}>Hit Rate</th>
                <th style={styles.thRight}>Tokens Enviados</th>
                <th style={styles.thRight}>Tokens Recibidos</th>
                <th style={styles.thRight}>Tiempo Prom.</th>
                <th style={styles.th}>Uso</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={b.quantization_block || i} style={styles.trHover}>
                  <td style={styles.tdName}>{b.quantization_block || 'N/A'}</td>
                  <td style={styles.tdRight}>{formatNumber(b.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(b.cacheHits)}</td>
                  <td style={styles.tdRight}>
                    <span style={{ color: getCacheColor(b.cacheHitRate || 0), fontWeight: '600' }}>
                      {formatPct(b.cacheHitRate)}
                    </span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(b.tokensSent)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(b.tokensReceived)}</span>
                  </td>
                  <td style={styles.tdRight}>{Math.round(b.avgResponseTime || 0) + 'ms'}</td>
                  <td style={styles.td}>
                    <div style={styles.bar}>
                      <div style={{
                        ...styles.barFill,
                        width: `${((b.tokensSent || 0) / maxBlockTokens * 100)}%`,
                        background: getCacheColor(b.cacheHitRate || 0),
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cache Performance by Model Table */}
      {byModel.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🤖 Cache Performance por Modelo</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Modelo</th>
                <th style={styles.thRight}>Requests</th>
                <th style={styles.thRight}>Cache Hits</th>
                <th style={styles.thRight}>Hit Rate</th>
                <th style={styles.thRight}>Tokens Enviados</th>
                <th style={styles.thRight}>Tokens Recibidos</th>
                <th style={styles.thRight}>Tiempo Prom.</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m, i) => (
                <tr key={m.model || i} style={styles.trHover}>
                  <td style={styles.tdName}>{m.model}</td>
                  <td style={styles.tdRight}>{formatNumber(m.requests)}</td>
                  <td style={styles.tdRight}>{formatNumber(m.cacheHits)}</td>
                  <td style={styles.tdRight}>
                    <span style={{ color: getCacheColor(m.cacheHitRate || 0), fontWeight: '600' }}>
                      {formatPct(m.cacheHitRate)}
                    </span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenIn}>{formatNumber(m.tokensSent)}</span>
                  </td>
                  <td style={styles.tdRight}>
                    <span style={styles.tokenOut}>{formatNumber(m.tokensReceived)}</span>
                  </td>
                  <td style={styles.tdRight}>{Math.round(m.avgResponseTime || 0) + 'ms'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && blocks.length === 0 && byModel.length === 0 && (
        <div style={styles.section}>
          <div style={styles.empty}>
            No hay datos de caché disponibles. Los datos de caché se generan cuando las requests pasan por el proxy con time quantization habilitado.
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
        <span><span style={{ color: '#34d399' }}>●</span> Hit Rate ≥ 80% (Excelente)</span>
        <span><span style={{ color: '#fbbf24' }}>●</span> Hit Rate 50-80% (Bueno)</span>
        <span><span style={{ color: '#f87171' }}>●</span> Hit Rate {'<'} 50% (Bajo)</span>
      </div>
    </div>
  );
};

export default CacheMetrics;
