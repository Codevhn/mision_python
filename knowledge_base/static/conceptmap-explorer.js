/* Spatial reading layer for the real concept graph. Never changes graph coordinates. */
(function () {
  'use strict';
  function mount(host, getMap, { overview, edit, saveDescription }) {
    const abort = new AbortController(), { signal } = abort;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let route = [], scene = null, timers = [], sequence = 0, editing = false;
    const node = id => (getMap()?.nodes || []).find(n => n.id === id);
    const links = id => (getMap()?.edges || []).filter(e => e.from === id && node(e.to));
    const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls || ''; if (text != null) el.textContent = text; return el; };
    const button = (text, fn, label) => { const el = make('button', '', text); el.type = 'button'; if (label) el.setAttribute('aria-label', label); el.addEventListener('click', fn, { signal }); return el; };
    const root = make('div', 'cm-explorer');
    const nav = make('nav', 'cm-space-nav'); nav.setAttribute('aria-label', 'Explorar mapa conceptual');
    const back = button('← Volver', () => { route.pop(); display('out'); });
    const full = button('Mapa completo', () => { route = []; display('out'); });
    const trail = make('div', 'cm-space-trail'); trail.setAttribute('aria-live', 'polite');
    const galaxy = button('Galaxia', () => { const off = host.classList.toggle('cm-galaxy-off'); galaxy.setAttribute('aria-pressed', String(!off)); }); galaxy.setAttribute('aria-pressed', 'true');
    const editBtn = button('Editar mapa', () => { editing = !editing; route = []; display('out'); edit(editing); editBtn.textContent = editing ? 'Explorar mapa' : 'Editar mapa'; });
    nav.append(back, full, trail, galaxy, editBtn);
    const world = make('div', 'cm-space-world'), stars = make('div', 'cm-space-galaxy'), memory = make('aside', 'cm-space-memory');
    stars.setAttribute('aria-hidden', 'true'); memory.setAttribute('aria-label', 'Capas recorridas');
    let seed = 741;
    for (let i = 0; i < 100; i++) { seed = seed * 16807 % 2147483647; const x = seed / 2147483647; seed = seed * 16807 % 2147483647; const star = make('i', 'cm-space-star'); star.style.cssText = `left:${x * 100}%;top:${seed / 2147483647 * 100}%;opacity:${.25 + x * .55}`; stars.append(star); }
    world.append(stars, memory); root.append(nav, world); host.append(root); host.classList.add('cm-space-enabled');
    function cancel() { sequence++; timers.forEach(clearTimeout); timers = []; }
    function later(fn, delay) { timers.push(setTimeout(fn, reduced.matches ? 0 : delay)); }
    function memoryUpdate() {
      memory.replaceChildren();
      route.slice(0, -1).forEach((id, index) => { const n = node(id); if (!n) return; const b = button('', () => { route = route.slice(0, index + 1); display('out'); }, 'Volver a ' + n.text); b.className = 'cm-space-memory-card'; b.append(make('small', '', 'CAPA ' + (index + 1)), make('strong', '', n.text), make('span', '', links(id).map(e => node(e.to).text).join(' · '))); memory.append(b); });
    }
    function chunksFor(n) {
      const chunks = [];
      if (n.description?.trim()) { n.description.split(/\n\s*\n/).filter(Boolean).forEach(text => { const section = make('section', 'cm-space-chunk'); section.append(make('p', '', text)); chunks.push(section); }); }
      else { const section = make('section', 'cm-space-chunk'); section.append(make('h3', '', 'Explicación del concepto'), make('p', '', 'Este concepto aún no tiene una explicación guardada. Puedes añadirla aquí o pedir al asistente que la desarrolle.')); chunks.push(section); }
      const related = (getMap().edges || []).filter(e => (e.from === n.id || e.to === n.id) && node(e.from) && node(e.to));
      if (related.length) { const section = make('section', 'cm-space-chunk'); section.append(make('h3', '', 'Relaciones en este mapa')); const list = make('ul'); related.forEach(e => list.append(make('li', '', `${node(e.from).text} — ${e.label || 'se relaciona con'} → ${node(e.to).text}`))); section.append(list); chunks.push(section); }
      return chunks;
    }
    function reader(n) {
      const article = make('article', 'cm-space-reading'), header = make('div', 'cm-space-reading-head'), body = make('div', 'cm-space-reading-body'), status = make('div', 'cm-space-status', 'Desplegando contenido…');
      status.setAttribute('role', 'status'); const chunks = chunksFor(n); chunks.forEach(c => { c.inert = true; body.append(c); });
      let finished = false;
      const reveal = c => { c.inert = false; c.classList.add('visible', 'scanning'); };
      const finish = () => { finished = true; status.textContent = 'Contenido completo'; show.disabled = true; show.textContent = 'Completo'; };
      const show = button('Mostrar todo', () => { chunks.forEach(reveal); finish(); });
      header.append(make('span', '', 'LECTURA DIGITAL'), show);
      const actions = make('div', 'cm-space-reading-actions');
      actions.append(button('Explicar con el asistente', () => window.AssistantApp?.askSelection(n.text, 'explain', { type: 'conceptmap', id: getMap().id, title: getMap().title })));
      const form = make('form', 'cm-space-description-form'); form.hidden = true;
      const label = make('label', '', 'Explicación guardada'), input = make('textarea'); input.value = n.description || ''; input.maxLength = 12000; input.rows = 8; label.append(input);
      const result = make('p', 'cm-space-save-status'); result.setAttribute('role', 'status');
      const save = button('Guardar explicación', async () => { const value = input.value.trim(); save.disabled = true; try { await saveDescription(n.id, value); if (!host.isConnected || !node(n.id)) return; node(n.id).description = value; display('in', true); } catch { result.textContent = 'No se pudo guardar. Tu texto se conserva; inténtalo de nuevo.'; } finally { save.disabled = false; } });
      form.addEventListener('submit', e => e.preventDefault(), { signal }); form.append(label, save, result);
      actions.append(button(n.description ? 'Editar explicación' : 'Añadir explicación', () => { form.hidden = !form.hidden; if (!form.hidden) { chunks.forEach(reveal); finish(); input.focus(); } }));
      article.append(header, body, status, actions, form);
      article.start = () => { if (finished) return; chunks.forEach((c, i) => later(() => { if (finished) return; reveal(c); if (i === chunks.length - 1) later(finish, 1000); }, 200 + i * 1500)); };
      article.finish = () => { chunks.forEach(reveal); finish(); };
      return article;
    }
    function build(n, reading = false) {
      const layer = make('section', 'cm-space-scene'), title = make('div', 'cm-space-title'), heading = make('h2', '', n.text); heading.tabIndex = -1;
      const outgoing = links(n.id), childIds = [...new Set(outgoing.map(e => e.to))];
      title.append(make('small', '', reading || !childIds.length ? 'EXPLICACIÓN DEL CONCEPTO' : 'RELACIONES DEL CONCEPTO'), heading); layer.append(title);
      if (reading || !childIds.length) { const panel = reader(n); layer.append(panel); layer.reader = panel; }
      else {
        const hub = make('div', 'cm-space-hub'); hub.append(make('small', '', 'CONCEPTO ACTUAL'), make('strong', '', n.text), button('Leer concepto', () => display('in', false, true))); layer.append(hub);
        const children = make('div', 'cm-space-children');
        childIds.forEach(id => { const child = node(id), card = button('', () => enter(id), 'Explorar ' + child.text); card.className = 'cm-space-concept'; const phrases = outgoing.filter(e => e.to === id).map(e => e.label).filter(Boolean); card.append(make('span', 'cm-space-relation', phrases.join(' · ') || 'se relaciona con'), make('strong', '', child.text), make('span', 'cm-space-card-hint', links(id).length ? 'Entrar en sus ramas →' : 'Abrir explicación →')); children.append(card); });
        layer.append(children, make('p', 'cm-space-note', 'Explora una rama o lee el concepto actual. Las frases conservan las relaciones del mapa.'));
      }
      return layer;
    }
    function display(direction = 'in', instant = false, reading = false) {
      cancel(); const turn = sequence;
      world.querySelectorAll('.cm-space-scene:not(.current)').forEach(el => el.remove());
      route = route.filter(id => node(id));
      const active = node(route.at(-1)), old = scene; scene = null;
      if (old) { old.classList.remove('current'); old.inert = true; old.classList.add(direction === 'out' ? 'retreating' : 'departing'); }
      host.classList.toggle('cm-depth-active', !!active); host.classList.toggle('cm-space-editing', editing);
      back.disabled = !route.length; full.disabled = !route.length;
      trail.textContent = [getMap()?.title, ...route.map(id => node(id).text)].join(' › '); memoryUpdate();
      stars.style.setProperty('--travel', 1 + route.length * .07);
      if (!active) { if (old) old.remove(); overview(); return; }
      scene = build(active, reading); const next = scene; next.classList.add('current');
      if (!instant && !reduced.matches) next.classList.add(direction === 'out' ? 'returning' : 'arriving'); world.append(next);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (turn === sequence) next.classList.remove('arriving', 'returning'); }));
      later(() => { if (turn !== sequence) return; old?.remove(); next.reader?.start(); next.querySelector('h2').focus({ preventScroll: true }); }, instant ? 0 : 1700);
    }
    function enter(id) { if (editing || !node(id)) return; const index = route.indexOf(id); if (index >= 0) route = route.slice(0, index + 1); else route.push(id); display(); }
    reduced.addEventListener('change', () => { if (reduced.matches) { cancel(); world.querySelectorAll('.cm-space-scene:not(.current)').forEach(el => el.remove()); scene?.classList.remove('arriving', 'returning'); scene?.reader?.finish(); } }, { signal });
    display('in', true);
    return { enter, refresh: () => display('in', true), destroy: () => { cancel(); abort.abort(); root.remove(); host.classList.remove('cm-space-enabled', 'cm-depth-active', 'cm-space-editing'); } };
  }
  window.ConceptMapExplorer = { mount };
})();
