/* Topic conversations, independent of the entry editor. */
(() => {
  const area = document.getElementById('assistantArea');
  if (!area) return;
  const escape = text => window.escapeHtml(String(text || ''));
  let record = null, choice = null, busy = false, controller = null, mounted = false;
  let loadSequence = 0;
  const el = id => document.getElementById(id);

  async function api(url, init) {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data;
  }
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function status(text, error = false) {
    el('assistantStatus').textContent = text;
    el('assistantStatus').classList.toggle('assistant-status-error', error);
  }
  function setBusy(value) {
    busy = value;
    el('assistantSend').disabled = value;
    el('assistantStop').classList.toggle('hidden', !value);
    el('assistantNew').disabled = value;
    area.querySelectorAll('.assistant-history button').forEach(button => button.disabled = value);
    el('assistantModel').inert = value;
  }
  function sources(container, list) {
    if (!list?.length) return;
    const details = document.createElement('details');
    details.className = 'assistant-sources';
    const summary = document.createElement('summary');
    summary.textContent = 'Contenido de Atlas consultado';
    details.appendChild(summary);
    list.forEach(source => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = source.title;
      button.addEventListener('click', () => {
        if (source.type === 'conceptmap' || source.type === 'mindmap') {
          window._openAtlasMap?.(source.type, source.id);
        } else if (source.type === 'board') {
          document.getElementById('abBoards')?.click(); window.KanbanApp?.showBoard(source.id);
        } else {
          document.getElementById('abKnowledge')?.click(); window._loadEntryById?.(source.id);
        }
      });
      details.appendChild(button);
    });
    container.appendChild(details);
  }
  function bubble(message) {
    const article = document.createElement('article');
    article.className = `assistant-message assistant-message-${message.role}`;
    const label = document.createElement('div');
    label.className = 'assistant-message-label';
    label.textContent = message.role === 'user' ? 'Tú' : 'Asistente';
    const content = document.createElement('div');
    content.className = 'assistant-message-content markdown-body';
    if (message.role === 'assistant' && message.html) content.innerHTML = message.html;
    else content.textContent = message.content;
    article.append(label, content);
    if (message.role === 'assistant') {
      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'assistant-copy'; copy.textContent = 'Copiar respuesta';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(message.content); copy.textContent = 'Copiado'; }
        catch { status('No se pudo copiar. Puedes seleccionar el texto manualmente.', true); }
      });
      article.appendChild(copy);
      sources(article, message.sources);
    }
    el('assistantTranscript').appendChild(article);
    return content;
  }
  function scrollBottom() { const transcript = el('assistantTranscript'); transcript.scrollTop = transcript.scrollHeight; }
  function renderConversation() {
    el('assistantTitle').textContent = record?.messages.length ? record.title : 'Una pregunta abre un nuevo camino';
    el('assistantTranscript').innerHTML = '';
    if (!record?.messages.length) {
      el('assistantTranscript').innerHTML = `<div class="assistant-welcome"><span class="assistant-welcome-icon" aria-hidden="true">✦</span><h2>¿Qué quieres explorar?</h2><p>Pregunta, profundiza y conecta ideas. También puedes consultar tus notas y retomar lo que estabas estudiando.</p><div class="assistant-suggestions"><button type="button">¿Por dónde me quedé estudiando?</button><button type="button">¿Qué tengo pendiente?</button><button type="button">Explícame CSS Grid con ejemplos</button></div></div>`;
      area.querySelectorAll('.assistant-suggestions button').forEach(button => button.addEventListener('click', () => { el('assistantInput').value = button.textContent; el('assistantInput').focus(); }));
    } else record.messages.forEach(bubble);
    scrollBottom();
    mountModel();
  }
  function mountModel() {
    const container = el('assistantModel');
    container.querySelectorAll('.practice-cselect').forEach(node => { node._cselectClose?.(); node._cselectPortal?.remove(); });
    window._mountModelSelector(container, {
      context: 'assistant', value: record?.provider && record?.model ? { provider: record.provider, model: record.model } : choice,
      onChange: value => { choice = value; },
    });
  }
  async function refreshHistory() {
    const data = await api('/api/assistant/conversations');
    const history = el('assistantHistory'); history.innerHTML = '';
    if (!data.conversations.length) history.innerHTML = '<p class="assistant-history-empty">Tus conversaciones aparecerán aquí.</p>';
    data.conversations.forEach(item => {
      const row = document.createElement('div'); row.className = 'assistant-history-row';
      row.classList.toggle('active', item.id === record?.id);
      const open = document.createElement('button'); open.type = 'button'; open.className = 'assistant-history-open';
      open.textContent = item.title; open.title = item.title; open.disabled = busy;
      open.addEventListener('click', () => loadConversation(item.id));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
      remove.className = 'assistant-history-delete'; remove.setAttribute('aria-label', `Eliminar ${item.title}`); remove.disabled = busy;
      remove.addEventListener('click', async () => {
        if (busy || !window.confirm('¿Eliminar esta conversación y sus mensajes?')) return;
        try { await api(`/api/assistant/conversations/${item.id}`, { method: 'DELETE' });
          if (record?.id === item.id) { record = null; renderConversation(); }
          await refreshHistory();
        } catch (error) { status(error.message, true); }
      });
      row.append(open, remove); history.appendChild(row);
    });
  }
  async function loadConversation(id) {
    if (busy) return;
    const sequence = ++loadSequence;
    setBusy(true);
    el('assistantStop').classList.add('hidden');
    try {
      status('Cargando conversación…');
      const loaded = await api(`/api/assistant/conversations/${id}`);
      if (sequence !== loadSequence) return;
      record = loaded; renderConversation(); await refreshHistory();
      status(loaded.memory ? 'Historial guardado · Los turnos antiguos se resumen para mantener el contexto.' : 'Historial guardado');
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  }
  async function send(event) {
    event?.preventDefault();
    const prompt = el('assistantInput').value.trim();
    if (busy || !prompt) return;
    if (!choice) { status('Selecciona un modelo configurado para empezar.', true); return; }
    setBusy(true); controller = new AbortController();
    let completed = false, content = null, partial = '';
    try {
      if (!record) record = await api('/api/assistant/conversations', post({}));
      el('assistantTranscript').querySelector('.assistant-welcome')?.remove();
      bubble({ role: 'user', content: prompt });
      content = bubble({ role: 'assistant', content: 'Pensando…' });
      el('assistantInput').value = ''; scrollBottom(); status('Preparando respuesta…');
      const response = await fetch(`/api/assistant/conversations/${record.id}/messages`, {
        ...post({ prompt, provider: choice.provider, model: choice.model, use_atlas: el('assistantUseAtlas').checked }), signal: controller.signal,
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || `HTTP ${response.status}`); }
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const lines = block.split('\n');
          const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
          const payload = JSON.parse(lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'));
          if (kind === 'error') throw new Error(payload.error);
          if (kind === 'status') status(payload.message);
          if (payload.delta) { partial += payload.delta; content.textContent = partial; scrollBottom(); }
          if (kind === 'done') {
            completed = true;
            status(payload.truncated ? 'La respuesta alcanzó el límite. Puedes pedir que continúe.' : payload.context_summarized ? 'Guardado · Contexto antiguo resumido' : 'Conversación guardada');
          }
        }
      }
      if (!completed) throw new Error('La conexión terminó sin completar la respuesta.');
    } catch (error) {
      status(error.name === 'AbortError' ? 'Respuesta detenida. La respuesta parcial no se guardó.' : error.message, true);
      if (content && !partial) content.textContent = 'No se pudo completar la respuesta. Puedes intentar con otro modelo.';
    } finally {
      controller = null;
      try {
        if (record) { record = await api(`/api/assistant/conversations/${record.id}`); if (completed) renderConversation(); }
        await refreshHistory();
      } catch (error) { status(`No se pudo recuperar el historial: ${error.message}`, true); }
      setBusy(false);
      el('assistantInput').focus({ preventScroll: true });
    }
  }
  async function open() {
    if (mounted) return;
    mounted = true;
    area.innerHTML = `<aside class="assistant-history"><div class="assistant-history-heading"><span>Conversaciones</span><button type="button" id="assistantNew">+ Nueva</button></div><div id="assistantHistory"></div></aside><div class="assistant-chat"><header class="assistant-header"><div><span class="assistant-eyebrow">ASISTENTE ATLAS</span><h1 id="assistantTitle"></h1></div><details class="assistant-settings"><summary>Modelo y contexto</summary><div id="assistantModel" class="practice-cselect"></div><label class="assistant-context-option"><input type="checkbox" id="assistantUseAtlas" checked> Consultar mis notas, cursos y pendientes</label><p>Cuando está activo, se comparte contexto relevante de Atlas con el modelo elegido.</p></details></header><div class="assistant-transcript" id="assistantTranscript" aria-label="Mensajes de la conversación"></div><form class="assistant-composer" id="assistantForm"><label class="sr-only" for="assistantInput">Mensaje al asistente</label><textarea id="assistantInput" maxlength="20000" rows="2" placeholder="Pregunta algo o continúa el tema…"></textarea><div class="assistant-composer-footer"><span id="assistantStatus" role="status"></span><button type="button" class="hidden" id="assistantStop">Detener</button><button type="submit" id="assistantSend">Enviar ↑</button></div><div class="assistant-disclaimer">La IA puede equivocarse. Revisa las fuentes y los detalles importantes.</div></form></div>`;
    el('assistantForm').addEventListener('submit', send);
    el('assistantInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    });
    el('assistantStop').addEventListener('click', () => controller?.abort());
    el('assistantNew').addEventListener('click', () => {
      if (busy) return;
      ++loadSequence; record = null; el('assistantInput').value = ''; renderConversation(); refreshHistory().catch(error => status(error.message, true));
      status('Nueva conversación'); el('assistantInput').focus();
    });
    renderConversation();
    try { await refreshHistory(); } catch (error) { status(error.message, true); }
  }
  window.AssistantApp = { open };
})();
