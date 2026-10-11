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
  let _generationSequence = 0;

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
    ++_generationSequence;
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
    opts = { ...(opts || {}) };
    const sequence = ++_generationSequence;
    const isSummarize = opts.mode === 'summarize' && opts.content;
    // Same fallback as mindmap.js: the lesson-shortcut path calls this
    // directly, skipping showList()'s model selector entirely.
    const modelChoice = _modelChoice || (window._getRawSavedModelChoice ? window._getRawSavedModelChoice('conceptmap') : null);

    _explorer?.destroy(); _explorer = null;
    _area = document.getElementById('conceptMapArea');
    if (!_area) return;
    if (window.showConceptMapArea) window.showConceptMapArea();
    _currentMap = null;
    _area.innerHTML = `
      <section class="cm-generating" aria-busy="true" aria-labelledby="cmGeneratingTopic">
        <div class="cm-generation-constellation" aria-hidden="true">
          <svg viewBox="0 0 400 200" focusable="false">
            <defs><linearGradient id="cmLoadingGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".2"/><stop offset=".48" stop-color="currentColor" stop-opacity=".06"/><stop offset=".5" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity=".04"/></linearGradient></defs>
            <g class="cm-loading-links"><path d="M200 62C200 86 90 80 90 112"/><path d="M200 62C200 86 310 80 310 112"/><path d="M200 62C200 105 200 110 200 153"/></g>
            <g class="cm-loading-node cm-loading-root"><rect x="148" y="18" width="104" height="44" rx="8"/><path d="M173 35h54M181 46h38"/></g>
            <g class="cm-loading-node" style="--node-delay:-1.2s"><rect x="48" y="112" width="84" height="42" rx="7"/><path d="M66 129h48M74 140h32"/></g>
            <g class="cm-loading-node" style="--node-delay:-2.4s"><rect x="268" y="112" width="84" height="42" rx="7"/><path d="M286 129h48M294 140h32"/></g>
            <g class="cm-loading-node" style="--node-delay:-3.6s"><rect x="158" y="153" width="84" height="36" rx="7"/><path d="M177 170h46"/></g>
          </svg>
        </div>
        <h1 class="cm-generating-topic" id="cmGeneratingTopic">${_esc(prompt)}</h1>
        <p id="cmGenerationStatus" role="status">${isSummarize ? 'Organizando los conceptos de la lección…' : 'Generando tu mapa conceptual…'}</p>
        ${modelChoice?.model ? `<p class="cm-generating-model"><span aria-hidden="true"></span>${_esc(modelChoice.model)}</p>` : ''}
      </section>`;

    try {
      const requestMap = async compact => {
        const res = await fetch('/api/concept-maps/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, content: opts.content || '', mode: opts.mode || 'explore', provider: modelChoice?.provider, model: modelChoice?.model, compact }),
        });
        let data;
        try { data = await res.json(); }
        catch { const error = new Error(res.ok ? 'Respuesta con formato inesperado.' : `HTTP ${res.status}`); error.status = res.status; throw error; }
        if (!res.ok) { const error = new Error(data.error || `HTTP ${res.status}`); error.status = res.status; error.code = data.code; throw error; }
        return data;
      };
      let data;
      try { data = await requestMap(false); }
      catch (error) {
        if (sequence !== _generationSequence) return;
        if (error.code !== 'ai_output_truncated' && !/se cortó por el límite de tokens|output.*truncat/i.test(error.message)) throw error;
        const progress = document.getElementById('cmGenerationStatus');
        if (progress) progress.textContent = 'La respuesta se cortó. Preparando un mapa más compacto con explicaciones…';
        // One retry, same provider/model/source. Each request has its own timeout.
        try { data = await requestMap(true); }
        catch (retryError) { retryError.compactAttempted = true; throw retryError; }
      }
      if (!data?.id || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Respuesta con formato inesperado.');
      if (sequence !== _generationSequence) return;
      _currentMap = data;
      if (window._loadConceptMapSidebar) window._loadConceptMapSidebar();
      render();
    } catch (err) {
      if (sequence !== _generationSequence) return;
      showGenerationFailure(err, prompt, opts, modelChoice);
    }
  }

  function showGenerationFailure(error, prompt, opts, modelChoice) {
    const message = String(error.message || 'Error desconocido');
    let title = 'No pudimos generar tu mapa', reason = 'El proveedor no completó la solicitud. Puedes reintentar o elegir otro modelo.';
    if (error.code === 'ai_output_truncated' || /se cortó por el límite de tokens|output.*truncat/i.test(message)) {
      title = 'El modelo cortó la respuesta';
      reason = error.compactAttempted
        ? 'El proveedor agotó su límite incluso con un mapa más compacto. Elige otro modelo para volver a intentarlo.'
        : 'El proveedor agotó su límite antes de terminar el mapa. Puedes elegir otro modelo para volver a intentarlo.';
    } else if (/timed?\s*out|timeout|tiempo.*(espera|agot)|HTTP (408|504)/i.test(message)) {
      title = 'El modelo tardó demasiado';
      reason = 'Se agotó el tiempo de espera antes de recibir el mapa. Puedes volver a intentarlo o probar con otro modelo.';
    } else if (error.status === 429 || /rate.?limit|quota|cuota/i.test(message)) {
      title = 'El proveedor alcanzó su límite';
      reason = 'Espera un momento antes de reintentar o elige otro modelo disponible.';
    } else if ([401, 403].includes(error.status)) {
      title = 'No se pudo acceder al proveedor';
      reason = 'Revisa la configuración y los permisos de su API, o elige otro proveedor disponible.';
    } else if (/json|formato|truncad|incomplet/i.test(message)) {
      reason = 'La respuesta no tenía el formato necesario para construir el mapa. Reintenta o prueba otro modelo.';
    } else if (/fetch|network|red|connection/i.test(message)) {
      reason = 'No se pudo completar la conexión. Comprueba tu conexión y vuelve a intentarlo.';
    }
    const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls || ''; if (text != null) el.textContent = text; return el; };
    const panel = make('section', 'cm-generation-failure'); panel.setAttribute('aria-labelledby', 'cmFailureTitle');
    const icon = make('div', 'cm-failure-icon'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg class="atlas-system-icon" viewBox="0 0 24 24" focusable="false"><use href="/static/aero-icons.svg#conceptmaps"></use></svg>';
    const chrome = make('header', 'cm-failure-chrome'), body = make('div', 'cm-failure-body'), footer = make('footer', 'cm-failure-footer');
    const heading = make('h2', '', title); heading.id = 'cmFailureTitle'; heading.tabIndex = -1;
    const description = make('p', 'cm-failure-reason', reason); description.setAttribute('role', 'status');
    const preserved = make('p', 'cm-failure-preserved', 'Tu solicitud se conserva abajo. Puedes ajustarla antes de reintentar.');
    const label = make('label', 'cm-failure-label', 'Tema o solicitud'), input = make('textarea', 'cm-failure-input');
    input.id = 'cmFailurePrompt'; input.value = prompt; input.rows = 2; label.htmlFor = input.id;
    const modelLabel = make('div', 'cm-failure-label', 'Modelo para el próximo intento'), selector = make('div', 'practice-cselect'), warnings = make('div', 'cm-model-warnings');
    const actions = make('div', 'cm-failure-actions'), retry = make('button', 'cm-failure-retry', 'Reintentar'), back = make('button', '', 'Volver a mis mapas'), blank = make('button', '', 'Crear mapa vacío');
    [retry, back, blank].forEach(button => { button.type = 'button'; });
    let nextChoice = modelChoice;
    const update = () => { retry.disabled = blank.disabled = !input.value.trim(); }; input.addEventListener('input', update); update();
    retry.addEventListener('click', () => { if (!input.value.trim()) return; _modelChoice = nextChoice; generateFromPrompt(input.value, opts); });
    back.addEventListener('click', async () => { await showList(); const draft = document.getElementById('cmPromptInput'); if (draft) draft.value = input.value; });
    const feedback = make('p', 'cm-failure-feedback'); feedback.setAttribute('role', 'status');
    blank.addEventListener('click', async () => {
      const title = input.value.trim(); if (!title || blank.disabled) return;
      const sequence = _generationSequence; blank.disabled = retry.disabled = true;
      try { const map = await apiCreate(title); if (sequence !== _generationSequence) return; if (window._loadConceptMapSidebar) window._loadConceptMapSidebar(); showMap(map.id); }
      catch { if (sequence === _generationSequence) { feedback.textContent = 'No se pudo crear el mapa vacío. Tu solicitud sigue aquí; vuelve a intentarlo.'; update(); } }
    });
    const details = make('details', 'cm-failure-details'); details.append(make('summary', '', 'Detalles técnicos'), make('pre', '', message));
    blank.className = 'cm-failure-blank';
    chrome.append(icon, heading);
    body.append(description, preserved, label, input, modelLabel, selector, warnings, details);
    actions.append(retry, back, blank); footer.append(actions, feedback);
    panel.append(chrome, body, footer);
    _area.replaceChildren(panel);
    if (window._mountModelSelector) window._mountModelSelector(selector, { context: 'conceptmap', value: modelChoice, warningContainer: warnings, onChange: choice => { nextChoice = choice; } });
    else { modelLabel.textContent = 'Se reutilizará el modelo del intento anterior.'; }
    heading.focus({ preventScroll: true });
  }

  // ── Map view ─────────────────────────────────────────────────────────────
  async function showMap(id) {
    ++_generationSequence;
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
        <div class="cm-map-heading"><h1 class="cm-map-title" id="cmMapTitle" spellcheck="false">${_esc(_currentMap.title)}</h1><div id="cmExplorerTrail"></div></div>
        <div id="cmExplorerControls"></div>
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
    document.getElementById('cmAddNodeBtn').addEventListener('click', onAddNodeCenter, { signal });

    const titleEl = document.getElementById('cmMapTitle');
    titleEl.addEventListener('blur', onRenameMap, { signal });
    titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } }, { signal });

    _svgEl = document.getElementById('cmSvg');
    _viewportEl = document.getElementById('cmViewport');
    renderCanvas();
    initPanZoom(signal);
    fitToScreen();
    let labelFrame = 0;
    const scheduleLabels = () => {
      cancelAnimationFrame(labelFrame);
      labelFrame = requestAnimationFrame(placeEdgeLabels);
    };
    const labelObserver = new MutationObserver(scheduleLabels);
    document.fonts?.addEventListener('loadingdone', scheduleLabels, { signal });
    for (const el of [document.documentElement, document.body]) labelObserver.observe(el, { attributes:true, attributeFilter:['class','style','data-theme','data-style','data-variant','data-palette'] });
    signal.addEventListener('abort', () => { labelObserver.disconnect(); cancelAnimationFrame(labelFrame); }, { once:true });
    _explorer = window.ConceptMapExplorer?.mount(document.getElementById('cmCanvasWrap'), () => _currentMap, {
      overview: fitToScreen,
      edit: value => { _editing = value; titleEl.contentEditable = String(value); renderCanvas(); },
      remove: onDeleteMap,
      controls: document.getElementById('cmExplorerControls'),
      trailHost: document.getElementById('cmExplorerTrail'),
      modelChoice: () => _modelChoice || window._getRawSavedModelChoice?.('conceptmap') || _currentMap.model_choice,
      setModelChoice: choice => { _modelChoice = choice; },
      explain: async (id, choice) => {
        const mapId = _currentMap.id;
        const response = await fetch(`/api/concept-maps/${mapId}/nodes/${id}/explanation`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: choice?.provider, model: choice?.model }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'No se pudo obtener la explicación.');
        if (!result.description?.trim()) throw new Error('El modelo devolvió una explicación vacía.');
        return result;
      },
      saveDescription: async (id, description) => {
        const mapId = _currentMap.id;
        await apiPatchNode(mapId, id, { description });
        const result = await apiGet(mapId);
        return result.nodes.find(n => n.id === id);
      },
    });
  }

  function renderCanvas() {
    const edgesG = document.getElementById('cmEdges');
    const nodesG = document.getElementById('cmNodes');
    edgesG.innerHTML = '';
    nodesG.innerHTML = '';
    const curves = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    curves.classList.add('cm-edge-curves'); edgesG.appendChild(curves);
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
    for (const e of edges) renderEdge(e, byId[e.from], byId[e.to], edgesG);
    for (const n of nodes) nodesG.appendChild(renderNode(n, rank[n.id] || 0));
    placeEdgeLabels();
    // Re-measure when the selected typeface finishes loading, using this map only.
    document.fonts?.ready.then(() => {
      if (edgesG.isConnected && document.getElementById('cmEdges') === edgesG) {
        placeEdgeLabels();
        if (!_editing) fitToScreen();
      }
    });
  }

  function placeEdgeLabels() {
    const edgesG = document.getElementById('cmEdges');
    if (!edgesG || !_currentMap || !edgesG.getClientRects().length) return;
    const nodes = _currentMap.nodes || [];
    const boxes = nodes.map(n => ({ x: n.x, y: n.y, w: n._w, h: n._h }));
    const groups = new Map([...edgesG.children].map(g => [g.dataset.id, g]));
    const items = (_currentMap.edges || []).map(edge => {
      const g = groups.get(String(edge.id));
      if (!g) return null;
      const chip = g.querySelector('.cm-edge-label'), fo = g.querySelector('foreignObject');
      // offset dimensions are in graph units, independent of the current zoom.
      const w = chip.offsetWidth + (_editing ? 20 : 0) + 2, h = Math.max(24, chip.offsetHeight) + 2;
      const path = g._lines.querySelector('.cm-edge-line'), length = path.getTotalLength();
      const anchors = [.5, .38, .62, .26, .74].map(t => path.getPointAtLength(length * t));
      return { edge, g, fo, w, h, anchors };
    }).filter(Boolean);
    const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 10 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 9;
    const placed = [];
    const free = box => !boxes.some(other => overlaps(box, other)) && !placed.some(other => overlaps(box, other));
    const right = Math.max(0, ...boxes.map(b => b.x + b.w / 2));
    const top = Math.min(0, ...boxes.map(b => b.y - b.h / 2));
    let laneY = top;
    for (const item of items) {
      let box, anchor;
      // Prefer a point on its own curve. Expand into nearby lanes only if needed.
      for (let radius = 0; radius <= 6 && !box; radius++) {
        const offsets = radius ? [[0,-radius*36],[0,radius*36],[-radius*46,0],[radius*46,0],[-radius*46,-radius*36],[radius*46,radius*36],[-radius*46,radius*36],[radius*46,-radius*36]] : [[0,0]];
        for (const point of item.anchors) {
          for (const [dx, dy] of offsets) {
            const candidate = { x: point.x + dx, y: point.y + dy, w: item.w, h: item.h };
            if (free(candidate)) { box = candidate; anchor = point; break; }
          }
          if (box) break;
        }
      }
      // A crowded/cyclic graph must never fall back to an occupied midpoint.
      if (!box) {
        box = { x: right + item.w / 2 + 32, y: laneY + item.h / 2, w: item.w, h: item.h };
        while (!free(box)) box.y += item.h + 20;
        laneY = box.y + item.h / 2 + 20;
        anchor = item.anchors[0];
      }
      placed.push(box); item.edge._labelBox = box;
      item.fo.setAttribute('x', box.x - box.w / 2); item.fo.setAttribute('y', box.y - box.h / 2);
      item.fo.setAttribute('width', box.w); item.fo.setAttribute('height', box.h);
      const leader = item.g._lines.querySelector('.cm-edge-leader');
      const dx = anchor.x - box.x, dy = anchor.y - box.y;
      const distance = Math.max(Math.abs(dx) / (box.w / 2), Math.abs(dy) / (box.h / 2));
      leader.setAttribute('d', distance > 1 ? `M ${box.x + dx / distance} ${box.y + dy / distance} L ${anchor.x} ${anchor.y}` : '');
    }
  }

  function _nodeColor(node, r) {
    return node.color || `color-mix(in srgb, var(--accent) ${Math.max(38, 100 - r * 12)}%, var(--text-muted))`;
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
    // Paint every curve below every label, so other connections cannot cross
    // over the text of a previously drawn phrase.
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g._lines = lines; edgesG.querySelector('.cm-edge-curves').appendChild(lines);

    const { x1, y1, x2, y2 } = _edgeEndpoints(fromNode, toNode);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', _connectionPath(x1, y1, x2, y2));
    path.setAttribute('class', 'cm-edge-line');
    // Smooth linking curves; direction is expressed by each linking phrase.
    lines.appendChild(path);
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leader.setAttribute('class', 'cm-edge-leader');
    lines.appendChild(leader);

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    const LW = 176, LH = 44;
    fo.setAttribute('x', mx - LW / 2);
    fo.setAttribute('y', my - LH / 2);
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
      placeEdgeLabels();
      apiPatchEdge(_currentMap.id, edge.id, { label: val }).catch(() => {});
    });
    chip.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); chip.blur(); } });
    chip.addEventListener('input', placeEdgeLabels);

    const delBtn = document.createElement('button');
    delBtn.className = 'cm-edge-del';
    delBtn.hidden = !_editing;
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
      if (element) for (const part of [element, element._lines]) { part.classList.toggle('cm-edge-active', !!active); part.classList.toggle('cm-muted', !!id && !active); }
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
        const path = g._lines.querySelector('.cm-edge-line');
        if (path) path.setAttribute('d', _connectionPath(x1, y1, x2, y2));
      }
      placeEdgeLabels();
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
    placeEdgeLabels();
    const boxes = nodes.map(n => ({ x:n.x, y:n.y, w:n._w || NODE_W, h:n._h || NODE_H }));
    boxes.push(...(_currentMap.edges || []).map(e => e._labelBox).filter(Boolean));
    const minX = Math.min(...boxes.map(b => b.x - b.w / 2));
    const maxX = Math.max(...boxes.map(b => b.x + b.w / 2));
    const minY = Math.min(...boxes.map(b => b.y - b.h / 2));
    const maxY = Math.max(...boxes.map(b => b.y + b.h / 2));
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
