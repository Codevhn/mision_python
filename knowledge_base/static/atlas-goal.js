/* The real Home goal window. Amounts are user-provided; previews stay separate. */
(() => {
  'use strict';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currencySymbols = {HNL:'L',USD:'US$',EUR:'€'};
  const money = (cents,currency) => currencySymbols[currency] + ' ' + new Intl.NumberFormat('es-HN',{minimumFractionDigits:cents % 100 ? 2 : 0,maximumFractionDigits:2}).format(cents / 100);
  const inputMoney = cents => (cents / 100).toFixed(2);
  const cents = raw => {
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    const [whole,fraction=''] = raw.split('.');
    const value = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
    return Number.isSafeInteger(value) && value <= 10000000000 ? value : null;
  };
  let activeHost = null, goal = null, dialog = null, saving = false, collapsed = false;
  try {collapsed = localStorage.getItem('atlas_goal_collapsed') === 'true';} catch {}
  const art = `<div class="ag-art" aria-hidden="true"><div class="ag-orbit"></div><svg viewBox="0 0 100 80"><path d="M22 17h56v38H22Z"/><path d="m15 63 7-8h56l7 8v4H15Z"/><path d="M29 25h42v22H29Z"/><path d="m45 30-7 6 7 6m10-12 7 6-7 6"/></svg></div>`;

  async function request(method='GET',data) {
    const response = await fetch('/api/personal-goal',{method,headers:{'Content-Type':'application/json'},...(data ? {body:JSON.stringify(data)} : {})});
    let result;
    try {result = await response.json();} catch {throw new Error('No se pudo contactar con Atlas. Reintenta en un momento.');}
    if(!response.ok) throw new Error(result.error || 'No se pudo guardar la meta.');
    return result.goal;
  }
  function render(host,state='ready',error='') {
    if(!host || host !== activeHost || !host.isConnected) return;
    const percent = goal ? Math.min(100,Math.floor(goal.saved_cents / goal.target_cents * 100)) : 0;
    const remaining = goal ? Math.max(0,goal.target_cents-goal.saved_cents) : 0;
    host.innerHTML = `<section class="atlas-goal" aria-labelledby="homeGoalTitle"><div class="ag-corners" aria-hidden="true"></div>
      <header class="ag-chrome"><strong>◇ Mi próxima meta</strong><div class="ag-controls">${state==='ready'?`<button type="button" data-ag-edit aria-label="${goal?'Editar':'Configurar'} meta" title="${goal?'Editar':'Configurar'} meta">⚙</button>`:''}<button type="button" data-ag-collapse aria-label="${collapsed?'Expandir':'Contraer'} meta" aria-expanded="${!collapsed}" aria-controls="homeGoalBody">${collapsed?'+':'−'}</button></div></header>
      <div class="ag-body" id="homeGoalBody" ${collapsed?'hidden':''}>${art}<h3 id="homeGoalTitle">${goal?escape(goal.title):'Mi próximo equipo'}</h3>
      ${state==='loading'?'<p role="status">Cargando tu meta…</p>':state==='error'?`<p role="alert">${escape(error)}</p><button type="button" class="ag-button" data-ag-retry>Reintentar</button>`:goal?`<p>Un espacio para planear lo que viene.</p><div class="ag-amount"><strong>${money(goal.saved_cents,goal.currency)}</strong><span>de ${money(goal.target_cents,goal.currency)}</span></div><progress max="${goal.target_cents}" value="${Math.min(goal.saved_cents,goal.target_cents)}" aria-label="Avance de ${escape(goal.title)}"></progress><small>${goal.saved_cents>=goal.target_cents?'Meta alcanzada':`${percent}% de tu meta · ${money(remaining,goal.currency)} por reunir`}</small>`:'<p>Un espacio para planear lo que viene.</p><button type="button" class="ag-button" data-ag-edit>Configurar mi meta</button><small class="ag-empty-note">Elige tu objetivo y cuánto llevas reunido.</small>'}
      </div></section>`;
    host.querySelectorAll('[data-ag-edit]').forEach(button => button.addEventListener('click',openEditor));
    host.querySelector('[data-ag-collapse]').addEventListener('click',event => {
      collapsed = !collapsed;
      try {localStorage.setItem('atlas_goal_collapsed',String(collapsed));} catch {}
      const body = host.querySelector('#homeGoalBody'); body.hidden = collapsed;
      const button = event.currentTarget; button.textContent = collapsed ? '+' : '−'; button.setAttribute('aria-expanded',String(!collapsed)); button.setAttribute('aria-label',`${collapsed?'Expandir':'Contraer'} meta`);
    });
    host.querySelector('[data-ag-retry]')?.addEventListener('click',() => load(host));
  }
  async function load(host) {
    render(host,'loading');
    try {const saved = await request(); if(activeHost !== host || !host.isConnected) return; goal=saved;render(host);}
    catch(error) {render(host,'error',error.message);}
  }
  function ensureEditor() {
    if(dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'atlas-goal ag-dialog'; dialog.id = 'atlasGoalDialog'; dialog.setAttribute('aria-labelledby','atlasGoalEditorTitle');
    dialog.innerHTML = `<div class="ag-corners" aria-hidden="true"></div><header class="ag-chrome"><strong id="atlasGoalEditorTitle">Mi próxima meta</strong><div class="ag-controls"><button type="button" data-ag-close aria-label="Cerrar meta">×</button></div></header><form class="ag-body"><p>Define tu objetivo y actualiza el total que has reunido.</p><label>Nombre de la meta<input name="title" maxlength="100" required></label><div class="ag-form-row"><label>Moneda<select name="currency"><option value="HNL">Lempiras · HNL</option><option value="USD">Dólares · USD</option><option value="EUR">Euros · EUR</option></select></label><label>Importe objetivo<input name="target" type="number" inputmode="decimal" min="0.01" max="100000000" step="0.01" required></label></div><label>Total reunido<input name="saved" type="number" inputmode="decimal" min="0" max="100000000" step="0.01" required></label><small>No se realizan conversiones de moneda ni movimientos bancarios.</small><p class="ag-form-status" role="status" aria-live="polite"></p><footer class="ag-form-actions"><button type="button" class="ag-button" data-ag-close>Cancelar</button><button type="submit" class="ag-button" data-ag-save>Guardar meta</button></footer></form>`;
    document.body.append(dialog);
    window.mountAtlasSelects?.(dialog);
    dialog.querySelectorAll('[data-ag-close]').forEach(b => b.addEventListener('click',() => {if(!saving) dialog.close();}));
    dialog.addEventListener('cancel',event => {if(saving) event.preventDefault();});
    const form = dialog.querySelector('form');
    form.addEventListener('submit',async event => {
      event.preventDefault(); if(saving) return;
      const data = {title:form.elements.title.value.trim(),currency:form.elements.currency.value,target_cents:cents(form.elements.target.value),saved_cents:cents(form.elements.saved.value)};
      const status = form.querySelector('.ag-form-status');
      if(!data.title || data.target_cents === null || data.target_cents <= 0 || data.saved_cents === null) {status.textContent='Indica un nombre y cantidades con un máximo de dos decimales.';return;}
      saving = true;status.textContent='Guardando tu meta…';form.setAttribute('aria-busy','true');
      dialog.querySelectorAll('button,input,select').forEach(element => element.disabled=true);
      try {
        goal = await request('PUT',data);
        render(activeHost);
        dialog.close();
        activeHost?.querySelector('[data-ag-edit]')?.focus();
      } catch(error) {status.textContent=error.message;}
      finally {saving=false;form.removeAttribute('aria-busy');dialog.querySelectorAll('button,input,select').forEach(element => element.disabled=false);}
    });
  }
  function openEditor() {
    ensureEditor();if(dialog.open) return;
    const form = dialog.querySelector('form');
    form.elements.title.value = goal?.title || 'Mi próximo equipo';
    form.elements.currency.value = goal?.currency || 'HNL';
    form.elements.currency._atlasSync?.();
    form.elements.target.value = goal ? inputMoney(goal.target_cents) : '';
    form.elements.saved.value = inputMoney(goal?.saved_cents || 0);
    form.querySelector('.ag-form-status').textContent='';dialog.showModal();form.elements.title.focus();
  }
  window.AtlasGoal = {mount(host) {if(!host) return;activeHost=host;load(host);}};
})();
