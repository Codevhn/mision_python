/* Convert an editor selection into a classified, empty knowledge entry. */
(() => {
  let active = false;
  async function request(url, body) {
    const response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }
  async function create(text, source) {
    if (active) return;
    if (source?.type !== 'entry') throw new Error('Selecciona un término dentro de una entrada o lección.');
    const title = text.trim();
    if (!title || title.length > 300 || title.includes('\n')) throw new Error('Selecciona un término o título breve de hasta 300 caracteres.');
    active = true;
    let dialog;
    try {
      const preview = await request('/api/knowledge/selection', {title, source_entry_id:source.id});
      dialog = document.createElement('dialog');
      dialog.className = 'assistant-confirm-dialog assistant-edit-dialog knowledge-selection-dialog';
      dialog.setAttribute('aria-label', 'Crear entrada en Conocimiento');
      dialog.innerHTML = '<form><header class="assistant-confirm-header"><h2>Crear entrada en Conocimiento</h2></header><div class="assistant-confirm-body"><p class="atlas-dialog-notice"></p><label>Título<input name="title" required maxlength="300"></label><label>Área<input name="category" required maxlength="100" list="knowledgeSelectionAreas"></label><datalist id="knowledgeSelectionAreas"></datalist><label>Temática<input name="topic" required maxlength="100" list="knowledgeSelectionTopics"></label><datalist id="knowledgeSelectionTopics"></datalist><p class="knowledge-classification-note">La clasificación sugerida es editable. La entrada se creará vacía.</p><div class="knowledge-duplicates" aria-live="polite"></div><p class="knowledge-selection-error" role="status"></p></div><footer class="assistant-confirm-actions"><button type="button">Cancelar</button><button type="submit">Crear entrada</button></footer></form>';
      const form = dialog.querySelector('form');
      const inputs = Object.fromEntries(['title','category','topic'].map(key => [key, form.elements.namedItem(key)]));
      Object.entries(inputs).forEach(([key,input]) => { input.value = preview[key] || ''; });
      dialog.querySelector('.atlas-dialog-notice').textContent = `Origen: ${preview.source.title}`;
      for (const [id, values] of [['knowledgeSelectionAreas',preview.categories],['knowledgeSelectionTopics',preview.topics]]) {
        values.forEach(value => { const option=document.createElement('option'); option.value=value; dialog.querySelector(`#${id}`).append(option); });
      }
      const duplicates = dialog.querySelector('.knowledge-duplicates');
      const submit = dialog.querySelector('button[type=submit]');
      const error = dialog.querySelector('.knowledge-selection-error');
      let saving = false, checkSequence = 0, timer;
      function renderDuplicates(items) {
        duplicates.replaceChildren(); submit.disabled = saving || items.length > 0;
        if (!items.length) return;
        const note=document.createElement('p');note.textContent='Ya existe una entrada con este título. Puedes abrirla o cambiar el título.';duplicates.append(note);
        items.forEach(item => {
          const button=document.createElement('button');button.type='button';button.className='btn-ghost';
          button.textContent=`Abrir ${item.title} · ${item.category} / ${item.topic}`;
          button.addEventListener('click', async () => { dialog.close(); window.switchSpace?.('knowledge'); await window.loadEntry(item.id); });
          duplicates.append(button);
        });
      }
      renderDuplicates(preview.duplicates);
      inputs.title.addEventListener('input', () => {
        clearTimeout(timer); const sequence=++checkSequence; submit.disabled=true;
        timer=setTimeout(async () => {
          if (!inputs.title.value.trim()) return;
          try {
            const result=await request('/api/knowledge/selection',{title:inputs.title.value,source_entry_id:source.id});
            if(sequence===checkSequence && dialog.open){error.textContent='';renderDuplicates(result.duplicates);}
          } catch(err) { if(sequence===checkSequence) error.textContent=err.message; }
        },250);
      });
      dialog.querySelector('footer button[type=button]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('cancel', event => { if(saving) event.preventDefault(); });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if(saving || submit.disabled) return;
        saving=true; dialog.querySelectorAll('button').forEach(button=>button.disabled=true);error.textContent='';
        try {
          const saved=await request('/api/entry',{
            entry_type:'knowledge',title:inputs.title.value.trim(),category:inputs.category.value.trim(),topic:inputs.topic.value.trim(),
            raw_text:'',already_markdown:true,source_entry_id:source.id,source_excerpt:String(source.excerpt || '').slice(0,8000)
          });
          dialog.close(); await window.loadTree(); window.switchSpace?.('knowledge'); await window.loadEntry(saved.id);
          await window.AssistantApp?.offerKnowledgeDevelopment(inputs.title.value.trim(),saved.id);
        } catch(err) { error.textContent=err.message;saving=false;dialog.querySelectorAll('button').forEach(button=>button.disabled=false); }
      });
      document.body.append(dialog);dialog.showModal();inputs.title.focus();
      await new Promise(resolve => dialog.addEventListener('close',resolve,{once:true}));
      clearTimeout(timer);
    } finally { dialog?.remove();active=false; }
  }
  window.SelectionKnowledge = { create };
})();
