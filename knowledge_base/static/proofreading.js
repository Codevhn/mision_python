/* Every remote check is explicit. Corrections stay in a preview until applied. */
(() => {
  const el = id => document.getElementById(id), dialog = el('proofreadingDialog');
  if (!dialog) return;
  let mode = 'browser', target = null, lastField = null, pendingTarget = null;
  let choice = null, matches = [], picks = new Map(), reviewed = false, requestId = 0, controller = null, busy = false;
  const source = el('proofreadingSource'), preview = el('proofreadingPreview');
  const isField = node => node && !dialog.contains(node) && !node.disabled && !node.readOnly &&
    (node.matches('textarea:not([spellcheck="false"]), input[type="text"], input:not([type]), .inline-title[contenteditable="true"]'));
  document.addEventListener('focusin', event => { if (isField(event.target)) lastField = event.target; });
  function status(text, error = false) { el('proofreadingStatus').textContent = text; el('proofreadingStatus').classList.toggle('error', error); }
  function capture(field) {
    const selection = window.getSelection();
    if (!field && selection?.rangeCount && !selection.isCollapsed) {
      let node = selection.anchorNode?.parentElement;
      while (node && !node._captureSpellingSelection) node = node.parentElement;
      const saved = node?._captureSpellingSelection?.();
      if (saved) return saved;
      const title = selection.anchorNode?.parentElement?.closest('.inline-title');
      if (title) field = title;
      else return {text:selection.toString(), apply:null};
    }
    field ||= isField(document.activeElement) ? document.activeElement : lastField;
    if (!isField(field) || !field.isConnected) return null;
    const title = field.isContentEditable;
    const entryId = title ? window._getAssistantVisibleContext?.()?.id : null;
    const original = title ? field.textContent : field.value;
    const start = title ? 0 : field.selectionStart || 0;
    const end = title ? original.length : field.selectionEnd || 0;
    const from = start === end ? 0 : start, to = start === end ? original.length : end;
    return {text:original.slice(from, to), focus:() => field.focus(), apply: corrected => {
      if (!field.isConnected || (title && entryId !== window._getAssistantVisibleContext?.()?.id) || (title ? field.textContent : field.value) !== original) throw new Error('El texto cambió. Abre de nuevo el corrector para revisar la versión actual.');
      if (title) { field.textContent = corrected; }
      else field.setRangeText(corrected, from, to, 'end');
      field.dispatchEvent(new Event('input', {bubbles:true}));
      if (title) field.dispatchEvent(new Event('blur'));
      return true;
    }};
  }
  function buttons() {
    el('proofreadingCheck').disabled = busy || !source.value.trim() || source.value.length > 10000 || (mode === 'ai' && !choice);
    el('proofreadingApply').disabled = busy || !target?.apply || !reviewed || !preview.value.trim() || preview.value === target.text;
    el('proofreadingCopy').disabled = busy || !preview.value.trim();
    el('proofreadingModel').inert = busy;
  }
  function invalidate() {
    controller?.abort(); requestId++; busy = false; reviewed = mode === 'browser';
    matches = []; picks.clear(); el('proofreadingIssues').replaceChildren();
    preview.value = mode === 'browser' ? source.value : ''; status(''); buttons();
  }
  function setMode(value) {
    dialog.querySelectorAll('.practice-cselect').forEach(wrap => wrap._cselectClose?.());
    mode = value;
    dialog.querySelectorAll('[data-proof-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.proofMode === mode)));
    el('proofreadingModel').hidden = mode !== 'ai';
    el('proofreadingCheck').hidden = mode === 'browser';
    el('proofreadingPreviewLabel').hidden = mode === 'browser';
    el('proofreadingHint').textContent = {
      browser:'El navegador subraya posibles errores. Haz clic derecho en una palabra marcada para elegir una sugerencia. Configura español en su corrector. No se envía texto desde Atlas a LanguageTool ni a la IA.',
      languagetool:'Revisa ortografía y gramática sin IA. Al pulsar Revisar texto se envía únicamente este fragmento a LanguageTool. El servicio público gratuito tiene límites de uso.',
      ai:'Al pulsar Revisar texto se envía únicamente este fragmento al modelo elegido. No se incluyen notas, historial ni contexto de Atlas. Puedes editar la propuesta antes de aplicarla.',
    }[mode];
    preview.readOnly = mode !== 'ai'; invalidate();
  }
  function open(explicitField) {
    if (dialog.open) return;
    target = explicitField ? capture(explicitField) : pendingTarget || capture(); pendingTarget = null;
    source.value = target?.text || '';
    el('proofreadingTargetHint').textContent = target?.apply ? 'Se reemplazará solo el fragmento capturado. Puedes deshacer el cambio del editor con Ctrl+Z.' : 'Puedes copiar la propuesta. Para aplicarla directamente, selecciona texto de un solo párrafo en el editor o abre el corrector desde un campo de texto. Los bloques de código no se reemplazan.';
    setMode('browser'); dialog.showModal(); source.focus();
  }
  function buildPreview() {
    let text = source.value, boundary = text.length;
    for (const [index, replacement] of [...picks.entries()].sort((a,b) => matches[b[0]].offset - matches[a[0]].offset)) {
      const m = matches[index];
      if (m.offset + m.length > boundary) continue; // overlapping findings never corrupt a previously chosen replacement
      text = text.slice(0,m.offset) + replacement + text.slice(m.offset + m.length); boundary = m.offset;
    }
    preview.value = text; buttons();
  }
  function showIssues() {
    const list = el('proofreadingIssues'); list.replaceChildren();
    matches.forEach((match,index) => {
      const row = document.createElement('div'); row.className = 'proofreader-issue';
      const message = document.createElement('p'); message.textContent = match.message;
      const context = document.createElement('small'); context.textContent = source.value.slice(Math.max(0,match.offset-35),match.offset+match.length+35);
      row.append(message,context);
      for (const replacement of match.replacements) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = replacement || 'Quitar';
        button.setAttribute('aria-pressed', String(picks.get(index) === replacement));
        button.addEventListener('click', () => {
          // Choosing a finding replaces any overlapping choice.
          for (const key of picks.keys()) { const other = matches[key]; if (other.offset < match.offset + match.length && match.offset < other.offset + other.length || other.offset === match.offset) picks.delete(key); }
          picks.set(index,replacement); buildPreview(); showIssues();
        }); row.appendChild(button);
      }
      const ignore = document.createElement('button'); ignore.type='button'; ignore.textContent='Conservar original';
      ignore.addEventListener('click', () => { picks.delete(index); buildPreview(); showIssues(); }); row.appendChild(ignore); list.appendChild(row);
    });
  }
  el('proofreadingCheck').addEventListener('click', async () => {
    if (busy || !source.value.trim() || source.value.length > 10000) return;
    const sequence = ++requestId, text = source.value, checkedMode = mode;
    controller?.abort(); controller = new AbortController(); busy = true; reviewed = false; preview.value = ''; el('proofreadingIssues').replaceChildren(); buttons(); status('Revisando el fragmento…');
    try {
      const response = await fetch('/api/proofreading/check', {method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal, body:JSON.stringify({text, mode:checkedMode, ...(checkedMode === 'ai' ? choice : {})})});
      const data = await response.json();
      if (sequence !== requestId || !dialog.open) return;
      if (!response.ok) throw new Error(data.error || 'No se pudo revisar el texto.');
      reviewed = true;
      if (checkedMode === 'ai') { preview.value = data.corrected; status(data.corrected === text ? 'El modelo no propuso cambios.' : 'Propuesta lista. Revísala antes de aplicar.'); }
      else { matches = data.matches; picks.clear(); buildPreview(); showIssues(); status(matches.length ? `${matches.length} posibles errores. Elige las sugerencias que quieras aplicar.` : 'LanguageTool no encontró errores en este fragmento.'); }
    } catch(error) { if (sequence === requestId && error.name !== 'AbortError') status(error.message, true); }
    finally { if (sequence === requestId) { busy = false; buttons(); } }
  });
  source.addEventListener('input', invalidate); preview.addEventListener('input', buttons);
  dialog.querySelectorAll('[data-proof-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.proofMode)));
  el('proofreadingClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { controller?.abort(); requestId++; busy = false; dialog.querySelectorAll('.practice-cselect').forEach(wrap => wrap._cselectClose?.()); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const picker = dialog.querySelector('.ai-model-panel:not(.hidden)');
    if (picker) { event.preventDefault(); dialog.querySelector('.practice-cselect')?._cselectClose?.(true); }
    event.stopPropagation();
  });
  el('proofreadingApply').addEventListener('click', () => {
    if (el('proofreadingApply').disabled) return;
    try { target.apply(preview.value); dialog.close(); target.focus?.(); }
    catch(error) { status(error.message,true); }
  });
  el('proofreadingCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(preview.value); status('Propuesta copiada.'); }
    catch { status('No se pudo copiar automáticamente. Selecciona y copia el texto del corrector.',true); }
  });
  el('proofreadingToggle').addEventListener('pointerdown', () => { pendingTarget = capture(); });
  el('proofreadingToggle').addEventListener('click', () => open());
  document.addEventListener('click', event => { if (event.target.closest('#assistantProofread')) open(el('assistantInput')); });
  window._mountModelSelector(el('proofreadingModel'), {context:'proofreading', onChange:value => { choice=value; buttons(); }});
  window.AtlasProofreader = {open};
})();
