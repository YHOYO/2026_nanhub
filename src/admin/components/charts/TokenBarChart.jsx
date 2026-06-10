import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * TokenBarChart - Horizontal bar chart showing prompt vs completion tokens per model
 */

const CHART_COLORS = {
  'deepseek-v4-flash': '#fbbf24',
  'gemma4': '#a78bfa',
  'mimo-v2.5': '#22d3ee',
  'qwen3-embedding': '#f87171',
  'qwen3.6': '#34d399',
  'unknown': '#64748b',
};

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

const TokenBarChart = ({ byModel = [] }) => {
  const models = byModel.filter(m => m.model !== 'unknown');

  if (models.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={titleStyle}>📊 Token Consumption by Model</h3>
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Sin datos</div>
      </div>
    );
  }

  const chartData = {
    labels: models.map(m => m.model),
    datasets: [
      {
        label: 'Prompt Tokens',
        data: models.map(m => m.tokensPrompt || 0),
        backgroundColor: 'rgba(34, 211, 238, 0.8)',
        borderColor: '#22d3ee',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Completion Tokens',
        data: models.map(m => m.tokensCompletion || 0),
        backgroundColor: 'rgba(167, 139, 250, 0.8)',
        borderColor: '#a78bfa',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { size: 12 },
          padding: 16,
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
          label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          color: 'rgba(51, 65, 85, 0.5)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          fontSize: 11,
          callback: (value) => formatNumber(value),
        },
      },
      y: {
        stacked: true,
        grid: {
          display: false,
        },
        ticks: {
          color: '#e2e8f0',
          font: { size: 12, weight: '500' },
        },
      },
    },
  };

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>📊 Token Consumption by Model</h3>
      <div style={{ height: `${Math.max(120, models.length * 60)}px` }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};

export default TokenBarChart;
