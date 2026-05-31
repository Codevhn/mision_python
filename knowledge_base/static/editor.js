'use strict';
// ============================================================
// BLOCK EDITOR — factory, multiple instances, slash commands
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
    { type:'code',     label:'Código',         desc:'Bloque de código',     icon:'</>' },
    { type:'quote',    label:'Cita',           desc:'Blockquote',           icon:'"'   },
    { type:'divider',  label:'Divisor',        desc:'Línea horizontal',     icon:'—'   },
    { type:'page',     label:'Sub-página',     desc:'Crear página hija',    icon:'⬡'   },
  ];

  const PLACEHOLDER = {
    text:'Escribe algo, o \'/\' para comandos…',
    h1:'Encabezado 1', h2:'Encabezado 2', h3:'Encabezado 3', h4:'Encabezado 4',
    bullet:'Elemento de lista', numbered:'Elemento numerado',
    todo:'Tarea pendiente',
    code:'// código aquí', quote:'Cita…', divider:'', page:'Nombre de la sub-página',
  };

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function uid() { return 'b' + Math.random().toString(36).slice(2, 9); }

  // ── FACTORY ─────────────────────────────────────────────────────────────────
  function createInstance(opts) {
    const container    = opts.container;
    const syncTarget   = opts.syncTarget   || null;
    const menuEl       = opts.menuEl;
    const onPageCreate = opts.onPageCreate || null;
    const onChange     = opts.onChange     || null;

    let _blocks  = [];
    let _loading = false;   // true while loading md — prevents onChange feedback loop
    let slashBlockId = null, slashFilter = '', menuIdx = 0;
    let convertMenu = null;

    // ── HELPERS ─────────────────────────────────────────────────
    function isSpecialLine(l) {
      if (!l) return false;
      return /^#{1,4} /.test(l) || l.startsWith('- ') || l.startsWith('> ') ||
             l === '---' || l.startsWith('```') || /^\d+\. /.test(l) ||
             /^\[\[.+\]\]$/.test(l.trim());
    }

    // ── MD → BLOCKS ─────────────────────────────────────────────
    function mdToBlocks(md) {
      if (!md || !md.trim()) return [{ id:uid(), type:'text', content:'', checked:false }];
      const blocks = [];
      const lines = md.split('\n');
      let i = 0;

      while (i < lines.length) {
        const l = lines[i];

        // blank line → skip
        if (!l.trim()) { i++; continue; }

        // headings
        if (l.startsWith('#### '))  { blocks.push({ id:uid(), type:'h4', content:l.slice(5) }); i++; continue; }
        if (l.startsWith('### '))   { blocks.push({ id:uid(), type:'h3', content:l.slice(4) }); i++; continue; }
        if (l.startsWith('## '))    { blocks.push({ id:uid(), type:'h2', content:l.slice(3) }); i++; continue; }
        if (l.startsWith('# '))     { blocks.push({ id:uid(), type:'h1', content:l.slice(2) }); i++; continue; }

        // todo
        if (l.startsWith('- [x] ')) { blocks.push({ id:uid(), type:'todo', content:l.slice(6), checked:true  }); i++; continue; }
        if (l.startsWith('- [ ] ')) { blocks.push({ id:uid(), type:'todo', content:l.slice(6), checked:false }); i++; continue; }

        // list
        if (l.startsWith('- '))     { blocks.push({ id:uid(), type:'bullet',   content:l.slice(2) }); i++; continue; }
        if (/^\d+\. /.test(l))      { blocks.push({ id:uid(), type:'numbered', content:l.replace(/^\d+\. /, '') }); i++; continue; }

        // quote
        if (l.startsWith('> '))     { blocks.push({ id:uid(), type:'quote',   content:l.slice(2) }); i++; continue; }

        // divider
        if (l === '---' || l === '***') { blocks.push({ id:uid(), type:'divider', content:'' }); i++; continue; }

        // page link: [[title]] or [[title|entry-id]]
        if (/^\[\[.+\]\]$/.test(l.trim())) {
          const inner = l.trim().slice(2, -2);
          const pipe  = inner.lastIndexOf('|');
          const title  = pipe >= 0 ? inner.slice(0, pipe) : inner;
          const pageId = pipe >= 0 ? inner.slice(pipe + 1) : undefined;
          blocks.push({ id:uid(), type:'page', content:title, pageId }); i++; continue;
        }

        // code fence
        if (l.startsWith('```')) {
          const lang = l.slice(3).trim();
          const code = [];
          i++;
          while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
          if (lines[i] && lines[i].startsWith('```')) i++; // skip closing fence
          blocks.push({ id:uid(), type:'code', content:code.join('\n'), lang });
          continue;
        }

        // plain text paragraph — accumulate consecutive non-special, non-blank lines
        const paraLines = [l];
        i++;
        while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
          paraLines.push(lines[i]);
          i++;
        }
        blocks.push({ id:uid(), type:'text', content:paraLines.join('\n') });
      }

      return blocks.length ? blocks : [{ id:uid(), type:'text', content:'', checked:false }];
    }

    // ── BLOCKS → MD ─────────────────────────────────────────────
    function readContent(id) {
      const el = container.querySelector(`[data-id="${id}"] .eb-content`);
      if (!el) return null;
      // Use innerText to preserve \n in multi-line text blocks
      return (typeof el.innerText !== 'undefined') ? el.innerText : el.textContent;
    }

    function blocksToMd() {
      const parts = [];
      for (const b of _blocks) {
        const c = (readContent(b.id) ?? b.content ?? '').replace(/\n$/, ''); // trim trailing \n
        switch (b.type) {
          case 'h1': parts.push('# '  + c); break;
          case 'h2': parts.push('## ' + c); break;
          case 'h3': parts.push('### '+ c); break;
          case 'h4': parts.push('#### '+ c); break;
          case 'bullet':   parts.push('- ' + c); break;
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
          // Store pageId in markdown: [[title|page-id]]
          case 'page':    parts.push('[[' + c + (b.pageId ? '|' + b.pageId : '') + ']]'); break;
          default: if (c.trim()) parts.push(c);
        }
      }
      return parts.join('\n\n');
    }

    // ── RENDER ──────────────────────────────────────────────────
    function render() {
      container.innerHTML = '';
      for (const b of _blocks) container.appendChild(makeEl(b));
      if (_blocks.length === 0) {
        _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
        container.appendChild(makeEl(_blocks[0]));
      }
    }

    function makeEl(b) {
      const wrap = document.createElement('div');
      wrap.className = `eb eb--${b.type}`;
      wrap.dataset.id   = b.id;
      wrap.dataset.type = b.type;

      // Type badge
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
        ta.addEventListener('input', () => {
          ta.rows = Math.max(3, ta.value.split('\n').length + 1);
          sync();
        });
        ta.addEventListener('keydown', e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const s = ta.selectionStart;
            ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(s);
            ta.selectionStart = ta.selectionEnd = s + 2;
          }
          if (e.key === 'Escape') { focusNextBlock(b.id); }
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

      if (b.type === 'page') {
        const link = document.createElement('div');
        link.className = 'eb-page-link' + (b.pageId ? ' eb-page-navigable' : '');
        link.dataset.pageTitle = b.content || '';
        link.dataset.pageId    = b.pageId || '';
        link.title = b.pageId ? 'Clic para abrir esta página' : 'Sub-página';
        link.innerHTML = `<span class="eb-page-icon">⬡</span><span class="eb-page-name">${escHtml(b.content || 'Sin título')}</span><span class="eb-page-arrow">→</span>`;
        link.addEventListener('click', e => {
          e.stopPropagation();
          if (b.pageId && window._loadEntryById) window._loadEntryById(b.pageId);
        });
        wrap.appendChild(link);
        return wrap;
      }

      // Editable content div
      const div = document.createElement('div');
      div.className = 'eb-content';
      div.contentEditable = 'true';
      div.spellcheck = false;
      div.dataset.placeholder = PLACEHOLDER[b.type] || '';

      // Use innerText to correctly render \n as line breaks
      if (b.content) div.innerText = b.content;

      div.addEventListener('keydown', e => onKeydown(e, b, div));
      div.addEventListener('input',   () => onInput(b, div));
      div.addEventListener('focus',   () => wrap.classList.add('eb--focused'));
      div.addEventListener('blur',    () => { wrap.classList.remove('eb--focused'); sync(); });
      wrap.appendChild(div);
      return wrap;
    }

    // ── BLOCK OPS ───────────────────────────────────────────────
    function addBlockAfter(afterId, type, content = '', opts = {}) {
      const idx = _blocks.findIndex(b => b.id === afterId);
      const nb = { id: uid(), type, content, checked: false };
      _blocks.splice(idx + 1, 0, nb);
      const afterEl = container.querySelector(`[data-id="${afterId}"]`);
      const newEl = makeEl(nb);
      afterEl.after(newEl);
      const c = newEl.querySelector('.eb-content');
      if (c && !opts.noFocus) { c.focus(); placeCursorEnd(c); }
      sync();
      return nb;
    }

    function insertBlockBefore(beforeId, type, content = '') {
      const idx = _blocks.findIndex(b => b.id === beforeId);
      if (idx < 0) return;
      const nb = { id: uid(), type, content, checked: false };
      _blocks.splice(idx, 0, nb);
      const beforeEl = container.querySelector(`[data-id="${beforeId}"]`);
      const newEl = makeEl(nb);
      beforeEl.before(newEl);
      const c = newEl.querySelector('.eb-content');
      if (c) { c.focus(); placeCursorEnd(c); }
      sync();
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
      if (el) el.innerText = '';
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

    // ── CONVERT MENU ────────────────────────────────────────────
    function openConvertMenu(blockId, anchor) {
      closeConvertMenu();
      const m = document.createElement('div');
      m.className = 'eb-convert-menu';
      const rect = anchor.getBoundingClientRect();
      m.style.top  = (rect.bottom + 4) + 'px';
      m.style.left = rect.left + 'px';
      m.innerHTML = CMDS.filter(c => c.type !== 'page' && c.type !== 'divider').map(c =>
        `<div class="eb-convert-item" data-type="${c.type}"><span>${c.icon}</span>${c.label}</div>`
      ).join('');
      m.querySelectorAll('.eb-convert-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          convertBlock(blockId, el.dataset.type);
          closeConvertMenu();
        });
      });
      document.body.appendChild(m);
      convertMenu = m;
      setTimeout(() => document.addEventListener('mousedown', closeConvertMenu, { once: true }), 0);
    }
    function closeConvertMenu() { if (convertMenu) { convertMenu.remove(); convertMenu = null; } }

    // ── CURSOR UTILS ────────────────────────────────────────────
    function placeCursorEnd(el) {
      try {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch(e) {}
    }

    function placeCursorStart(el) {
      try {
        const r = document.createRange();
        r.setStart(el, 0);
        r.collapse(true);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch(e) {}
    }

    function isCursorAtStart(el) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return true;
      const range = sel.getRangeAt(0);
      if (range.startOffset !== 0) return false;
      // Check if startContainer is el or the very first text node
      let node = range.startContainer;
      while (node && node !== el) {
        if (node.previousSibling) return false;
        node = node.parentNode;
      }
      return true;
    }

    function isCursorAtEnd(el) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return true;
      const range = sel.getRangeAt(0);
      // Create a range at end of el and compare
      const endRange = document.createRange();
      endRange.selectNodeContents(el);
      endRange.collapse(false);
      return range.compareBoundaryPoints(Range.END_TO_END, endRange) >= 0;
    }

    function focusPrevBlock(id) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx <= 0) return;
      const prevId = _blocks[idx - 1].id;
      const prevEl = container.querySelector(`[data-id="${prevId}"] .eb-content`);
      if (prevEl) { prevEl.focus(); placeCursorEnd(prevEl); }
    }

    function focusNextBlock(id) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx >= _blocks.length - 1) return;
      const nextId = _blocks[idx + 1].id;
      const nextEl = container.querySelector(`[data-id="${nextId}"] .eb-content`);
      if (nextEl) { nextEl.focus(); placeCursorStart(nextEl); }
    }

    // ── KEYDOWN ─────────────────────────────────────────────────
    function onKeydown(e, b, div) {
      // Slash menu navigation
      if (slashBlockId === b.id) {
        if (e.key === 'ArrowDown') { e.preventDefault(); menuIdx = Math.min(menuIdx + 1, visibleCmds().length - 1); renderMenu(); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); menuIdx = Math.max(menuIdx - 1, 0); renderMenu(); return; }
        if (e.key === 'Enter')     { e.preventDefault(); selectCmd(visibleCmds()[menuIdx]?.type, b.id); return; }
        if (e.key === 'Escape')    { hideMenu(); return; }
      }

      // Arrow navigation between blocks
      if (e.key === 'ArrowUp' && isCursorAtStart(div)) {
        e.preventDefault();
        focusPrevBlock(b.id);
        return;
      }
      if (e.key === 'ArrowDown' && isCursorAtEnd(div)) {
        e.preventDefault();
        focusNextBlock(b.id);
        return;
      }

      // Tab → move to next block (prevent browser from leaving page)
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        focusNextBlock(b.id);
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        focusPrevBlock(b.id);
        return;
      }

      // Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        hideMenu();
        const continueTypes = ['bullet', 'numbered', 'todo'];
        const nextType = continueTypes.includes(b.type) ? b.type : 'text';

        // Empty list item → convert to text
        if (continueTypes.includes(b.type) && div.innerText.trim() === '') {
          convertBlock(b.id, 'text'); return;
        }
        // Cursor at START of a non-text block → insert new block BEFORE
        if (isCursorAtStart(div) && b.type !== 'text' && div.innerText.trim() !== '') {
          insertBlockBefore(b.id, 'text'); return;
        }
        addBlockAfter(b.id, nextType);
        return;
      }

      // Shift+Enter → soft newline within block (browser default <br>)
      // Just let it happen and sync
      if (e.key === 'Enter' && e.shiftKey) {
        setTimeout(sync, 0);
        return;
      }

      // Backspace on empty → delete block or convert heading→text
      if (e.key === 'Backspace' && div.innerText.trim() === '') {
        e.preventDefault();
        hideMenu();
        if (b.type !== 'text') { convertBlock(b.id, 'text'); return; }
        deleteBlock(b.id);
        return;
      }
    }

    // ── INPUT / SLASH ────────────────────────────────────────────
    function onInput(b, div) {
      const text = div.innerText || div.textContent;
      const slashIdx = text.lastIndexOf('/');
      if (slashIdx !== -1 && (slashIdx === 0 || /\s/.test(text[slashIdx - 1]))) {
        slashBlockId = b.id;
        slashFilter = text.slice(slashIdx + 1).toLowerCase().replace(/\n/g, '');
        menuIdx = 0;
        showMenu(div);
      } else if (slashBlockId === b.id && !text.includes('/')) {
        hideMenu();
      } else if (slashBlockId === b.id) {
        slashFilter = text.slice(text.lastIndexOf('/') + 1).toLowerCase().replace(/\n/g, '');
        menuIdx = 0;
        renderMenu();
      }
      sync();
    }

    // ── SLASH MENU ───────────────────────────────────────────────
    function visibleCmds() {
      if (!slashFilter) return CMDS;
      return CMDS.filter(c =>
        c.label.toLowerCase().includes(slashFilter) ||
        c.type.toLowerCase().includes(slashFilter)  ||
        c.desc.toLowerCase().includes(slashFilter)
      );
    }
    function showMenu(div) { positionMenu(div); menuEl.classList.remove('hidden'); renderMenu(); }
    function hideMenu()    { menuEl.classList.add('hidden'); slashBlockId = null; slashFilter = ''; menuIdx = 0; }
    function positionMenu(div) {
      const rect = div.getBoundingClientRect();
      let top = rect.bottom + 4, left = rect.left;
      const mw = 280, mh = 260;
      if (top + mh > window.innerHeight) top = rect.top - mh - 4;
      if (left + mw > window.innerWidth)  left = window.innerWidth - mw - 8;
      menuEl.style.top  = top  + 'px';
      menuEl.style.left = left + 'px';
    }
    function renderMenu() {
      const cmds = visibleCmds();
      if (!cmds.length) { menuEl.innerHTML = '<div class="slash-empty">Sin resultados</div>'; return; }
      menuEl.innerHTML = cmds.map((c, i) => `
        <div class="slash-item ${i === menuIdx ? 'slash-item--active' : ''}" data-type="${c.type}">
          <span class="slash-icon">${c.icon}</span>
          <div class="slash-text">
            <span class="slash-label">${c.label}</span>
            <span class="slash-desc">${c.desc}</span>
          </div>
        </div>`).join('');
      menuEl.querySelectorAll('.slash-item').forEach((el, i) => {
        el.addEventListener('mousedown', e => { e.preventDefault(); selectCmd(cmds[i].type, slashBlockId); });
        el.addEventListener('mouseover', () => { menuIdx = i; renderMenu(); });
      });
    }
    function selectCmd(type, blockId) {
      if (!type || !blockId) { hideMenu(); return; }
      const el = container.querySelector(`[data-id="${blockId}"] .eb-content`);
      if (el) {
        const text = el.innerText || el.textContent;
        const si = text.lastIndexOf('/');
        el.innerText = text.slice(0, si);
        placeCursorEnd(el);
      }
      hideMenu();
      if (type === 'divider') { convertBlock(blockId, 'divider'); addBlockAfter(blockId, 'text'); return; }
      if (type === 'page') {
        if (window._promptPageName) window._promptPageName(blockId);
        return;
      }
      convertBlock(blockId, type);
    }

    // ── SYNC ────────────────────────────────────────────────────
    function sync() {
      if (_loading) return; // never fire onChange during load
      const md = blocksToMd();
      if (syncTarget) syncTarget.value = md;
      if (onChange) onChange(md);
    }

    // ── PUBLIC ──────────────────────────────────────────────────
    function load(md) {
      _loading = true;
      _blocks = mdToBlocks(md);
      render();
      if (syncTarget) syncTarget.value = md; // sync textarea silently
      _loading = false;
      // Don't call onChange — user hasn't changed anything yet
    }

    function getMarkdown() {
      const md = blocksToMd();
      if (syncTarget) syncTarget.value = md;
      return md;
    }

    function addPageBlock(blockId, pageName, pageId) {
      const b = _blocks.find(b => b.id === blockId);
      if (b) {
        b.type   = 'page';
        b.content = pageName;
        b.pageId  = pageId;
        const old   = container.querySelector(`[data-id="${blockId}"]`);
        const newEl = makeEl(b);
        old.replaceWith(newEl);
      } else {
        const nb = { id: uid(), type: 'page', content: pageName, pageId };
        _blocks.push(nb);
        container.appendChild(makeEl(nb));
      }
      const targetId = b ? blockId : _blocks[_blocks.length - 1].id;
      // noFocus: don't scroll away from current view position
      addBlockAfter(targetId, 'text', '', { noFocus: true });
      sync();
    }

    function focusFirst() {
      const first = container.querySelector('.eb-content, .eb-code');
      if (first) { first.focus(); if (first.classList.contains('eb-content')) placeCursorEnd(first); }
    }

    // Global: hide menus on outside click
    document.addEventListener('mousedown', e => {
      if (menuEl && !menuEl.contains(e.target)) hideMenu();
    });

    // Initial empty state
    _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
    render();

    return { load, loadMarkdown: load, getMarkdown, addPageBlock, focusFirst };
  }

  // ── DEFAULT INSTANCE (modal — backward compat) ───────────────────────────────
  let _default = null;

  return {
    create: createInstance,
    init(opts)       { _default = createInstance(opts); },
    loadMarkdown(md) { _default && _default.load(md); },
    getMarkdown()    { return _default ? _default.getMarkdown() : ''; },
    addPageBlock(...a){ _default && _default.addPageBlock(...a); },
    focusFirst()     { _default && _default.focusFirst(); },
  };
})();
