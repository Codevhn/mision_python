/* Spatial reading layer for the real concept graph. Never changes graph coordinates. */
(function () {
  'use strict';
  function mount(host, getMap, { overview, edit, remove, controls, trailHost, modelChoice, setModelChoice, explain, saveDescription }) {
    const abort = new AbortController(), { signal } = abort;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let route = [], scene = null, timers = [], sequence = 0, editing = false, readingOpen = false;
    let connectorFrame = 0, connectorObserver = null;
    const requests = new Map();
    const node = id => (getMap()?.nodes || []).find(n => n.id === id);
    const links = id => (getMap()?.edges || []).filter(e => e.from === id && node(e.to));
    const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls || ''; if (text != null) el.textContent = text; return el; };
    const button = (text, fn, label) => { const el = make('button', '', text); el.type = 'button'; if (label) el.setAttribute('aria-label', label); el.addEventListener('click', fn, { signal }); return el; };
    const root = make('div', 'cm-explorer');
    const nav = make('nav', 'cm-space-nav'); nav.setAttribute('aria-label', 'Explorar mapa conceptual');
    const back = button('← Volver', () => { if (readingOpen) display('out'); else { route.pop(); display('out'); } });
    const full = button('Vista general', () => { route = []; display('out'); });
    const trail = make('div', 'cm-space-trail'); trail.setAttribute('aria-live', 'polite');
    const options = make('details', 'cm-space-options'), summary = make('summary', '', '•••'); summary.setAttribute('aria-label', 'Opciones del mapa');
    const menu = make('div', 'cm-space-menu');
    const closeModelPicker = () => models.querySelectorAll('.practice-cselect').forEach(el => el._cselectClose?.());
    const closeMenu = () => { closeModelPicker(); options.open = false; };
    const galaxy = button('Fondo galáctico', () => { const off = host.classList.toggle('cm-galaxy-off'); galaxy.setAttribute('aria-pressed', String(!off)); closeMenu(); }); galaxy.setAttribute('aria-pressed', String(!host.classList.contains('cm-galaxy-off')));
    const editBtn = button('Editar mapa', () => { editing = !editing; route = []; display('out'); edit(editing); editBtn.textContent = editing ? 'Terminar edición' : 'Editar mapa'; closeMenu(); });
    const editText = button('Editar texto del concepto', () => { closeMenu(); scene?.reader?.editText(); });
    const models = make('div', 'cm-space-models'), warnings = make('div', 'cm-space-model-warning');
    models.append(make('span', '', 'Modelo para explicaciones'));
    const selector = make('div'); models.append(selector, warnings);
    const stats = make('small', 'cm-space-map-stats', `${getMap().nodes.length} conceptos · ${getMap().edges.length} relaciones`);
    menu.append(models, galaxy, editBtn, editText, stats, button('Eliminar mapa', () => { closeMenu(); remove(); }));
    options.append(summary, menu); nav.append(back, full, options);
    if (controls) controls.append(nav); else root.append(nav);
    if (trailHost) trailHost.append(trail); else nav.prepend(trail);
    options.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); summary.focus(); } }, { signal });
    document.addEventListener('pointerdown', e => { if (!options.contains(e.target) && ![...models.querySelectorAll('.practice-cselect')].some(el => el._cselectPortal?.contains(e.target))) closeMenu(); }, { signal });
    options.addEventListener('toggle', () => { if (!options.open) closeModelPicker(); }, { signal });
    if (window._mountModelSelector) window._mountModelSelector(selector, { context: 'conceptmap', value: modelChoice?.(), warningContainer: warnings, onChange: choice => setModelChoice?.(choice) });
    const world = make('div', 'cm-space-world'), stars = make('div', 'cm-space-galaxy'), memory = make('aside', 'cm-space-memory');
    stars.setAttribute('aria-hidden', 'true'); memory.setAttribute('aria-label', 'Capas recorridas');
    let seed = 741;
    for (let i = 0; i < 100; i++) { seed = seed * 16807 % 2147483647; const x = seed / 2147483647; seed = seed * 16807 % 2147483647; const star = make('i', 'cm-space-star'); star.style.cssText = `left:${x * 100}%;top:${seed / 2147483647 * 100}%;opacity:${.25 + x * .55}`; stars.append(star); }
    const ambient = make('div', 'cm-space-ambient'); ambient.setAttribute('aria-hidden', 'true');
    world.append(stars, ambient, memory); root.append(world); host.append(root); host.classList.add('cm-space-enabled');
    function cancel() { cancelAnimationFrame(connectorFrame); connectorObserver?.disconnect(); connectorObserver = null; sequence++; timers.forEach(clearTimeout); timers = []; }
    function later(fn, delay) { timers.push(setTimeout(fn, reduced.matches ? 0 : delay)); }
    function memoryUpdate() {
      memory.replaceChildren();
      if (route.length > 1) memory.append(make('span', 'cm-space-memory-caption', 'CAPAS RECORRIDAS'), make('div', 'cm-space-memory-line'));
      route.slice(0, -1).forEach((id, index) => { const n = node(id); if (!n) return; const b = button('', () => { route = route.slice(0, index + 1); display('out'); }, 'Volver a ' + n.text); b.className = 'cm-space-memory-card'; b.append(make('small', '', 'CAPA ' + (index + 1)), make('strong', '', n.text), make('span', '', links(id).map(e => node(e.to).text).join(' · '))); memory.append(b); });
    }
    function chunksFor(n) {
      const chunks = [];
      // Only HTML rendered and sanitized by Atlas's Markdown renderer enters here.
      if (n.description_html) {
        const template = document.createElement('template'); template.innerHTML = n.description_html;
        let section;
        for (const block of template.content.children) {
          if (!section || (!/^H[1-6]$/.test(block.tagName) && section.lastElementChild && !/^H[1-6]$/.test(section.lastElementChild.tagName))) {
            section = make('section', 'cm-space-chunk'); chunks.push(section);
          }
          section.append(block.cloneNode(true));
        }
      } else if (n.description?.trim()) {
        n.description.split(/\n\s*\n/).filter(Boolean).forEach(text => { const section = make('section', 'cm-space-chunk'); section.append(make('p', '', text)); chunks.push(section); });
      }
      return chunks;
    }
    function reader(n) {
      const article = make('article', 'cm-space-reading'), body = make('div', 'cm-space-reading-body'), status = make('div', 'cm-space-status');
      status.setAttribute('role', 'status');
      const chunks = chunksFor(n); chunks.forEach((c, i) => { c.inert = true; c.style.setProperty('--text-depth', `${Math.min(i, 3) * 3}px`); body.append(c); });
      let finished = false;
      const revealInstant = c => { c.inert = false; c.classList.add('visible'); c.classList.remove('scanning'); };
      const finish = () => { finished = true; show.hidden = true; status.textContent = ''; };
      const show = button('Mostrar todo', () => { chunks.forEach(revealInstant); finish(); });
      show.className = 'cm-space-show-all'; show.hidden = !chunks.length;
      article.append(show, body, status);
      const form = make('form', 'cm-space-description-form'); form.hidden = true;
      const label = make('label', '', 'Editar texto'), input = make('textarea'); input.value = n.description || ''; input.maxLength = 12000; input.rows = 8; label.append(input);
      const result = make('p', 'cm-space-save-status'); result.setAttribute('role', 'status');
      const save = button('Guardar cambios', async () => {
        const value = input.value.trim(); if (!value) { result.textContent = 'Escribe una explicación antes de guardar.'; return; }
        save.disabled = true;
        try { const saved = await saveDescription(n.id, value); if (!host.isConnected || !node(n.id)) return; Object.assign(node(n.id), saved); if (scene?.reader === article) display('in', true, true); }
        catch { result.textContent = 'No se pudo guardar. Tu texto se conserva; inténtalo de nuevo.'; }
        finally { save.disabled = false; }
      });
      form.addEventListener('submit', e => e.preventDefault(), { signal }); form.append(label, save, button('Cancelar', () => { form.hidden = true; }), result); article.append(form);
      article.editText = () => { form.hidden = false; chunks.forEach(revealInstant); finish(); input.focus(); };
      async function load() {
        status.className = 'cm-space-status cm-space-loading'; status.replaceChildren(make('span', 'cm-space-loader'), make('span', '', 'Preparando la explicación…'));
        article.setAttribute('aria-busy', 'true');
        try {
          if (!requests.has(n.id)) requests.set(n.id, explain(n.id, modelChoice?.()).then(saved => { if (!signal.aborted && node(n.id)) Object.assign(node(n.id), saved); return saved; }).finally(() => requests.delete(n.id)));
          await requests.get(n.id);
          if (!signal.aborted && scene?.reader === article) display('in', true, true);
        } catch (error) {
          if (signal.aborted || scene?.reader !== article) return;
          status.className = 'cm-space-status cm-space-error';
          status.replaceChildren(make('p', '', 'No pudimos preparar esta explicación.'), make('p', 'cm-space-error-detail', error.message), button('Reintentar', load), button('Cambiar modelo', () => { options.open = true; selector.querySelector('button, select, input')?.focus(); }));
        } finally { article.setAttribute('aria-busy', 'false'); }
      }
      article.start = () => {
        if (!chunks.length) { load(); return; }
        if (finished) return;
        chunks.forEach((c, i) => later(() => { if (finished) return; revealInstant(c); c.classList.add('scanning'); if (i === chunks.length - 1) later(finish, 1000); }, 200 + i * 1200));
      };
      article.finish = () => { chunks.forEach(revealInstant); finish(); };
      return article;
    }
    function build(n, reading = false) {
      const layer = make('section', 'cm-space-scene'), title = make('div', 'cm-space-title'), heading = make('h2', '', n.text); heading.tabIndex = -1;
      const outgoing = links(n.id), childIds = [...new Set(outgoing.map(e => e.to))];
      title.append(heading); if (!reading && childIds.length) title.classList.add('cm-space-title--branches'); layer.append(title);
      if (reading || !childIds.length) { const panel = reader(n); layer.append(panel); layer.reader = panel; }
      else {
        const cluster = make('div', 'cm-space-cluster');
        const hub = button('', () => display('in', false, true), 'Abrir explicación de ' + n.text);
        hub.className = 'cm-space-hub'; hub.title = 'Abrir explicación';
        hub.append(make('strong', '', n.text));
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('cm-space-connections'); svg.setAttribute('aria-hidden', 'true');
        const children = make('div', 'cm-space-children');
        childIds.forEach((id, index) => {
          const child = node(id), card = button('', () => enter(id), 'Explorar ' + child.text);
          card.className = 'cm-space-concept'; card.style.setProperty('--float-delay', (-index * 1.7) + 's');
          const phrases = outgoing.filter(e => e.to === id).map(e => e.label).filter(Boolean);
          card.append(make('span', 'cm-space-relation', phrases.join(' · ') || 'se relaciona con'), make('strong', '', child.text), make('span', 'cm-space-card-hint', links(id).length ? 'Explorar ramas' : 'Abrir explicación'), make('span', 'cm-space-port', '+'));
          children.append(card);
          const path = document.createElementNS(svg.namespaceURI, 'path'); svg.append(path);
        });
        cluster.append(svg, hub, children); layer.append(cluster);
        layer.append(make('p', 'cm-space-note', 'Pulsa una rama para explorarla o el concepto actual para ver su explicación.'));
        layer.cluster = { el: cluster, hub, cards: [...children.children], svg };

      }
      return layer;
    }
    function connectLayer(layer) {
      cancelAnimationFrame(connectorFrame); connectorObserver?.disconnect(); connectorObserver = null;
      if (!layer.cluster) return;
      const { el, hub, cards, svg } = layer.cluster;
      const paths = [...svg.children]; let lastDraw = 0;
      function draw(now = 0) {
        if (!el.isConnected || !layer.classList.contains('current')) return;
        if (now - lastDraw >= 32 || !now) {
          const frame = el.getBoundingClientRect();
          if (frame.width && frame.height) {
            const width = el.clientWidth, height = el.clientHeight, sx = width / frame.width, sy = height / frame.height;
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            const a = hub.getBoundingClientRect(), x1 = (a.left + a.width / 2 - frame.left) * sx, y1 = (a.bottom - frame.top) * sy;
            cards.forEach((card, i) => {
              const b = card.getBoundingClientRect(), x2 = (b.left + b.width / 2 - frame.left) * sx, y2 = (b.top - frame.top) * sy;
              const middle = y1 + Math.max(24, (y2 - y1) * .5);
              paths[i].setAttribute('d', `M${x1} ${y1} C${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`);
            });
          }
          lastDraw = now;
        }
        if (!reduced.matches && !document.hidden && el.getClientRects().length) connectorFrame = requestAnimationFrame(draw);
      }
      connectorObserver = new ResizeObserver(() => { cancelAnimationFrame(connectorFrame); draw(); }); connectorObserver.observe(el);
      draw();
    }
    function display(direction = 'in', instant = false, reading = false) {
      cancel(); const turn = sequence; readingOpen = reading;
      world.querySelectorAll('.cm-space-scene:not(.current)').forEach(el => el.remove());
      route = route.filter(id => node(id));
      const active = node(route.at(-1)), old = scene; scene = null;
      if (old) { old.classList.remove('current'); old.inert = true; old.classList.add(direction === 'out' ? 'retreating' : 'departing'); }
      host.classList.toggle('cm-depth-active', !!active); host.classList.toggle('cm-space-editing', editing);
      back.disabled = route.length <= 1 && !readingOpen; full.disabled = !route.length; editText.hidden = !active || (!reading && links(active.id).length > 0); closeMenu();
      trail.textContent = route.map(id => node(id).text).join(' › ') || 'Vista general'; memoryUpdate();
      stars.style.setProperty('--travel', 1 + route.length * .07);
      if (!active) { if (old) old.remove(); overview(); return; }
      scene = build(active, reading); const next = scene; next.classList.add('current');
      if (!instant && !reduced.matches) next.classList.add(direction === 'out' ? 'returning' : 'arriving'); world.append(next); connectLayer(next);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (turn === sequence) next.classList.remove('arriving', 'returning'); }));
      later(() => { if (turn !== sequence) return; old?.remove(); next.reader?.start(); next.querySelector('h2').focus({ preventScroll: true }); }, instant ? 0 : 1700);
    }
    function enter(id) { if (editing || !node(id)) return; const index = route.indexOf(id); if (index >= 0) route = route.slice(0, index + 1); else route.push(id); display(); }
    reduced.addEventListener('change', () => { if (reduced.matches) { cancel(); world.querySelectorAll('.cm-space-scene:not(.current)').forEach(el => el.remove()); scene?.classList.remove('arriving', 'returning'); scene?.reader?.finish(); scene?.reader?.start(); connectLayer(scene || {}); } else connectLayer(scene || {}); }, { signal });
    document.addEventListener('visibilitychange', () => { cancelAnimationFrame(connectorFrame); if (!document.hidden && scene) connectLayer(scene); }, { signal });
    const map = getMap(), incoming = new Set((map?.edges || []).map(edge => edge.to));
    const roots = (map?.nodes || []).filter(n => !incoming.has(n.id));
    const candidates = roots.length ? roots : (map?.nodes || []);
    const start = [...candidates].sort((a, b) => links(b.id).length - links(a.id).length)[0];
    if (start) route = [start.id];
    display('in', true);
    return { enter, refresh: () => display('in', true), destroy: () => { cancel(); abort.abort(); models.querySelectorAll('.practice-cselect').forEach(el => { el._cselectClose?.(); el._cselectPortal?.remove(); }); nav.remove(); trail.remove(); root.remove(); host.classList.remove('cm-space-enabled', 'cm-depth-active', 'cm-space-editing'); } };
  }
  window.ConceptMapExplorer = { mount };
})();
