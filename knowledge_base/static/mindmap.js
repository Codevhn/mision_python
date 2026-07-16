/* =============================================
   MINDMAP — AI-assisted mind map module (Fase 0: fundamentos)
   Exposes window.MindmapApp = { init, showList, showMap }

   Fase 0 scope: real CRUD (create/list/open/rename/delete maps,
   add/edit/delete nodes) rendered as a simple nested list. The
   professional SVG tidy-tree canvas with zoom/pan replaces this
   list view in Fase 2 — this is intentionally plain for now.
   ============================================= */

(function () {
  'use strict';

  let _area = null;
  let _currentMap = null; // full mindmap object currently open, or null

  function _esc(s) {
    return (window.escapeHtml ? escapeHtml(s) : String(s ?? ''));
  }

  // ── API ──────────────────────────────────────────────────────────────────
  async function apiList() {
    const r = await fetch('/api/mindmaps');
    if (!r.ok) throw new Error('list failed');
    return r.json();
  }
  async function apiCreate(title) {
    const r = await fetch('/api/mindmaps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error('create failed');
    return r.json();
  }
  async function apiGet(id) {
    const r = await fetch(`/api/mindmaps/${id}`);
    if (!r.ok) throw new Error('get failed');
    return r.json();
  }
  async function apiRename(id, title) {
    const r = await fetch(`/api/mindmaps/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error('rename failed');
    return r.json();
  }
  async function apiDelete(id) {
    const r = await fetch(`/api/mindmaps/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete failed');
    return r.json();
  }
  async function apiAddNode(mapId, parentId, text) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, text }),
    });
    if (!r.ok) throw new Error('add node failed');
    return r.json();
  }
  async function apiEditNode(mapId, nodeId, text) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error('edit node failed');
    return r.json();
  }
  async function apiDeleteNode(mapId, nodeId) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete node failed');
    return r.json();
  }

  // ── List view (landing grid) ────────────────────────────────────────────
  async function showList() {
    _area = document.getElementById('mindmapArea');
    if (!_area) return;
    if (window.showMindmapArea) window.showMindmapArea();
    _currentMap = null;
    _area.innerHTML = '<div class="mm-loading">Cargando mapas…</div>';

    let maps;
    try { maps = await apiList(); }
    catch { _area.innerHTML = '<div class="mm-loading">No se pudo cargar. Recarga la página.</div>'; return; }

    const cards = maps.map(m => `
      <div class="mm-card" data-id="${m.id}">
        <div class="mm-card-icon">✺</div>
        <div class="mm-card-title">${_esc(m.title)}</div>
        <div class="mm-card-meta">${m.node_count} nodo${m.node_count === 1 ? '' : 's'}</div>
      </div>`).join('');

    _area.innerHTML = `
      <div class="mm-prompt-header">
        <h1 class="mm-prompt-title">¿Sobre qué quieres el mapa mental?</h1>
        <div class="mm-prompt-row">
          <input type="text" class="mm-prompt-input" id="mmPromptInput"
                 placeholder="Ej: Quiero saber cómo estudiar SQL desde cero…" autocomplete="off" />
          <button class="mm-prompt-btn" id="mmPromptBtn" title="Generar">→</button>
        </div>
        <p class="mm-hint">La IA arma el árbol completo — ramas y subramas — al instante. ¿Prefieres armarlo tú? <a href="#" id="mmBlankLink">crea uno vacío</a>.</p>
      </div>
      ${maps.length ? '<p class="mm-grid-label">Tus mapas</p>' : ''}
      <div class="mm-grid" id="mmGrid">
        ${cards}
      </div>`;

    const input = document.getElementById('mmPromptInput');
    const submit = () => generateFromPrompt(input.value);
    document.getElementById('mmPromptBtn').addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    document.getElementById('mmBlankLink').addEventListener('click', e => { e.preventDefault(); promptCreateBlank(); });
    _area.querySelectorAll('.mm-card[data-id]').forEach(card => {
      card.addEventListener('click', () => showMap(card.dataset.id));
    });
    input.focus();
  }

  function promptCreateBlank() {
    const title = window.prompt('¿Sobre qué quieres el mapa?');
    if (!title || !title.trim()) return;
    apiCreate(title.trim())
      .then(map => {
        if (window._loadMindmapSidebar) window._loadMindmapSidebar();
        showMap(map.id);
      })
      .catch(() => window.showToast && showToast('Error al crear el mapa', 'error'));
  }

  // ── AI generation — the primary "wow" entry point ───────────────────────
  async function generateFromPrompt(rawPrompt) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return;

    _area = document.getElementById('mindmapArea');
    if (!_area) return;
    if (window.showMindmapArea) window.showMindmapArea();
    _area.innerHTML = `
      <div class="mm-generating">
        <span class="mm-spinner"></span>
        <p>Generando tu mapa mental…</p>
        <p class="mm-generating-sub">"${_esc(prompt)}"</p>
      </div>`;

    try {
      const res = await fetch('/api/mindmaps/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar');
      _currentMap = data;
      if (window._loadMindmapSidebar) window._loadMindmapSidebar();
      render();
    } catch (err) {
      _area.innerHTML = `<div class="mm-loading">No se pudo generar el mapa: ${_esc(err.message)}</div>`;
      window.showToast && showToast('Error al generar el mapa mental', 'error');
    }
  }

  // ── Map view (open a specific map) ──────────────────────────────────────
  async function showMap(id) {
    _area = document.getElementById('mindmapArea');
    if (!_area) return;
    if (window.showMindmapArea) window.showMindmapArea();
    _area.innerHTML = '<div class="mm-loading">Cargando…</div>';

    let map;
    try { map = await apiGet(id); }
    catch { _area.innerHTML = '<div class="mm-loading">No se pudo cargar ese mapa.</div>'; return; }

    _currentMap = map;
    render();
  }

  function render() {
    if (!_currentMap) return;
    _area.innerHTML = `
      <div class="mm-map-header">
        <button class="mm-back-btn" id="mmBackBtn" title="Volver a Mapas">← Mapas</button>
        <h1 class="mm-map-title" id="mmMapTitle" contenteditable="true" spellcheck="false">${_esc(_currentMap.title)}</h1>
        <button class="mm-delete-btn" id="mmDeleteBtn" title="Eliminar mapa">Eliminar</button>
      </div>
      <div class="mm-tree-wrap">
        <ul class="mm-tree" id="mmTree"></ul>
      </div>`;

    document.getElementById('mmBackBtn').addEventListener('click', showList);
    document.getElementById('mmDeleteBtn').addEventListener('click', onDeleteMap);

    const titleEl = document.getElementById('mmMapTitle');
    titleEl.addEventListener('blur', onRenameMap);
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });

    const treeRoot = document.getElementById('mmTree');
    treeRoot.appendChild(renderNode(_currentMap.root, true));
  }

  function renderNode(node, isRoot) {
    const li = document.createElement('li');
    li.className = 'mm-node' + (isRoot ? ' mm-node--root' : '');
    li.dataset.id = node.id;

    const row = document.createElement('div');
    row.className = 'mm-node-row';

    const text = document.createElement('span');
    text.className = 'mm-node-text';
    text.textContent = node.text;
    text.contentEditable = 'true';
    text.spellcheck = false;
    text.addEventListener('blur', () => {
      const val = text.textContent.trim();
      if (!val || val === node.text) { text.textContent = node.text; return; }
      apiEditNode(_currentMap.id, node.id, val)
        .then(map => { _currentMap = map; })
        .catch(() => window.showToast && showToast('Error al editar', 'error'));
    });
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'mm-node-add';
    addBtn.title = 'Agregar sub-tema';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => onAddChild(node.id));

    row.append(text, addBtn);

    if (!isRoot) {
      const delBtn = document.createElement('button');
      delBtn.className = 'mm-node-del';
      delBtn.title = 'Eliminar';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => onDeleteNode(node.id));
      row.appendChild(delBtn);
    }

    li.appendChild(row);

    if (node.children && node.children.length) {
      const ul = document.createElement('ul');
      ul.className = 'mm-tree';
      node.children.forEach(child => ul.appendChild(renderNode(child, false)));
      li.appendChild(ul);
    }
    return li;
  }

  function onAddChild(parentId) {
    const text = window.prompt('Texto del sub-tema:');
    if (!text || !text.trim()) return;
    apiAddNode(_currentMap.id, parentId, text.trim())
      .then(map => { _currentMap = map; render(); })
      .catch(() => window.showToast && showToast('Error al agregar', 'error'));
  }

  function onDeleteNode(nodeId) {
    apiDeleteNode(_currentMap.id, nodeId)
      .then(map => { _currentMap = map; render(); })
      .catch(() => window.showToast && showToast('Error al eliminar', 'error'));
  }

  function onRenameMap(e) {
    const val = e.target.textContent.trim();
    if (!val || val === _currentMap.title) { e.target.textContent = _currentMap.title; return; }
    apiRename(_currentMap.id, val)
      .then(map => {
        _currentMap = map;
        if (window._loadMindmapSidebar) window._loadMindmapSidebar();
      })
      .catch(() => window.showToast && showToast('Error al renombrar', 'error'));
  }

  function onDeleteMap() {
    if (!_currentMap) return;
    if (!window.confirm(`¿Eliminar el mapa "${_currentMap.title}"? Esta acción no se puede deshacer.`)) return;
    apiDelete(_currentMap.id)
      .then(() => {
        if (window._loadMindmapSidebar) window._loadMindmapSidebar();
        showList();
      })
      .catch(() => window.showToast && showToast('Error al eliminar', 'error'));
  }

  function init() {
    // Nothing to pre-load — the sidebar tree (loaded by app.js) and the
    // "+ Nuevo mapa" entry points are enough to reach showList()/showMap().
  }

  window.MindmapApp = { init, showList, showMap, generateFromPrompt };
})();
