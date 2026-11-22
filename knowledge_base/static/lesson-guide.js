/* Lesson metadata lives outside the Markdown editor and its save queue. */
(() => {
  const drafts = new Map();
  window.renderLessonGuide = (id, meta) => {
    const host = document.getElementById('lessonGuide');
    if (!host) return;
    host.replaceChildren();
    host.classList.toggle('hidden', meta.type !== 'course');
    if (meta.type !== 'course') return;
    const saved = {lesson_objective:meta.lesson_objective || '', lesson_guidance:meta.lesson_guidance || ''};
    const draft = drafts.get(id) || {...saved};
    const panel = document.createElement('details');
    panel.className = 'lesson-guide-panel';
    // Saved guidance stays compact; an empty guide invites the first edit.
    panel.open = drafts.has(id) || !saved.lesson_objective && !saved.lesson_guidance;
    const summary = document.createElement('summary');
    const title = document.createElement('strong');title.textContent = 'Guía de la lección';
    const hint = document.createElement('span');hint.textContent = 'Objetivo y orientación · Contexto para el asistente';
    summary.append(title, hint);panel.append(summary);
    const form = document.createElement('form');
    const help = document.createElement('p');help.className = 'lesson-guide-help';
    help.textContent = 'Define qué se debe aprender y cómo desarrollar los apartados. Estos campos se guardan aparte de los apuntes.';
    form.append(help);
    const inputs = {};
    for (const [key, label, placeholder] of [
      ['lesson_objective', 'Objetivo de la lección', '¿Qué debería comprender o poder hacer el estudiante al terminar?'],
      ['lesson_guidance', 'Orientación del desarrollo', 'Indica el enfoque, los límites y qué evitar repetir entre subtemas.'],
    ]) {
      const field = document.createElement('label');field.textContent = label;
      const input = document.createElement('textarea');input.name = key;input.rows = 3;input.maxLength = 4000;
      input.placeholder = placeholder;input.value = draft[key];input.disabled = !!meta.database_locked;
      inputs[key] = input;field.append(input);form.append(field);
    }
    const actions = document.createElement('div');actions.className = 'lesson-guide-actions';
    const save = document.createElement('button');save.type = 'submit';save.className = 'btn-primary';save.textContent = 'Guardar guía';
    const status = document.createElement('span');status.setAttribute('role','status');
    let saving = false;
    const changed = () => Object.keys(inputs).some(key => inputs[key].value !== saved[key]);
    const refresh = () => {save.disabled = saving || !!meta.database_locked || !changed();};
    form.addEventListener('input', () => {
      const value = Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.value]));
      if (changed()) drafts.set(id, value);else drafts.delete(id);
      status.textContent = changed() ? 'Cambios sin guardar' : '';refresh();
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
        status.textContent = changed() ? 'Cambios sin guardar' : 'Guía guardada · El asistente la usará en la próxima consulta';
      } catch (error) {status.textContent = error.message;}
      finally {saving = false;refresh();}
    });
    actions.append(save, status);form.append(actions);panel.append(form);host.append(panel);refresh();
    if (meta.database_locked) status.textContent = 'Desbloquea la lección para editar la guía';
    else if (changed()) status.textContent = 'Cambios sin guardar';
  };
})();
