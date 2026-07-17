/* =============================================
   MINDMAP — AI-assisted mind map module
   Exposes window.MindmapApp = { init, showList, showMap, generateFromPrompt }

   Fase 0: CRUD (create/list/open/rename/delete maps, add/edit/delete
   nodes) + AI generation (explore/summarize modes).
   Fase 2: the map view renders as a real SVG tidy-tree canvas — nodes
   laid out by depth/branch, curved connectors, pan (drag background)
   and zoom (wheel + buttons), branch colors, inline editing via
   foreignObject. Vector-based, so zoom never blurs.
   ============================================= */

(function () {
  'use strict';

  let _area = null;
  let _currentMap = null; // full mindmap object currently open, or null
  let _view = { x: 0, y: 0, k: 1 }; // pan/zoom state for the canvas
  let _viewportEl = null, _svgEl = null;
  let _panAbort = null; // AbortController for window-level pan listeners, re-armed per render
  let _measureCtx = null;

  const BRANCH_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];
  const NODE_H = 40, ROOT_H = 52, ROW_GAP = 16, COL_GAP = 90, NODE_MIN_W = 90, NODE_PAD_X = 76; // includes room for the two hover action buttons
  const ZOOM_MIN = 0.2, ZOOM_MAX = 2.5;

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

  async function promptCreateBlank() {
    const title = window.showPrompt
      ? await window.showPrompt('Nuevo mapa mental', 'Ej: Entornos virtuales en Python')
      : window.prompt('¿Sobre qué quieres el mapa?');
    if (!title) return;
    try {
      const map = await apiCreate(title);
      if (window._loadMindmapSidebar) window._loadMindmapSidebar();
      showMap(map.id);
    } catch {
      window.showToast && showToast('Error al crear el mapa', 'error');
    }
  }

  // ── AI generation — the primary "wow" entry point ───────────────────────
  // opts.mode: 'explore' (default — brainstorm a plan from a bare topic, the
  // ideamap.ai-style prompt-field flow) or 'summarize' (organize opts.content,
  // real existing text, into a study map grounded in what it actually says —
  // used by the course-lesson shortcut, which has real content to draw from).
  async function generateFromPrompt(rawPrompt, opts) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return;
    opts = opts || {};
    const isSummarize = opts.mode === 'summarize' && opts.content;

    _area = document.getElementById('mindmapArea');
    if (!_area) return;
    if (window.showMindmapArea) window.showMindmapArea();
    _area.innerHTML = `
      <div class="mm-generating">
        <span class="mm-spinner"></span>
        <p>${isSummarize ? 'Organizando el contenido de la lección…' : 'Generando tu mapa mental…'}</p>
        <p class="mm-generating-sub">"${_esc(prompt)}"</p>
      </div>`;

    try {
      const res = await fetch('/api/mindmaps/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, content: opts.content || '', mode: opts.mode || 'explore' }),
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
    if (_panAbort) _panAbort.abort();
    _panAbort = new AbortController();
    const { signal } = _panAbort;

    _area.innerHTML = `
      <div class="mm-map-header">
        <button class="mm-back-btn" id="mmBackBtn" title="Volver a Mapas">← Mapas</button>
        <h1 class="mm-map-title" id="mmMapTitle" contenteditable="true" spellcheck="false">${_esc(_currentMap.title)}</h1>
        <button class="mm-delete-btn" id="mmDeleteBtn" title="Eliminar mapa">Eliminar</button>
      </div>
      <div class="mm-canvas-wrap" id="mmCanvasWrap">
        <svg id="mmSvg" class="mm-svg">
          <g id="mmViewport">
            <g id="mmLinks"></g>
            <g id="mmNodes"></g>
          </g>
        </svg>
        <div class="mm-zoom-controls">
          <button class="mm-zoom-btn" id="mmZoomOut" title="Alejar">−</button>
          <button class="mm-zoom-btn" id="mmZoomFit" title="Ajustar a pantalla">⤢</button>
          <button class="mm-zoom-btn" id="mmZoomIn" title="Acercar">+</button>
        </div>
      </div>`;

    document.getElementById('mmBackBtn').addEventListener('click', showList, { signal });
    document.getElementById('mmDeleteBtn').addEventListener('click', onDeleteMap, { signal });

    const titleEl = document.getElementById('mmMapTitle');
    titleEl.addEventListener('blur', onRenameMap, { signal });
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    }, { signal });

    _svgEl = document.getElementById('mmSvg');
    _viewportEl = document.getElementById('mmViewport');
    renderCanvas();
    initPanZoom(signal);
    fitToScreen();
  }

  // ── Layout — hand-rolled tidy tree (depth = column, siblings stacked) ──────
  function measureTextWidth(text, bold) {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    _measureCtx.font = `${bold ? 700 : 500} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    return _measureCtx.measureText(text || '').width;
  }

  function computeLayout(root) {
    let leafCursor = 0;
    const colWidths = [];

    function place(node, depth, branchIdx) {
      const isRoot = depth === 0;
      node._depth = depth;
      node._h = isRoot ? ROOT_H : NODE_H;
      node._w = Math.max(NODE_MIN_W, Math.ceil(measureTextWidth(node.text, isRoot)) + NODE_PAD_X);
      node._color = isRoot ? 'var(--accent)' : BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];
      colWidths[depth] = Math.max(colWidths[depth] || 0, node._w);

      const kids = node.children || [];
      if (!kids.length) {
        node._y = leafCursor * (NODE_H + ROW_GAP);
        leafCursor++;
      } else {
        kids.forEach((child, i) => place(child, depth + 1, isRoot ? i : branchIdx));
        node._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
      }
    }
    place(root, 0, 0);

    function assignX(node, depth, x) {
      node._x = x;
      const nextX = x + colWidths[depth] + COL_GAP;
      (node.children || []).forEach(child => assignX(child, depth + 1, nextX));
    }
    assignX(root, 0, 0);

    return { totalHeight: Math.max(leafCursor * (NODE_H + ROW_GAP), NODE_H), totalWidth: colWidths.reduce((a, b) => a + b + COL_GAP, 0) };
  }

  function renderCanvas() {
    const linksG = document.getElementById('mmLinks');
    const nodesG = document.getElementById('mmNodes');
    linksG.innerHTML = '';
    nodesG.innerHTML = '';
    computeLayout(_currentMap.root);

    const flat = [];
    (function collect(node, parent) { flat.push({ node, parent }); (node.children || []).forEach(c => collect(c, node)); })(_currentMap.root, null);

    // Links first (so nodes render on top)
    for (const { node, parent } of flat) {
      if (!parent) continue;
      const x1 = parent._x + parent._w, y1 = parent._y + parent._h / 2;
      const x2 = node._x, y2 = node._y + node._h / 2;
      const mx = x1 + (x2 - x1) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', 'mm-link');
      path.setAttribute('stroke', node._color.startsWith('var') ? '#94a3b8' : node._color);
      linksG.appendChild(path);
    }

    for (const { node } of flat) {
      nodesG.appendChild(renderNodeFO(node, node === _currentMap.root));
    }
  }

  function renderNodeFO(node, isRoot) {
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', node._x);
    fo.setAttribute('y', node._y);
    fo.setAttribute('width', node._w);
    fo.setAttribute('height', node._h);
    fo.setAttribute('style', 'overflow: visible;');
    fo.dataset.id = node.id;

    const box = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    box.className = 'mm-node-box' + (isRoot ? ' mm-node-box--root' : '');
    box.style.borderColor = node._color;
    if (isRoot) box.style.background = node._color;

    const text = document.createElement('div');
    text.className = 'mm-node-text';
    text.textContent = node.text;
    text.contentEditable = 'true';
    text.spellcheck = false;
    text.addEventListener('mousedown', e => e.stopPropagation());
    text.addEventListener('blur', () => {
      const val = text.textContent.trim();
      if (!val || val === node.text) { text.textContent = node.text; return; }
      apiEditNode(_currentMap.id, node.id, val)
        .then(map => { _currentMap = map; renderCanvas(); })
        .catch(() => window.showToast && showToast('Error al editar', 'error'));
    });
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    });
    box.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'mm-node-actions';
    const addBtn = document.createElement('button');
    addBtn.className = 'mm-node-add';
    addBtn.title = 'Agregar sub-tema';
    addBtn.textContent = '+';
    addBtn.addEventListener('mousedown', e => e.stopPropagation());
    addBtn.addEventListener('click', () => onAddChild(node.id));
    actions.appendChild(addBtn);
    if (!isRoot) {
      const delBtn = document.createElement('button');
      delBtn.className = 'mm-node-del';
      delBtn.title = 'Eliminar';
      delBtn.textContent = '×';
      delBtn.addEventListener('mousedown', e => e.stopPropagation());
      delBtn.addEventListener('click', () => onDeleteNode(node.id, (node.children || []).length));
      actions.appendChild(delBtn);
    }
    box.appendChild(actions);

    fo.appendChild(box);
    return fo;
  }

  // ── Pan (drag background) + zoom (wheel / buttons) — vector, never blurs ──
  function applyView() {
    _viewportEl.setAttribute('transform', `translate(${_view.x},${_view.y}) scale(${_view.k})`);
  }

  function zoomAt(cx, cy, factor) {
    const newK = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, _view.k * factor));
    _view.x = cx - (cx - _view.x) * (newK / _view.k);
    _view.y = cy - (cy - _view.y) * (newK / _view.k);
    _view.k = newK;
    applyView();
  }

  function fitToScreen() {
    if (!_currentMap || !_svgEl) return;
    const flat = [];
    (function collect(node) { flat.push(node); (node.children || []).forEach(collect); })(_currentMap.root);
    if (!flat.length) return;
    const minX = Math.min(...flat.map(n => n._x));
    const maxX = Math.max(...flat.map(n => n._x + n._w));
    const minY = Math.min(...flat.map(n => n._y));
    const maxY = Math.max(...flat.map(n => n._y + n._h));
    const rect = _svgEl.getBoundingClientRect();
    const w = rect.width || 900, h = rect.height || 600;
    const contentW = Math.max(1, maxX - minX), contentH = Math.max(1, maxY - minY);
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((w - 80) / contentW, (h - 80) / contentH, 1)));
    _view.k = k;
    _view.x = (w - contentW * k) / 2 - minX * k;
    _view.y = (h - contentH * k) / 2 - minY * k;
    applyView();
  }

  function initPanZoom(signal) {
    applyView();
    let panning = false, lastX = 0, lastY = 0, moved = false;

    _svgEl.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1 - e.deltaY * 0.0015);
    }, { passive: false, signal });

    _svgEl.addEventListener('mousedown', e => {
      if (e.target.closest('.mm-node-box')) return;
      panning = true; moved = false; lastX = e.clientX; lastY = e.clientY;
      _svgEl.classList.add('mm-grabbing');
    }, { signal });

    window.addEventListener('mousemove', e => {
      if (!panning) return;
      moved = true;
      _view.x += e.clientX - lastX;
      _view.y += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      applyView();
    }, { signal });

    window.addEventListener('mouseup', () => {
      panning = false;
      _svgEl.classList.remove('mm-grabbing');
    }, { signal });

    document.getElementById('mmZoomIn').addEventListener('click', () => {
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 1.25);
    }, { signal });
    document.getElementById('mmZoomOut').addEventListener('click', () => {
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 0.8);
    }, { signal });
    document.getElementById('mmZoomFit').addEventListener('click', fitToScreen, { signal });
  }

  async function onAddChild(parentId) {
    const text = window.showPrompt
      ? await window.showPrompt('Agregar sub-tema', 'Escribe el texto…')
      : window.prompt('Texto del sub-tema:');
    if (!text) return;
    try {
      _currentMap = await apiAddNode(_currentMap.id, parentId, text);
      renderCanvas();
      fitToScreen();
    } catch {
      window.showToast && showToast('Error al agregar', 'error');
    }
  }

  async function onDeleteNode(nodeId, childCount) {
    if (childCount > 0) {
      const ok = window.showConfirm
        ? await window.showConfirm('eliminar rama', `Este nodo tiene ${childCount} sub-tema${childCount === 1 ? '' : 's'}. ¿Eliminarlo junto con toda la rama?`)
        : window.confirm('Este nodo tiene sub-temas. ¿Eliminarlo junto con toda la rama?');
      if (!ok) return;
    }
    apiDeleteNode(_currentMap.id, nodeId)
      .then(map => { _currentMap = map; renderCanvas(); fitToScreen(); })
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

  async function onDeleteMap() {
    if (!_currentMap) return;
    const ok = window.showConfirm
      ? await window.showConfirm('eliminar mapa', `¿Eliminar el mapa "${_currentMap.title}"? Esta acción no se puede deshacer.`)
      : window.confirm(`¿Eliminar el mapa "${_currentMap.title}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await apiDelete(_currentMap.id);
      if (window._loadMindmapSidebar) window._loadMindmapSidebar();
      showList();
    } catch {
      window.showToast && showToast('Error al eliminar', 'error');
    }
  }

  function init() {
    // Nothing to pre-load — the sidebar tree (loaded by app.js) and the
    // "+ Nuevo mapa" entry points are enough to reach showList()/showMap().
  }

  window.MindmapApp = { init, showList, showMap, generateFromPrompt };
})();
