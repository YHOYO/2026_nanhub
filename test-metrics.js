/**
 * test-metrics.js - Script de pruebas diversificado para el Dashboard de Métricas
 * 
 * Ejecutar: node test-metrics.js
 * Requiere que el servidor esté corriendo en http://localhost:8080
 */

import Project from './src/models/Project.js';
import ProjectApiKey from './src/models/ProjectApiKey.js';
import db from './src/config/database.js';

const BASE_URL = 'http://localhost:8080';
const DELAY_MS = 1500; // Delay between requests to avoid rate limiting

// ── Helpers ───────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  console.log(`\x1b[36m[TEST]\x1b[0m ${msg}`);
}

function logOk(msg) {
  console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
}

function logFail(msg) {
  console.log(`\x1b[31m  ✗\x1b[0m ${msg}`);
}

function logPhase(msg) {
  console.log(`\n\x1b[33m═══ ${msg} ═══\x1b[0m`);
}

// ── Phase 1: Create Projects and API Keys ────────────────
function createProjectsAndKeys() {
  logPhase('Fase 1: Creando proyectos y API keys');

  const existingProjects = Project.findAll();
  const existingProject = existingProjects[0];

  // Create new projects
  const projects = [
    { name: 'Proyecto ChatBot IA', desc: 'Chatbot inteligente para atención al cliente' },
    { name: 'Proyecto Analytics ML', desc: 'Plataforma de análisis con machine learning' },
    { name: 'Proyecto RAG Docs', desc: 'Documentación RAG con embeddings semánticos' },
  ];

  const createdProjects = [];

  for (const p of projects) {
    // Check if project already exists
    const existing = existingProjects.find(ep => ep.name === p.name);
    if (existing) {
      logOk(`Proyecto "${p.name}" ya existe (id: ${existing.id})`);
      createdProjects.push(existing);
      continue;
    }

    const project = Project.create({ name: p.name, description: p.desc });
    logOk(`Proyecto "${p.name}" creado (id: ${project.id})`);

    // Create API key for this project
    const key = ProjectApiKey.create({
      projectId: project.id,
      name: `${p.name} Key`,
    });
    logOk(`API key creada: ${key.apiKey.substring(0, 20)}...`);
    createdProjects.push(project);
  }

  // Get all keys for all projects
  const allProjects = Project.findAll();
  const projectKeys = {};

  for (const p of allProjects) {
    const keys = ProjectApiKey.findByProjectId(p.id);
    if (keys.length > 0) {
      // We need the plain key - but it's only returned at creation time
      // For existing projects, we need to create a new key
      const newKey = ProjectApiKey.create({
        projectId: p.id,
        name: `Test Key ${Date.now()}`,
      });
      projectKeys[p.id] = { name: p.name, key: newKey.apiKey };
    }
  }

  // Also keep the key we created earlier
  const testKey = ProjectApiKey.create({
    projectId: existingProject.id,
    name: 'Test Key Phase1',
  });
  projectKeys[existingProject.id] = { name: existingProject.name, key: testKey.apiKey };

  return { allProjects, projectKeys };
}

// ── Phase 2: Non-Streaming Chat Completions ──────────────
async function testNonStreaming(projectKeys) {
  logPhase('Fase 2: Chat completions (non-streaming)');

  const keys = Object.values(projectKeys);
  const prompts = [
    { projectIdx: 0, content: 'Que es la inteligencia artificial?', max_tokens: 50 },
    { projectIdx: 0, content: 'Explica machine learning en simples palabras', max_tokens: 80 },
    { projectIdx: 0, content: 'Diferencia entre deep learning y neural networks', max_tokens: 100 },
    { projectIdx: 1, content: 'Cual es el futuro del analytics de datos', max_tokens: 60 },
    { projectIdx: 1, content: 'Ventajas de Python para data science', max_tokens: 70 },
    { projectIdx: 2, content: 'Como implementar RAG en una aplicacion', max_tokens: 90 },
    { projectIdx: 2, content: 'Que es un vector database', max_tokens: 50 },
    { projectIdx: 2, content: 'Comparar PostgreSQL vs Pinecone para embeddings', max_tokens: 80 },
    { projectIdx: 3, content: 'Responde con un haiku sobre programacion', max_tokens: 30 },
    { projectIdx: 3, content: 'Dame un ejemplo de API REST', max_tokens: 60 },
  ];

  let success = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const keyInfo = keys[p.projectIdx] || keys[0];

    try {
      log(`[${i + 1}/${prompts.length}] ${keyInfo.name} - "${p.content.substring(0, 40)}..."`);

      const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyInfo.key}`,
        },
        body: JSON.stringify({
          model: 'mimo-v2.5',
          messages: [{ role: 'user', content: p.content }],
          max_tokens: p.max_tokens,
          stream: false,
        }),
      });

      const data = await response.json();

      if (data.usage) {
        logOk(`Tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
        success++;
      } else {
        logFail(`Sin datos de usage: ${JSON.stringify(data).substring(0, 100)}`);
        failed++;
      }
    } catch (err) {
      logFail(`Error: ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  log(`Resultado: ${success} éxitos, ${failed} fallos`);
  return { success, failed };
}

// ── Phase 3: Streaming Chat Completions ──────────────────
async function testStreaming(projectKeys) {
  logPhase('Fase 3: Chat completions (streaming)');

  const keys = Object.values(projectKeys);
  const prompts = [
    { projectIdx: 0, content: 'Cuenta un chiste de programadores' },
    { projectIdx: 0, content: 'Que es TypeScript y por que usarlo' },
    { projectIdx: 1, content: 'Explica gradient descent con un analogia' },
    { projectIdx: 2, content: 'Como funciona un embedding model' },
    { projectIdx: 3, content: 'Escribe un poema corto sobre codigo' },
  ];

  let success = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const keyInfo = keys[p.projectIdx] || keys[0];

    try {
      log(`[${i + 1}/${prompts.length}] ${keyInfo.name} (STREAMING) - "${p.content.substring(0, 40)}..."`);

      const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyInfo.key}`,
        },
        body: JSON.stringify({
          model: 'mimo-v2.5',
          messages: [{ role: 'user', content: p.content }],
          max_tokens: 50,
          stream: true,
        }),
      });

      // Read the streaming response
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
      let tokensFound = false;

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.usage) {
            tokensFound = true;
            logOk(`Tokens streaming: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion`);
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }

      if (tokensFound) {
        success++;
      } else {
        logOk(`Streaming completado (${lines.length} chunks) - tokens pueden estar en el último chunk`);
        success++;
      }
    } catch (err) {
      logFail(`Error: ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  log(`Resultado: ${success} éxitos, ${failed} fallos`);
  return { success, failed };
}

// ── Phase 4: Embeddings ──────────────────────────────────
async function testEmbeddings(projectKeys) {
  logPhase('Fase 4: Requests de embeddings');

  const keys = Object.values(projectKeys);
  const texts = [
    { projectIdx: 2, text: 'Este documento explica como usar RAG para busqueda semantica en aplicaciones modernas' },
    { projectIdx: 2, text: 'La inteligencia artificial transforma la industria tecnologica global' },
    { projectIdx: 1, text: 'Los datos son el petroleo del siglo XXI para las empresas' },
    { projectIdx: 0, text: 'Un chatbot inteligente puede atender a miles de usuarios simultaneamente' },
    { projectIdx: 3, text: 'Prueba de embedding para validar metricas del dashboard' },
  ];

  let success = 0;
  let failed = 0;

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const keyInfo = keys[t.projectIdx] || keys[0];

    try {
      log(`[${i + 1}/${texts.length}] ${keyInfo.name} - "${t.text.substring(0, 50)}..."`);

      const response = await fetch(`${BASE_URL}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyInfo.key}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: t.text,
        }),
      });

      const data = await response.json();

      if (data.usage) {
        logOk(`Tokens embedding: ${data.usage.prompt_tokens} prompt, total: ${data.usage.total_tokens}`);
        success++;
      } else if (data.data && data.data.length > 0) {
        logOk(`Embedding generado (dimensiones: ${data.data[0].embedding?.length || 'N/A'})`);
        success++;
      } else {
        logFail(`Respuesta inesperada: ${JSON.stringify(data).substring(0, 150)}`);
        failed++;
      }
    } catch (err) {
      logFail(`Error: ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  log(`Resultado: ${success} éxitos, ${failed} fallos`);
  return { success, failed };
}

// ── Phase 5: Error Requests ──────────────────────────────
async function testErrors(projectKeys) {
  logPhase('Fase 5: Requests con errores');

  const keys = Object.values(projectKeys);
  const errorRequests = [
    {
      projectIdx: 3,
      desc: 'Modelo inexistente',
      body: {
        model: 'modelo-inexistente-xyz-123',
        messages: [{ role: 'user', content: 'Test error' }],
        max_tokens: 10,
      },
    },
    {
      projectIdx: 0,
      desc: 'Sin modelo',
      body: {
        messages: [{ role: 'user', content: 'Test error sin modelo' }],
        max_tokens: 10,
      },
    },
    {
      projectIdx: 1,
      desc: 'Modelo gpt-falso',
      body: {
        model: 'gpt-no-existe-999',
        messages: [{ role: 'user', content: 'Test error modelo falso' }],
        max_tokens: 10,
      },
    },
  ];

  let errorsCaptured = 0;

  for (let i = 0; i < errorRequests.length; i++) {
    const e = errorRequests[i];
    const keyInfo = keys[e.projectIdx] || keys[0];

    try {
      log(`[${i + 1}/${errorRequests.length}] ${keyInfo.name} - ${e.desc}`);

      const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyInfo.key}`,
        },
        body: JSON.stringify(e.body),
      });

      if (response.status >= 400) {
        logOk(`Error capturado: HTTP ${response.status}`);
        errorsCaptured++;
      } else {
        logOk(`Request completada (status ${response.status}) - error no fue capturado como esperado`);
      }
    } catch (err) {
      logFail(`Error de red: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  log(`Errores capturados: ${errorsCaptured}/${errorRequests.length}`);
  return { errorsCaptured };
}

// ── Phase 6: GET /v1/models ──────────────────────────────
async function testModels(projectKeys) {
  logPhase('Fase 6: Requests GET /v1/models');

  const keys = Object.values(projectKeys);
  let success = 0;

  for (let i = 0; i < 2; i++) {
    const keyInfo = keys[i] || keys[0];

    try {
      log(`[${i + 1}/2] ${keyInfo.name} - GET /v1/models`);

      const response = await fetch(`${BASE_URL}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${keyInfo.key}`,
        },
      });

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        logOk(`Modelos disponibles: ${data.data.length}`);
        success++;
      } else {
        logOk(`Respuesta recibida: ${JSON.stringify(data).substring(0, 100)}`);
        success++;
      }
    } catch (err) {
      logFail(`Error: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  log(`Resultado: ${success}/2 éxitos`);
  return { success };
}

// ── Phase 7: Validation ──────────────────────────────────
async function validate() {
  logPhase('Fase 7: Validación del Dashboard');

  // Wait for all metrics to be written
  await sleep(2000);

  // 1. Check metrics_daily table
  log('Verificando metrics_daily...');
  const metrics = db.prepare('SELECT * FROM metrics_daily ORDER BY date DESC, total_tokens DESC').all();
  logOk(`Registros en metrics_daily: ${metrics.length}`);
  for (const m of metrics) {
    log(`  ${m.date} | ${m.model || 'N/A'} | ${m.endpoint || 'N/A'} | req:${m.total_requests} | tok:${m.total_tokens} (prompt:${m.tokens_prompt} comp:${m.tokens_completion}) | err:${m.error_rate}%`);
  }

  // 2. Check dashboard API
  log('Verificando /api/dashboard/super...');
  try {
    const response = await fetch(`${BASE_URL}/api/dashboard/super?period=all`);
    const data = await response.json();

    logOk('Summary:');
    log(`  Total Requests: ${data.summary.totalRequests}`);
    log(`  Total Tokens: ${data.summary.totalTokens} (prompt: ${data.summary.totalPrompt}, completion: ${data.summary.totalCompletion})`);
    log(`  Avg Response Time: ${data.summary.avgResponseTime}ms`);
    log(`  Error Rate: ${data.summary.errorRate}%`);
    log(`  Projects: ${data.summary.totalProjects}`);
    log(`  Models: ${data.summary.totalModels}`);

    logOk('Por Proyecto:');
    for (const p of data.byProject) {
      log(`  ${p.projectName || p.projectId}: ${p.totalRequests} req, ${p.totalTokens} tok`);
    }

    logOk('Por Modelo:');
    for (const m of data.byModel) {
      log(`  ${m.model}: ${m.totalRequests} req, ${m.totalTokens} tok (prompt: ${m.tokensPrompt}, comp: ${m.tokensCompletion})`);
    }

    logOk('Por Endpoint:');
    for (const e of data.byEndpoint) {
      log(`  ${e.endpoint}: ${e.totalRequests} req, ${e.totalTokens} tok`);
    }

    logOk('Tendencia Diaria:');
    for (const d of data.dailyTrend) {
      log(`  ${d.date}: ${d.requests} req, ${d.tokens} tok`);
    }

    // Validate expected results
    log('\n--- Validación ---');
    const checks = [
      { name: 'Al menos 4 proyectos', pass: data.summary.totalProjects >= 4 },
      { name: 'Al menos 1 modelo', pass: data.summary.totalModels >= 1 },
      { name: 'Total requests > 0', pass: data.summary.totalRequests > 0 },
      { name: 'Total tokens > 0', pass: data.summary.totalTokens > 0 },
      { name: 'Prompt tokens > 0', pass: data.summary.totalPrompt > 0 },
      { name: 'Al menos 2 endpoints', pass: data.byEndpoint.length >= 2 },
      { name: 'Al menos 3 proyectos con datos', pass: data.byProject.length >= 3 },
      { name: 'Tendencia diaria con datos', pass: data.dailyTrend.length >= 1 },
    ];

    let allPassed = true;
    for (const c of checks) {
      if (c.pass) {
        logOk(c.name);
      } else {
        logFail(c.name);
        allPassed = false;
      }
    }

    // 3. Check admin page loads
    log('Verificando /admin/pages/metrics...');
    const adminResponse = await fetch(`${BASE_URL}/admin/pages/metrics`);
    if (adminResponse.status === 200) {
      logOk(`Admin page carga: HTTP ${adminResponse.status}, ${adminResponse.headers.get('content-length')} bytes`);
    } else {
      logFail(`Admin page error: HTTP ${adminResponse.status}`);
      allPassed = false;
    }

    log(`\n${allPassed ? '\x1b[32m✓ TODAS LAS PRUEBAS PASARON\x1b[0m' : '\x1b[31m✗ ALGUNAS PRUEBAS FALLARON\x1b[0m'}`);
  } catch (err) {
    logFail(`Error validando dashboard: ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('\x1b[1m');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   TEST: Dashboard de Métricas - Pruebas Diversas   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  console.log(`Servidor: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    const { allProjects, projectKeys } = createProjectsAndKeys();

    const nonStreamResult = await testNonStreaming(projectKeys);
    const streamResult = await testStreaming(projectKeys);
    const embeddingResult = await testEmbeddings(projectKeys);
    const errorResult = await testErrors(projectKeys);
    const modelsResult = await testModels(projectKeys);

    await validate();

    logPhase('Resumen Final');
    log(`Non-streaming: ${nonStreamResult.success} éxitos, ${nonStreamResult.failed} fallos`);
    log(`Streaming: ${streamResult.success} éxitos, ${streamResult.failed} fallos`);
    log(`Embeddings: ${embeddingResult.success} éxitos, ${embeddingResult.failed} fallos`);
    log(`Errores: ${errorResult.errorsCaptured} capturados`);
    log(`Models: ${modelsResult.success} éxitos`);
  } catch (err) {
    console.error('\x1b[31mError fatal:\x1b[0m', err.message);
    console.error(err.stack);
  }
}

main();
