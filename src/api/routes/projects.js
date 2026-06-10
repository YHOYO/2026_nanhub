import { Router } from 'express';
import Project from '../../models/Project.js';
import ProjectApiKey from '../../models/ProjectApiKey.js';
import logger from '../../utils/logger.js';

const router = Router();

// ==========================================
// Helper functions for safe escaping
// ==========================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '\x26amp;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26#39;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;');
}

function escapeJS(s) {
  return String(s)
    .replace(/\\/g, '\x5c\x5c')
    .replace(/'/g, '\x5c\x27')
    .replace(/"/g, '\x5c\x22')
    .replace(/\n/g, '\x5cn')
    .replace(/\r/g, '\x5cr');
}

// ==========================================
// Dashboard routes (MUST be before /:id routes)
// ==========================================

/**
 * GET /api/projects/dashboard/keys
 * Dashboard showing all projects with their API keys
 */
router.get('/dashboard/keys', (req, res) => {
  try {
    const projects = Project.findAll();
    const keyStats = ProjectApiKey.getAllStats();

    const projectRows = projects.map(p => {
      const stats = keyStats[p.id] || { total: 0, active: 0 };
      const safeName = escapeHtml(p.name);
      const jsName = escapeJS(p.name);
      const statusColor = p.is_active ? '#10b981' : '#ef4444';
      const statusText = p.is_active ? 'Activo' : 'Inactivo';
      const dot = '\u25CF';
      return '<tr>' +
        '<td style="padding:12px 16px;border-bottom:1px solid #334155;font-weight:500">' + safeName + '</td>' +
        '<td style="padding:12px 16px;border-bottom:1px solid #334155"><span style="color:' + statusColor + '">' + dot + ' ' + statusText + '</span></td>' +
        '<td style="padding:12px 16px;border-bottom:1px solid #334155;color:#94a3b8">' + stats.active + ' / ' + stats.total + '</td>' +
        '<td style="padding:12px 16px;border-bottom:1px solid #334155;color:#94a3b8">' + p.created_at + '</td>' +
        '<td style="padding:12px 16px;border-bottom:1px solid #334155">' +
          '<button onclick="showProjectKeys(\'' + p.id + '\', \'' + jsName + '\')" style="display:inline-block;padding:6px 14px;background:#22d3ee;color:#0f172a;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600">Ver Keys</button> ' +
          '<button onclick="createNewKey(\'' + p.id + '\', \'' + jsName + '\')" style="display:inline-block;padding:6px 14px;background:#10b981;color:#0f172a;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600">+ Nueva Key</button>' +
        '</td></tr>';
    }).join('');

    let tableHtml = '';
    if (projects.length > 0) {
      tableHtml = '<table><thead><tr>' +
        '<th>Proyecto</th><th>Estado</th><th>Keys (Activas/Total)</th><th>Creado</th><th>Acciones</th>' +
        '</tr></thead><tbody>' + projectRows + '</tbody></table>';
    } else {
      tableHtml = '<div class="empty">No hay proyectos creados aun.</div>';
    }

    // Build the HTML using string concatenation to avoid template literal issues
    const htmlParts = [];
    htmlParts.push('<!DOCTYPE html><html lang="es"><head>');
    htmlParts.push('<meta charset="UTF-8">');
    htmlParts.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    htmlParts.push('<title>API Keys - NaNProxy</title>');
    htmlParts.push('<style>');
    htmlParts.push('*{margin:0;padding:0;box-sizing:border-box}');
    htmlParts.push("body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:40px 20px}");
    htmlParts.push('.container{max-width:1100px;margin:0 auto}');
    htmlParts.push('h1{font-size:28px;margin-bottom:8px}');
    htmlParts.push('.subtitle{color:#94a3b8;margin-bottom:32px;font-size:16px}');
    htmlParts.push('table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden}');
    htmlParts.push('th{text-align:left;padding:14px 16px;background:#334155;color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:0.5px}');
    htmlParts.push('tr:hover{background:#263548}');
    htmlParts.push('.empty{text-align:center;padding:40px;color:#64748b}');
    htmlParts.push('.overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center}');
    htmlParts.push('.overlay.active{display:flex}');
    htmlParts.push('.modal{background:#1e293b;border-radius:16px;padding:32px;max-width:700px;width:90%;box-shadow:0 25px 50px rgba(0,0,0,0.5);position:relative;max-height:80vh;overflow-y:auto}');
    htmlParts.push('.modal h2{font-size:20px;margin-bottom:8px;color:#f8fafc}');
    htmlParts.push('.modal .subtitle{color:#94a3b8;margin-bottom:20px;font-size:14px}');
    htmlParts.push('.modal .warning{background:#78350f;border:1px solid #b45309;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#fbbf24}');
    htmlParts.push(".modal .key-box{background:#0f172a;border:2px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;word-break:break-all;font-family:'Fira Code',Consolas,monospace;font-size:13px;color:#22d3ee;line-height:1.6}");
    htmlParts.push('.modal .btn{display:inline-block;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;text-decoration:none;margin:2px}');
    htmlParts.push('.modal .btn-primary{background:#22d3ee;color:#0f172a}');
    htmlParts.push('.modal .btn-danger{background:#ef4444;color:#fff}');
    htmlParts.push('.modal .btn-success{background:#10b981;color:#0f172a}');
    htmlParts.push('.modal .btn-secondary{background:#334155;color:#e2e8f0}');
    htmlParts.push('.modal .btn-close{position:absolute;top:16px;right:16px;background:#334155;color:#e2e8f0;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px}');
    htmlParts.push('.modal .copied{color:#10b981;font-size:13px;margin-left:10px;display:none}');
    htmlParts.push('.modal .loading{color:#94a3b8;font-size:14px}');
    htmlParts.push('.modal .error{color:#ef4444;font-size:14px}');
    htmlParts.push('.key-item{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px}');
    htmlParts.push('.key-item .key-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}');
    htmlParts.push('.key-item .key-name{font-weight:600;color:#f8fafc}');
    htmlParts.push('.key-item .key-status{font-size:12px;padding:2px 8px;border-radius:4px}');
    htmlParts.push('.key-item .key-status.active{background:#065f46;color:#10b981}');
    htmlParts.push('.key-item .key-status.inactive{background:#7f1d1d;color:#ef4444}');
    htmlParts.push('.key-item .key-meta{color:#64748b;font-size:12px;margin-bottom:8px}');
    htmlParts.push('.key-item .key-actions{display:flex;gap:4px;flex-wrap:wrap}');
    htmlParts.push('.create-key-form{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-top:16px}');
    htmlParts.push(".create-key-form input{background:#1e293b;border:1px solid #334155;border-radius:6px;padding:8px 12px;color:#e2e8f0;width:200px;font-size:14px}");
    htmlParts.push('</style></head><body>');
    htmlParts.push('<div class="container">');
    htmlParts.push('<h1>API Keys</h1>');
    htmlParts.push('<p class="subtitle">Gestiona las API keys de tus proyectos</p>');
    htmlParts.push(tableHtml);
    htmlParts.push('</div>');

    // Overlay for project keys
    htmlParts.push('<div class="overlay" id="overlay" onclick="if(event.target===this)closeModal()">');
    htmlParts.push('<div class="modal">');
    htmlParts.push('<button class="btn-close" onclick="closeModal()">&#x2715;</button>');
    htmlParts.push('<h2 id="modalTitle">API Keys</h2>');
    htmlParts.push('<p class="subtitle" id="modalSubtitle">API Keys del proyecto</p>');
    htmlParts.push('<div id="modalContent"><div class="loading">Cargando...</div></div>');
    htmlParts.push('</div></div>');

    // Overlay for new key
    htmlParts.push('<div class="overlay" id="keyOverlay" onclick="if(event.target===this)closeKeyModal()">');
    htmlParts.push('<div class="modal" style="max-width:550px">');
    htmlParts.push('<button class="btn-close" onclick="closeKeyModal()">&#x2715;</button>');
    htmlParts.push('<h2>Nueva API Key</h2>');
    htmlParts.push('<p class="subtitle">Copia esta clave ahora - no se volvera a mostrar</p>');
    htmlParts.push('<div class="warning">Copia esta key ahora! Si pierdes esta ventana, deberas regenerar la key.</div>');
    htmlParts.push('<div id="keyContent"><div class="loading">Generando...</div></div>');
    htmlParts.push('</div></div>');

    // JavaScript
    htmlParts.push('<script>');
    htmlParts.push('var currentProjectId = null;');
    htmlParts.push('function showProjectKeys(projectId, projectName) {');
    htmlParts.push('  currentProjectId = projectId;');
    htmlParts.push('  var overlay = document.getElementById("overlay");');
    htmlParts.push('  var title = document.getElementById("modalTitle");');
    htmlParts.push('  var subtitle = document.getElementById("modalSubtitle");');
    htmlParts.push('  var content = document.getElementById("modalContent");');
    htmlParts.push('  title.textContent = "API Keys \\u2014 " + projectName;');
    htmlParts.push('  subtitle.textContent = "Gestiona las API keys de este proyecto";');
    htmlParts.push('  content.innerHTML = \'<div class="loading">Cargando keys...</div>\';');
    htmlParts.push('  overlay.classList.add("active");');
    htmlParts.push('  fetch("/api/projects/" + projectId + "/keys")');
    htmlParts.push('    .then(function(r){return r.json()})');
    htmlParts.push('    .then(function(data){');
    htmlParts.push('      if(data.data && data.data.length > 0){');
    htmlParts.push('        var h="";');
    htmlParts.push('        data.data.forEach(function(k){');
    htmlParts.push('          var sc=k.isActive?"active":"inactive";');
    htmlParts.push('          var st=k.isActive?"\\u25CF Activa":"\\u25CF Inactiva";');
    htmlParts.push('          var lu=k.lastUsedAt?new Date(k.lastUsedAt).toLocaleString("es"):"Nunca";');
    htmlParts.push('          h+=\'<div class="key-item"><div class="key-header"><span class="key-name">\' + escapeHtml(k.name) + \'</span><span class="key-status \' + sc + \'">\' + st + \'</span></div>\';');
    htmlParts.push('          h+=\'<div class="key-meta">ID: \' + k.id.substring(0,8) + "... | Ultimo uso: " + lu + " | Creada: " + new Date(k.createdAt).toLocaleString("es") + \'</div>\';');
    htmlParts.push('          h+=\'<div class="key-actions">\';');
    htmlParts.push('          h+=\'<button class="btn btn-primary" onclick="viewKey(\\\'\' + k.id + \'\\\')">Ver Key</button>\';');
    htmlParts.push('          h+=\'<button class="btn btn-secondary" onclick="rotateKey(\\\'\' + k.id + \'\\\')">Rotar</button>\';');
    htmlParts.push('          if(k.isActive){h+=\'<button class="btn btn-secondary" onclick="deactivateKey(\\\'\' + k.id + \'\\\')">Desactivar</button>\';}');
    htmlParts.push('          else{h+=\'<button class="btn btn-success" onclick="activateKey(\\\'\' + k.id + \'\\\')">Activar</button>\';}');
    htmlParts.push('          h+=\'<button class="btn btn-danger" onclick="deleteKey(\\\'\' + k.id + \'\\\')">Eliminar</button>\';');
    htmlParts.push('          h+="</div></div>";');
    htmlParts.push('        });');
    htmlParts.push('        content.innerHTML=h;');
    htmlParts.push('      }else{');
    htmlParts.push('        content.innerHTML=\'<div style="text-align:center;padding:20px;color:#64748b">No hay keys para este proyecto</div>\';');
    htmlParts.push('      }');
    htmlParts.push('    })');
    htmlParts.push('    .catch(function(){content.innerHTML=\'<div class="error">Error al cargar las keys</div>\';});');
    htmlParts.push('}');
    htmlParts.push('function createNewKey(projectId,projectName){');
    htmlParts.push('  currentProjectId=projectId;');
    htmlParts.push('  var o=document.getElementById("overlay"),t=document.getElementById("modalTitle"),s=document.getElementById("modalSubtitle"),c=document.getElementById("modalContent");');
    htmlParts.push('  t.textContent="Nueva API Key \\u2014 "+projectName;');
    htmlParts.push('  s.textContent="Ingresa un nombre para la nueva key";');
    htmlParts.push('  c.innerHTML=\'<div class="create-key-form"><div style="margin-bottom:12px"><label style="display:block;color:#94a3b8;font-size:13px;margin-bottom:4px">Nombre:</label><input type="text" id="newKeyName" value="Default"></div><button class="btn btn-success" onclick="submitNewKey()">Crear Key</button></div>\';');
    htmlParts.push('  o.classList.add("active");');
    htmlParts.push('}');
    htmlParts.push('function submitNewKey(){');
    htmlParts.push('  var name=document.getElementById("newKeyName").value.trim()||"Default";');
    htmlParts.push('  var c=document.getElementById("modalContent");');
    htmlParts.push('  c.innerHTML=\'<div class="loading">Creando key...</div>\';');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name})})');
    htmlParts.push('    .then(function(r){return r.json()})');
    htmlParts.push('    .then(function(d){');
    htmlParts.push('      if(d.apiKey){closeKeyModal();showNewKeyModal(d.apiKey,d.name);showProjectKeys(currentProjectId,document.getElementById("modalTitle").textContent.replace("Nueva API Key \\u2014 ","").replace("API Keys \\u2014 ",""));}');
    htmlParts.push('      else{c.innerHTML=\'<div class="error">\'+(d.error||"Error")+"</div>";}');
    htmlParts.push('    })');
    htmlParts.push('    .catch(function(){c.innerHTML=\'<div class="error">Error al crear la key</div>\';});');
    htmlParts.push('}');
    htmlParts.push('function viewKey(keyId){');
    htmlParts.push('  var o=document.getElementById("keyOverlay"),c=document.getElementById("keyContent");');
    htmlParts.push('  c.innerHTML=\'<div class="loading">Obteniendo key...</div>\';');
    htmlParts.push('  o.classList.add("active");');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys/"+keyId+"/view",{method:"POST"})');
    htmlParts.push('    .then(function(r){return r.json()})');
    htmlParts.push('    .then(function(d){');
    htmlParts.push('      if(d.apiKey){c.innerHTML=\'<div class="key-box" id="keyValue">\'+d.apiKey+"</div><button class=\\"btn btn-primary\\" onclick=\\"copyKey()\\">Copiar Key</button><span class=\\"copied\\" id=\\"copiedMsg\\">Copiada!</span><p style=\\"margin-top:12px;color:#64748b;font-size:12px\\">Esta key reemplaza la anterior.</p>";}');
    htmlParts.push('      else{c.innerHTML=\'<div class="error">\'+(d.error||"Error")+"</div>";}');
    htmlParts.push('    })');
    htmlParts.push('    .catch(function(){c.innerHTML=\'<div class="error">Error al obtener la key</div>\';});');
    htmlParts.push('}');
    htmlParts.push('function rotateKey(keyId){');
    htmlParts.push('  if(!confirm("Rotar esta key? La anterior dejara de funcionar."))return;');
    htmlParts.push('  var o=document.getElementById("keyOverlay"),c=document.getElementById("keyContent");');
    htmlParts.push('  c.innerHTML=\'<div class="loading">Rotando key...</div>\';');
    htmlParts.push('  o.classList.add("active");');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys/"+keyId+"/rotate",{method:"POST"})');
    htmlParts.push('    .then(function(r){return r.json()})');
    htmlParts.push('    .then(function(d){');
    htmlParts.push('      if(d.apiKey){c.innerHTML=\'<div class="key-box" id="keyValue">\'+d.apiKey+"</div><button class=\\"btn btn-primary\\" onclick=\\"copyKey()\\">Copiar Key</button><span class=\\"copied\\" id=\\"copiedMsg\\">Copiada!</span><p style=\\"margin-top:12px;color:#64748b;font-size:12px\\">La key anterior ya no funciona.</p>";showProjectKeys(currentProjectId,document.getElementById("modalTitle").textContent.replace("API Keys \\u2014 ",""));}');
    htmlParts.push('      else{c.innerHTML=\'<div class="error">\'+(d.error||"Error")+"</div>";}');
    htmlParts.push('    })');
    htmlParts.push('    .catch(function(){c.innerHTML=\'<div class="error">Error al rotar la key</div>\';});');
    htmlParts.push('}');
    htmlParts.push('function deactivateKey(keyId){');
    htmlParts.push('  if(!confirm("Desactivar esta key?"))return;');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys/"+keyId+"/deactivate",{method:"POST"})');
    htmlParts.push('    .then(function(){showProjectKeys(currentProjectId,document.getElementById("modalTitle").textContent.replace("API Keys \\u2014 ",""))});');
    htmlParts.push('}');
    htmlParts.push('function activateKey(keyId){');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys/"+keyId+"/activate",{method:"POST"})');
    htmlParts.push('    .then(function(){showProjectKeys(currentProjectId,document.getElementById("modalTitle").textContent.replace("API Keys \\u2014 ",""))});');
    htmlParts.push('}');
    htmlParts.push('function deleteKey(keyId){');
    htmlParts.push('  if(!confirm("Eliminar esta key permanentemente?"))return;');
    htmlParts.push('  fetch("/api/projects/"+currentProjectId+"/keys/"+keyId,{method:"DELETE"})');
    htmlParts.push('    .then(function(){showProjectKeys(currentProjectId,document.getElementById("modalTitle").textContent.replace("API Keys \\u2014 ",""))});');
    htmlParts.push('}');
    htmlParts.push('function showNewKeyModal(apiKey,name){');
    htmlParts.push('  var o=document.getElementById("keyOverlay"),c=document.getElementById("keyContent");');
    htmlParts.push('  c.innerHTML=\'<div class="key-box" id="keyValue">\'+apiKey+"</div><button class=\\"btn btn-primary\\" onclick=\\"copyKey()\\">Copiar Key</button><span class=\\"copied\\" id=\\"copiedMsg\\">Copiada!</span><p style=\\"margin-top:12px;color:#64748b;font-size:12px\\">No volveras a ver esta key. Copiala ahora.</p>";');
    htmlParts.push('  o.classList.add("active");');
    htmlParts.push('}');
    htmlParts.push('function copyKey(){');
    htmlParts.push('  var k=document.getElementById("keyValue").textContent;');
    htmlParts.push('  navigator.clipboard.writeText(k).then(function(){document.getElementById("copiedMsg").style.display="inline";setTimeout(function(){document.getElementById("copiedMsg").style.display="none"},3000)});');
    htmlParts.push('}');
    htmlParts.push('function closeModal(){document.getElementById("overlay").classList.remove("active")}');
    htmlParts.push('function closeKeyModal(){document.getElementById("keyOverlay").classList.remove("active")}');
    htmlParts.push('function escapeHtml(t){var d=document.createElement("div");d.appendChild(document.createTextNode(t));return d.innerHTML}');
    htmlParts.push('document.addEventListener("keydown",function(e){if(e.key==="Escape"){if(document.getElementById("keyOverlay").classList.contains("active")){closeKeyModal()}else{closeModal()}}});');
    htmlParts.push('</script></body></html>');

    res.send(htmlParts.join(''));
  } catch (error) {
    logger.error('Failed to render keys dashboard', { error: error.message });
    res.status(500).send('<h1>Error</h1>');
  }
});

// ==========================================
// Project CRUD routes
// ==========================================

/**
 * POST /api/projects
 */
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const project = Project.create({ name: name.trim(), description: description?.trim() || null });
    const apiKeyRecord = ProjectApiKey.create({ projectId: project.id, name: 'Default' });
    logger.info('Project created', { projectId: project.id, name: project.name });
    res.status(201).json({ id: project.id, name: project.name, description: project.description, apiKey: apiKeyRecord.apiKey, createdAt: project.createdAt });
  } catch (error) {
    logger.error('Failed to create project', { error: error.message });
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects
 */
router.get('/', (req, res) => {
  try {
    const projects = Project.findAll();
    const keyStats = ProjectApiKey.getAllStats();
    const projectsList = projects.map(project => ({
      id: project.id, name: project.name, description: project.description,
      isActive: project.is_active, keysCount: keyStats[project.id]?.total || 0,
      activeKeysCount: keyStats[project.id]?.active || 0,
      createdAt: project.created_at, updatedAt: project.updated_at,
    }));
    res.json({ data: projectsList });
  } catch (error) {
    logger.error('Failed to list projects', { error: error.message });
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/**
 * GET /api/projects/:id
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const stats = Project.getStats(id);
    const keyStats = ProjectApiKey.getStats(id);
    res.json({ id: project.id, name: project.name, description: project.description, isActive: project.is_active, keysCount: keyStats.total || 0, activeKeysCount: keyStats.active || 0, createdAt: project.created_at, updatedAt: project.updated_at, stats });
  } catch (error) {
    logger.error('Failed to get project', { error: error.message });
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * PUT /api/projects/:id
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const existingProject = Project.findById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });
    const updated = Project.update(id, { name, description, isActive });
    if (!updated) return res.status(400).json({ error: 'No fields to update' });
    const project = Project.findById(id);
    logger.info('Project updated', { projectId: id });
    res.json({ id: project.id, name: project.name, description: project.description, isActive: project.is_active, createdAt: project.created_at, updatedAt: project.updated_at });
  } catch (error) {
    logger.error('Failed to update project', { error: error.message });
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existingProject = Project.findById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });
    Project.delete(id);
    logger.info('Project deleted', { projectId: id });
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete project', { error: error.message });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ==========================================
// API Key management routes
// ==========================================

router.get('/:id/keys', (req, res) => {
  try {
    const { id } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const keys = ProjectApiKey.findByProjectId(id);
    const keysList = keys.map(key => ({ id: key.id, name: key.name, isActive: key.is_active === 1, lastUsedAt: key.last_used_at, expiresAt: key.expires_at, createdAt: key.created_at, updatedAt: key.updated_at }));
    res.json({ data: keysList });
  } catch (error) {
    logger.error('Failed to list API keys', { error: error.message });
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

router.post('/:id/keys', (req, res) => {
  try {
    const { id } = req.params;
    const { name, expiresAt } = req.body;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const apiKeyRecord = ProjectApiKey.create({ projectId: id, name: name?.trim() || 'Default', expiresAt: expiresAt || null });
    logger.info('API key created', { projectId: id, keyId: apiKeyRecord.id });
    res.status(201).json({ id: apiKeyRecord.id, name: apiKeyRecord.name, apiKey: apiKeyRecord.apiKey, expiresAt: apiKeyRecord.expiresAt, createdAt: apiKeyRecord.createdAt });
  } catch (error) {
    logger.error('Failed to create API key', { error: error.message });
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/:id/keys/:keyId', (req, res) => {
  try {
    const { id, keyId } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = ProjectApiKey.findById(keyId);
    if (!key || key.project_id !== id) return res.status(404).json({ error: 'API key not found' });
    ProjectApiKey.delete(keyId);
    logger.info('API key deleted', { projectId: id, keyId });
    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete API key', { error: error.message });
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

router.post('/:id/keys/:keyId/rotate', (req, res) => {
  try {
    const { id, keyId } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = ProjectApiKey.findById(keyId);
    if (!key || key.project_id !== id) return res.status(404).json({ error: 'API key not found' });
    const result = ProjectApiKey.rotateKey(keyId);
    logger.info('API key rotated', { projectId: id, keyId });
    res.json({ id: result.id, name: result.name, apiKey: result.apiKey });
  } catch (error) {
    logger.error('Failed to rotate API key', { error: error.message });
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

router.post('/:id/keys/:keyId/deactivate', (req, res) => {
  try {
    const { id, keyId } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = ProjectApiKey.findById(keyId);
    if (!key || key.project_id !== id) return res.status(404).json({ error: 'API key not found' });
    ProjectApiKey.deactivate(keyId);
    logger.info('API key deactivated', { projectId: id, keyId });
    res.json({ message: 'API key deactivated successfully' });
  } catch (error) {
    logger.error('Failed to deactivate API key', { error: error.message });
    res.status(500).json({ error: 'Failed to deactivate API key' });
  }
});

router.post('/:id/keys/:keyId/activate', (req, res) => {
  try {
    const { id, keyId } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = ProjectApiKey.findById(keyId);
    if (!key || key.project_id !== id) return res.status(404).json({ error: 'API key not found' });
    ProjectApiKey.activate(keyId);
    logger.info('API key activated', { projectId: id, keyId });
    res.json({ message: 'API key activated successfully' });
  } catch (error) {
    logger.error('Failed to activate API key', { error: error.message });
    res.status(500).json({ error: 'Failed to activate API key' });
  }
});

router.post('/:id/keys/:keyId/view', (req, res) => {
  try {
    const { id, keyId } = req.params;
    const project = Project.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = ProjectApiKey.findById(keyId);
    if (!key || key.project_id !== id) return res.status(404).json({ error: 'API key not found' });
    const result = ProjectApiKey.rotateKey(keyId);
    logger.info('API key viewed', { projectId: id, keyId });
    res.json({ apiKey: result.apiKey });
  } catch (error) {
    logger.error('Failed to view API key', { error: error.message });
    res.status(500).json({ error: 'Failed to view API key' });
  }
});

export default router;
