/* Convert an editor selection into a classified, empty knowledge entry. */
(() => {
  let active = false;
  function classificationPicker(input, dialog, getValues) {
    const list=document.createElement('div');list.className='atlas-select-popup knowledge-classification-options hidden';
    list.id=`knowledge-options-${input.name}`;list.setAttribute('role','listbox');dialog.append(list);
    input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
    let selected=-1;
    const key=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function close(){list.classList.add('hidden');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;}
    function position(){const rect=input.getBoundingClientRect();list.style.left=`${rect.left}px`;list.style.width=`${rect.width}px`;list.style.top=`${Math.min(rect.bottom+4,innerHeight-list.offsetHeight-12)}px`;}
    function show(filter=''){
      list.replaceChildren();selected=-1;
      const values=[...new Set(getValues().filter(Boolean))].filter(value=>!filter||key(value).includes(key(filter))).slice(0,40);
      if(!values.length){close();return;}
      values.forEach((value,index)=>{
        const option=document.createElement('button');option.className='atlas-select-option';option.type='button';option.setAttribute('role','option');
        option.id=`${list.id}-${index}`;option.textContent=value;option.setAttribute('aria-selected','false');
        option.addEventListener('mousedown',event=>event.preventDefault());
        option.addEventListener('click',()=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();close();});list.append(option);
      });
      list.classList.remove('hidden');input.setAttribute('aria-expanded','true');position();
    }
    input.addEventListener('focus',()=>show());input.addEventListener('click',()=>show());input.addEventListener('input',()=>show(input.value));
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!list.classList.contains('hidden')){event.preventDefault();event.stopPropagation();close();return;}
      if(['ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();if(list.classList.contains('hidden'))show();
        const options=[...list.children];if(!options.length)return;
        selected=(selected+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
        options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));
        input.setAttribute('aria-activedescendant',options[selected].id);options[selected].scrollIntoView({block:'nearest'});
      }else if(event.key==='Enter'&&selected>=0&&!list.classList.contains('hidden')){event.preventDefault();list.children[selected].click();}
      else if(event.key==='Tab')close();
    });
    input.addEventListener('blur',()=>{if(!list.contains(document.activeElement))close();});
    dialog.addEventListener('pointerdown',event=>{if(event.target!==input&&!list.contains(event.target))close();});
    const reposition=()=>{if(!list.classList.contains('hidden'))position();};
    window.addEventListener('resize',reposition);dialog.addEventListener('scroll',reposition,true);
    dialog.addEventListener('close',()=>window.removeEventListener('resize',reposition),{once:true});
  }
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
      dialog.querySelectorAll('datalist').forEach(node=>node.remove());
      inputs.category.removeAttribute('list');inputs.topic.removeAttribute('list');
      classificationPicker(inputs.category,dialog,()=>preview.categories);
      classificationPicker(inputs.topic,dialog,()=>{
        const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        const area=Object.keys(preview.topics_by_category||{}).find(label=>normalize(label)===normalize(inputs.category.value));
        return area?preview.topics_by_category[area]:[];
      });
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
