'use strict';
// ============================================================
// BLOCK EDITOR — slash commands, contenteditable, sub-pages
// ============================================================
window.BlockEditor = (() => {

  const CMDS = [
    { type:'text',     label:'Texto',          desc:'Párrafo normal',       icon:'¶'   },
    { type:'h1',       label:'Encabezado 1',   desc:'Título grande',        icon:'H1'  },
    { type:'h2',       label:'Encabezado 2',   desc:'Título mediano',       icon:'H2'  },
    { type:'h3',       label:'Encabezado 3',   desc:'Título pequeño',       icon:'H3'  },
    { type:'h4',       label:'Encabezado 4',   desc:'Título mínimo',        icon:'H4'  },
    { type:'bullet',   label:'Lista •',        desc:'Lista con viñetas',    icon:'•'   },
    { type:'numbered', label:'Lista 1.',       desc:'Lista numerada',       icon:'1.'  },
    { type:'todo',     label:'Tarea',          desc:'Checkbox de tarea',    icon:'☐'   },
    { type:'toggle',   label:'Toggle ▶',       desc:'Bloque colapsable',    icon:'▶'   },
    { type:'code',     label:'Código',         desc:'Bloque de código',     icon:'</>' },
    { type:'quote',    label:'Cita',           desc:'Blockquote',           icon:'"'   },
    { type:'divider',  label:'Divisor',        desc:'Línea horizontal',     icon:'—'   },
    { type:'page',     label:'Sub-página',     desc:'Crear página hija',    icon:'⬡'   },
  ];

  const PLACEHOLDER = {
    text:     "Escribe algo, o '/' para comandos…",
    h1:'Encabezado 1', h2:'Encabezado 2', h3:'Encabezado 3', h4:'Encabezado 4',
    bullet:'Elemento de lista', numbered:'Elemento numerado',
    todo:'Tarea pendiente', toggle:'Título del toggle',
    code:'// código aquí', quote:'Cita…', divider:'', page:'Nombre de la sub-página',
  };

  let container, syncTarget, menuEl, onPageCreate;
  let _blocks = [];
  let slashBlockId = null, slashFilter = '', menuIdx = 0;

  // ---- UTILS ----
  function uid() { return 'b' + Math.random().toString(36).slice(2, 9); }

  // ---- MARKDOWN ↔ BLOCKS ----
  function mdToBlocks(md) {
    if (!md || !md.trim()) return [{ id:uid(), type:'text', content:'', checked:false }];
    const lines = md.split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if      (l.startsWith('#### '))  { blocks.push({ id:uid(), type:'h4', content:l.slice(5) }); }
      else if (l.startsWith('### '))   { blocks.push({ id:uid(), type:'h3', content:l.slice(4) }); }
      else if (l.startsWith('## '))    { blocks.push({ id:uid(), type:'h2', content:l.slice(3) }); }
      else if (l.startsWith('# '))     { blocks.push({ id:uid(), type:'h1', content:l.slice(2) }); }
      else if (l.startsWith('- [x] ')) { blocks.push({ id:uid(), type:'todo', content:l.slice(6), checked:true }); }
      else if (l.startsWith('- [ ] ')) { blocks.push({ id:uid(), type:'todo', content:l.slice(6), checked:false }); }
      else if (l.startsWith('- '))     { blocks.push({ id:uid(), type:'bullet', content:l.slice(2) }); }
      else if (/^\d+\. /.test(l))      { blocks.push({ id:uid(), type:'numbered', content:l.replace(/^\d+\. /, '') }); }
      else if (l.startsWith('> '))     { blocks.push({ id:uid(), type:'quote', content:l.slice(2) }); }
      else if (l === '---')            { blocks.push({ id:uid(), type:'divider', content:'' }); }
      else if (l.startsWith('```')) {
        const lang = l.slice(3).trim();
        const code = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
        blocks.push({ id:uid(), type:'code', content:code.join('\n'), lang });
      }
      else if (/^\[\[.+\]\]$/.test(l.trim())) {
        blocks.push({ id:uid(), type:'page', content:l.trim().slice(2, -2) });
      }
      else if (l.trim() === '') { /* skip blank lines */ }
      else { blocks.push({ id:uid(), type:'text', content:l }); }
      i++;
    }
    return blocks.length ? blocks : [{ id:uid(), type:'text', content:'', checked:false }];
  }

  function blocksToMd() {
    const parts = [];
    for (const b of _blocks) {
      const c = readContent(b.id) ?? b.content ?? '';
      switch (b.type) {
        case 'h1': parts.push('# ' + c); break;
        case 'h2': parts.push('## ' + c); break;
        case 'h3': parts.push('### ' + c); break;
        case 'h4': parts.push('#### ' + c); break;
        case 'bullet': parts.push('- ' + c); break;
        case 'numbered': parts.push('1. ' + c); break;
        case 'todo': {
          const cb = container.querySelector(`[data-id="${b.id}"] input[type=checkbox]`);
          const chk = cb ? cb.checked : (b.checked || false);
          parts.push(`- [${chk ? 'x' : ' '}] ${c}`);
          break;
        }
        case 'quote': parts.push('> ' + c); break;
        case 'code': {
          const ta = container.querySelector(`[data-id="${b.id}"] .eb-code`);
          const code = ta ? ta.value : c;
          parts.push('```' + (b.lang || '') + '\n' + code + '\n```');
          break;
        }
        case 'divider': parts.push('---'); break;
        case 'page': parts.push('[[' + c + ']]'); break;
        case 'toggle': parts.push('> **' + c + '**'); break;
        default: if (c.trim()) parts.push(c);
      }
    }
    return parts.join('\n\n');
  }

  function readContent(id) {
    const el = container.querySelector(`[data-id="${id}"] .eb-content`);
    return el ? el.textContent : null;
  }

  // ---- RENDER ALL BLOCKS ----
  function render() {
    container.innerHTML = '';
    for (const b of _blocks) container.appendChild(makeEl(b));
    if (_blocks.length === 0) {
      _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
      container.appendChild(makeEl(_blocks[0]));
    }
  }

  // ---- BUILD ONE BLOCK ELEMENT ----
  function makeEl(b) {
    const wrap = document.createElement('div');
    wrap.className = `eb eb--${b.type}`;
    wrap.dataset.id = b.id;
    wrap.dataset.type = b.type;

    // Type badge (click to convert)
    const badge = document.createElement('span');
    badge.className = 'eb-badge';
    badge.title = 'Convertir bloque';
    badge.addEventListener('mousedown', e => { e.preventDefault(); openConvertMenu(b.id, badge); });
    wrap.appendChild(badge);

    if (b.type === 'divider') {
      const hr = document.createElement('hr');
      hr.className = 'eb-divider';
      wrap.appendChild(hr);
      wrap.addEventListener('click', () => {
        const idx = _blocks.findIndex(x => x.id === b.id);
        if (idx === _blocks.length - 1) addBlockAfter(b.id, 'text');
      });
      return wrap;
    }

    if (b.type === 'code') {
      const header = document.createElement('div');
      header.className = 'eb-code-header';
      const langInput = document.createElement('input');
      langInput.className = 'eb-code-lang';
      langInput.value = b.lang || '';
      langInput.placeholder = 'lenguaje…';
      langInput.addEventListener('input', sync);
      header.appendChild(langInput);
      wrap.appendChild(header);

      const ta = document.createElement('textarea');
      ta.className = 'eb-code';
      ta.value = b.content || '';
      ta.spellcheck = false;
      ta.rows = Math.max(3, (b.content || '').split('\n').length + 1);
      ta.addEventListener('input', () => { ta.rows = Math.max(3, ta.value.split('\n').length + 1); sync(); });
      ta.addEventListener('keydown', e => {
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(s); ta.selectionStart = ta.selectionEnd = s + 2; }
      });
      wrap.appendChild(ta);
      return wrap;
    }

    if (b.type === 'todo') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'eb-checkbox';
      cb.checked = b.checked || false;
      cb.addEventListener('change', () => { b.checked = cb.checked; sync(); });
      wrap.appendChild(cb);
    }

    if (b.type === 'toggle') {
      const arrow = document.createElement('span');
      arrow.className = 'eb-toggle-arrow';
      arrow.textContent = '▶';
      arrow.addEventListener('click', () => wrap.classList.toggle('eb--open'));
      wrap.appendChild(arrow);

      const inner = document.createElement('div');
      inner.className = 'eb-toggle-body';
      inner.textContent = '(contenido del toggle)';
      wrap.appendChild(inner);
    }

    if (b.type === 'page') {
      // Sub-page link block
      const link = document.createElement('div');
      link.className = 'eb-page-link';
      link.dataset.pageTitle = b.content || '';
      link.innerHTML = `<span class="eb-page-icon">⬡</span><span class="eb-page-name">${escHtml(b.content || 'Sin título')}</span>`;
      link.addEventListener('click', () => {
        if (b.pageId) window._loadEntryById && window._loadEntryById(b.pageId);
      });
      wrap.appendChild(link);
      return wrap;
    }

    const div = document.createElement('div');
    div.className = 'eb-content';
    div.contentEditable = 'true';
    div.dataset.placeholder = PLACEHOLDER[b.type] || '';
    div.textContent = b.content || '';

    div.addEventListener('keydown', e => onKeydown(e, b, div));
    div.addEventListener('input',   () => onInput(b, div));
    div.addEventListener('focus',   () => wrap.classList.add('eb--focused'));
    div.addEventListener('blur',    () => { wrap.classList.remove('eb--focused'); sync(); });
    wrap.appendChild(div);
    return wrap;
  }

  // ---- BLOCK OPERATIONS ----
  function addBlockAfter(afterId, type, content = '') {
    const idx = _blocks.findIndex(b => b.id === afterId);
    const nb = { id: uid(), type, content, checked: false };
    _blocks.splice(idx + 1, 0, nb);
    const afterEl = container.querySelector(`[data-id="${afterId}"]`);
    const newEl = makeEl(nb);
    afterEl.after(newEl);
    const c = newEl.querySelector('.eb-content');
    if (c) { c.focus(); placeCursorEnd(c); }
    sync();
    return nb;
  }

  function deleteBlock(id) {
    const idx = _blocks.findIndex(b => b.id === id);
    if (_blocks.length <= 1) { clearBlock(id); return; }
    _blocks.splice(idx, 1);
    const el = container.querySelector(`[data-id="${id}"]`);
    const prevId = _blocks[Math.max(0, idx - 1)].id;
    el.remove();
    const prevC = container.querySelector(`[data-id="${prevId}"] .eb-content`);
    if (prevC) { prevC.focus(); placeCursorEnd(prevC); }
    sync();
  }

  function clearBlock(id) {
    const el = container.querySelector(`[data-id="${id}"] .eb-content`);
    if (el) el.textContent = '';
    sync();
  }

  function convertBlock(id, newType) {
    const b = _blocks.find(b => b.id === id);
    if (!b) return;
    b.content = readContent(id) ?? b.content;
    b.type = newType;
    const old = container.querySelector(`[data-id="${id}"]`);
    const newEl = makeEl(b);
    old.replaceWith(newEl);
    const c = newEl.querySelector('.eb-content');
    if (c) { c.focus(); placeCursorEnd(c); }
    sync();
  }

  // ---- CONVERT MENU (click badge) ----
  let convertMenu = null;
  function openConvertMenu(blockId, anchor) {
    closeConvertMenu();
    const m = document.createElement('div');
    m.className = 'eb-convert-menu';
    const rect = anchor.getBoundingClientRect();
    m.style.top = (rect.bottom + 4) + 'px';
    m.style.left = rect.left + 'px';
    m.innerHTML = CMDS.filter(c => c.type !== 'page' && c.type !== 'divider').map(c =>
      `<div class="eb-convert-item" data-type="${c.type}"><span>${c.icon}</span>${c.label}</div>`
    ).join('');
    m.querySelectorAll('.eb-convert-item').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); convertBlock(blockId, el.dataset.type); closeConvertMenu(); });
    });
    document.body.appendChild(m);
    convertMenu = m;
    setTimeout(() => document.addEventListener('mousedown', closeConvertMenu, { once: true }), 0);
  }
  function closeConvertMenu() { if (convertMenu) { convertMenu.remove(); convertMenu = null; } }

  // ---- CURSOR ----
  function placeCursorEnd(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // ---- KEYDOWN ----
  function onKeydown(e, b, div) {
    // Slash menu navigation
    if (slashBlockId === b.id) {
      if (e.key === 'ArrowDown') { e.preventDefault(); menuIdx = Math.min(menuIdx + 1, visibleCmds().length - 1); renderMenu(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); menuIdx = Math.max(menuIdx - 1, 0); renderMenu(); return; }
      if (e.key === 'Enter')     { e.preventDefault(); selectCmd(visibleCmds()[menuIdx]?.type, b.id); return; }
      if (e.key === 'Escape')    { hideMenu(); return; }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hideMenu();
      const continueTypes = ['bullet', 'numbered', 'todo'];
      const nextType = continueTypes.includes(b.type) ? b.type : 'text';
      // If current is empty list item, convert to text instead
      if (continueTypes.includes(b.type) && div.textContent === '') {
        convertBlock(b.id, 'text'); return;
      }
      addBlockAfter(b.id, nextType);
      return;
    }

    if (e.key === 'Backspace' && div.textContent === '') {
      e.preventDefault();
      hideMenu();
      if (b.type !== 'text') { convertBlock(b.id, 'text'); return; }
      deleteBlock(b.id);
      return;
    }
  }

  // ---- INPUT (slash detection) ----
  function onInput(b, div) {
    const text = div.textContent;
    const slashIdx = text.lastIndexOf('/');
    if (slashIdx !== -1 && (slashIdx === 0 || /\s/.test(text[slashIdx - 1]))) {
      slashBlockId = b.id;
      slashFilter = text.slice(slashIdx + 1).toLowerCase();
      menuIdx = 0;
      showMenu(div);
    } else if (slashBlockId === b.id && !text.includes('/')) {
      hideMenu();
    } else if (slashBlockId === b.id) {
      slashFilter = text.slice(text.lastIndexOf('/') + 1).toLowerCase();
      menuIdx = 0;
      renderMenu();
    }
    sync();
  }

  // ---- SLASH MENU ----
  function visibleCmds() {
    if (!slashFilter) return CMDS;
    return CMDS.filter(c =>
      c.label.toLowerCase().includes(slashFilter) ||
      c.type.toLowerCase().includes(slashFilter) ||
      c.desc.toLowerCase().includes(slashFilter)
    );
  }

  function showMenu(div) {
    positionMenu(div);
    menuEl.classList.remove('hidden');
    renderMenu();
  }

  function hideMenu() {
    menuEl.classList.add('hidden');
    slashBlockId = null;
    slashFilter = '';
    menuIdx = 0;
  }

  function positionMenu(div) {
    const rect = div.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    const mw = 280, mh = 260;
    if (top + mh > window.innerHeight) top = rect.top - mh - 4;
    if (left + mw > window.innerWidth) left = window.innerWidth - mw - 8;
    menuEl.style.top  = top + 'px';
    menuEl.style.left = left + 'px';
  }

  function renderMenu() {
    const cmds = visibleCmds();
    if (!cmds.length) {
      menuEl.innerHTML = '<div class="slash-empty">Sin resultados</div>';
      return;
    }
    menuEl.innerHTML = cmds.map((c, i) => `
      <div class="slash-item ${i === menuIdx ? 'slash-item--active' : ''}" data-type="${c.type}">
        <span class="slash-icon">${c.icon}</span>
        <div class="slash-text">
          <span class="slash-label">${c.label}</span>
          <span class="slash-desc">${c.desc}</span>
        </div>
      </div>
    `).join('');
    menuEl.querySelectorAll('.slash-item').forEach((el, i) => {
      el.addEventListener('mousedown', e => { e.preventDefault(); selectCmd(cmds[i].type, slashBlockId); });
      el.addEventListener('mouseover', () => { menuIdx = i; renderMenu(); });
    });
  }

  function selectCmd(type, blockId) {
    if (!type || !blockId) { hideMenu(); return; }
    // Strip the /filter from block content
    const el = container.querySelector(`[data-id="${blockId}"] .eb-content`);
    if (el) {
      const text = el.textContent;
      const si = text.lastIndexOf('/');
      el.textContent = text.slice(0, si);
    }
    hideMenu();

    if (type === 'divider') {
      convertBlock(blockId, 'divider');
      addBlockAfter(blockId, 'text');
      return;
    }

    if (type === 'page') {
      // Will open the page name modal
      if (onPageCreate) {
        const pageName = window._promptPageName ? window._promptPageName(blockId) : null;
        if (pageName === null) {
          // Async — will resolve via callback
        }
      }
      return;
    }

    convertBlock(blockId, type);
  }

  // ---- SYNC TO TEXTAREA ----
  function sync() {
    if (syncTarget) syncTarget.value = blocksToMd();
  }

  // ---- HTML ESCAPE ----
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ---- PUBLIC API ----
  function init(opts) {
    container   = opts.container;
    syncTarget  = opts.syncTarget;
    onPageCreate = opts.onPageCreate || null;
    menuEl      = opts.menuEl;

    _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
    render();

    document.addEventListener('mousedown', e => {
      if (menuEl && !menuEl.contains(e.target)) hideMenu();
    });
  }

  function loadMarkdown(md) {
    _blocks = mdToBlocks(md);
    render();
    sync();
  }

  function getMarkdown() {
    sync();
    return syncTarget ? syncTarget.value : blocksToMd();
  }

  function addPageBlock(blockId, pageName, pageId) {
    const b = _blocks.find(b => b.id === blockId);
    if (b) {
      b.type = 'page';
      b.content = pageName;
      b.pageId = pageId;
      const old = container.querySelector(`[data-id="${blockId}"]`);
      const newEl = makeEl(b);
      old.replaceWith(newEl);
    } else {
      // Add at end
      const last = _blocks[_blocks.length - 1];
      const nb = { id: uid(), type: 'page', content: pageName, pageId };
      _blocks.push(nb);
      container.appendChild(makeEl(nb));
    }
    addBlockAfter(b ? blockId : _blocks[_blocks.length - 1].id, 'text');
    sync();
  }

  function focusFirst() {
    const first = container.querySelector('.eb-content, .eb-code');
    if (first) { first.focus(); if (first.classList.contains('eb-content')) placeCursorEnd(first); }
  }

  return { init, loadMarkdown, getMarkdown, addPageBlock, focusFirst };
})();
