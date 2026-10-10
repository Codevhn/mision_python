/* =============================================
   CONCEPT MAP — AI-assisted concept map module (mapas conceptuales)
   Exposes window.ConceptMapApp = { init, showList, showMap, generateFromPrompt }

   Deliberately NOT a reskinned mindmap: a concept map is a real GRAPH (flat
   nodes + edges, a node can have more than one incoming connection) where
   every connection carries its own linking-phrase label, read together with
   its two nodes as a short proposition ("Currículo" —"se concreta en"→
   "D.C.B."). Mind maps (mindmap.js) are a tree of branches with no edge
   text — a different study technique entirely, kept as its own feature.

   Layout: the server computes an initial top-to-bottom rank (general at
   top, specific below, see app.py's _layout_concept_map) when a map is
   AI-generated, but nodes are always freely draggable afterward — real
   concept maps are rarely tidy on the first try. Rank is recomputed
   client-side from the current edges on every render purely to drive
   color/weight (more general = bolder), independent of whatever position
   the student has dragged a node to.
   ============================================= */

(function () {
  'use strict';

  let _area = null;
  let _modelChoice = null; // {provider, model} — picked via the model selector, remembered per-context in localStorage
  let _currentMap = null; // {id, title, nodes:[{id,text,x,y,color}], edges:[{id,from,to,label}]}
  let _view = { x: 0, y: 0, k: 1 };
  let _viewportEl = null, _svgEl = null;
  let _panAbort = null;
  let _explorer = null, _editing = false;

  const RANK_COLORS = ['#bd603e', '#527b91', '#49867a', '#80709c', '#99804c', '#617887'];
  const NODE_W = 180, NODE_H = 112, ROOT_SCALE = 1.06;
  const ZOOM_MIN = 0.2, ZOOM_MAX = 2.5;
  const DRAG_THRESHOLD = 4;

  const ICON_PLUS = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_MINUS = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_FIT = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M1 4V1h3M11 4V1H8M1 8v3h3M11 8v3H8" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function _esc(s) { return (window.escapeHtml ? escapeHtml(s) : String(s ?? '')); }

  // ── API ──────────────────────────────────────────────────────────────────
  async function apiList() {
    const r = await fetch('/api/concept-maps');
    if (!r.ok) throw new Error('list failed');
    return r.json();
  }
  async function apiCreate(title) {
    const r = await fetch('/api/concept-maps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error('create failed');
    return r.json();
  }
  async function apiGet(id) {
    const r = await fetch(`/api/concept-maps/${id}`);
    if (!r.ok) throw new Error('get failed');
    return r.json();
  }
  async function apiRename(id, title) {
    const r = await fetch(`/api/concept-maps/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error('rename failed');
    return r.json();
  }
  async function apiDelete(id) {
    const r = await fetch(`/api/concept-maps/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete failed');
    return r.json();
  }
  async function apiAddNode(mapId, text, x, y) {
    const r = await fetch(`/api/concept-maps/${mapId}/nodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, x, y }),
    });
    if (!r.ok) throw new Error('add node failed');
    return r.json();
  }
  async function apiPatchNode(mapId, nodeId, patch) {
    const r = await fetch(`/api/concept-maps/${mapId}/nodes/${nodeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error('edit node failed');
    return r.json();
  }
  async function apiDeleteNode(mapId, nodeId) {
    const r = await fetch(`/api/concept-maps/${mapId}/nodes/${nodeId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete node failed');
    return r.json();
  }
  async function apiAddEdge(mapId, from, to, label) {
    const r = await fetch(`/api/concept-maps/${mapId}/edges`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, label }),
    });
    if (!r.ok) throw new Error('add edge failed');
    return r.json();
  }
  async function apiPatchEdge(mapId, edgeId, patch) {
    const r = await fetch(`/api/concept-maps/${mapId}/edges/${edgeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error('edit edge failed');
    return r.json();
  }
  async function apiDeleteEdge(mapId, edgeId) {
    const r = await fetch(`/api/concept-maps/${mapId}/edges/${edgeId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete edge failed');
    return r.json();
  }

  // ── List view (landing grid) ─────────────────────────────────────────────
  async function showList() {
    _explorer?.destroy(); _explorer = null;
    _area = document.getElementById('conceptMapArea');
    if (!_area) return;
    if (window.showConceptMapArea) window.showConceptMapArea();
    _currentMap = null;
    _area.innerHTML = '<div class="cm-loading">Cargando mapas…</div>';

    let maps;
    try { maps = await apiList(); }
    catch { _area.innerHTML = '<div class="cm-loading">No se pudo cargar. Recarga la página.</div>'; return; }

    const cards = maps.map(m => `
      <div class="cm-card" data-id="${m.id}">
        <div class="cm-card-icon"><svg class="atlas-system-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/static/aero-icons.svg#conceptmaps"></use></svg></div>
        <div class="cm-card-title">${_esc(m.title)}</div>
        <div class="cm-card-meta">${m.node_count} concepto${m.node_count === 1 ? '' : 's'}</div>
      </div>`).join('');

    _area.innerHTML = `
      <div class="cm-prompt-header">
        <h1 class="cm-prompt-title">¿Qué concepto quieres mapear?</h1>
        <div class="cm-prompt-row atlas-ai-composer">
          <input type="text" class="cm-prompt-input" id="cmPromptInput"
                 placeholder="Ej: Selectores en CSS, propiedades del contenedor padre…" autocomplete="off" />
          <div class="atlas-ai-composer-tools"><div class="practice-cselect" id="cmModelCSelect"></div><button class="cm-prompt-btn" id="cmPromptBtn" title="Generar mapa" aria-label="Generar mapa"><svg class="atlas-send-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 16V4m-5 5 5-5 5 5"/></svg></button></div>
        </div>
        <p class="cm-hint">La IA arma la red de conceptos y sus relaciones al instante. ¿Prefieres armarlo tú? <a href="#" id="cmBlankLink">crea uno vacío</a>.</p>

        <div class="cm-model-warnings" id="cmModelWarnings"></div>
      </div>
      ${maps.length ? '<p class="cm-grid-label">Tus mapas</p>' : ''}
      <div class="cm-grid" id="cmGrid">${cards}</div>`;

    const input = document.getElementById('cmPromptInput');
    const submit = () => generateFromPrompt(input.value);
    document.getElementById('cmPromptBtn').addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    document.getElementById('cmBlankLink').addEventListener('click', e => { e.preventDefault(); promptCreateBlank(); });
    _area.querySelectorAll('.cm-card[data-id]').forEach(card => {
      card.addEventListener('click', () => showMap(card.dataset.id));
    });
    if (window._mountModelSelector) {
      window._mountModelSelector(document.getElementById('cmModelCSelect'), {
        context: 'conceptmap',
        warningContainer: document.getElementById('cmModelWarnings'),
        value: _modelChoice,
        onChange: choice => { _modelChoice = choice; },
      });
    }
    input.focus();
  }

  async function promptCreateBlank() {
    const title = window.showPrompt
      ? await window.showPrompt('Nuevo mapa conceptual', 'Ej: Selectores en CSS')
      : window.prompt('¿Qué concepto quieres mapear?');
    if (!title) return;
    try {
      const map = await apiCreate(title);
      if (window._loadConceptMapSidebar) window._loadConceptMapSidebar();
      showMap(map.id);
    } catch {
      window.showToast && showToast('Error al crear el mapa', 'error');
    }
  }

  async function generateFromPrompt(rawPrompt, opts) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return;
    opts = opts || {};
    const isSummarize = opts.mode === 'summarize' && opts.content;
    // Same fallback as mindmap.js: the lesson-shortcut path calls this
    // directly, skipping showList()'s model selector entirely.
    const modelChoice = _modelChoice || (window._getRawSavedModelChoice ? window._getRawSavedModelChoice('conceptmap') : null);

    _explorer?.destroy(); _explorer = null;
    _area = document.getElementById('conceptMapArea');
    if (!_area) return;
    if (window.showConceptMapArea) window.showConceptMapArea();
    _area.innerHTML = `
      <div class="cm-generating">
        <span class="cm-spinner"></span>
        <p>${isSummarize ? 'Organizando los conceptos de la lección…' : 'Generando tu mapa conceptual…'}</p>
        <p class="cm-generating-sub">"${_esc(prompt)}"</p>
      </div>`;

    try {
      const res = await fetch('/api/concept-maps/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, content: opts.content || '', mode: opts.mode || 'explore', provider: modelChoice?.provider, model: modelChoice?.model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar');
      _currentMap = data;
      if (window._loadConceptMapSidebar) window._loadConceptMapSidebar();
      render();
    } catch (err) {
      _area.innerHTML = `<div class="cm-loading">No se pudo generar el mapa: ${_esc(err.message)}</div>`;
      window.showToast && showToast('Error al generar el mapa conceptual', 'error');
    }
  }

  // ── Map view ─────────────────────────────────────────────────────────────
  async function showMap(id) {
    _explorer?.destroy(); _explorer = null;
    _area = document.getElementById('conceptMapArea');
    if (!_area) return;
    if (window.showConceptMapArea) window.showConceptMapArea();
    _area.innerHTML = '<div class="cm-loading">Cargando…</div>';

    let map;
    try { map = await apiGet(id); }
    catch { _area.innerHTML = '<div class="cm-loading">No se pudo cargar ese mapa.</div>'; return; }

    _currentMap = map;
    render();
  }

  // Ranks nodes by BFS distance from the root (no incoming edge) — purely for
  // color/weight, never touches x/y. Mirrors app.py's _layout_concept_map.
  // Longest path from a root (Kahn's algorithm), matching app.py's
  // _layout_concept_map exactly — a converging node (two parents at
  // different depths, like "P.C.C." in a classic Novak example) must rank
  // below BOTH, never tied with one of them just because a plain BFS
  // shortest-path reached it first via the shorter route.
  function _computeRanks(nodes, edges) {
    const ids = nodes.map(n => n.id);
    const children = {}, indegree = {};
    ids.forEach(id => { children[id] = []; indegree[id] = 0; });
    edges.forEach(e => {
      if (e.from in children && e.to in indegree) {
        children[e.from].push(e.to);
        indegree[e.to]++;
      }
    });
    const rank = {};
    ids.forEach(id => { rank[id] = 0; });
    const remaining = Object.assign({}, indegree);
    const q = ids.filter(id => indegree[id] === 0);
    while (q.length) {
      const cur = q.shift();
      for (const nxt of children[cur]) {
        rank[nxt] = Math.max(rank[nxt], rank[cur] + 1);
        remaining[nxt]--;
        if (remaining[nxt] === 0) q.push(nxt);
      }
    }
    return rank;
  }

  function render() {
    if (!_currentMap) return;
    _explorer?.destroy(); _explorer = null; _editing = false;
    if (_panAbort) _panAbort.abort();
    _panAbort = new AbortController();
    const { signal } = _panAbort;

    _area.innerHTML = `
      <div class="cm-map-header">
        <button class="cm-back-btn" id="cmBackBtn" title="Volver a Mapas">← Mapas</button>
        <div class="cm-map-heading"><div class="cm-map-eyebrow">MAPA CONCEPTUAL</div><h1 class="cm-map-title" id="cmMapTitle" contenteditable="true" spellcheck="false">${_esc(_currentMap.title)}</h1><div class="cm-map-meta" id="cmMapMeta"></div></div>
        <button class="cm-delete-btn" id="cmDeleteBtn" title="Eliminar mapa">Eliminar</button>
      </div>
      <div class="cm-canvas-wrap" id="cmCanvasWrap">
        <svg id="cmSvg" class="cm-svg">
          <defs>
            <marker id="cm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--cm-arrow-color, #94a3b8)"/>
            </marker>
          </defs>
          <g id="cmViewport">
            <g id="cmEdges"></g>
            <g id="cmNodes"></g>
          </g>
        </svg>
        <button class="cm-add-node-btn" id="cmAddNodeBtn" title="Agregar concepto">${ICON_PLUS} Concepto</button>
        <div class="cm-zoom-controls">
          <button class="cm-zoom-btn" id="cmZoomOut" title="Alejar">${ICON_MINUS}</button>
          <button class="cm-zoom-btn" id="cmZoomFit" title="Ajustar a pantalla">${ICON_FIT}</button>
          <button class="cm-zoom-btn" id="cmZoomIn" title="Acercar">${ICON_PLUS}</button>
        </div>
        <div class="cm-canvas-hint">Arrastra para explorar · Acerca para leer · Edita cualquier concepto</div>
      </div>`;

    document.getElementById('cmBackBtn').addEventListener('click', showList, { signal });
    document.getElementById('cmDeleteBtn').addEventListener('click', onDeleteMap, { signal });
    document.getElementById('cmAddNodeBtn').addEventListener('click', onAddNodeCenter, { signal });

    const titleEl = document.getElementById('cmMapTitle');
    titleEl.addEventListener('blur', onRenameMap, { signal });
    titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } }, { signal });

    _svgEl = document.getElementById('cmSvg');
    _viewportEl = document.getElementById('cmViewport');
    renderCanvas();
    initPanZoom(signal);
    fitToScreen();
    _explorer = window.ConceptMapExplorer?.mount(document.getElementById('cmCanvasWrap'), () => _currentMap, {
      overview: fitToScreen,
      edit: value => { _editing = value; renderCanvas(); },
      saveDescription: (id, description) => apiPatchNode(_currentMap.id, id, { description }),
    });
  }

  function renderCanvas() {
    const edgesG = document.getElementById('cmEdges');
    const nodesG = document.getElementById('cmNodes');
    edgesG.innerHTML = '';
    nodesG.innerHTML = '';
    const nodes = _currentMap.nodes || [];
    const edges = _currentMap.edges || [];
    const rank = _computeRanks(nodes, edges);
    const meta = document.getElementById('cmMapMeta');
    if (meta) meta.textContent = `${nodes.length} conceptos · ${edges.length} relaciones`;
    const byId = {};
    nodes.forEach(n => { byId[n.id] = n; });

    // Node sizes (node._w/_h) must exist BEFORE edges are drawn, since
    // _edgeEndpoints clips each line to its node's actual box — render edges
    // first and the root's bigger bubble would clip against a stale/default
    // size on the very first paint.
    for (const n of nodes) _sizeNode(n, rank[n.id] || 0);
    const labelSlots = [];
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = '12px Arial';
    for (const e of edges) {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) continue;
      const { x1, y1, x2, y2 } = _edgeEndpoints(a, b);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const width = Math.min(176, measure.measureText(e.label || 'frase de enlace…').width + 38);
      e._labelDy = 0;
      for (const offset of [0, -28, 28, -56, 56]) {
        const slot = { x: mx, y: my + offset, w: width };
        const overlapsLabel = labelSlots.some(other => Math.abs(slot.x - other.x) < (slot.w + other.w) / 2 + 6 && Math.abs(slot.y - other.y) < 28);
        const overlapsNode = nodes.some(n => Math.abs(slot.x - n.x) < (slot.w + n._w) / 2 && Math.abs(slot.y - n.y) < n._h / 2 + 18);
        if (!overlapsLabel && !overlapsNode) { e._labelDy = offset; break; }
      }
      labelSlots.push({ x: mx, y: my + e._labelDy, w: width });
    }
    for (const e of edges) renderEdge(e, byId[e.from], byId[e.to], edgesG);
    for (const n of nodes) nodesG.appendChild(renderNode(n, rank[n.id] || 0));
  }

  function _nodeColor(node, r) {
    return node.color || RANK_COLORS[Math.min(r, RANK_COLORS.length - 1)];
  }

  function _sizeNode(node, r) {
    const isRoot = r === 0;
    const scale = isRoot ? ROOT_SCALE : Math.max(0.82, 1 - r * 0.06);
    node._w = NODE_W * scale;
    node._h = NODE_H * (isRoot ? ROOT_SCALE : 1);
  }

  function renderNode(node, r) {
    const isRoot = r === 0;
    const w = node._w, h = node._h;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', node.x - w / 2);
    fo.setAttribute('y', node.y - h / 2);
    fo.setAttribute('width', w);
    fo.setAttribute('height', h);
    fo.setAttribute('style', 'overflow: visible;');
    fo.dataset.id = node.id;

    const box = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    box.className = 'cm-node-box' + (isRoot ? ' cm-node-box--root' : '');
    box.style.setProperty('--node-color', _nodeColor(node, r));
    box.style.setProperty('--node-font', (isRoot ? 1 : 0.93) + 'rem');
    const kicker = document.createElement('div');
    kicker.className = 'cm-node-kicker';
    kicker.textContent = isRoot ? 'Concepto base' : `Nivel ${r + 1}`;
    box.appendChild(kicker);
    box.addEventListener('click', e => { if (!_editing && !e.target.closest('button,.cm-connector-handle')) _explorer?.enter(node.id); });
    box.addEventListener('mouseenter', () => highlightNode(node.id));
    box.addEventListener('mouseleave', () => highlightNode(null));

    const text = document.createElement('div');
    text.className = 'cm-node-text';
    text.textContent = node.text;
    text.contentEditable = String(_editing);
    text.spellcheck = false;
    text.addEventListener('keydown', e => { if (!_editing && ['Enter', ' '].includes(e.key)) { e.preventDefault(); _explorer?.enter(node.id); } });

    text.setAttribute('aria-label', _editing ? 'Editar concepto' : 'Explorar ' + node.text);
    if (!_editing) { text.setAttribute('role', 'button'); text.tabIndex = 0; }
    text.addEventListener('focus', () => highlightNode(node.id));
    text.addEventListener('mousedown', ev => ev.stopPropagation());
    text.addEventListener('blur', () => {
      highlightNode(null);
      const val = text.textContent.trim();
      if (!val || val === node.text) { text.textContent = node.text; return; }
      node.text = val;
      apiPatchNode(_currentMap.id, node.id, { text: val }).catch(() => {});
    });
    text.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
    box.appendChild(text);

    const delBtn = document.createElement('button');
    delBtn.className = 'cm-node-del';
    delBtn.title = 'Eliminar concepto';
    delBtn.innerHTML = ICON_CLOSE;
    delBtn.addEventListener('mousedown', ev => ev.stopPropagation());
    delBtn.addEventListener('click', ev => { ev.stopPropagation(); onDeleteNode(node); });
    box.appendChild(delBtn);

    const handle = document.createElement('div');
    handle.className = 'cm-connector-handle';
    handle.title = 'Arrastra para conectar con otro concepto';
    handle.addEventListener('mousedown', ev => startConnect(ev, node));
    box.appendChild(handle);

    box.addEventListener('mousedown', ev => startNodeDrag(ev, node, fo));

    fo.appendChild(box);
    return fo;
  }

  function renderEdge(edge, fromNode, toNode, edgesG) {
    if (!fromNode || !toNode) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = edge.id;

    const { x1, y1, x2, y2 } = _edgeEndpoints(fromNode, toNode);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', _connectionPath(x1, y1, x2, y2));
    path.setAttribute('class', 'cm-edge-line');
    path.setAttribute('marker-end', 'url(#cm-arrow)');
    g.appendChild(path);

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    const LW = 176, LH = 44;
    fo.setAttribute('x', mx - LW / 2);
    fo.setAttribute('y', my + (edge._labelDy || 0) - LH / 2);
    fo.setAttribute('width', LW);
    fo.setAttribute('height', LH);
    fo.setAttribute('style', 'overflow: visible;');

    const chip = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    chip.className = 'cm-edge-label' + (edge.label ? '' : ' cm-edge-label--empty');
    chip.contentEditable = String(_editing);
    chip.spellcheck = false;
    chip.textContent = edge.label || 'frase de enlace…';
    chip.addEventListener('mousedown', ev => ev.stopPropagation());
    chip.addEventListener('focus', () => {
      if (!edge.label) chip.textContent = '';
      chip.classList.remove('cm-edge-label--empty');
    });
    chip.addEventListener('blur', () => {
      const val = chip.textContent.trim();
      edge.label = val;
      chip.textContent = val || 'frase de enlace…';
      chip.classList.toggle('cm-edge-label--empty', !val);
      apiPatchEdge(_currentMap.id, edge.id, { label: val }).catch(() => {});
    });
    chip.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); chip.blur(); } });

    const delBtn = document.createElement('button');
    delBtn.className = 'cm-edge-del';
    delBtn.title = 'Eliminar conexión';
    delBtn.innerHTML = ICON_CLOSE;
    delBtn.addEventListener('mousedown', ev => ev.stopPropagation());
    delBtn.addEventListener('click', ev => { ev.stopPropagation(); onDeleteEdge(edge); });

    const wrap = document.createElement('div');
    wrap.className = 'cm-edge-label-wrap';
    wrap.appendChild(chip);
    wrap.appendChild(delBtn);
    fo.appendChild(wrap);
    g.appendChild(fo);

    edgesG.appendChild(g);
  }

  function highlightNode(id) {
    if (!_svgEl || !_currentMap) return;
    const connected = new Set([id]);
    (_currentMap.edges || []).forEach(edge => {
      const active = id && (edge.from === id || edge.to === id);
      if (active) { connected.add(edge.from); connected.add(edge.to); }
      const element = [...document.getElementById('cmEdges').children].find(item => item.dataset.id === edge.id);
      if (element) { element.classList.toggle('cm-edge-active', !!active); element.classList.toggle('cm-muted', !!id && !active); }
    });
    [...document.getElementById('cmNodes').children].forEach(element => {
      element.classList.toggle('cm-muted', !!id && !connected.has(element.dataset.id));
    });
  }

  function _connectionPath(x1, y1, x2, y2) {
    const middle = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
  }

  // Where the connecting line should touch each node's box edge — straight
  // line from center to center, clipped to the rectangle boundary, so it
  // always starts/ends flush against the card rather than under its text.
  function _edgeEndpoints(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const p1 = _clipToBox(a, dx, dy);
    const p2 = _clipToBox(b, -dx, -dy);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  function _clipToBox(node, dx, dy) {
    const hw = (node._w || NODE_W) / 2, hh = (node._h || NODE_H) / 2;
    if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
    const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
    const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
    const s = Math.min(scaleX, scaleY);
    return { x: node.x + dx * s, y: node.y + dy * s };
  }

  // ── Node drag (reposition) ───────────────────────────────────────────────
  // Moves just this node's <foreignObject> and re-paths only the edges
  // touching it directly — NOT a full renderCanvas() per mousemove, which
  // would tear down and rebuild every contentEditable box in the map on
  // every pixel of movement.
  function startNodeDrag(e, node, fo) {
    if (!_editing || e.button !== 0) return;
    const startClientX = e.clientX, startClientY = e.clientY;
    const origX = node.x, origY = node.y;
    let dragging = false;
    const byId = {};
    (_currentMap.nodes || []).forEach(n => { byId[n.id] = n; });
    const touchingEdges = (_currentMap.edges || []).filter(ed => ed.from === node.id || ed.to === node.id);

    function repositionTouchingEdges() {
      for (const ed of touchingEdges) {
        const g = document.getElementById('cmEdges').querySelector(`g[data-id="${ed.id}"]`);
        if (!g) continue;
        const a = byId[ed.from], b = byId[ed.to];
        if (!a || !b) continue;
        const { x1, y1, x2, y2 } = _edgeEndpoints(a, b);
        const path = g.querySelector('.cm-edge-line');
        if (path) path.setAttribute('d', _connectionPath(x1, y1, x2, y2));
        const fo2 = g.querySelector('foreignObject');
        if (fo2) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          fo2.setAttribute('x', mx - 88);
          fo2.setAttribute('y', my + (ed._labelDy || 0) - 22);
        }
      }
    }

    function onMove(ev) {
      const dxScreen = ev.clientX - startClientX, dyScreen = ev.clientY - startClientY;
      if (!dragging) {
        if (Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
        dragging = true;
        ev.preventDefault();
      }
      node.x = origX + dxScreen / _view.k;
      node.y = origY + dyScreen / _view.k;
      fo.setAttribute('x', node.x - node._w / 2);
      fo.setAttribute('y', node.y - node._h / 2);
      repositionTouchingEdges();
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragging) {
        apiPatchNode(_currentMap.id, node.id, { x: node.x, y: node.y }).catch(() => {});
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Drag-to-connect ──────────────────────────────────────────────────────
  function screenToCanvas(clientX, clientY) {
    const rect = _svgEl.getBoundingClientRect();
    return { x: (clientX - rect.left - _view.x) / _view.k, y: (clientY - rect.top - _view.y) / _view.k };
  }

  function startConnect(e, fromNode) {
    if (!_editing) return;
    e.preventDefault();
    e.stopPropagation();
    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('class', 'cm-edge-line cm-edge-line--pending');
    document.getElementById('cmEdges').appendChild(tempPath);
    _svgEl.classList.add('cm-connecting');

    function update(clientX, clientY) {
      const p = screenToCanvas(clientX, clientY);
      tempPath.setAttribute('d', `M ${fromNode.x} ${fromNode.y} L ${p.x} ${p.y}`);
    }
    update(e.clientX, e.clientY);

    function onMove(ev) { update(ev.clientX, ev.clientY); }
    async function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      tempPath.remove();
      _svgEl.classList.remove('cm-connecting');
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetFO = target && target.closest ? target.closest('[data-id]') : null;
      const toId = targetFO ? targetFO.dataset.id : null;
      if (!toId || toId === fromNode.id) return;
      try {
        const map = await apiAddEdge(_currentMap.id, fromNode.id, toId, '');
        _currentMap = map;
        renderCanvas();
        // Focus the brand-new (last) edge's label so the linking phrase can be
        // typed immediately — that label is the whole point of a concept map.
        const g = document.getElementById('cmEdges').lastElementChild;
        const chip = g && g.querySelector('.cm-edge-label');
        if (chip) { chip.focus(); document.execCommand('selectAll', false, null); }
      } catch {
        window.showToast && showToast('No se pudo conectar', 'error');
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Node/edge/map mutations ──────────────────────────────────────────────
  async function onAddNodeCenter() {
    const rect = _svgEl.getBoundingClientRect();
    const center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const text = window.showPrompt
      ? await window.showPrompt('Nuevo concepto', 'Texto del concepto')
      : window.prompt('Texto del concepto');
    if (!text || !text.trim()) return;
    try {
      const map = await apiAddNode(_currentMap.id, text.trim(), center.x + (Math.random() - 0.5) * 40, center.y + (Math.random() - 0.5) * 40);
      _currentMap = map;
      renderCanvas();
    } catch {
      window.showToast && showToast('Error al agregar el concepto', 'error');
    }
  }

  async function onDeleteNode(node) {
    const ok = window.showConfirm
      ? await window.showConfirm('Eliminar concepto', `¿Eliminar "${node.text}"? También se eliminan sus conexiones.`)
      : window.confirm(`¿Eliminar "${node.text}"?`);
    if (!ok) return;
    try {
      const map = await apiDeleteNode(_currentMap.id, node.id);
      _currentMap = map;
      renderCanvas();
    } catch {
      window.showToast && showToast('Error al eliminar', 'error');
    }
  }

  async function onDeleteEdge(edge) {
    try {
      const map = await apiDeleteEdge(_currentMap.id, edge.id);
      _currentMap = map;
      renderCanvas();
    } catch {
      window.showToast && showToast('Error al eliminar la conexión', 'error');
    }
  }

  function onRenameMap(e) {
    const val = e.target.textContent.trim();
    if (!val || val === _currentMap.title) { e.target.textContent = _currentMap.title; return; }
    apiRename(_currentMap.id, val)
      .then(map => { _currentMap = map; if (window._loadConceptMapSidebar) window._loadConceptMapSidebar(); })
      .catch(() => window.showToast && showToast('Error al renombrar', 'error'));
  }

  async function onDeleteMap() {
    if (!_currentMap) return;
    const ok = window.showConfirm
      ? await window.showConfirm('Eliminar mapa', `¿Eliminar el mapa "${_currentMap.title}"? Esta acción no se puede deshacer.`)
      : window.confirm(`¿Eliminar el mapa "${_currentMap.title}"?`);
    if (!ok) return;
    try {
      await apiDelete(_currentMap.id);
      if (window._loadConceptMapSidebar) window._loadConceptMapSidebar();
      showList();
    } catch {
      window.showToast && showToast('Error al eliminar', 'error');
    }
  }

  // ── Pan / zoom (same mechanics as mindmap.js's canvas) ───────────────────
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
    const nodes = (_currentMap && _currentMap.nodes) || [];
    if (!nodes.length || !_svgEl) return;
    const minX = Math.min(...nodes.map(n => n.x - (n._w || NODE_W) / 2));
    const maxX = Math.max(...nodes.map(n => n.x + (n._w || NODE_W) / 2));
    const minY = Math.min(...nodes.map(n => n.y - (n._h || NODE_H) / 2));
    const maxY = Math.max(...nodes.map(n => n.y + (n._h || NODE_H) / 2));
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
    let panning = false, lastX = 0, lastY = 0;

    _svgEl.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1 - e.deltaY * 0.0015);
    }, { passive: false, signal });

    _svgEl.addEventListener('mousedown', e => {
      if (e.target.closest('.cm-node-box')) return;
      e.preventDefault();
      panning = true; lastX = e.clientX; lastY = e.clientY;
      _svgEl.classList.add('cm-grabbing');
    }, { signal });

    window.addEventListener('mousemove', e => {
      if (!panning) return;
      _view.x += e.clientX - lastX;
      _view.y += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      applyView();
    }, { signal });

    window.addEventListener('mouseup', () => { panning = false; _svgEl.classList.remove('cm-grabbing'); }, { signal });

    let pinchDist = null;
    let touchStartX = 0, touchStartY = 0, touchTentative = false;
    const PAN_THRESHOLD = 10;
    const touchDist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const touchMid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    _svgEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
        touchTentative = true; panning = false;
      } else if (e.touches.length === 2) {
        touchTentative = false; panning = false;
        pinchDist = touchDist(e.touches[0], e.touches[1]);
      }
    }, { signal, passive: true });

    _svgEl.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && (touchTentative || panning)) {
        const t = e.touches[0];
        if (!panning) {
          if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) < PAN_THRESHOLD) return;
          panning = true; touchTentative = false;
          lastX = touchStartX; lastY = touchStartY;
        }
        e.preventDefault();
        _view.x += t.clientX - lastX; _view.y += t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        applyView();
      } else if (e.touches.length === 2 && pinchDist != null) {
        e.preventDefault();
        const dist = touchDist(e.touches[0], e.touches[1]);
        const mid = touchMid(e.touches[0], e.touches[1]);
        const rect = _svgEl.getBoundingClientRect();
        zoomAt(mid.x - rect.left, mid.y - rect.top, dist / pinchDist);
        pinchDist = dist;
      }
    }, { signal, passive: false });

    _svgEl.addEventListener('touchend', e => {
      if (e.touches.length < 2) pinchDist = null;
      if (e.touches.length === 0) { panning = false; touchTentative = false; }
    }, { signal, passive: true });

    document.getElementById('cmZoomIn').addEventListener('click', () => {
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 1.2);
    }, { signal });
    document.getElementById('cmZoomOut').addEventListener('click', () => {
      const rect = _svgEl.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 1 / 1.2);
    }, { signal });
    document.getElementById('cmZoomFit').addEventListener('click', fitToScreen, { signal });
  }

  function init() {
    // No persistent DOM wiring needed beyond what app.js does for the
    // sidebar "+" button — showList()/showMap() build their own listeners
    // fresh each render, same pattern as MindmapApp.
  }

  window.ConceptMapApp = { init, showList, showMap, generateFromPrompt, getAssistantContext: () => _currentMap ? {type:'conceptmap',id:_currentMap.id,title:_currentMap.title || 'Mapa'} : null };
})();
