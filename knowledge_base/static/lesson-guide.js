/* Lesson metadata lives outside the Markdown editor and its save queue. */
(() => {
  const drafts = new Map();
  window._lessonGuideHasDraft = id => drafts.has(id);
  let dispose = () => {};
  window.renderLessonGuide = (id, meta) => {
    const host = document.getElementById('lessonGuide');
    if (!host) return;
    dispose();dispose = () => {};
    host.replaceChildren();
    host.classList.toggle('hidden', meta.type !== 'course');
    if (meta.type !== 'course') return;
    const saved = {lesson_objective:meta.lesson_objective || '', lesson_guidance:meta.lesson_guidance || ''};
    const draft = drafts.get(id) || {...saved};
    const panel = document.createElement('section');
    panel.className = 'lesson-guide-panel';
    panel.setAttribute('aria-labelledby','lessonGuideTitle');
    const title = document.createElement('div');title.id = 'lessonGuideTitle';
    const caption = document.createElement('span');caption.textContent = 'Guía de la lección';
    const develop = document.createElement('button');develop.type = 'button';develop.className = 'lesson-guide-develop';
    develop.textContent = 'Desarrollar lección completa';title.append(caption,develop);
    panel.append(title);
    const form = document.createElement('form');
    const columns = document.createElement('div');columns.className = 'lesson-guide-columns';form.append(columns);
    const inputs = {};
    for (const [key, label, placeholder] of [
      ['lesson_objective', 'Objetivo de la lección', 'Define qué se aprenderá al terminar esta lección…'],
      ['lesson_guidance', 'Orientación del desarrollo', 'Indica el enfoque y los límites que guiarán los subtemas…'],
    ]) {
      const field = document.createElement('label');field.textContent = label;
      const input = document.createElement('textarea');input.name = key;input.rows = 2;input.maxLength = 4000;
      input.placeholder = placeholder;input.value = draft[key];input.disabled = !!meta.database_locked;
      input.setAttribute('aria-describedby','lessonGuideHelp');
      inputs[key] = input;field.append(input);columns.append(field);
    }
    const actions = document.createElement('div');actions.className = 'lesson-guide-actions';
    const save = document.createElement('button');save.type = 'submit';save.className = 'btn-primary';save.textContent = 'Guardar guía';
    const status = document.createElement('span');status.setAttribute('role','status');
    const help = document.createElement('span');help.id = 'lessonGuideHelp';help.className = 'lesson-guide-help';
    help.textContent = 'El asistente usará la guía guardada para desarrollar los subtemas.';
    const resizeInputs = () => {
      if (!host.isConnected || host.classList.contains('hidden')) return;
      for (const input of Object.values(inputs)) {
        input.style.height = 'auto';input.style.height = `${Math.min(320, input.scrollHeight + 2)}px`;
      }
    };
    let saving = false;
    const changed = () => Object.keys(inputs).some(key => inputs[key].value !== saved[key]);
    develop.onclick = () => {
      if(changed()){status.textContent='Guarda la guía antes de desarrollar la lección.';return;}
      window.AssistantApp?.developLesson(id);
    };
    const refresh = () => {
      save.disabled = saving || !!meta.database_locked || !changed();
      save.hidden = !saving && !changed();
    };
    form.addEventListener('input', () => {
      const value = Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.value]));
      if (changed()) drafts.set(id, value);else drafts.delete(id);
      status.textContent = changed() ? 'Cambios sin guardar' : '';refresh();resizeInputs();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();if (save.disabled) return;
      const payload = Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.value]));
      const submittedDraft = drafts.get(id);
      saving = true;refresh();status.textContent = 'Guardando…';
      try {
        const response = await fetch(`/api/entry/${encodeURIComponent(id)}/learning-guide`, {
          method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
        });
        const result = await response.json();if (!response.ok) throw new Error(result.error || 'No se pudo guardar la guía');
        for (const key of Object.keys(inputs)) {
          saved[key] = result[key];meta[key] = result[key];
          if (inputs[key].value === payload[key]) inputs[key].value = result[key];
        }
        if (!changed() && drafts.get(id) === submittedDraft) drafts.delete(id);
        status.textContent = changed() ? 'Cambios sin guardar' : 'Guía guardada';
      } catch (error) {status.textContent = error.message;}
      finally {saving = false;refresh();resizeInputs();}
    });
    actions.append(help, status, save);form.append(actions);panel.append(form);host.append(panel);refresh();
    requestAnimationFrame(resizeInputs);
    if (typeof ResizeObserver !== 'undefined') {
      let width = 0;
      const observer = new ResizeObserver(entries => {
        const next = entries[0].contentRect.width;
        if (next !== width) {width = next;resizeInputs();}
      });
      observer.observe(host);dispose = () => observer.disconnect();
    }
    if (meta.database_locked) status.textContent = 'Desbloquea la lección para editar la guía';
    else if (changed()) status.textContent = 'Cambios sin guardar';
  };
})();
