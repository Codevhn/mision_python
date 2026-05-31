'use strict';
// ============================================================
// BLOCK EDITOR — factory, multiple instances, slash commands
// ============================================================
window.BlockEditor = (() => {

  const CMDS = [
    { type:'text',      label:'Texto',           desc:'Párrafo normal',            icon:'¶',   keys:['text','texto','p','paragraph'] },
    { type:'h1',        label:'Encabezado 1',    desc:'Título grande',             icon:'H1',  keys:['heading','h1','titulo','title','encabezado'] },
    { type:'h2',        label:'Encabezado 2',    desc:'Título mediano',            icon:'H2',  keys:['heading','h2','titulo','title','encabezado'] },
    { type:'h3',        label:'Encabezado 3',    desc:'Título pequeño',            icon:'H3',  keys:['heading','h3','titulo','title','encabezado'] },
    { type:'h4',        label:'Encabezado 4',    desc:'Título mínimo',             icon:'H4',  keys:['heading','h4','titulo','title','encabezado'] },
    { type:'toggle',    label:'Toggle',          desc:'Bloque desplegable',        icon:'▸',   keys:['toggle','desplegable','collapse','collapsar','t'] },
    { type:'toggle-h1', label:'Toggle H1',       desc:'Encabezado desplegable 1',  icon:'▸H1', keys:['toggle','heading','h1','desplegable'] },
    { type:'toggle-h2', label:'Toggle H2',       desc:'Encabezado desplegable 2',  icon:'▸H2', keys:['toggle','heading','h2','desplegable'] },
    { type:'toggle-h3', label:'Toggle H3',       desc:'Encabezado desplegable 3',  icon:'▸H3', keys:['toggle','heading','h3','desplegable'] },
    { type:'bullet',    label:'Lista •',         desc:'Lista con viñetas',         icon:'•',   keys:['bullet','list','lista','viñeta','b','ul'] },
    { type:'numbered',  label:'Lista 1.',        desc:'Lista numerada',            icon:'1.',  keys:['numbered','number','lista','ol','numerada','n'] },
    { type:'todo',      label:'Tarea',           desc:'Checkbox de tarea',         icon:'☐',   keys:['todo','task','checkbox','tarea','check'] },
    { type:'table',     label:'Tabla',           desc:'Tabla markdown',            icon:'⊞',   keys:['table','tabla','grid'] },
    { type:'code',      label:'Código',          desc:'Bloque de código',          icon:'</>',  keys:['code','codigo','snippet','pre','c'] },
    { type:'quote',     label:'Cita',            desc:'Blockquote',                icon:'"',   keys:['quote','cita','blockquote','q'] },
    { type:'divider',   label:'Divisor',         desc:'Línea horizontal',          icon:'—',   keys:['divider','divisor','hr','line','separador'] },
    { type:'page',      label:'Sub-página',      desc:'Crear página hija',         icon:'⬡',   keys:['page','subpage','pagina','link','sub'] },
  ];

  const PLACEHOLDER = {
    text:'Escribe algo, o \'/\' para comandos…',
    h1:'Encabezado 1', h2:'Encabezado 2', h3:'Encabezado 3', h4:'Encabezado 4',
    toggle:'Título del toggle…', 'toggle-h1':'Toggle Encabezado 1',
    'toggle-h2':'Toggle Encabezado 2', 'toggle-h3':'Toggle Encabezado 3',
    bullet:'Elemento de lista', numbered:'Elemento numerado',
    todo:'Tarea pendiente', table:'',
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
    let _loading = false;
    let slashBlockId = null, slashFilter = '', menuIdx = 0;
    let convertMenu = null;
    let blockMenu   = null;
    let dragSrcId   = null;
    const _nestedMenus = new Map(); // blockId → slash-menu DOM element
    let _selfRef = null;            // set after createInstance returns (for page-create in nested editors)

    // ── HELPERS ─────────────────────────────────────────────────
    function isSpecialLine(l) {
      if (!l) return false;
      return /^#{1,4} /.test(l) || l.startsWith('- ') || l.startsWith('> ') ||
             l === '---' || l === '***' || l.startsWith('```') || /^\d+\. /.test(l) ||
             /^\[\[.+\]\]$/.test(l.trim()) || l.startsWith('|') || l.startsWith(':::');
    }

    // ── MARKDOWN TABLE ↔ TABULATOR ─────────────────────────────
    let _tabCount = 0;
    function parseMdTable(raw) {
      const rows = raw.split('\n').map(r => r.trim()).filter(r => r.startsWith('|'));
      if (!rows.length) return { columns: [], data: [] };
      const parseRow = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const headers = parseRow(rows[0]);
      const dataRows = rows.slice(2).filter(r => !/^\|[\s\-:|]+\|$/.test(r)).map(parseRow);
      const columns = headers.map((h, i) => ({
        title: h, field: `c${i}`, editor: 'input', headerWordWrap: true,
        headerClick: () => {},
      }));
      const data = dataRows.map(cells => {
        const obj = {};
        headers.forEach((_, i) => obj[`c${i}`] = cells[i] || '');
        return obj;
      });
      return { columns, data };
    }

    function tabulatorToMd(columns, data) {
      if (!columns.length) return '';
      const headers = columns.map(c => c.title || '');
      const sep = headers.map(() => '---');
      const rows = data.map(row => columns.map(c => String(row[c.field] || '')));
      const fmt = cells => '| ' + cells.join(' | ') + ' |';
      return [fmt(headers), fmt(sep), ...rows.map(fmt)].join('\n');
    }

    // Parse HTML table (from clipboard/Notion) to markdown table
    function htmlTableToMd(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const table = tmp.querySelector('table');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return null;
      const parseRow = tr => Array.from(tr.querySelectorAll('th,td')).map(c => c.innerText.replace(/\n/g, ' ').trim());
      const allRows = rows.map(parseRow).filter(r => r.length);
      if (!allRows.length) return null;
      const headers = allRows[0];
      const sep = headers.map(() => '---');
      const dataRows = allRows.slice(1);
      const fmt = cells => '| ' + cells.join(' | ') + ' |';
      return [fmt(headers), fmt(sep), ...dataRows.map(fmt)].join('\n');
    }

    function makeTabulator(container, b, onChange) {
      const { columns, data } = parseMdTable(b.content || '');
      const tid = 'tab-' + (++_tabCount);
      container.id = tid;
      if (!window.Tabulator) return;
      const tab = new Tabulator('#' + tid, {
        data,
        columns: columns.length ? columns : [
          { title: 'Col 1', field: 'c0', editor: 'input' },
          { title: 'Col 2', field: 'c1', editor: 'input' },
        ],
        layout: 'fitColumns',
        height: false,
        renderVertical: 'basic',
        movableColumns: true,
        resizableRows: false,
        columnHeaderVertAlign: 'top',
        rowHeight: 36,
        cellEdited: () => {
          const cols = tab.getColumnDefinitions();
          const rows = tab.getData();
          b.content = tabulatorToMd(cols, rows);
          onChange();
        },
      });
      container.dataset.tabulatorId = tid;
      // Right-click header to rename
      setTimeout(() => {
        container.querySelectorAll('.tabulator-col-title').forEach((el, i) => {
          el.title = 'Doble clic para renombrar';
          el.addEventListener('dblclick', e => {
            e.stopPropagation();
            const col = tab.getColumnDefinitions()[i];
            if (!col) return;
            const inp = document.createElement('input');
            inp.value = col.title;
            inp.style.cssText = 'background:var(--bg-elevated);color:var(--text);border:1px solid var(--accent);padding:2px 6px;font-size:0.8rem;width:100%;';
            el.innerHTML = '';
            el.appendChild(inp);
            inp.focus(); inp.select();
            const commit = () => {
              const newTitle = inp.value.trim() || col.title;
              tab.updateColumnDefinition(col.field, { title: newTitle });
              const cols = tab.getColumnDefinitions();
              const rows = tab.getData();
              b.content = tabulatorToMd(cols, rows);
              onChange();
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e2 => { if (e2.key === 'Enter') { e2.preventDefault(); commit(); } });
          });
        });
      }, 200);
      return tab;
    }

    // ── MD → BLOCKS ─────────────────────────────────────────────
    const COLOR_NAMES = {
      default:'', gray:'#9b9b9b', brown:'#8b6756', orange:'#d9730d', yellow:'#cb912f',
      green:'#4a9e6a', blue:'#2e7fd6', purple:'#9065b0', pink:'#c4385b', red:'#cc4444'
    };
    const BG_NAMES = {
      default:'', gray:'rgba(120,120,120,0.15)', brown:'rgba(139,103,86,0.15)',
      orange:'rgba(217,115,13,0.15)', yellow:'rgba(203,145,47,0.15)',
      green:'rgba(74,158,106,0.15)', blue:'rgba(46,127,214,0.15)',
      purple:'rgba(144,101,176,0.15)', pink:'rgba(196,56,91,0.15)', red:'rgba(204,68,68,0.15)'
    };

    function mdToBlocks(md) {
      if (!md || !md.trim()) return [{ id:uid(), type:'text', content:'', checked:false }];
      const blocks = [];
      const lines = md.split('\n');
      let i = 0;

      while (i < lines.length) {
        let l = lines[i];

        // color annotation: <!-- color:X bgColor:Y -->
        let blockColor = '', blockBgColor = '';
        const colorMatch = l.match(/^<!--\s*color:(\w+)(?:\s+bgColor:(\w+))?\s*-->$/);
        if (colorMatch) { blockColor = colorMatch[1]; blockBgColor = colorMatch[2] || ''; i++; if (i >= lines.length) break; l = lines[i]; }
        const pushBlock = (b) => { if (blockColor) b.color = blockColor; if (blockBgColor) b.bgColor = blockBgColor; blocks.push(b); };

        // blank line → skip
        if (!l.trim()) { i++; continue; }

        // headings
        if (l.startsWith('#### '))  { pushBlock({ id:uid(), type:'h4', content:l.slice(5) }); i++; continue; }
        if (l.startsWith('### '))   { pushBlock({ id:uid(), type:'h3', content:l.slice(4) }); i++; continue; }
        if (l.startsWith('## '))    { pushBlock({ id:uid(), type:'h2', content:l.slice(3) }); i++; continue; }
        if (l.startsWith('# '))     { pushBlock({ id:uid(), type:'h1', content:l.slice(2) }); i++; continue; }

        // todo
        if (l.startsWith('- [x] ')) { pushBlock({ id:uid(), type:'todo', content:l.slice(6), checked:true  }); i++; continue; }
        if (l.startsWith('- [ ] ')) { pushBlock({ id:uid(), type:'todo', content:l.slice(6), checked:false }); i++; continue; }

        // list
        if (l.startsWith('- '))     { pushBlock({ id:uid(), type:'bullet',   content:l.slice(2) }); i++; continue; }
        if (/^\d+\. /.test(l))      { pushBlock({ id:uid(), type:'numbered', content:l.replace(/^\d+\. /, '') }); i++; continue; }

        // quote
        if (l.startsWith('> '))     { pushBlock({ id:uid(), type:'quote',   content:l.slice(2) }); i++; continue; }

        // divider
        if (l === '---' || l === '***') { pushBlock({ id:uid(), type:'divider', content:'' }); i++; continue; }

        // page link: [[title]] or [[title|entry-id]]
        if (/^\[\[.+\]\]$/.test(l.trim())) {
          const inner = l.trim().slice(2, -2);
          const pipe  = inner.lastIndexOf('|');
          const title  = pipe >= 0 ? inner.slice(0, pipe) : inner;
          const pageId = pipe >= 0 ? inner.slice(pipe + 1) : undefined;
          pushBlock({ id:uid(), type:'page', content:title, pageId }); i++; continue;
        }

        // toggle blocks: :::toggle Header, :::toggle-h1 Header, etc.
        if (l.startsWith(':::toggle')) {
          const typeMatch = l.match(/^:::(toggle(?:-h[123])?)\s*(.*)/);
          const tType   = typeMatch ? typeMatch[1] : 'toggle';
          const tHeader = typeMatch ? typeMatch[2] : '';
          const bodyLines = [];
          i++;
          let toggleLines = 0;
          while (i < lines.length && !lines[i].startsWith(':::') && toggleLines < 500) {
            bodyLines.push(lines[i]); i++; toggleLines++;
          }
          if (i < lines.length && lines[i].startsWith(':::')) i++; // skip closing :::
          pushBlock({ id:uid(), type:tType, header:tHeader, body:bodyLines.join('\n'), open:true });
          continue;
        }

        // markdown table — accumulate consecutive | lines
        if (l.startsWith('|')) {
          const tableLines = [l];
          i++;
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]); i++;
          }
          pushBlock({ id:uid(), type:'table', content:tableLines.join('\n') });
          continue;
        }

        // code fence — guard: stop at closing ``` OR at most 500 lines to avoid consuming rest of doc
        if (l.startsWith('```')) {
          const lang = l.slice(3).trim();
          const code = [];
          i++;
          let fenceLines = 0;
          while (i < lines.length && !lines[i].startsWith('```') && fenceLines < 500) {
            code.push(lines[i]); i++; fenceLines++;
          }
          if (i < lines.length && lines[i].startsWith('```')) i++; // skip closing fence
          pushBlock({ id:uid(), type:'code', content:code.join('\n'), lang });
          continue;
        }

        // plain text paragraph — accumulate consecutive non-special, non-blank lines
        const paraLines = [l];
        i++;
        while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
          paraLines.push(lines[i]);
          i++;
        }
        pushBlock({ id:uid(), type:'text', content:paraLines.join('\n') });
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
        const colorPrefix = (b.color && b.color !== 'default') || (b.bgColor && b.bgColor !== 'default')
          ? `<!-- color:${b.color||'default'}${b.bgColor ? ' bgColor:'+b.bgColor : ''} -->\n`
          : '';
        const c = (readContent(b.id) ?? b.content ?? '').replace(/\n$/, ''); // trim trailing \n
        const push = (raw) => parts.push(colorPrefix + raw);
        switch (b.type) {
          case 'h1': push('# '  + c); break;
          case 'h2': push('## ' + c); break;
          case 'h3': push('### '+ c); break;
          case 'h4': push('#### '+ c); break;
          case 'bullet':   push('- ' + c); break;
          case 'numbered': push('1. ' + c); break;
          case 'todo': {
            const cb = container.querySelector(`[data-id="${b.id}"] input[type=checkbox]`);
            const chk = cb ? cb.checked : (b.checked || false);
            push(`- [${chk ? 'x' : ' '}] ${c}`);
            break;
          }
          case 'quote': push('> ' + c); break;
          case 'code': {
            const ta = container.querySelector(`[data-id="${b.id}"] .eb-code`);
            const li = container.querySelector(`[data-id="${b.id}"] .eb-code-lang`);
            const code = ta ? ta.value : c;
            const lang = li ? li.value : (b.lang || '');
            push('```' + lang + '\n' + code + '\n```');
            break;
          }
          case 'toggle':
          case 'toggle-h1':
          case 'toggle-h2':
          case 'toggle-h3': {
            const hEl = container.querySelector(`[data-id="${b.id}"] .eb-toggle-header`);
            const th = hEl ? (hEl.innerText || '') : (b.header || '');
            const tb = b.body || '';
            push(`:::${b.type} ${th}\n${tb}\n:::`);
            break;
          }
          case 'table':   push(b.content || ''); break;
          case 'divider': push('---'); break;
          case 'page':    push('[[' + c + (b.pageId ? '|' + b.pageId : '') + ']]'); break;
          default: if (c.trim()) push(c);
        }
      }
      return parts.join('\n\n');
    }

    // ── VIRTUAL RENDER ──────────────────────────────────────────
    // Blocks are rendered in chunks via rAF to avoid blocking the UI.
    // IntersectionObserver lazy-highlights code blocks when they enter viewport.
    let _vObserver = null;
    const CHUNK = 40; // blocks per animation frame

    function render() {
      _nestedMenus.forEach(m => m.remove());
      _nestedMenus.clear();
      // Destroy any existing Tabulator instances
      container.querySelectorAll('[data-tabulator-id]').forEach(el => {
        try { Tabulator.findTable('#' + el.id)?.[0]?.destroy(); } catch(_) {}
      });
      if (_vObserver) { _vObserver.disconnect(); _vObserver = null; }
      container.innerHTML = '';

      if (_blocks.length === 0) {
        _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
        container.appendChild(makeEl(_blocks[0]));
        return;
      }

      // Setup IntersectionObserver for lazy PrismJS highlighting
      if (window.IntersectionObserver) {
        _vObserver = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const codeEl = entry.target.querySelector('.eb-code-pre code[class*="language-"]');
            if (codeEl && window.Prism) { Prism.highlightElement(codeEl); }
            _vObserver.unobserve(entry.target);
          });
        }, { rootMargin: '300px 0px' });
      }

      // Chunked rendering
      let idx = 0;
      function renderChunk() {
        const end = Math.min(idx + CHUNK, _blocks.length);
        for (; idx < end; idx++) {
          const el = makeEl(_blocks[idx]);
          container.appendChild(el);
          if (_vObserver) _vObserver.observe(el);
        }
        if (idx < _blocks.length) requestAnimationFrame(renderChunk);
      }
      renderChunk();
    }

    function applyBlockColor(wrap, b) {
      const col = b.color && b.color !== 'default' ? COLOR_NAMES[b.color] : '';
      const bg  = b.bgColor && b.bgColor !== 'default' ? BG_NAMES[b.bgColor] : '';
      wrap.style.color = col || '';
      wrap.style.background = bg || '';
      wrap.style.borderRadius = bg ? '3px' : '';
    }

    function setBlockColor(blockId, color, bgColor) {
      const b = _blocks.find(x => x.id === blockId);
      if (!b) return;
      if (color !== undefined) b.color = color;
      if (bgColor !== undefined) b.bgColor = bgColor;
      const wrap = container.querySelector(`[data-id="${blockId}"]`);
      if (wrap) applyBlockColor(wrap, b);
      sync();
    }

    function makeEl(b) {
      const wrap = document.createElement('div');
      wrap.className = `eb eb--${b.type}`;
      wrap.dataset.id   = b.id;
      wrap.dataset.type = b.type;
      applyBlockColor(wrap, b);

      // Block controls (drag handle + options) — shown on hover
      const controls = document.createElement('div');
      controls.className = 'eb-controls';

      const handle = document.createElement('div');
      handle.className = 'eb-handle';
      handle.draggable = true;
      handle.title = 'Clic para opciones · Arrastrar para mover';
      handle.innerHTML = '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7.5" cy="2.5" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13.5" r="1.5"/><circle cx="7.5" cy="13.5" r="1.5"/></svg>';
      handle.addEventListener('dragstart', e => {

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', b.id);
        dragSrcId = b.id;
        setTimeout(() => wrap.classList.add('eb--dragging'), 0);
      });
      handle.addEventListener('dragend', () => {
        wrap.classList.remove('eb--dragging');
        dragSrcId = null;
        container.querySelectorAll('.eb--drag-top, .eb--drag-bot').forEach(el => el.classList.remove('eb--drag-top', 'eb--drag-bot'));
      });
      // Click handle (no drag) → open block menu
      handle.addEventListener('click', e => { e.preventDefault(); openBlockMenu(b.id, handle); });

      // + button first, then handle — same layout as Notion
      const optsBtn = document.createElement('button');
      optsBtn.className = 'eb-opts';
      optsBtn.title = 'Añadir bloque abajo';
      optsBtn.innerHTML = '+';
      optsBtn.addEventListener('mousedown', e => { e.preventDefault(); addBlockAfter(b.id, 'text'); });

      controls.appendChild(optsBtn);
      controls.appendChild(handle);
      wrap.appendChild(controls);

      // Drop zone events on every block
      wrap.addEventListener('dragover', e => {
        if (!dragSrcId || dragSrcId === b.id) return;
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        container.querySelectorAll('.eb--drag-top, .eb--drag-bot').forEach(el => el.classList.remove('eb--drag-top', 'eb--drag-bot'));
        wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'eb--drag-top' : 'eb--drag-bot');
      });
      wrap.addEventListener('dragleave', e => {
        if (!e.currentTarget.contains(e.relatedTarget)) wrap.classList.remove('eb--drag-top', 'eb--drag-bot');
      });
      wrap.addEventListener('drop', e => {
        if (!dragSrcId || dragSrcId === b.id) return;
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        wrap.classList.remove('eb--drag-top', 'eb--drag-bot');
        moveBlock(dragSrcId, b.id, before);
        dragSrcId = null;
      });

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
        header.appendChild(langInput);

        // Copy button in header
        const copyBtn = document.createElement('button');
        copyBtn.className = 'eb-code-copy';
        copyBtn.title = 'Copiar código';
        copyBtn.textContent = 'copy';
        copyBtn.addEventListener('mousedown', e => e.preventDefault());
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(ta.value).then(() => {
            copyBtn.textContent = 'copied!';
            setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
          });
        });
        header.appendChild(copyBtn);
        wrap.appendChild(header);

        // Highlighted view (pre/code)
        const pre = document.createElement('pre');
        pre.className = 'eb-code-pre';
        const codeEl = document.createElement('code');
        const lang = (b.lang || '').trim();
        if (lang) codeEl.className = `language-${lang}`;
        codeEl.textContent = b.content || '';
        pre.appendChild(codeEl);

        // Editable textarea (hidden by default)
        const ta = document.createElement('textarea');
        ta.className = 'eb-code';
        ta.value = b.content || '';
        ta.spellcheck = false;
        ta.style.display = 'none';
        ta.rows = Math.max(3, (b.content || '').split('\n').length + 1);

        const showPre = () => {
          const l = (langInput.value || '').trim();
          codeEl.className = l ? `language-${l}` : '';
          codeEl.textContent = ta.value;
          if (window.Prism) Prism.highlightElement(codeEl);
          pre.style.display = '';
          ta.style.display = 'none';
          b.lang = langInput.value;
          sync();
        };
        const showTa = () => {
          pre.style.display = 'none';
          ta.style.display = '';
          ta.focus();
        };

        pre.addEventListener('click', showTa);

        ta.addEventListener('input', () => {
          ta.rows = Math.max(3, ta.value.split('\n').length + 1);
          sync();
        });
        ta.addEventListener('blur', showPre);
        ta.addEventListener('keydown', e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const s = ta.selectionStart;
            ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(s);
            ta.selectionStart = ta.selectionEnd = s + 2;
          }
          if (e.key === 'Escape') { ta.blur(); }
        });

        langInput.addEventListener('change', showPre);

        // Initial highlight
        if (window.Prism && lang) Prism.highlightElement(codeEl);

        wrap.appendChild(pre);
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

      // ── TABLE block (Tabulator) ─────────────────────────────────
      if (b.type === 'table') {
        const tWrap = document.createElement('div');
        tWrap.className = 'eb-table-wrap eb-tabulator-host';
        // Toolbar: add/remove row and col
        const toolbar = document.createElement('div');
        toolbar.className = 'eb-table-toolbar';
        let _tab = null;
        const addRow = () => {
          if (!_tab) return;
          const cols = _tab.getColumnDefinitions();
          const row = {}; cols.forEach(c => row[c.field] = '');
          _tab.addRow(row);
          const rows = _tab.getData();
          b.content = tabulatorToMd(cols, rows); sync();
        };
        const addCol = () => {
          if (!_tab) return;
          const cols = _tab.getColumnDefinitions();
          const newField = `c${cols.length}`;
          _tab.addColumn({ title: 'Col', field: newField, editor: 'input' });
          const newCols = _tab.getColumnDefinitions();
          const rows = _tab.getData();
          b.content = tabulatorToMd(newCols, rows); sync();
        };
        const delRow = () => {
          if (!_tab) return;
          const sel = _tab.getSelectedRows();
          if (sel.length) { sel.forEach(r => r.delete()); }
          else {
            const rows = _tab.getRows();
            if (rows.length > 1) rows[rows.length - 1].delete();
          }
          const cols = _tab.getColumnDefinitions();
          b.content = tabulatorToMd(cols, _tab.getData()); sync();
        };

        toolbar.innerHTML = `
          <button class="eb-tbl-btn" title="Agregar fila">+ Fila</button>
          <button class="eb-tbl-btn" title="Agregar columna">+ Col</button>
          <button class="eb-tbl-btn eb-tbl-danger" title="Eliminar fila seleccionada">− Fila</button>
        `;
        toolbar.querySelectorAll('.eb-tbl-btn').forEach((btn, i) => {
          btn.addEventListener('mousedown', e => { e.preventDefault(); [addRow, addCol, delRow][i](); });
        });

        tWrap.appendChild(toolbar);
        wrap.appendChild(tWrap);

        // Init Tabulator after element is in DOM
        requestAnimationFrame(() => {
          _tab = makeTabulator(tWrap, b, sync);
        });
        return wrap;
      }

      // ── TOGGLE block ────────────────────────────────────────────
      if (b.type === 'toggle' || b.type === 'toggle-h1' || b.type === 'toggle-h2' || b.type === 'toggle-h3') {
        const isOpen = b.open !== false;
        wrap.classList.add('eb--toggle');
        if (b.type !== 'toggle') wrap.classList.add(`eb--${b.type}`);

        // Toggle row: controls + arrow + header (all on same line like Notion)
        const tRow = document.createElement('div');
        tRow.className = 'eb-toggle-row';

        // Move controls inside the row so they align with the heading
        controls.classList.add('eb-controls--inline');
        tRow.appendChild(controls);

        const arrow = document.createElement('button');
        arrow.className = 'eb-toggle-arrow';
        arrow.innerHTML = isOpen
          ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4 2l4 4-4 4"/></svg>';
        arrow.title = isOpen ? 'Colapsar' : 'Expandir';

        const hDiv = document.createElement('div');
        hDiv.className = 'eb-toggle-header eb-content';
        hDiv.contentEditable = 'true';
        hDiv.spellcheck = false;
        const hTag = b.type === 'toggle-h1' ? 'h1' : b.type === 'toggle-h2' ? 'h2' : b.type === 'toggle-h3' ? 'h3' : null;
        hDiv.dataset.placeholder = PLACEHOLDER[b.type] || 'Toggle…';
        if (b.header) hDiv.innerText = b.header;
        if (hTag) hDiv.dataset.headingTag = hTag;

        tRow.appendChild(arrow);
        tRow.appendChild(hDiv);
        wrap.appendChild(tRow);

        // Body — full nested block editor (collapsible)
        const body = document.createElement('div');
        body.className = 'eb-toggle-body-wrap';
        body.style.display = isOpen ? '' : 'none';

        const nestedContainer = document.createElement('div');
        nestedContainer.className = 'eb-toggle-nested';
        body.appendChild(nestedContainer);
        wrap.appendChild(body);

        // Dedicated slash menu for this nested editor
        const nestedMenu = document.createElement('div');
        nestedMenu.className = 'slash-menu hidden';
        document.body.appendChild(nestedMenu);
        _nestedMenus.set(b.id, nestedMenu);

        // Create nested editor instance
        const nestedEd = BlockEditor.create({
          container: nestedContainer,
          menuEl:    nestedMenu,
          onChange:  (md) => { b.body = md; sync(); },
        });
        nestedEd.load(b.body || '');

        // Store nested editor on wrap so confirmPageCreate can find it
        wrap._nestedEditor = nestedEd;

        // Arrow toggle
        arrow.addEventListener('click', () => {
          b.open = !b.open;
          arrow.innerHTML = b.open
            ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4 2l4 4-4 4"/></svg>';
          arrow.title = b.open ? 'Colapsar' : 'Expandir';
          body.style.display = b.open ? '' : 'none';
        });

        // Header keydown
        hDiv.addEventListener('keydown', e => onKeydown(e, b, hDiv));
        hDiv.addEventListener('input',   () => { b.header = hDiv.innerText; sync(); });
        hDiv.addEventListener('focus',   () => wrap.classList.add('eb--focused'));
        hDiv.addEventListener('blur',    () => { wrap.classList.remove('eb--focused'); sync(); });

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
      // Clean up any nested slash menu for this toggle block
      const nm = _nestedMenus.get(id);
      if (nm) { nm.remove(); _nestedMenus.delete(id); }
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
      const isToggleSrc = b.type.startsWith('toggle');
      const isToggleDst = newType.startsWith('toggle');
      if (isToggleSrc) {
        // reading from toggle header
        const hEl = container.querySelector(`[data-id="${id}"] .eb-toggle-header`);
        const src = hEl ? (hEl.innerText || '') : (b.header || '');
        if (isToggleDst) { b.header = src; }
        else             { b.content = src; b.header = undefined; b.body = undefined; }
      } else {
        b.content = readContent(id) ?? b.content;
        if (isToggleDst) { b.header = b.content; b.body = ''; b.content = undefined; }
      }
      b.type = newType;
      if (isToggleDst && b.open === undefined) b.open = true;
      const old = container.querySelector(`[data-id="${id}"]`);
      const newEl = makeEl(b);
      old.replaceWith(newEl);
      const c = newEl.querySelector('.eb-toggle-header, .eb-content');
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
      m.innerHTML = CMDS.filter(c => c.type !== 'page' && c.type !== 'divider' && c.type !== 'table').map(c =>
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

    // ── BLOCK MENU (options button) ─────────────────────────────
    function openBlockMenu(blockId, anchor) {
      closeBlockMenu();
      const m = document.createElement('div');
      m.className = 'eb-block-menu';
      const rect = anchor.getBoundingClientRect();
      let top  = rect.bottom + 4;
      let left = rect.left;
      if (top + 200 > window.innerHeight) top = rect.top - 200;
      if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
      m.style.top  = top  + 'px';
      m.style.left = left + 'px';

      const items = [
        { label:'Convertir en…', icon:'⇄', sub:'turn' },
        { label:'Color',          icon:'🎨', sub:'color' },
        { label:'Duplicar',      icon:'⎘', action: () => { duplicateBlock(blockId); closeBlockMenu(); } },
        { sep: true },
        { label:'Eliminar',      icon:'✕', action: () => { deleteBlock(blockId); closeBlockMenu(); }, danger:true },
      ];

      m.innerHTML = items.map((it, i) => it.sep
        ? `<div class="eb-bm-sep"></div>`
        : `<div class="eb-bm-item${it.danger?' eb-bm-danger':''}${it.sub?' eb-bm-sub':''}" data-idx="${i}">
             <span class="eb-bm-icon">${it.icon}</span><span>${it.label}</span>${it.sub ? '<span class="eb-bm-arrow">›</span>' : ''}
           </div>`
      ).join('');

      m.querySelectorAll('.eb-bm-item').forEach(el => {
        const i = parseInt(el.dataset.idx);
        const it = items[i];
        if (!it) return;
        if (it.sub === 'turn') {
          el.addEventListener('mouseenter', () => { closeColorMenu(); openTurnIntoMenu(blockId, el, m); });
        } else if (it.sub === 'color') {
          el.addEventListener('mouseenter', () => { closeTurnIntoMenu(); openColorMenu(blockId, el, m); });
        } else if (it.action) {
          el.addEventListener('mousedown', e => { e.preventDefault(); it.action(); });
        }
      });

      document.body.appendChild(m);
      blockMenu = m;
      setTimeout(() => document.addEventListener('mousedown', _closeBMOutside), 0);
    }

    function _closeBMOutside(e) {
      if (blockMenu && !blockMenu.contains(e.target)) closeBlockMenu();
    }

    function closeBlockMenu() {
      if (blockMenu) { blockMenu.remove(); blockMenu = null; }
      document.removeEventListener('mousedown', _closeBMOutside);
      closeTurnIntoMenu();
      closeColorMenu();
    }

    let colorMenu = null;
    function closeColorMenu() { if (colorMenu) { colorMenu.remove(); colorMenu = null; } }

    function openColorMenu(blockId, anchor, parent) {
      closeColorMenu();
      const rect = anchor.getBoundingClientRect();
      const m = document.createElement('div');
      m.className = 'eb-block-menu eb-color-menu';
      m.style.left = (rect.right + 4) + 'px';
      m.style.top  = rect.top + 'px';

      const colors = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
      const colorLabels = { default:'Default', gray:'Gris', brown:'Marrón', orange:'Naranja',
        yellow:'Amarillo', green:'Verde', blue:'Azul', purple:'Morado', pink:'Rosa', red:'Rojo' };

      const b = _blocks.find(x => x.id === blockId);
      const curColor  = b?.color  || 'default';
      const curBgColor = b?.bgColor || 'default';

      m.innerHTML = `
        <div class="eb-bm-section">Color de texto</div>
        ${colors.map(c => `
          <div class="eb-bm-item eb-color-item" data-color="${c}" data-kind="color">
            <span class="eb-color-dot" style="background:${c==='default'?'transparent':COLOR_NAMES[c]};border:${c==='default'?'1px solid var(--border)':'none'}"></span>
            <span>${colorLabels[c]}</span>
            ${curColor===c?'<span class="eb-bm-arrow" style="margin-left:auto">✓</span>':''}
          </div>`).join('')}
        <div class="eb-bm-sep"></div>
        <div class="eb-bm-section">Color de fondo</div>
        ${colors.map(c => `
          <div class="eb-bm-item eb-color-item" data-color="${c}" data-kind="bgColor">
            <span class="eb-color-dot" style="background:${c==='default'?'transparent':BG_NAMES[c]};border:${c==='default'?'1px solid var(--border)':'none'}"></span>
            <span>${colorLabels[c]} fondo</span>
            ${curBgColor===c?'<span class="eb-bm-arrow" style="margin-left:auto">✓</span>':''}
          </div>`).join('')}
      `;

      m.querySelectorAll('.eb-color-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          const kind = el.dataset.kind;
          const val  = el.dataset.color;
          if (kind === 'color') setBlockColor(blockId, val, undefined);
          else setBlockColor(blockId, undefined, val);
          closeBlockMenu();
        });
      });

      document.body.appendChild(m);
      colorMenu = m;
      // Flip if off-screen
      const mr = m.getBoundingClientRect();
      if (mr.right > window.innerWidth) m.style.left = (rect.left - mr.width - 4) + 'px';
      if (mr.bottom > window.innerHeight) m.style.top = (window.innerHeight - mr.height - 8) + 'px';
    }

    let turnIntoMenu = null;
    function openTurnIntoMenu(blockId, anchor, parent) {
      closeTurnIntoMenu();
      const rect = anchor.getBoundingClientRect();
      const m = document.createElement('div');
      m.className = 'eb-block-menu eb-turninto-menu';
      m.style.top  = rect.top  + 'px';
      m.style.left = (rect.right + 4) + 'px';

      const types = CMDS.filter(c => !['page','divider','table'].includes(c.type));
      m.innerHTML = types.map(c =>
        `<div class="eb-bm-item" data-type="${c.type}">
           <span class="eb-bm-icon">${c.icon}</span><span>${c.label}</span>
         </div>`
      ).join('');
      m.querySelectorAll('.eb-bm-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          convertBlock(blockId, el.dataset.type);
          closeBlockMenu();
        });
      });
      document.body.appendChild(m);
      turnIntoMenu = m;
    }
    function closeTurnIntoMenu() { if (turnIntoMenu) { turnIntoMenu.remove(); turnIntoMenu = null; } }

    // ── MOVE BLOCK (drag & drop) ────────────────────────────────
    function moveBlock(srcId, targetId, before) {
      const si = _blocks.findIndex(b => b.id === srcId);
      if (si < 0) return;
      const [sb] = _blocks.splice(si, 1);
      const ti = _blocks.findIndex(b => b.id === targetId);
      _blocks.splice(before ? ti : ti + 1, 0, sb);
      render();
      sync();
    }

    // ── DUPLICATE BLOCK ─────────────────────────────────────────
    function duplicateBlock(id) {
      const b = _blocks.find(b => b.id === id);
      if (!b) return;
      if (!['toggle','toggle-h1','toggle-h2','toggle-h3','table','code','divider','page'].includes(b.type)) {
        b.content = readContent(id) ?? b.content;
      }
      const clone = { ...b, id: uid() };
      const idx = _blocks.findIndex(b => b.id === id);
      _blocks.splice(idx + 1, 0, clone);
      const el = container.querySelector(`[data-id="${id}"]`);
      const newEl = makeEl(clone);
      el.after(newEl);
      sync();
    }

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
      const f = slashFilter.toLowerCase();
      const scored = CMDS.map(c => {
        const type  = c.type.toLowerCase();
        const label = c.label.toLowerCase();
        const desc  = c.desc.toLowerCase();
        const keys  = (c.keys || []);
        let score = 0;
        if (type.startsWith(f) || label.startsWith(f))              score = 3;
        else if (keys.some(k => k === f || k.startsWith(f)))        score = 3;
        else if (type.includes(f) || label.includes(f))             score = 2;
        else if (desc.includes(f) || keys.some(k => k.includes(f))) score = 1;
        return { c, score };
      }).filter(x => x.score > 0);
      scored.sort((a, b) => b.score - a.score);
      return scored.map(x => x.c);
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
        // Tell app.js which editor owns this block so addPageBlock goes to the right instance
        window._activeEditorForPageCreate = _selfRef;
        if (window._promptPageName) window._promptPageName(blockId);
        return;
      }
      if (type === 'table') {
        const b = _blocks.find(b => b.id === blockId);
        if (b) {
          b.type = 'table';
          b.content = '| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| | | |';
          const old = container.querySelector(`[data-id="${blockId}"]`);
          const newEl = makeEl(b);
          old.replaceWith(newEl);
        }
        sync(); return;
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

    // ── PASTE HANDLER: intercept HTML table paste ────────────────
    container.addEventListener('paste', e => {
      const html = e.clipboardData?.getData('text/html') || '';
      if (!html) return;

      // If HTML contains a table, convert it
      if (/<table[\s>]/i.test(html)) {
        const md = htmlTableToMd(html);
        if (md) {
          e.preventDefault();
          // Find current focused block
          const focused = document.activeElement?.closest('[data-id]');
          const focusedId = focused?.dataset?.id;
          const focusedBlock = _blocks.find(x => x.id === focusedId);
          const insertAfter = focusedId || _blocks[_blocks.length - 1]?.id;
          const nb = { id: uid(), type: 'table', content: md };
          const idx = _blocks.findIndex(x => x.id === insertAfter);
          if (idx >= 0) _blocks.splice(idx + 1, 0, nb);
          else _blocks.push(nb);
          // If focused block is empty text, remove it
          if (focusedBlock && focusedBlock.type === 'text' && !(focusedBlock.content || '').trim()) {
            _blocks.splice(_blocks.findIndex(x => x.id === focusedId), 1);
          }
          render(); sync(); return;
        }
      }

      // Large text paste: convert to plain text and chunk into blocks
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text.split('\n').length > 50) {
        e.preventDefault();
        const focused = document.activeElement?.closest('[data-id]');
        const focusedId = focused?.dataset?.id;
        const newBlocks = mdToBlocks(text);
        const idx = _blocks.findIndex(x => x.id === focusedId);
        if (idx >= 0) {
          // Replace focused empty block or insert after
          const focusedBlock = _blocks[idx];
          const replace = focusedBlock && focusedBlock.type === 'text' && !(focusedBlock.content || '').trim();
          if (replace) _blocks.splice(idx, 1, ...newBlocks);
          else _blocks.splice(idx + 1, 0, ...newBlocks);
        } else {
          _blocks.push(...newBlocks);
        }
        render(); sync();
      }
    });

    // Initial empty state
    _blocks = [{ id:uid(), type:'text', content:'', checked:false }];
    render();

    _selfRef = { load, loadMarkdown: load, getMarkdown, addPageBlock, focusFirst };
    return _selfRef;
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
