import React from 'react';
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
 * DailyTrendChart - Area chart showing prompt vs completion tokens over time
 */

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

const DailyTrendChart = ({ dailyTrend = [] }) => {
  if (dailyTrend.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={titleStyle}>📉 Daily Token Trend</h3>
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Sin datos</div>
      </div>
    );
  }

  const dates = dailyTrend.map(d => {
    const parts = (d.date || '').split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d.date;
  });

  const chartData = {
    labels: dates,
    datasets: [
      {
        label: 'Prompt Tokens',
        data: dailyTrend.map(d => d.tokensPrompt || 0),
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34, 211, 238, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#22d3ee',
        pointBorderColor: '#1e293b',
        pointBorderWidth: 2,
      },
      {
        label: 'Completion Tokens',
        data: dailyTrend.map(d => d.tokensCompletion || 0),
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#a78bfa',
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
      <h3 style={titleStyle}>📉 Daily Token Trend</h3>
      <div style={{ height: '280px' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default DailyTrendChart;
