import React, { useRef, useEffect } from 'react';
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
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

/**
 * ModelUsageChart - Multi-series line chart showing token usage per model over time
 * Similar to the "Model Usage (Last 30 Days)" chart from the reference image
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

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
};

const titleStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#e2e8f0',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const selectStyle = {
  padding: '6px 12px',
  borderRadius: '6px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: '13px',
  cursor: 'pointer',
};

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

const ModelUsageChart = ({ dailyTrend = [], byModel = [] }) => {
  const chartRef = useRef(null);

  // Get unique models that have data
  const models = byModel.map(m => m.model).filter(m => m !== 'unknown');

  // Build daily data grouped by model
  // Since dailyTrend doesn't have per-model breakdown, we use total tokens per day
  const dates = [...new Set(dailyTrend.map(d => d.date))].sort();

  // Create a single series for total usage (since dailyTrend is aggregated)
  const chartData = {
    labels: dates.map(d => {
      const parts = d.split('-');
      return `${parts[2]}/${parts[1]}`;
    }),
    datasets: [
      {
        label: 'Total Tokens',
        data: dates.map(d => {
          const day = dailyTrend.find(t => t.date === d);
          return day?.tokens || 0;
        }),
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#22d3ee',
        pointBorderColor: '#1e293b',
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (ctx) => `Tokens: ${formatNumber(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(51, 65, 85, 0.5)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          fontSize: 11,
          maxRotation: 45,
        },
      },
      y: {
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
    },
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>📈 Model Usage (Last Period)</h3>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {models.length} modelos activos
        </span>
      </div>
      <div style={{ height: '280px' }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
};

export default ModelUsageChart;
