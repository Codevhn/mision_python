(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => ({HNL:'L ',USD:'US$ ',EUR:'€ '}[$('#currency').value]) + new Intl.NumberFormat('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100);
  const isoToday = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const cents = raw => {if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new Error('Usa un importe con un máximo de dos decimales.');const [a,b='']=raw.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>10000000000)throw new Error('El importe es demasiado grande.');return n;};
  let state={accounts:[],movements:[],budgets:[]},category='',type='',formMode='',busy=false,refreshing=false,ready=false;
  const categories=['Alimentación','Vivienda','Transporte','Herramientas','Salud','Ocio','Otros'];
  $('#month').value=isoToday().slice(0,7);
  function copyTheme(){
    if(window.parent===window)return;
    try {for(const key of ['style','variant','theme','palette','intensity','languageTheme'])document.documentElement.dataset[key]=window.parent.document.documentElement.dataset[key]||'';}catch{}
  }
  copyTheme();
  if(window.parent!==window){try{new MutationObserver(copyTheme).observe(window.parent.document.documentElement,{attributes:true});}catch{}}
  window.AtlasGoal.mount($('#finance-goal'));
  async function api(path='/api/finance',method='GET',data){
    const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
    let result;try{result=await response.json();}catch{throw new Error('No se pudo contactar con Atlas. Reintenta en un momento.');}
    if(!response.ok)throw new Error(result.error||'No se pudo guardar el cambio.');return result;
  }
  const accountMap=()=>new Map(state.accounts.map(a=>[a.id,a]));
  const visibleAccounts=()=>state.accounts.filter(a=>a.currency===$('#currency').value);
  const currencyMovements=()=>{const accounts=accountMap();return state.movements.filter(m=>accounts.get(m.account_id)?.currency===$('#currency').value);};
  const monthMovements=()=>currencyMovements().filter(m=>m.date.startsWith($('#month').value)&&(!$('#account-filter').value||m.account_id===$('#account-filter').value||m.destination_id===$('#account-filter').value));
  function sum(list,kind){return list.filter(m=>m.type===kind).reduce((n,m)=>n+m.amount_cents,0);}
  function showDetail(detail){
    document.querySelectorAll('[data-detail]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.detail===detail)));
    $('#movement-detail').hidden=detail!=='movements';$('#budget-detail').hidden=detail!=='budgets';
  }
  function selectCategory(name){category=category===name?'':name;type='';showDetail('movements');render();restoreChartFocus('expense',name);}
  function selectAccount(id){$('#account-filter').value=$('#account-filter').value===id?'':id;category='';type='';showDetail('movements');render();}
  function selectType(kind){type=type===kind?'':kind;category='';showDetail('movements');render();}
  function restoreChartFocus(chart,key){const buttons=document.querySelectorAll(`#${chart}-chart [data-chart-key]`);[...buttons].find(b=>b.dataset.chartKey===key)?.focus({preventScroll:true});}
  function chart(host,items,label,selected,choose,empty){
    host.replaceChildren();
    const total=items.reduce((n,item)=>n+item.amount,0);
    if(total<=0){const p=document.createElement('p');p.className='chart-empty';p.textContent=empty;host.append(p);return;}
    const ring=document.createElement('div');ring.className='chart-ring';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 130 130');svg.setAttribute('role','group');svg.setAttribute('aria-label',label);
    const center=document.createElement('span');center.className='chart-ring-center';
    const centerLabel=document.createElement('small'),centerValue=document.createElement('strong');centerLabel.textContent=selected?items.find(i=>i.key===selected)?.name||label:label;centerValue.textContent=money(items.find(i=>i.key===selected)?.amount||total);center.append(centerLabel,centerValue);
    ring.append(svg,center);
    const legend=document.createElement('div');legend.className='chart-legend';
    const description=document.createElement('div');description.className='chart-description';description.setAttribute('role','status');description.textContent='Selecciona una porción o su nombre para consultar sus movimientos.';
    let offset=0;const circumference=2*Math.PI*48;
    items.forEach((item,index)=>{
      const percent=item.amount/total*100,color=`color-mix(in srgb,var(--accent) ${Math.max(20,95-index*15)}%,var(--text-muted))`;
      const amountLabel=`${item.name}: ${money(item.amount)} · ${percent.toFixed(1)}%`;
      const circle=document.createElementNS(svg.namespaceURI,'circle');
      for(const [key,value] of Object.entries({cx:65,cy:65,r:48,transform:'rotate(-90 65 65)','stroke-dasharray':`${Math.max(.1,item.amount/total*circumference-2)} ${circumference}`,'stroke-dashoffset':-offset,role:'button',tabindex:0,'aria-label':amountLabel,'aria-pressed':String(item.key===selected)}))circle.setAttribute(key,value);
      circle.classList.add('chart-slice');if(selected&&item.key!==selected)circle.classList.add('is-dimmed');circle.style.stroke=color;circle.dataset.chartKey=item.key;
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=amountLabel;circle.append(title);
      const activate=()=>choose(item.key);circle.addEventListener('click',activate);circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
      circle.addEventListener('pointerenter',()=>{description.textContent=amountLabel;});circle.addEventListener('focus',()=>{description.textContent=amountLabel;});svg.append(circle);
      const button=document.createElement('button');button.type='button';button.dataset.chartKey=item.key;button.setAttribute('aria-label',amountLabel);button.setAttribute('aria-pressed',String(item.key===selected));
      const dot=document.createElement('i');dot.className='legend-dot';dot.style.setProperty('--slice-color',color);dot.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.textContent=item.name;const value=document.createElement('b');value.textContent=`${Math.round(percent)}%`;button.append(dot,name,value);button.addEventListener('click',activate);legend.append(button);
      offset+=item.amount/total*circumference;
    });
    host.append(ring,legend,description);
  }
  function render(){
    const accounts=visibleAccounts(),period=monthMovements(),allPeriod=currencyMovements().filter(m=>m.date.startsWith($('#month').value));
    const total=accounts.reduce((n,a)=>n+a.balance_cents,0),savings=accounts.filter(a=>a.kind==='savings').reduce((n,a)=>n+a.balance_cents,0);
    $('#balance-total').textContent=money(total);$('#savings-total').textContent=money(savings);$('#spending-total').textContent=money(total-savings);$('#balance-currency').textContent=$('#currency').selectedOptions[0].textContent;
    const income=sum(period,'income'),expense=sum(period,'expense');$('#income-total').textContent=money(income);$('#expense-total').textContent=money(expense);$('#month-total').textContent=(income>=expense?'+':'−')+money(Math.abs(income-expense));
    $('#add-movement').disabled=!accounts.length;
    $('#accounts').innerHTML=accounts.length?accounts.map(a=>`<button type="button" class="account-row" data-account="${a.id}" aria-pressed="${$('#account-filter').value===a.id}"><span class="account-icon" aria-hidden="true">${a.kind==='savings'?'◇':'▤'}</span><div><strong>${esc(a.name)}</strong><small>${a.kind==='savings'?'Ahorro':'Uso diario'}</small></div><b>${money(a.balance_cents)}</b></button>`).join(''):'<p class="chart-empty">Añade tu primera cuenta con su saldo inicial para empezar.</p>';
    $('#accounts').querySelectorAll('[data-account]').forEach(b=>b.addEventListener('click',()=>selectAccount(b.dataset.account)));
    const grouped=new Map();period.filter(m=>m.type==='expense').forEach(m=>grouped.set(m.category,(grouped.get(m.category)||0)+m.amount_cents));
    chart($('#expense-chart'),[...grouped].sort((a,b)=>b[1]-a[1]).map(([name,amount])=>({key:name,name,amount})),'Gastos',category,selectCategory,'Todavía no hay gastos para este mes y esta cuenta.');
    chart($('#savings-chart'),accounts.filter(a=>a.kind==='savings'&&a.balance_cents>0).map(a=>({key:a.id,name:a.name,amount:a.balance_cents})),'Ahorro',$('#account-filter').value,id=>{selectAccount(id);restoreChartFocus('savings',id);},'Añade una cuenta de ahorro o transfiere dinero a una existente.');
    const max=Math.max(income,expense,1);$('#flow-chart').innerHTML=[['income','Ingresos',income,90],['expense','Gastos',expense,45]].map(([kind,name,amount,color])=>`<button type="button" class="flow-bar" data-kind="${kind}" aria-pressed="${type===kind}" ${amount?'':'disabled'}><span>${name}</span><span class="flow-bar-track" aria-hidden="true"><span class="flow-bar-fill" style="display:block;width:${amount/max*100}%;--slice-color:color-mix(in srgb,var(--accent) ${color}%,var(--text-muted))"></span></span><b>${money(amount)}</b></button>`).join('');
    $('#flow-chart').querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{const kind=b.dataset.kind;selectType(kind);$('#flow-chart').querySelector(`[data-kind="${kind}"]`)?.focus({preventScroll:true});}));
    const filtered=period.filter(m=>(!category||m.category===category)&&(!type||m.type===type));
    $('#movement-heading').textContent=category?`Movimientos · ${category}`:type==='income'?'Ingresos del mes':type==='expense'?'Gastos del mes':'Movimientos del mes';$('#movement-count').textContent=`${filtered.length} movimientos`;
    const map=accountMap();$('#movements').innerHTML=filtered.length?filtered.map(m=>`<div class="transaction-row" data-type="${m.type}"><span class="transaction-icon" aria-hidden="true">${m.type==='transfer'?'⇄':m.type==='income'?'↙':'↗'}</span><div><strong>${esc(m.description)}</strong><small>${esc(m.date)} · ${esc(m.category)} · ${esc(map.get(m.account_id)?.name||'')}${m.destination_id?' → '+esc(map.get(m.destination_id)?.name||''):''}</small></div><b>${m.type==='income'?'+':m.type==='expense'?'−':''}${money(m.amount_cents)}</b><button type="button" class="movement-delete" data-delete="${m.id}" aria-label="Eliminar ${esc(m.description)}">×</button></div>`).join(''):'<p class="chart-empty">No hay movimientos con esta selección.</p>';
    $('#movements').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('¿Eliminar este movimiento y recalcular los saldos?'))return;b.disabled=true;try{await api('/api/finance/movements/'+b.dataset.delete,'DELETE');await load();}catch(e){$('#finance-status').textContent=e.message;b.disabled=false;}}));
    $('#clear-filters').hidden=!category&&!type&&!$('#account-filter').value;
    const budgets=state.budgets.filter(b=>b.currency===$('#currency').value&&b.month===$('#month').value);
    $('#budgets').innerHTML=budgets.length?budgets.map(b=>{const spent=allPeriod.filter(m=>m.type==='expense'&&m.category===b.category).reduce((n,m)=>n+m.amount_cents,0);return `<div class="budget-card"><div class="budget-title"><b>${esc(b.category)}</b><span>${money(spent)} / ${money(b.limit_cents)}</span></div><progress value="${Math.min(spent,b.limit_cents)}" max="${b.limit_cents}" aria-label="Presupuesto de ${esc(b.category)}"></progress><small>${spent>b.limit_cents?money(spent-b.limit_cents)+' por encima del límite':money(b.limit_cents-spent)+' disponibles'} · Todas las cuentas</small></div>`;}).join(''):'<p class="chart-empty">Define un presupuesto para una categoría de este mes.</p>';
  }
  async function load(){
    if(refreshing)return;refreshing=true;$('#finance-status').textContent='Cargando tus finanzas…';$('#finance-error').hidden=true;
    try{state=await api();ready=true;const current=$('#account-filter').value;$('#account-filter').innerHTML='<option value="">Todas las cuentas</option>'+visibleAccounts().map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');if(visibleAccounts().some(a=>a.id===current))$('#account-filter').value=current;render();$('#finance-content').hidden=false;$('#finance-status').textContent='';}
    catch(e){$('#finance-error p').textContent=e.message;$('#finance-error').hidden=false;$('#finance-status').textContent='';}
    finally{refreshing=false;$('#add-movement').disabled=!ready||!visibleAccounts().length;}
  }
  const dialog=$('#finance-dialog'),form=$('#finance-form');
  function open(mode){
    formMode=mode;$('#form-status').textContent='';const accounts=visibleAccounts();
    const accountOptions=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    const amountField=(name,label,minimum='0.01')=>`<label>${label}<input type="number" inputmode="decimal" name="${name}" min="${minimum}" max="100000000" step="0.01" required></label>`;
    const categoryField='<label class="full-field">Categoría<input name="category" maxlength="50" list="category-options" required><datalist id="category-options">'+[...new Set([...categories,...state.movements.map(m=>m.category)])].map(c=>`<option value="${esc(c)}"></option>`).join('')+'</datalist></label>';
    if(mode==='account'){$('#dialog-title').textContent='Añadir cuenta';$('#form-fields').innerHTML='<label class="full-field">Nombre<input name="name" maxlength="60" required placeholder="Ej.: Cuenta principal"></label><label>Tipo<select name="kind"><option value="spending">Uso diario</option><option value="savings">Ahorro</option></select></label><label>Moneda<select name="currency"><option value="HNL">HNL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>'+amountField('opening','Saldo inicial','0');form.elements.currency.value=$('#currency').value;form.elements.opening.value='0';}
    else if(mode==='budget'){$('#dialog-title').textContent='Definir presupuesto del mes';$('#form-fields').innerHTML=categoryField+amountField('limit','Límite · '+$('#currency').value);}
    else{$('#dialog-title').textContent='Registrar movimiento';$('#form-fields').innerHTML='<label>Tipo<select name="type"><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="transfer">Transferencia</option></select></label>'+amountField('amount','Importe · '+$('#currency').value)+'<label class="full-field">Descripción<input name="description" maxlength="120" required></label><label>Cuenta<select name="account_id">'+accountOptions+'</select></label><label>Fecha<input type="date" name="date" required></label>'+categoryField+'<label class="full-field" id="destination-field" hidden>Cuenta de destino<select name="destination_id">'+accountOptions+'</select></label>';form.elements.date.value=isoToday();form.elements.category.value='Otros';if($('#account-filter').value)form.elements.account_id.value=$('#account-filter').value;form.elements.type.addEventListener('change',()=>{const transfer=form.elements.type.value==='transfer';$('#destination-field').hidden=!transfer;form.elements.category.disabled=transfer;});}
    window.mountAtlasSelects?.(form);window.mountAtlasDates?.(form);
    dialog.showModal();form.querySelector('input:not(.atlas-select-native):not(.atlas-date-native),.atlas-select-trigger,.atlas-date-trigger')?.focus();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;let endpoint,data;
    try{if(formMode==='account'){endpoint='/api/finance/accounts';data={name:form.elements.name.value.trim(),kind:form.elements.kind.value,currency:form.elements.currency.value,opening_cents:cents(form.elements.opening.value)};}
    else if(formMode==='budget'){endpoint='/api/finance/budgets';data={month:$('#month').value,currency:$('#currency').value,category:form.elements.category.value.trim(),limit_cents:cents(form.elements.limit.value)};}
    else{endpoint='/api/finance/movements';data={type:form.elements.type.value,amount_cents:cents(form.elements.amount.value),description:form.elements.description.value.trim(),account_id:form.elements.account_id.value,date:form.elements.date.value,category:form.elements.category.value.trim(),destination_id:form.elements.destination_id.value};}}
    catch(e){$('#form-status').textContent=e.message;return;}
    busy=true;$('#form-status').textContent='Guardando…';form.setAttribute('aria-busy','true');dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
    try{await api(endpoint,formMode==='budget'?'PUT':'POST',data);dialog.close();await load();}
    catch(e){$('#form-status').textContent=e.message;}
    finally{busy=false;form.removeAttribute('aria-busy');dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);if(formMode==='movement'&&form.elements.type.value==='transfer')form.elements.category.disabled=true;}
  });
  dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)dialog.close();}));dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#add-account').addEventListener('click',()=>open('account'));$('#add-movement').addEventListener('click',()=>open('movement'));$('#add-budget').addEventListener('click',()=>open('budget'));
  $('#retry-finances').addEventListener('click',load);
  $('#month').addEventListener('change',()=>{if(!$('#month').value)$('#month').value=isoToday().slice(0,7);category='';type='';render();});
  $('#account-filter').addEventListener('change',()=>{category='';type='';render();});
  $('#currency').addEventListener('change',()=>{category='';type='';$('#account-filter').innerHTML='<option value="">Todas las cuentas</option>'+visibleAccounts().map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');render();});
  $('#clear-filters').addEventListener('click',()=>{category='';type='';$('#account-filter').value='';render();});
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>showDetail(b.dataset.detail)));
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='atlas-finance-refresh'){window.closeAtlasSelectPopup?.();window.closeAtlasDatePopup?.();load();window.AtlasGoal.mount($('#finance-goal'));}});
  $('#add-movement').disabled=true;load();
})();
