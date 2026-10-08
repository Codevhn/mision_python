/* Topic conversations, independent of the entry editor. */
(() => {
  const area = document.getElementById('assistantArea');
  if (!area) return;
  const escape = text => window.escapeHtml(String(text || ''));
  let record = null, choice = null, busy = false, controller = null, mounted = false;
  let loadSequence = 0, visibleContext = null, returnFocus = null;
  let selectedFragment = null, fragmentSent = false;
  let modelReady = Promise.resolve();
  let modelNames = new Map();
  let resizeAnimation = null;
  let useVisibleContext = true;
  const icons = {
    copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    retry:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
    edit:'<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/>',
    more:'<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  function actionButton(label, icon, handler) {
    const button = document.createElement('button'); button.type='button'; button.className='assistant-icon-action';
    button.title=label; button.setAttribute('aria-label',label); button.innerHTML=svg(icon);
    button.addEventListener('click',()=>{try{Promise.resolve(handler()).catch(error=>status(error.message,true));}catch(error){status(error.message,true);}}); return button;
  }
  async function copyText(text, button) {
    try { await navigator.clipboard.writeText(text); status('Copiado'); button?.setAttribute('aria-label','Contenido copiado'); }
    catch { status('No se pudo copiar. Puedes seleccionar el texto manualmente.',true); }
  }
  function editDialog(title, fields, save) {
    const dialog=document.createElement('dialog'); dialog.className='assistant-confirm-dialog assistant-edit-dialog';
    dialog.innerHTML='<form><header class="assistant-confirm-header"><h2></h2></header><div class="assistant-confirm-body"></div><footer class="assistant-confirm-actions"><button type="button">Cancelar</button><button type="submit">Guardar</button></footer></form>';
    dialog.querySelector('h2').textContent=title; dialog.setAttribute('aria-label',title);
    const body=dialog.querySelector('.assistant-confirm-body'), inputs={};
    fields.forEach(field=>{const label=document.createElement('label'),input=document.createElement(field.multiline?'textarea':'input'); label.textContent=field.label; input.value=field.value||'';input.required=!field.readonly;input.readOnly=!!field.readonly;input.maxLength=field.max||100;label.append(input);body.append(label);inputs[field.key]=input;});
    const error=document.createElement('p');error.setAttribute('role','status');body.append(error);
    let result=null, saving=false;
    dialog.querySelector('button[type="button"]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
    dialog.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault(); if(saving)return; saving=true; dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
      try { result=await save(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])));dialog.close(); }
      catch(err){error.textContent=err.message;saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
    });
    document.body.append(dialog);dialog.showModal();Object.values(inputs)[0]?.focus();
    return new Promise(resolve=>dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true}));
  }
  async function saveResponse(message, type) {
    const title=message.content.match(/^#+\s+(.+)$/m)?.[1]?.replace(/\*+/g,'').slice(0,100)||'Respuesta de IA';
    const fields=[{key:'title',label:'Título',value:title,max:100}];
    if(type==='knowledge')fields.push({key:'category',label:'Categoría',value:'IA'},{key:'topic',label:'Tema',value:'Respuestas'});
    fields.push({key:'raw_text',label:'Contenido que se guardará',value:message.content,multiline:true,readonly:true,max:1000000});
    const saved=await editDialog(type==='page'?'Crear página desde la respuesta':'Guardar respuesta en Conocimiento',fields,
      values=>api('/api/entry',post({...values,entry_type:type,already_markdown:true})));
    if(saved){status('Respuesta guardada. La conversación se conserva.');window.loadTree?.();}
  }
  function retryMessage(message) {
    if(busy)return;
    const input=el('assistantInput');
    if(input.value.trim()){status('Envía o limpia tu borrador antes de reintentar.',true);return;}
    if(message.roadmap_request){ const {course_id,...options}=message.roadmap_request; generateRoadmap(course_id,options,true); return; }
    input.value=message.question||message.content;
    input.dispatchEvent(new Event('input'));
    send(null,{retry:true,selection:message.selection_context||null});
  }
  document.body.appendChild(area);
  const el = id => document.getElementById(id);

  async function api(url, init) {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || `Error HTTP ${response.status}`);
      error.rawResponse = typeof data.raw_response === 'string' ? data.raw_response : '';
      throw error;
    }
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
    el('assistantUseAtlas').disabled = value;
    el('assistantUseCurrent').disabled = value || !visibleContext;
    el('assistantRefreshContext').disabled = value;
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
          const target = {page:'abPages', teamspace:'abTeamspace', course:'abCourses'}[source.entry_type] || 'abKnowledge';
          document.getElementById(target)?.click(); window._loadEntryById?.(source.id);
        }
      });
      details.appendChild(button);
    });
    container.appendChild(details);
  }
  function formatRoadmap(content, draft) {
    content.classList.add('assistant-roadmap-outline');
    const nodes=Array.from(content.childNodes);
    content.replaceChildren();
    const overview=document.createElement('p');overview.className='assistant-roadmap-overview';
    const lessons=draft.modules.reduce((count,module)=>count+(module.lessons||[]).length,0);
    overview.textContent=`${draft.modules.length} módulos · ${lessons} lecciones · Propuesta para revisar`;
    content.append(overview);
    let moduleBody=null, lessonBody=null;
    for(const node of nodes){
      if(node.nodeName==='H2'){
        const module=document.createElement('details');module.className='assistant-roadmap-module';module.open=true;
        const summary=document.createElement('summary');summary.append(node);
        moduleBody=document.createElement('div');moduleBody.className='assistant-roadmap-module-body';
        module.append(summary,moduleBody);content.append(module);lessonBody=null;
      }else if(node.nodeName==='H3' && moduleBody){
        lessonBody=document.createElement('section');lessonBody.className='assistant-roadmap-lesson';
        lessonBody.append(node);moduleBody.append(lessonBody);
      }else{
        (lessonBody||moduleBody||content).append(node);
      }
    }
  }
  function bubble(message) {
    const article = document.createElement('article');
    article.className = `assistant-message assistant-message-${message.role}`;
    const label = document.createElement('div');
    label.className = 'assistant-message-label';
    label.textContent = message.role === 'user' ? 'Tú' : modelNames.get(`${message.provider}:${message.model}`) || message.model || 'IA · modelo no registrado';
    const content = document.createElement('div');
    content.className = 'assistant-message-content markdown-body';
    if (message.role === 'assistant' && message.html) content.innerHTML = message.html;
    else content.textContent = message.question || message.content;
    if(message.role==='assistant' && message.roadmap_draft?.modules) formatRoadmap(content,message.roadmap_draft);
    content.querySelectorAll('table').forEach(table => {
      const scroll = document.createElement('div');
      scroll.className = 'assistant-table-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', 'Tabla de la respuesta. Desplázate horizontalmente para ver todas las columnas.');
      table.before(scroll); scroll.appendChild(table);
    });
    article.append(label, content);
    if (message.selection_context) {
      const detail = document.createElement('details'), heading = document.createElement('summary'), quote = document.createElement('blockquote');
      detail.className = 'assistant-selection-detail';
      heading.textContent = `Selección · ${message.selection_context.title || 'Texto seleccionado'}`;
      quote.textContent = message.selection_context.text;
      detail.append(heading, quote); article.append(detail);
    }
    if (message.role === 'assistant' && message.content !== 'Pensando…') {
      const actions=document.createElement('div');actions.className='assistant-response-actions';
      const copy=actionButton('Copiar respuesta completa','copy',()=>copyText(message.content,copy));copy.classList.add('assistant-copy');actions.append(copy);
      const index=record?.messages.indexOf(message), question=index>0?record.messages[index-1]:null;
      if(question?.role==='user')actions.append(actionButton('Reintentar con el modelo seleccionado','retry',()=>retryMessage(question)));
      const menu=document.createElement('details');menu.className='assistant-response-menu';
      const toggle=document.createElement('summary');toggle.innerHTML=svg('more');toggle.title='Opciones de respuesta';toggle.setAttribute('aria-label','Opciones de respuesta');menu.append(toggle);
      const options=document.createElement('div');options.className='assistant-response-options';
      [['Guardar como página',()=>saveResponse(message,'page')],['Guardar en Conocimiento',()=>saveResponse(message,'knowledge')],['Descargar Markdown',()=>{
        const url=URL.createObjectURL(new Blob([message.content],{type:'text/markdown;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='respuesta-atlas.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }],['Copiar conversación completa',()=>copyText((record?.messages||[]).map(m=>`${m.role==='user'?'Tú':modelNames.get(`${m.provider}:${m.model}`)||m.model||'IA'}:\n${m.content}`).join('\n\n'))]].forEach(([label,handler])=>{
        const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{menu.open=false;handler();});options.append(button);
      });menu.append(options);actions.append(menu);article.append(actions);
      if(message.roadmap_draft){
        const apply=document.createElement('button');apply.type='button';apply.className='assistant-roadmap-apply';
        apply.textContent='Revisar y aplicar al curso';
        apply.addEventListener('click',()=>window._previewAssistantRoadmap(message.roadmap_draft));
        article.append(apply);
      }
      sources(article, message.sources);
    } else if(message.role==='user' && record?.messages.at(-1)===message) {
      article.append(actionButton('Reintentar con el modelo seleccionado','retry',()=>retryMessage(message)));
    }
    el('assistantTranscript').appendChild(article);
    return content;
  }
  function scrollBottom() { const transcript = el('assistantTranscript'); transcript.scrollTop = transcript.scrollHeight; }
  function renderConversation() {
    el('assistantTitle').textContent = record?.messages.length ? record.title : 'Conversación nueva';
    el('assistantTitle').parentElement.title = el('assistantTitle').textContent;
    el('assistantTranscript').innerHTML = '';
    if (!record?.messages.length) {
      el('assistantTranscript').innerHTML = `<div class="assistant-welcome"><span class="assistant-welcome-icon" aria-hidden="true">✦</span><h2>¿Qué quieres explorar?</h2><p>Pregunta, profundiza y conecta ideas. También puedes consultar tus notas y retomar lo que estabas estudiando.</p><div class="assistant-suggestions"><button type="button">¿Por dónde me quedé estudiando?</button><button type="button">¿Qué tengo pendiente?</button><button type="button">Explícame CSS Grid con ejemplos</button></div></div>`;
      area.querySelectorAll('.assistant-suggestions button').forEach(button => button.addEventListener('click', () => { el('assistantInput').value = button.textContent; el('assistantInput').dispatchEvent(new Event('input')); el('assistantInput').focus(); }));
    } else record.messages.forEach(bubble);
    scrollBottom();
    if(record?.messages.at(-1)?.roadmap_draft){
      const transcript=el('assistantTranscript'), proposal=transcript.querySelector('.assistant-message-assistant:last-child');
      if(proposal) transcript.scrollTop+=proposal.getBoundingClientRect().top-transcript.getBoundingClientRect().top-12;
    }
    mountModel();
  }
  function mountModel() {
    const container = el('assistantModel');
    container.querySelectorAll('.practice-cselect').forEach(node => { node._cselectClose?.(); node._cselectPortal?.remove(); });
    modelReady = window._getAvailableProviders().then(data=>{
      modelNames=new Map((data.providers||[]).flatMap(p=>p.models.map(m=>[`${p.id}:${m.id}`,m.label])));
      area.querySelectorAll('.assistant-message-assistant .assistant-message-label').forEach((label,index)=>{
        const message=record?.messages.filter(m=>m.role==='assistant')[index]; if(message)label.textContent=modelNames.get(`${message.provider}:${message.model}`)||message.model||'IA · modelo no registrado';
      });
      return window._mountModelSelector(container, {
      context: 'assistant', warningContainer: el('assistantWarnings'), value: record?.provider && record?.model ? { provider: record.provider, model: record.model } : choice,
      onChange: value => { choice = value; },
      });
    });
  }
  function confirmDeleteConversation(item, trigger) {
    if (el('assistantDeleteDialog')?.open) return Promise.resolve(false);
    const dialog = document.createElement('dialog');
    dialog.id = 'assistantDeleteDialog'; dialog.className = 'assistant-confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'assistantDeleteTitle');
    dialog.setAttribute('aria-describedby', 'assistantDeleteDescription');
    dialog.innerHTML = `<form method="dialog"><header class="assistant-confirm-header"><h2 id="assistantDeleteTitle">Eliminar conversación</h2></header><div class="assistant-confirm-body"><p>¿Eliminar <strong id="assistantDeleteName"></strong>?</p><p id="assistantDeleteDescription">Se eliminarán esta conversación y todos sus mensajes. Esta acción no se puede deshacer.</p></div><footer class="assistant-confirm-actions"><button type="submit" value="cancel" autofocus>Cancelar</button><button type="submit" value="delete" class="assistant-confirm-danger">Eliminar</button></footer></form>`;
    dialog.querySelector('#assistantDeleteName').textContent = item.title;
    document.body.appendChild(dialog);
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const approved = dialog.returnValue === 'delete';
        dialog.remove();
        (trigger.isConnected ? trigger : el('assistantHistoryToggle'))?.focus();
        resolve(approved);
      }, { once: true });
      dialog.showModal();
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
      const rename=actionButton(`Renombrar ${item.title}`,'edit',async()=>{
        if(busy)return;
        const saved=await editDialog('Renombrar conversación',[{key:'title',label:'Nombre',value:item.title,max:100}],values=>api(`/api/assistant/conversations/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}));
        if(saved){if(record?.id===item.id){record.title=saved.title;el('assistantTitle').textContent=saved.title;}await refreshHistory();}
      });rename.disabled=busy;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
      remove.className = 'assistant-history-delete'; remove.setAttribute('aria-label', `Eliminar ${item.title}`); remove.disabled = busy;
      remove.addEventListener('click', async () => {
        if (busy || !await confirmDeleteConversation(item, remove) || busy) return;
        setBusy(true);
        el('assistantStop').classList.add('hidden');
        try { await api(`/api/assistant/conversations/${item.id}`, { method: 'DELETE' });
          if (record?.id === item.id) { clearSelection(); record = null; renderConversation(); }
          await refreshHistory();
          el('assistantHistoryToggle').focus();
        } catch (error) { status(error.message, true); }
        finally { setBusy(false); }
      });
      row.append(open, rename, remove); history.appendChild(row);
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
      clearSelection(); record = loaded; renderConversation(); el('assistantHistoryPanel').classList.add('hidden'); el('assistantHistoryToggle').setAttribute('aria-expanded', 'false'); await refreshHistory();
      status(loaded.memory ? 'Historial guardado · Los turnos antiguos se resumen para mantener el contexto.' : 'Historial guardado');
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  }
  async function generateRoadmap(courseId, options={}, reuse=false) {
    await open();
    if(busy){status('Espera a que termine la consulta actual antes de generar el roadmap.',true);return;}
    setBusy(true);controller=new AbortController();
    let progress;
    try{
      if(!reuse || !record)record=await api('/api/assistant/conversations',post({}));
      clearSelection();renderConversation();
      el('assistantTranscript').querySelector('.assistant-welcome')?.remove();
      const depth={superficial:'Superficial',estandar:'Estándar',profundo:'Profunda'}[options.depth]||'Estándar';
      const level={principiante:'Principiante',intermedio:'Intermedio',avanzado:'Avanzado'}[options.level]||'Sin especificar';
      const question=`Genera el roadmap con estas opciones:\n\nCurso: ${options.course_title||'Curso seleccionado'}\nGranularidad: ${depth}\nNivel: ${level}\nMódulos de referencia: ${options.module_count||'La IA decide según el temario'}\nInstrucciones adicionales: ${options.topic?.trim()||'Ninguna'}`;
      bubble({role:'user',content:question});
      progress=document.createElement('p');progress.className='assistant-roadmap-progress';progress.setAttribute('role','status');progress.textContent='Preparando la generación…';
      el('assistantTranscript').append(progress);scrollBottom();
      await modelReady;setBusy(true);
      const selected=options.provider?{provider:options.provider,model:options.model}:choice;
      if(!selected)throw new Error('Selecciona un modelo configurado para generar el roadmap.');
      status('Generando la propuesta de módulos y lecciones…');
      progress.textContent=`Generando roadmap con ${modelNames.get(`${selected.provider}:${selected.model}`)||selected.model}…`;
      const result=await api(`/api/assistant/conversations/${record.id}/roadmap`,{
        ...post({...options,...selected,course_id:courseId}),signal:controller.signal});
      record=result;renderConversation();await refreshHistory();
      status('Propuesta lista. Puedes revisarla y aplicarla al curso.');
    }catch(error){
      status(error.name==='AbortError'?'Generación detenida.':error.message,true);
      if(progress){progress.textContent=error.name==='AbortError'?'Generación detenida. Puedes reintentar con las mismas opciones.':(/^No se pudo generar el roadmap/i.test(error.message)?error.message:`No se pudo generar el roadmap. ${error.message}`);progress.classList.add('assistant-roadmap-progress-error');}
      if(error.rawResponse){
        const details=document.createElement('details');details.className='assistant-roadmap-raw';
        const summary=document.createElement('summary');summary.textContent='Ver respuesta recibida del modelo';
        const raw=document.createElement('pre');raw.textContent=error.rawResponse;
        details.append(summary,raw,actionButton('Copiar respuesta recibida','copy',()=>copyText(error.rawResponse)));
        el('assistantTranscript').append(details);
      }
      const retry=actionButton('Reintentar roadmap con el modelo seleccionado','retry',()=>generateRoadmap(courseId,{...options,provider:choice?.provider,model:choice?.model},true));
      retry.classList.add('assistant-roadmap-retry');el('assistantTranscript').append(retry);
    }finally{setBusy(false);controller=null;}
  }
  async function send(event, options={}) {
    event?.preventDefault();
    const prompt = el('assistantInput').value.trim();
    if (busy || !prompt) return;
    if (!choice) { status('Selecciona un modelo configurado para empezar.', true); return; }
    const selection = options.retry ? options.selection : selectedFragment && !fragmentSent ? selectedFragment : null;
    captureContext();
    setBusy(true); controller = new AbortController();
    let completed = false, content = null, partial = '';
    try {
      if (!record) record = await api('/api/assistant/conversations', post({}));
      el('assistantTranscript').querySelector('.assistant-welcome')?.remove();
      if(!options.retry || record.messages.at(-1)?.role!=='user')bubble({ role: 'user', content: prompt, selection_context: selection });
      content = bubble({ role: 'assistant', content: 'Pensando…',provider:choice.provider,model:choice.model });
      el('assistantInput').value = ''; el('assistantInput').style.height = 'auto'; scrollBottom(); status('Preparando respuesta…');
      const response = await fetch(`/api/assistant/conversations/${record.id}/messages`, {
        ...post({ prompt, retry:!!options.retry, selection_context: selection, provider: choice.provider, model: choice.model, use_atlas: el('assistantUseAtlas').checked, current_context: el('assistantUseCurrent').checked ? visibleContext : null }), signal: controller.signal,
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || `HTTP ${response.status}`); }
      if (selection && !options.retry) fragmentSent = true;
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
            status(payload.truncated ? 'La respuesta alcanzó el límite. Puedes pedir que continúe.' : payload.context_summarized ? 'Guardado · Contexto antiguo resumido' : '');
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
        if (record) { record = await api(`/api/assistant/conversations/${record.id}`); renderConversation(); }
        await refreshHistory();
      } catch (error) { status(`No se pudo recuperar el historial: ${error.message}`, true); }
      setBusy(false);
      if (!area.classList.contains('hidden')) el('assistantInput').focus({ preventScroll: true });
    }
  }
  function closeModel() {
    el('assistantModel')?.querySelectorAll('.practice-cselect').forEach(node => node._cselectClose?.());
  }
  function close() {
    closeModel(); area.classList.add('hidden');
    el('assistantLauncher').classList.remove('hidden');
    el('assistantLauncher').setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }
  function captureContext() {
    visibleContext = window._getAssistantVisibleContext?.() || null;
    el('assistantUseCurrent').checked = useVisibleContext && !!visibleContext;
    el('assistantUseCurrent').disabled = !visibleContext;
    el('assistantCurrentLabel').textContent = visibleContext ? `Seguir la vista abierta: ${visibleContext.title}` : 'Seguir automáticamente la vista abierta';
    el('assistantContextSummary').textContent = el('assistantUseCurrent').checked ? 'Contexto · Vista actual' : el('assistantUseAtlas').checked ? 'Contexto · Atlas' : 'Sin contexto';
  }
  function clearSelection() {
    selectedFragment = null; fragmentSent = false;
    el('assistantSelection')?.remove();
  }
  async function askSelection(text, action = null, source = null) {
    if (busy) { status('Espera a que termine la respuesta o detenla antes de cambiar la selección.', true); return; }
    const visible = source || window._getAssistantVisibleContext?.();
    await open();
    if (busy) return;
    if (text && text.length > 10000) { status('Selecciona un fragmento de hasta 10.000 caracteres.', true); return; }
    document.getElementById('aiPanel')?.classList.add('hidden');
    clearSelection();
    if (text?.trim()) {
      selectedFragment = {text, title: String(visible?.title || 'Texto seleccionado').slice(0,300)};
      const strip = document.createElement('div'), details = document.createElement('details'), summary = document.createElement('summary'), quote = document.createElement('blockquote'), remove = document.createElement('button');
      strip.id = 'assistantSelection'; strip.className = 'assistant-selection';
      summary.textContent = `Selección · ${selectedFragment.title}`; quote.textContent = text;
      details.append(summary, quote); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label','Quitar selección');
      remove.addEventListener('click', () => { const sent = fragmentSent; clearSelection(); status(sent ? 'La selección enviada permanece en el historial.' : 'Selección retirada.'); });
      strip.append(details,remove); el('assistantTranscript').before(strip);
    }
    captureContext();
    const prompts = {explain:'Explícame el fragmento seleccionado con claridad.',summarize:'Resume el fragmento seleccionado.',example:'Dame un ejemplo práctico del fragmento seleccionado.'};
    const input = el('assistantInput');
    if (action && prompts[action] && !input.value.trim()) {
      input.value = prompts[action]; input.dispatchEvent(new Event('input')); await modelReady; await send();
    } else {
      status(input.value.trim() ? 'Selección preparada. Conservé tu borrador.' : 'Selección preparada. Pregunta sobre ella.'); input.focus();
    }
  }
  async function open() {
    returnFocus = document.activeElement;
    area.classList.remove('hidden');
    el('assistantLauncher').classList.add('hidden');
    el('assistantLauncher').setAttribute('aria-expanded', 'true');
    if (mounted) { captureContext(); el('assistantInput').focus({preventScroll:true}); return; }
    mounted = true;
    area.innerHTML = `<div class="assistant-chat"><header class="assistant-header"><div class="assistant-heading"><span class="assistant-brand-icon" aria-hidden="true">✦</span><div><strong>Asistente Atlas</strong><h1 id="assistantTitle"></h1></div></div><div class="assistant-header-actions"><button type="button" id="assistantHistoryToggle" aria-label="Ver conversaciones" aria-expanded="false" title="Conversaciones"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3h8M2 6h8M2 9h8"/></svg></button><button type="button" id="assistantNew" aria-label="Nueva conversación" title="Nueva conversación"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg></button><button type="button" id="assistantExpand" aria-label="Ampliar asistente" aria-pressed="false" title="Ampliar"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8"/><path d="M2 4h8"/></svg></button><button type="button" id="assistantClose" aria-label="Cerrar asistente" title="Cerrar"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6"/></svg></button></div></header><aside class="assistant-history hidden" id="assistantHistoryPanel"><div class="assistant-history-heading">Tus conversaciones</div><div id="assistantHistory"></div></aside><div class="assistant-transcript" id="assistantTranscript" aria-label="Mensajes de la conversación"></div><form class="assistant-composer" id="assistantForm"><div class="assistant-input-box"><label class="sr-only" for="assistantInput">Mensaje al asistente</label><textarea id="assistantInput" maxlength="20000" rows="1" spellcheck="true" lang="es" placeholder="Pregunta algo o continúa el tema…"></textarea><div class="assistant-composer-footer"><div id="assistantModel"></div><details class="assistant-context-menu"><summary id="assistantContextSummary">Contexto · Atlas</summary><div class="assistant-context-popover"><strong>Contexto de esta consulta</strong><label><input type="checkbox" id="assistantUseAtlas" checked> Consultar Atlas</label><p>Páginas, Teamspaces, cursos y pendientes.</p><label><input type="checkbox" id="assistantUseCurrent"><span id="assistantCurrentLabel"></span></label><button type="button" id="assistantRefreshContext">Actualizar vista actual</button><p>La ubicación y el contenido de la vista abierta se actualizan al enviar cada consulta. Puedes desactivar este contexto.</p></div></details><button type="button" class="hidden" id="assistantStop" aria-label="Detener respuesta">■</button><button type="button" id="assistantProofread" aria-label="Revisar ortografía del borrador" title="Revisar ortografía">Abc✓</button><button type="submit" id="assistantSend" aria-label="Enviar mensaje">↑</button></div></div><details class="assistant-model-alerts" id="assistantWarnings"><summary>Estado de modelos</summary></details><span id="assistantStatus" role="status"></span><div class="assistant-disclaimer">La IA puede equivocarse. Revisa las fuentes.</div></form></div>`;
    captureContext();
    el('assistantClose').addEventListener('click', close);
    el('assistantExpand').addEventListener('click', () => {
      const before = area.getBoundingClientRect();
      const previousRadius = getComputedStyle(area).borderRadius;
      resizeAnimation?.cancel();
      closeModel(); const expanded = area.classList.toggle('assistant-expanded');
      el('assistantExpand').setAttribute('aria-pressed', String(expanded));
      el('assistantExpand').setAttribute('aria-label', expanded ? 'Reducir asistente' : 'Ampliar asistente');
      el('assistantExpand').title = expanded ? 'Reducir' : 'Ampliar';
      el('assistantExpand').innerHTML = expanded ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M2 4h6v6H2z"/></svg>' : '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8"/><path d="M2 4h8"/></svg>';
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && area.animate) {
        const after = area.getBoundingClientRect(), radius = getComputedStyle(area).borderRadius;
        const frame = (rect, borderRadius) => ({left:`${rect.x}px`,top:`${rect.y}px`,right:'auto',bottom:'auto',width:`${rect.width}px`,height:`${rect.height}px`,borderRadius});
        resizeAnimation = area.animate([frame(before,previousRadius),frame(after,radius)], {duration:280,easing:'cubic-bezier(.22,.75,.25,1)'});
        area.querySelector('.assistant-chat').animate([{opacity:.88},{opacity:1}],{duration:220,easing:'ease-out'});
      }
    });
    el('assistantHistoryToggle').addEventListener('click', () => {
      const hidden = el('assistantHistoryPanel').classList.toggle('hidden');
      el('assistantHistoryToggle').setAttribute('aria-expanded', String(!hidden));
    });
    const updateContext = () => {
      el('assistantContextSummary').textContent = el('assistantUseCurrent').checked ? 'Contexto · Vista actual' : el('assistantUseAtlas').checked ? 'Contexto · Atlas' : 'Sin contexto';
    };
    el('assistantUseAtlas').addEventListener('change', updateContext);
    el('assistantUseCurrent').addEventListener('change', () => { useVisibleContext = el('assistantUseCurrent').checked; updateContext(); });
    el('assistantRefreshContext').addEventListener('click', () => { captureContext(); updateContext(); });
    el('assistantForm').addEventListener('submit', send);
    el('assistantInput').addEventListener('input', () => {
      const input = el('assistantInput'); input.style.height = 'auto'; input.style.height = Math.min(130, input.scrollHeight) + 'px';
    });
    el('assistantInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    });
    el('assistantStop').addEventListener('click', () => controller?.abort());
    el('assistantNew').addEventListener('click', () => {
      if (busy) return;
      el('assistantHistoryPanel').classList.add('hidden'); el('assistantHistoryToggle').setAttribute('aria-expanded', 'false');
      ++loadSequence; clearSelection(); record = null; el('assistantInput').value = ''; el('assistantInput').style.height = 'auto'; renderConversation(); refreshHistory().catch(error => status(error.message, true));
      status('Nueva conversación'); el('assistantInput').focus();
    });
    renderConversation();
    try { await refreshHistory(); } catch (error) { status(error.message, true); }
  }
  el('assistantLauncher').addEventListener('click', open);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !area.classList.contains('hidden')) {
      if (document.querySelector('.ai-model-panel:not(.hidden)')) return;
      const settings = area.querySelector('details[open]');
      if (settings) { settings.open = false; return; }
      close();
    }
  });
  const updateViewport = () => {
    if (!window.visualViewport) return;
    area.style.setProperty('--assistant-vh', `${window.visualViewport.height}px`);
    area.style.setProperty('--assistant-vtop', `${window.visualViewport.offsetTop}px`);
  };
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  updateViewport();
  window.AssistantApp = { open, close, askSelection, generateRoadmap };
})();
