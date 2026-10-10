'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const root = document.documentElement;
  const money = cents => 'L ' + new Intl.NumberFormat('es-HN', {minimumFractionDigits:2, maximumFractionDigits:2}).format(cents / 100);
  const seed = [
    {description:'Salario de octubre', amount:1800000, type:'income', category:'Ingreso', account:'bank', date:'01 oct'},
    {description:'Alquiler', amount:450000, type:'expense', category:'Vivienda', account:'bank', date:'02 oct'},
    {description:'Compra de la semana', amount:185000, type:'expense', category:'Alimentación', account:'bank', date:'05 oct'},
    {description:'Transporte del mes', amount:90000, type:'expense', category:'Transporte', account:'bank', date:'07 oct'},
    {description:'Herramientas de estudio', amount:100000, type:'expense', category:'Herramientas', account:'bank', date:'09 oct'},
  ];
  const budgets = [['Alimentación',300000],['Transporte',100000],['Herramientas',150000]];
  const descriptions = {
    classic:'Aero clásico · Cristal y reflejos como punto de referencia para comparar los nuevos marcos.',
    titanium:'Titanio · Un marco de doble bisel, pequeñas fijaciones y una cabecera ensamblada. El contenido conserva su Aero.',
    sentinel:'Centinela · Esquinas acorazadas, rieles segmentados y líneas de luz que siguen la paleta de Atlas.',
  };
  const names = {classic:'AERO CLÁSICO',titanium:'TITANIO',sentinel:'CENTINELA'};
  let transactions = seed.map(t => ({...t}));
  let toastTimer;
  let financeTab = 'overview';
  function notify(text) {
    clearTimeout(toastTimer);
    $('#demo-toast').textContent = text;
    $('#demo-toast').hidden = false;
    toastTimer = setTimeout(() => { $('#demo-toast').hidden = true; }, 4500);
  }
  document.querySelectorAll('[data-frame-choice]').forEach(button => button.addEventListener('click', () => {
    root.dataset.frame = button.dataset.frameChoice;
    document.querySelectorAll('[data-frame-choice]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    $('#frame-description').textContent = descriptions[root.dataset.frame];
    $('#selected-frame-label').textContent = names[root.dataset.frame];
  }));
  $('#palette').addEventListener('change', event => {
    const palette = event.target.value;
    root.dataset.variant = palette === 'light' ? 'light' : 'night';
    root.dataset.theme = palette === 'light' ? 'light' : 'dark';
    root.dataset.palette = palette === 'light' ? '' : palette;
  });
  function accountBalance(account) {
    return (account === 'bank' ? 1300000 : 100000) + transactions.filter(t => t.account === account).reduce((sum,t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }
  function transactionRow(transaction) {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.dataset.type = transaction.type;
    const icon = document.createElement('span'); icon.className = 'transaction-icon'; icon.textContent = transaction.type === 'income' ? '↙' : '↗'; icon.setAttribute('aria-hidden','true');
    const content = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = transaction.description;
    const meta = document.createElement('small'); meta.textContent = `${transaction.date} · ${transaction.category} · ${transaction.account === 'bank' ? 'Cuenta principal' : 'Efectivo'}`;
    const amount = document.createElement('b'); amount.textContent = (transaction.type === 'income' ? '+' : '−') + money(transaction.amount);
    content.append(title,meta); row.append(icon,content,amount); return row;
  }
  function renderFinances() {
    const income = transactions.filter(t => t.type === 'income').reduce((sum,t) => sum + t.amount,0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum,t) => sum + t.amount,0);
    const total = accountBalance('bank') + accountBalance('cash') + 400000;
    $('#balance-total').textContent = money(total);
    $('#net-worth').textContent = money(total - 450000);
    $('#bank-total').textContent = money(accountBalance('bank'));
    $('#cash-total').textContent = money(accountBalance('cash'));
    $('#income-total').textContent = money(income);
    $('#expense-total').textContent = money(expense);
    $('#month-total').textContent = (income >= expense ? '+' : '−') + money(Math.abs(income - expense));
    $('#donut-total').textContent = money(expense).replace('.00','');
    const ordered = [...transactions].reverse();
    $('#recent-transactions').replaceChildren(...ordered.slice(0,3).map(transactionRow));
    $('#all-transactions').replaceChildren(...ordered.map(transactionRow));
    const categories = new Map();
    transactions.filter(t => t.type === 'expense').forEach(t => categories.set(t.category,(categories.get(t.category) || 0) + t.amount));
    const colors = [90,70,50,32,18].map(percent => `color-mix(in srgb, var(--accent) ${percent}%, var(--text-muted))`);
    $('#spending-legend').replaceChildren(); $('#donut-segments').replaceChildren();
    let offset = 0;
    [...categories.entries()].sort((a,b) => b[1]-a[1]).forEach(([category,amount],i) => {
      const color = colors[Math.min(i,colors.length-1)];
      const legend = document.createElement('div'); legend.className = 'legend-row'; legend.style.setProperty('--slice-color',color);
      const dot = document.createElement('i'); dot.className = 'legend-dot'; dot.setAttribute('aria-hidden','true');
      const name = document.createElement('span'); name.textContent = category;
      const value = document.createElement('b'); value.textContent = Math.round(amount / expense * 100) + '%';
      legend.append(dot,name,value); $('#spending-legend').append(legend);
      const length = amount / expense * Math.PI * 90;
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      for (const [key,value] of Object.entries({cx:60,cy:60,r:45,'stroke-dasharray':`${Math.max(0,length-2)} ${Math.PI*90}`,'stroke-dashoffset':-offset})) circle.setAttribute(key,value);
      circle.style.stroke = color; $('#donut-segments').append(circle); offset += length;
    });
    $('#budget-list').replaceChildren();
    budgets.forEach(([category,limit]) => {
      const spent = categories.get(category) || 0;
      const card = document.createElement('section'); card.className = 'budget-card';
      const heading = document.createElement('div'); heading.className = 'budget-title';
      const title = document.createElement('b'); title.textContent = category;
      const summary = document.createElement('span'); summary.textContent = `${money(spent)} / ${money(limit)}`; heading.append(title,summary);
      const progress = document.createElement('progress'); progress.max = limit; progress.value = Math.min(spent,limit); progress.setAttribute('aria-label',`Presupuesto de ${category}`);
      const note = document.createElement('small'); note.textContent = spent > limit ? `${money(spent-limit)} por encima del límite` : `${money(limit-spent)} disponibles`;
      card.append(heading,progress,note); $('#budget-list').append(card);
    });
  }
  function setFinanceTab(tab) {
    financeTab = tab;
    ['overview','transactions','budgets'].forEach(name => {
      $('#finance-' + name).hidden = name !== tab;
      $(`[data-finance-tab="${name}"]`).setAttribute('aria-pressed',String(name === tab));
    });
  }
  document.querySelectorAll('[data-finance-tab]').forEach(b => b.addEventListener('click', () => setFinanceTab(b.dataset.financeTab)));
  $('#view-transactions').addEventListener('click', () => setFinanceTab('transactions'));
  document.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => {
    const finance = b.dataset.section === 'finance';
    $('#finance-view').hidden = !finance; $('#learning-view').hidden = finance;
    $('#window-title').textContent = finance ? 'Finanzas personales' : b.textContent.trim();
    $('#taskbar-title').textContent = $('#window-title').textContent;
    $('#window-icon').setAttribute('href',finance ? '#wallet-icon' : '../aero-icons.svg#knowledge');
    document.querySelectorAll('[data-section]').forEach(nav => {
      nav.classList.toggle('is-active',nav === b); nav.removeAttribute('aria-current');
    });
    b.setAttribute('aria-current','page');
    restoreWindow();
  }));
  const mainWindow = $('#main-window');
  const minimize = $('[data-window-action="minimize"]');
  const maximize = $('[data-window-action="maximize"]');
  function updateWindowLabels() {
    const title = $('#window-title').textContent;
    minimize.setAttribute('aria-label',`${mainWindow.classList.contains('is-minimized') ? 'Restaurar' : 'Minimizar'} ventana de ${title}`);
    minimize.textContent = mainWindow.classList.contains('is-minimized') ? '□' : '−';
    maximize.setAttribute('aria-label',`${$('.preview-workspace').classList.contains('main-maximized') ? 'Restaurar tamaño de' : 'Ampliar'} ventana de ${title}`);
  }
  function restoreWindow() { mainWindow.classList.remove('is-minimized'); updateWindowLabels(); }
  minimize.addEventListener('click', () => {mainWindow.classList.toggle('is-minimized');updateWindowLabels();});
  maximize.addEventListener('click', () => {
    restoreWindow(); const expanded = $('.preview-workspace').classList.toggle('main-maximized');
    maximize.setAttribute('aria-pressed',String(expanded)); updateWindowLabels();
  });
  $('#restore-main').addEventListener('click',restoreWindow);
  $('#toggle-goal').addEventListener('click',event => {
    $('#goal-body').hidden = !$('#goal-body').hidden;
    event.currentTarget.setAttribute('aria-expanded',String(!$('#goal-body').hidden));
    event.currentTarget.setAttribute('aria-label',$('#goal-body').hidden ? 'Expandir meta' : 'Contraer meta');
    event.currentTarget.textContent = $('#goal-body').hidden ? '+' : '−';
  });
  const dialog = $('#transaction-dialog'); const form = $('#transaction-form');
  $('#add-transaction').addEventListener('click', () => {form.reset(); $('#form-error').hidden = true; form.elements.category.disabled = false; dialog.showModal(); form.elements.amount.focus();});
  [$('#close-transaction'),$('#cancel-transaction')].forEach(b => b.addEventListener('click',() => dialog.close()));
  form.elements.type.addEventListener('change', () => {form.elements.category.disabled = form.elements.type.value === 'income';});
  form.addEventListener('submit',event => {
    event.preventDefault();
    const fields = new FormData(form); const amount = Math.round(Number(fields.get('amount')) * 100); const description = String(fields.get('description')).trim();
    const type = fields.get('type'); const account = fields.get('account');
    let error = '';
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000 || !description) error = 'Indica una descripción y un importe válido.';
    else if (type === 'expense' && amount > accountBalance(account)) error = 'El gasto supera el saldo de esta cuenta de muestra.';
    if(error) { $('#form-error').textContent = error; $('#form-error').hidden = false; return; }
    transactions.push({amount,description,type,account,category:type === 'income' ? 'Ingreso' : fields.get('category'),date:'10 oct'});
    renderFinances(); setFinanceTab(financeTab); dialog.close(); notify('Movimiento añadido a la muestra. Los saldos y presupuestos se actualizaron.');
  });
  $('#reset-demo').addEventListener('click', () => {transactions = seed.map(t => ({...t})); renderFinances(); notify('Datos de muestra restablecidos.');});
  renderFinances();
})();
