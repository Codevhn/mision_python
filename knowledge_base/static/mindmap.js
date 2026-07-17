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
  const NODE_H = 40, ROOT_H = 52, ROW_GAP = 16, COL_GAP = 90, NODE_MIN_W = 90, NODE_PAD_X = 64; // room for the fold pill — the toolbar/+ now float outside the box
  const ZOOM_MIN = 0.2, ZOOM_MAX = 2.5;

  // Small inline SVG icons — text glyphs (+, ⋯, ▾) sit off-center within their own
  // line box depending on the font, so flexbox centering alone can't fix them.
  // These are drawn on a fixed viewBox, so they land dead-center every time.
  const ICON_PLUS = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_MORE = '<svg viewBox="0 0 16 4" width="13" height="4"><circle cx="2" cy="2" r="1.7" fill="currentColor"/><circle cx="8" cy="2" r="1.7" fill="currentColor"/><circle cx="14" cy="2" r="1.7" fill="currentColor"/></svg>';
  const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 10 6" width="9" height="6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 6 10" width="6" height="9"><path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_MINUS = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_FIT = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M1 4V1h3M11 4V1H8M1 8v3h3M11 8v3H8" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Floating hover-toolbar icons
  const ICON_NOTE = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="3" y="2" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 6h5M5.5 9h5M5.5 12h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const ICON_COLOR_SWATCH = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor"/></svg>';
  // A pinched-waist 4-point star reads as a distinct "sparkle" glyph — a straight-edged
  // one (like the plus icon) is too easily mistaken for the "+" button right next to it.
  const ICON_AI = '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 1L9.4 6.6L15 8L9.4 9.4L8 15L6.6 9.4L1 8L6.6 6.6Z" fill="currentColor"/></svg>';
  // "Transform idea with AI" grid icons
  const ICON_SHORTEN = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 4h12M2 8h8M2 12h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const ICON_LENGTHEN = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 4h4M2 8h8M2 12h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const ICON_TITLE = '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.3h12" stroke="currentColor" stroke-width="1.3"/></svg>';
  const ICON_SLIDERS = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="4" r="1.6" fill="currentColor"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/><circle cx="7" cy="12" r="1.6" fill="currentColor"/></svg>';
  const ICON_ARROW_RIGHT = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M1 6h9M6 1.5L10.5 6 6 10.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function _esc(s) {
    return (window.escapeHtml ? escapeHtml(s) : String(s ?? ''));
  }

  // `pip install x` in a node's text renders as real inline code — backticks are the
  // marker, stripped from view (still present in the raw text shown while editing).
  function _parseInlineCode(text) {
    const parts = String(text ?? '').split('`');
    return parts.map((part, i) => (
      i % 2 === 1 ? `<code class="mm-inline-code">${_esc(part)}</code>` : _esc(part)
    )).join('');
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
  async function apiPatchNode(mapId, nodeId, patch) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error('edit node failed');
    return r.json();
  }
  async function apiDeleteNode(mapId, nodeId) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('delete node failed');
    return r.json();
  }
  async function apiDetachNode(mapId, nodeId) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}/detach`, { method: 'POST' });
    if (!r.ok) throw new Error('detach node failed');
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
          <button class="mm-zoom-btn" id="mmZoomOut" title="Alejar">${ICON_MINUS}</button>
          <button class="mm-zoom-btn" id="mmZoomFit" title="Ajustar a pantalla">${ICON_FIT}</button>
          <button class="mm-zoom-btn" id="mmZoomIn" title="Acercar">${ICON_PLUS}</button>
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
      node._color = node.color || (isRoot ? 'var(--accent)' : BRANCH_COLORS[branchIdx % BRANCH_COLORS.length]);
      colWidths[depth] = Math.max(colWidths[depth] || 0, node._w);

      const kids = node.collapsed ? [] : (node.children || []);
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
      if (node.collapsed) return; // hidden subtree — colWidths[depth+1] may be unset this pass, leave stale
      const nextX = x + colWidths[depth] + COL_GAP;
      (node.children || []).forEach(child => assignX(child, depth + 1, nextX));
    }
    assignX(root, 0, 0);

    return { totalHeight: Math.max(leafCursor * (NODE_H + ROW_GAP), NODE_H), totalWidth: colWidths.reduce((a, b) => a + b + COL_GAP, 0) };
  }

  function renderCanvas() {
    _closeActivePopover();
    _hideNodeHoverUI();
    const linksG = document.getElementById('mmLinks');
    const nodesG = document.getElementById('mmNodes');
    linksG.innerHTML = '';
    nodesG.innerHTML = '';
    computeLayout(_currentMap.root);

    const flat = [];
    (function collect(node, parent) {
      flat.push({ node, parent });
      if (!node.collapsed) (node.children || []).forEach(c => collect(c, node));
    })(_currentMap.root, null);

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
    text.innerHTML = _parseInlineCode(node.text);
    text.contentEditable = 'true';
    text.spellcheck = false;
    text.addEventListener('mousedown', e => e.stopPropagation());
    // Show the raw text (backticks and all) only while actively editing —
    // the rest of the time the backtick-delimited bits render as real code.
    text.addEventListener('focus', () => { text.textContent = node.text; });
    text.addEventListener('blur', () => {
      const val = text.textContent.trim();
      if (!val || val === node.text) { text.innerHTML = _parseInlineCode(node.text); return; }
      apiPatchNode(_currentMap.id, node.id, { text: val })
        .then(map => { _currentMap = map; renderCanvas(); })
        .catch(() => window.showToast && showToast('Error al editar', 'error'));
    });
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    });
    box.appendChild(text);

    if (node.notes) {
      const dot = document.createElement('span');
      dot.className = 'mm-node-notes-dot';
      dot.title = 'Tiene una nota';
      box.appendChild(dot);
    }

    if (node.linked_entry_uid) {
      const chip = document.createElement('span');
      chip.className = 'mm-node-link-chip';
      chip.title = 'Vinculado a una entrada de Conocimiento';
      chip.textContent = '🔗';
      box.appendChild(chip);
    }

    const hasChildren = (node.children || []).length > 0;
    if (hasChildren && !isRoot) {
      const fold = document.createElement('button');
      fold.className = 'mm-node-fold';
      fold.title = node.collapsed ? 'Expandir rama' : 'Colapsar rama';
      fold.innerHTML = node.collapsed
        ? `${ICON_CHEVRON_RIGHT}<span>${node.children.length}</span>`
        : ICON_CHEVRON_DOWN;
      fold.addEventListener('mousedown', e => e.stopPropagation());
      fold.addEventListener('click', () => toggleCollapse(node));
      box.appendChild(fold);
    }

    // Hover UI (toolbar + "+") is a single shared floating element, positioned over
    // whichever node has the pointer — not baked into each box (ideamap-style).
    box.addEventListener('mouseenter', () => _showNodeHoverUI(node, box, isRoot));
    box.addEventListener('mouseleave', _scheduleHoverHide);

    fo.appendChild(box);
    return fo;
  }

  // ── Floating hover toolbar (⋯ / nota / color / IA) + "+" — ideamap-style ───
  let _hoverToolbarEl = null, _hoverAddBtnEl = null, _hoverHideTimer = null, _hoverNode = null;

  function _cancelHoverHide() {
    if (_hoverHideTimer) { clearTimeout(_hoverHideTimer); _hoverHideTimer = null; }
  }

  function _scheduleHoverHide() {
    _cancelHoverHide();
    _hoverHideTimer = setTimeout(_hideNodeHoverUI, 220);
  }

  function _hideNodeHoverUI() {
    _cancelHoverHide();
    if (_hoverToolbarEl) { _hoverToolbarEl.remove(); _hoverToolbarEl = null; }
    if (_hoverAddBtnEl) { _hoverAddBtnEl.remove(); _hoverAddBtnEl = null; }
    _hoverNode = null;
  }

  function _positionNodeHoverUI(boxEl) {
    const rect = boxEl.getBoundingClientRect();
    if (_hoverToolbarEl) {
      _hoverToolbarEl.style.left = `${rect.left}px`;
      _hoverToolbarEl.style.top = `${rect.top - 38}px`;
    }
    if (_hoverAddBtnEl) {
      _hoverAddBtnEl.style.left = `${rect.right + 8}px`;
      _hoverAddBtnEl.style.top = `${rect.top + rect.height / 2 - 13}px`;
    }
  }

  function _showNodeHoverUI(node, boxEl, isRoot) {
    _cancelHoverHide();
    if (_hoverNode === node) { _positionNodeHoverUI(boxEl); return; }
    _hideNodeHoverUI();
    _hoverNode = node;

    const toolbar = document.createElement('div');
    toolbar.className = 'mm-hover-toolbar';
    const mkBtn = (icon, title, onClick) => {
      const b = document.createElement('button');
      b.className = 'mm-hover-toolbar-btn';
      b.title = title;
      b.innerHTML = icon;
      b.addEventListener('mousedown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); onClick(b); });
      toolbar.appendChild(b);
    };
    mkBtn(ICON_MORE, 'Más acciones', btn => openNodeMenu(node, btn, isRoot));
    mkBtn(ICON_NOTE, node.notes ? 'Ver / editar nota' : 'Agregar nota', () => openNotesPopover(node, toolbar));
    mkBtn(ICON_COLOR_SWATCH, 'Color', () => openColorPopover(node, toolbar));
    mkBtn(ICON_AI, 'Transformar con IA', () => openAiTransformPopover(node, toolbar));
    toolbar.addEventListener('mouseenter', _cancelHoverHide);
    toolbar.addEventListener('mouseleave', _scheduleHoverHide);
    document.body.appendChild(toolbar);
    _hoverToolbarEl = toolbar;

    const addBtn = document.createElement('button');
    addBtn.className = 'mm-hover-add-btn';
    addBtn.title = 'Agregar sub-tema';
    addBtn.innerHTML = ICON_PLUS;
    addBtn.addEventListener('mousedown', e => e.stopPropagation());
    addBtn.addEventListener('click', e => { e.stopPropagation(); onAddChild(node.id); });
    addBtn.addEventListener('mouseenter', _cancelHoverHide);
    addBtn.addEventListener('mouseleave', _scheduleHoverHide);
    document.body.appendChild(addBtn);
    _hoverAddBtnEl = addBtn;

    _positionNodeHoverUI(boxEl);
  }

  function toggleCollapse(node) {
    // Keep the user's current pan/zoom — folding a branch shouldn't recenter the whole map.
    apiPatchNode(_currentMap.id, node.id, { collapsed: !node.collapsed })
      .then(map => { _currentMap = map; renderCanvas(); })
      .catch(() => window.showToast && showToast('Error al colapsar', 'error'));
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
    (function collect(node) {
      flat.push(node);
      if (!node.collapsed) (node.children || []).forEach(collect);
    })(_currentMap.root);
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
      e.preventDefault(); // stop the drag from starting a native text-selection instead of a pan
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

    // Touch: one finger pans, two fingers pinch-zoom. Without this the browser falls
    // back to its own native page pinch-zoom/scroll on mobile — touch-action:none on
    // .mm-svg (CSS) opts out of that, this is what replaces it for the canvas itself.
    let pinchDist = null;
    const touchDist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const touchMid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    _svgEl.addEventListener('touchstart', e => {
      if (e.target.closest('.mm-node-box')) return;
      if (e.touches.length === 1) {
        panning = true; moved = false;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        panning = false;
        pinchDist = touchDist(e.touches[0], e.touches[1]);
      }
    }, { signal, passive: true });

    _svgEl.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && panning) {
        e.preventDefault();
        moved = true;
        const t = e.touches[0];
        _view.x += t.clientX - lastX;
        _view.y += t.clientY - lastY;
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
      if (e.touches.length === 0) panning = false;
    }, { signal, passive: true });

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

  function _findNode(node, id) {
    if (node.id === id) return node;
    for (const c of node.children || []) {
      const found = _findNode(c, id);
      if (found) return found;
    }
    return null;
  }

  async function onAddChild(parentId) {
    // Create instantly with a placeholder and drop the user straight into editing it —
    // no modal, no interrupting the current pan/zoom.
    try {
      _currentMap = await apiAddNode(_currentMap.id, parentId, 'Nueva idea');
      renderCanvas();
      const parent = _findNode(_currentMap.root, parentId);
      const newNode = parent && parent.children[parent.children.length - 1];
      const el = newNode && document.querySelector(`[data-id="${newNode.id}"] .mm-node-text`);
      if (el) { el.focus(); document.execCommand('selectAll', false, null); }
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
    // Keep the user's current pan/zoom — deleting a branch shouldn't recenter the whole map.
    apiDeleteNode(_currentMap.id, nodeId)
      .then(map => { _currentMap = map; renderCanvas(); })
      .catch(() => window.showToast && showToast('Error al eliminar', 'error'));
  }

  // ── Per-node "⋯" menu + notes/color popovers (Fase 3, ideamap-style toolbar) ─
  let _activePopover = null;
  let _popoverAbort = null;

  function _closeActivePopover() {
    if (_popoverAbort) { _popoverAbort.abort(); _popoverAbort = null; }
    if (_activePopover) { _activePopover.remove(); _activePopover = null; }
  }

  function _openPopover(el, anchorEl, opts) {
    _closeActivePopover();
    document.body.appendChild(el);
    const rect = anchorEl.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.top = `${rect.bottom + 6}px`;
    let left = (opts && opts.alignRight) ? rect.right - el.offsetWidth : rect.left;
    // Keep on-screen
    requestAnimationFrame(() => {
      const w = el.offsetWidth, vw = window.innerWidth;
      if (left + w > vw - 8) left = vw - w - 8;
      if (left < 8) left = 8;
      el.style.left = `${left}px`;
    });
    el.style.left = `${left}px`;
    _activePopover = el;
    _popoverAbort = new AbortController();
    const { signal } = _popoverAbort;
    setTimeout(() => {
      document.addEventListener('mousedown', e => {
        if (!el.contains(e.target)) _closeActivePopover();
      }, { signal });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') _closeActivePopover();
      }, { signal });
    }, 0);
  }

  function openNodeMenu(node, anchorEl, isRoot) {
    const menu = document.createElement('div');
    menu.className = 'mm-node-menu';

    const item = (label, fn, danger) => {
      const b = document.createElement('button');
      b.className = 'mm-menu-item' + (danger ? ' mm-menu-item--danger' : '');
      b.textContent = label;
      b.addEventListener('click', () => { _closeActivePopover(); fn(); });
      menu.appendChild(b);
    };

    item('Editar texto', () => {
      const fo = document.querySelector(`[data-id="${node.id}"] .mm-node-text`);
      if (fo) { fo.focus(); document.execCommand('selectAll', false, null); }
    });
    item(node.notes ? 'Ver / editar nota' : 'Agregar nota', () => openNotesPopover(node, anchorEl));
    item('Color', () => openColorPopover(node, anchorEl));
    if ((node.children || []).length && !isRoot) {
      item(node.collapsed ? 'Expandir rama' : 'Colapsar rama', () => toggleCollapse(node));
    }
    item('Copiar texto', () => copyNodeSubtree(node));
    if (node.linked_entry_uid) {
      const linked = _resolveLinkedEntry(node);
      item(linked ? 'Abrir entrada vinculada' : 'Entrada vinculada (eliminada)', () => {
        if (linked && window._navigateToEntity) _navigateToEntity(linked);
        else window.showToast && showToast('Esa entrada ya no existe', 'error');
      });
      item('Desvincular entrada', () => unlinkEntry(node));
    } else {
      item('Vincular a entrada existente', () => openLinkEntryPopover(node, anchorEl));
      item('Convertir en entrada nueva', () => openConvertToEntryModal(node));
    }
    if (!isRoot) {
      item('Desprender en nuevo mapa', () => onDetachNode(node));
      item('Eliminar', () => onDeleteNode(node.id, (node.children || []).length), true);
    }

    _openPopover(menu, anchorEl, { alignRight: true });
  }

  function openNotesPopover(node, anchorEl) {
    const pop = document.createElement('div');
    pop.className = 'mm-notes-popover';
    pop.innerHTML = `
      <textarea class="mm-notes-textarea" placeholder="Escribe una nota para este nodo…"></textarea>
      <div class="mm-popover-footer">
        <button class="btn-ghost mm-notes-cancel">cancelar</button>
        <button class="btn-primary mm-notes-save">guardar</button>
      </div>`;
    const textarea = pop.querySelector('.mm-notes-textarea');
    textarea.value = node.notes || '';
    pop.querySelector('.mm-notes-cancel').addEventListener('click', () => _closeActivePopover());
    pop.querySelector('.mm-notes-save').addEventListener('click', () => {
      const val = textarea.value.trim();
      apiPatchNode(_currentMap.id, node.id, { notes: val })
        .then(map => { _currentMap = map; renderCanvas(); })
        .catch(() => window.showToast && showToast('Error al guardar la nota', 'error'));
      _closeActivePopover();
    });
    _openPopover(pop, anchorEl, { alignRight: true });
    setTimeout(() => textarea.focus(), 50);
  }

  function openColorPopover(node, anchorEl) {
    const pop = document.createElement('div');
    pop.className = 'mm-color-popover';
    const autoBtn = document.createElement('button');
    autoBtn.className = 'mm-color-swatch mm-color-swatch--auto';
    autoBtn.title = 'Automático (por rama)';
    autoBtn.textContent = 'auto';
    autoBtn.addEventListener('click', () => {
      apiPatchNode(_currentMap.id, node.id, { color: null })
        .then(map => { _currentMap = map; renderCanvas(); })
        .catch(() => window.showToast && showToast('Error al aplicar color', 'error'));
      _closeActivePopover();
    });
    pop.appendChild(autoBtn);
    BRANCH_COLORS.forEach(color => {
      const b = document.createElement('button');
      b.className = 'mm-color-swatch';
      b.style.background = color;
      b.addEventListener('click', () => {
        apiPatchNode(_currentMap.id, node.id, { color })
          .then(map => { _currentMap = map; renderCanvas(); })
          .catch(() => window.showToast && showToast('Error al aplicar color', 'error'));
        _closeActivePopover();
      });
      pop.appendChild(b);
    });
    _openPopover(pop, anchorEl, { alignRight: true });
  }

  async function apiAiTransform(mapId, nodeId, action, customPrompt) {
    const r = await fetch(`/api/mindmaps/${mapId}/nodes/${nodeId}/ai-transform`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, custom_prompt: customPrompt || '' }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error al transformar');
    return data;
  }

  function openAiTransformPopover(node, anchorEl) {
    const pop = document.createElement('div');
    pop.className = 'mm-ai-popover';
    pop.innerHTML = `
      <div class="mm-ai-title">Transformar con IA</div>
      <div class="mm-ai-grid">
        <button class="mm-ai-action" data-action="shorten">${ICON_SHORTEN}<span>Acortar</span></button>
        <button class="mm-ai-action" data-action="lengthen">${ICON_LENGTHEN}<span>Expandir</span></button>
        <button class="mm-ai-action" data-action="find_title">${ICON_TITLE}<span>Buscar título</span></button>
        <button class="mm-ai-action" data-action="prompt">${ICON_SLIDERS}<span>Prompt</span></button>
      </div>
      <div class="mm-ai-prompt-row hidden">
        <input type="text" class="mm-ai-prompt-input" placeholder="Ej: tradúcelo al inglés…" autocomplete="off" />
        <button class="mm-ai-prompt-go" title="Aplicar">${ICON_ARROW_RIGHT}</button>
      </div>
      <div class="mm-ai-status hidden"></div>`;

    const grid = pop.querySelector('.mm-ai-grid');
    const promptRow = pop.querySelector('.mm-ai-prompt-row');
    const promptInput = pop.querySelector('.mm-ai-prompt-input');
    const status = pop.querySelector('.mm-ai-status');

    const runAction = async (action, customPrompt) => {
      grid.classList.add('hidden');
      promptRow.classList.add('hidden');
      status.classList.remove('hidden');
      status.textContent = 'Pensando…';
      try {
        _currentMap = await apiAiTransform(_currentMap.id, node.id, action, customPrompt);
        renderCanvas();
        _closeActivePopover();
        window.showToast && showToast('Nodo actualizado con IA', 'success');
      } catch (err) {
        status.textContent = err.message || 'Error al transformar';
      }
    };

    grid.querySelectorAll('.mm-ai-action').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'prompt') {
          grid.classList.add('hidden');
          promptRow.classList.remove('hidden');
          setTimeout(() => promptInput.focus(), 50);
          return;
        }
        runAction(btn.dataset.action);
      });
    });
    promptRow.querySelector('.mm-ai-prompt-go').addEventListener('click', () => runAction('prompt', promptInput.value));
    promptInput.addEventListener('keydown', e => { if (e.key === 'Enter') runAction('prompt', promptInput.value); });

    _openPopover(pop, anchorEl, { alignRight: true });
  }

  function copyNodeSubtree(node) {
    const lines = [];
    (function walk(n, depth) {
      lines.push('  '.repeat(depth) + '- ' + n.text);
      (n.children || []).forEach(c => walk(c, depth + 1));
    })(node, 0);
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => window.showToast && showToast('Copiado al portapapeles', 'success'))
        .catch(() => window.showToast && showToast('No se pudo copiar', 'error'));
    }
  }

  async function onDetachNode(node) {
    const ok = window.showConfirm
      ? await window.showConfirm('desprender rama', `¿Desprender "${node.text}" en un mapa nuevo e independiente?`)
      : window.confirm(`¿Desprender "${node.text}" en un mapa nuevo?`);
    if (!ok) return;
    try {
      const { new_map } = await apiDetachNode(_currentMap.id, node.id);
      if (window._loadMindmapSidebar) window._loadMindmapSidebar();
      window.showToast && showToast(`Mapa "${new_map.title}" creado`, 'success');
      showMap(new_map.id);
    } catch {
      window.showToast && showToast('Error al desprender', 'error');
    }
  }

  // ── Link a node to a Knowledge entry — existing one, or a brand-new one ────
  function _resolveLinkedEntry(node) {
    if (!node.linked_entry_uid) return null;
    return (typeof _index !== 'undefined' ? _index : []).find(e => e.uid === node.linked_entry_uid) || null;
  }

  function unlinkEntry(node) {
    apiPatchNode(_currentMap.id, node.id, { linked_entry_uid: null })
      .then(map => { _currentMap = map; renderCanvas(); })
      .catch(() => window.showToast && showToast('Error al desvincular', 'error'));
  }

  function openLinkEntryPopover(node, anchorEl) {
    const pop = document.createElement('div');
    pop.className = 'mm-link-popover';
    pop.innerHTML = `
      <input type="text" class="mm-link-search" placeholder="Buscar entrada de Conocimiento…" autocomplete="off" />
      <div class="mm-link-results"></div>`;
    const input = pop.querySelector('.mm-link-search');
    const results = pop.querySelector('.mm-link-results');

    const renderResults = q => {
      const f = q.trim().toLowerCase();
      const pool = typeof _index !== 'undefined' ? _index : [];
      const matches = pool.filter(e => {
        const haystack = [(e.title || ''), (e.category || ''), (e.topic || '')].join(' ').toLowerCase();
        return !f || haystack.includes(f);
      }).slice(0, 20);
      if (!matches.length) { results.innerHTML = '<div class="mm-link-empty">Sin resultados</div>'; return; }
      results.innerHTML = matches.map(e => {
        const meta = [e.category, e.topic].filter(Boolean).join(' › ');
        return `<div class="mm-link-item" data-uid="${_esc(e.uid || '')}">
          <span class="mm-link-item-title">${_esc(e.title || e.id)}</span>
          ${meta ? `<span class="mm-link-item-meta">${_esc(meta)}</span>` : ''}
        </div>`;
      }).join('');
      results.querySelectorAll('.mm-link-item').forEach(el => {
        el.addEventListener('click', () => {
          apiPatchNode(_currentMap.id, node.id, { linked_entry_uid: el.dataset.uid })
            .then(map => { _currentMap = map; renderCanvas(); })
            .catch(() => window.showToast && showToast('Error al vincular', 'error'));
          _closeActivePopover();
        });
      });
    };
    input.addEventListener('input', () => renderResults(input.value));
    renderResults('');
    _openPopover(pop, anchorEl, { alignRight: true });
    setTimeout(() => input.focus(), 50);
  }

  let _convertNode = null;
  let _convertModalWired = false;

  function _nodeSubtreeMarkdown(node) {
    const lines = [];
    if (node.notes) lines.push(`_${node.notes}_\n`);
    (node.children || []).forEach(function walk(child, depth) {
      lines.push('  '.repeat(depth) + '- ' + child.text + (child.notes ? ` — ${child.notes}` : ''));
      (child.children || []).forEach(gc => walk(gc, depth + 1));
    });
    return lines.join('\n');
  }

  function openConvertToEntryModal(node) {
    const overlay = document.getElementById('mmConvertOverlay');
    if (!overlay) return;
    _convertNode = node;

    if (!_convertModalWired) {
      _convertModalWired = true;
      const catInput = document.getElementById('mmcCategory');
      const catDrop = document.getElementById('mmcCatDropdown');
      const topicInput = document.getElementById('mmcTopic');
      const topicDrop = document.getElementById('mmcTopicDropdown');
      if (catInput && catDrop && topicInput && topicDrop && typeof _wireCategoryTopicSmartSelects === 'function') {
        _wireCategoryTopicSmartSelects(catInput, catDrop, topicInput, topicDrop);
      }
      document.getElementById('mmConvertClose')?.addEventListener('click', closeConvertModal);
      document.getElementById('mmConvertCancelBtn')?.addEventListener('click', closeConvertModal);
      document.getElementById('mmConvertApplyBtn')?.addEventListener('click', applyConvertToEntry);
    }

    document.getElementById('mmcTitle').value = node.text || '';
    document.getElementById('mmcCategory').value = '';
    document.getElementById('mmcTopic').value = '';
    overlay.classList.remove('hidden');
    setTimeout(() => document.getElementById('mmcTitle').focus(), 50);
  }

  function closeConvertModal() {
    document.getElementById('mmConvertOverlay')?.classList.add('hidden');
    _convertNode = null;
  }

  async function applyConvertToEntry() {
    if (!_convertNode) return;
    const title = document.getElementById('mmcTitle').value.trim();
    const category = document.getElementById('mmcCategory').value.trim();
    const topic = document.getElementById('mmcTopic').value.trim();
    if (!title || !category || !topic) {
      window.showToast && showToast('Completa título, categoría y tema', 'error');
      return;
    }
    const node = _convertNode;
    try {
      const res = await fetch('/api/entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_type: 'knowledge', title, category, topic,
          raw_text: _nodeSubtreeMarkdown(node), already_markdown: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la entrada');
      _currentMap = await apiPatchNode(_currentMap.id, node.id, { linked_entry_uid: data.uid });
      if (typeof loadTree === 'function') loadTree(); // refresh _index so the link resolves immediately
      renderCanvas();
      closeConvertModal();
      window.showToast && showToast('Entrada creada y vinculada', 'success');
    } catch (err) {
      window.showToast && showToast(err.message || 'Error al crear la entrada', 'error');
    }
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
