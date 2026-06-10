/**
 * Test script: Send requests through the proxy with each chat model
 * and verify they appear in the dashboard metrics.
 * 
 * Usage: node test-models-dashboard.js
 */
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamically import database module
const { default: db } = await import('./src/config/database.js');
const { default: ProjectApiKey } = await import('./src/models/ProjectApiKey.js');
const { default: Project } = await import('./src/models/Project.js');

const PROXY_URL = 'http://localhost:8080';

// Chat models to test
const CHAT_MODELS = [
  'deepseek-v4-flash',
  'gemma4',
  'mimo-v2.5',
  'qwen3.6',
];

// Create a test project and API key
console.log('=== Setting up test project ===');

const testProject = Project.create({
  name: 'Model Dashboard Test',
  description: 'Test project for dashboard model metrics',
});

console.log(`Project created: ${testProject.name} (${testProject.id})`);

const keyResult = ProjectApiKey.create({
  projectId: testProject.id,
  name: 'Test Key for Models',
});

const API_KEY = keyResult.apiKey;
console.log(`API Key created: ${API_KEY.substring(0, 12)}...`);
console.log('');

// Send a request to each model
async function sendChatRequest(model) {
  const body = JSON.stringify({
    model: model,
    messages: [
      { role: 'user', content: 'Responde con una sola palabra: hola' }
    ],
    max_tokens: 10,
    stream: false,
  });

  console.log(`  Sending request to model: ${model}...`);

  try {
    const response = await fetch(`${PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body,
    });

    const status = response.status;
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // Response might not be JSON
    }

    if (status === 200 && data?.model) {
      console.log(`  ✅ ${model}: OK (response model: ${data.model}, tokens: ${data.usage?.total_tokens || 'N/A'})`);
      return { model, status, success: true, responseModel: data.model };
    } else {
      const error = data?.error?.message || data?.error || `HTTP ${status}`;
      console.log(`  ⚠️ ${model}: ${error}`);
      return { model, status, success: false, error };
    }
  } catch (err) {
    console.log(`  ❌ ${model}: ${err.message}`);
    return { model, status: 0, success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Testing Chat Models ===');
  console.log(`Proxy: ${PROXY_URL}`);
  console.log(`Models: ${CHAT_MODELS.join(', ')}`);
  console.log('');

  const results = [];
  for (const model of CHAT_MODELS) {
    const result = await sendChatRequest(model);
    results.push(result);
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('');
  console.log('=== Results Summary ===');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  for (const r of successful) {
    console.log(`   ${r.model} → ${r.responseModel}`);
  }

  if (failed.length > 0) {
    console.log(`⚠️ Failed: ${failed.length}/${results.length}`);
    for (const r of failed) {
      console.log(`   ${r.model}: ${r.error}`);
    }
  }

  // Check dashboard metrics
  console.log('');
  console.log('=== Checking Dashboard Metrics ===');
  await new Promise(r => setTimeout(r, 2000)); // Wait for metrics to be saved

  try {
    const dashboardResponse = await fetch(`${PROXY_URL}/api/dashboard/super?period=1d`);
    const dashboard = await dashboardResponse.json();

    console.log('Models in dashboard:');
    if (dashboard.byModel && dashboard.byModel.length > 0) {
      for (const m of dashboard.byModel) {
        console.log(`   🤖 ${m.model}: ${m.totalRequests} requests, ${m.totalTokens} tokens`);
      }
    } else {
      console.log('   No models found in dashboard');
    }

    console.log('');
    console.log('API Keys in dashboard:');
    if (dashboard.byApiKey && dashboard.byApiKey.length > 0) {
      for (const k of dashboard.byApiKey) {
        console.log(`   🔑 ${k.keyName || k.apiKeyMasked}: ${k.requests} requests, ${k.tokens} tokens (${k.projectName})`);
      }
    } else {
      console.log('   No API keys found in dashboard');
    }
  } catch (err) {
    console.log(`Error checking dashboard: ${err.message}`);
  }

  // Cleanup: remove test project
  console.log('');
  console.log('=== Cleanup ===');
  try {
    db.prepare('DELETE FROM project_api_keys WHERE project_id = ?').run(testProject.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(testProject.id);
    console.log('Test project and keys removed');
  } catch (e) {
    console.log(`Cleanup note: ${e.message}`);
  }

  console.log('');
  console.log('Done! Check the dashboard at http://localhost:8080/admin/pages/metrics');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
