import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

/**
 * DistributionDonut - Donut chart showing request distribution by model
 */

const CHART_COLORS = {
  'deepseek-v4-flash': '#fbbf24',
  'gemma4': '#a78bfa',
  'mimo-v2.5': '#22d3ee',
  'qwen3-embedding': '#f87171',
  'qwen3.6': '#34d399',
  'unknown': '#64748b',
};

const DEFAULT_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#818cf8', '#2dd4bf'];

const containerStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '24px',
};

const titleStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#e2e8f0',
  margin: '0 0 16px 0',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

const DistributionDonut = ({ byModel = [] }) => {
  if (byModel.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={titleStyle}>🍩 Request Distribution</h3>
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Sin datos</div>
      </div>
    );
  }

  const totalRequests = byModel.reduce((sum, m) => sum + (m.totalRequests || 0), 0);

  const chartData = {
    labels: byModel.map(m => m.model),
    datasets: [
      {
        data: byModel.map(m => m.totalRequests || 0),
        backgroundColor: byModel.map((m, i) =>
          CHART_COLORS[m.model] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
        ),
        borderColor: '#1e293b',
        borderWidth: 3,
        hoverBorderColor: '#f8fafc',
        hoverBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          font: { size: 11 },
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx) => {
            const pct = totalRequests > 0 ? ((ctx.raw / totalRequests) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${formatNumber(ctx.raw)} (${pct}%)`;
          },
        },
      },
    },
  };

  // Center text plugin
  const centerText = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Total number
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(formatNumber(totalRequests), width / 2, height / 2 - 8);

      // Label
      ctx.fillStyle = '#64748b';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('requests', width / 2, height / 2 + 14);

      ctx.restore();
    },
  };

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>🍩 Request Distribution</h3>
      <div style={{ height: '280px', position: 'relative' }}>
        <Doughnut data={chartData} options={options} plugins={[centerText]} />
      </div>
    </div>
  );
};

export default DistributionDonut;
