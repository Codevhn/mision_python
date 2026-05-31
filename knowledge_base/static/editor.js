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
    let _loading = false;   // true while loading md — prevents onChange feedback loop
    let slashBlockId = null, slashFilter = '', menuIdx = 0;
    let convertMenu = null;
    let blockMenu   = null;
    let dragSrcId   = null;

    // ── HELPERS ─────────────────────────────────────────────────
    function isSpecialLine(l) {
      if (!l) return false;
      return /^#{1,4} /.test(l) || l.startsWith('- ') || l.startsWith('> ') ||
             l === '---' || l === '***' || l.startsWith('```') || /^\d+\. /.test(l) ||
             /^\[\[.+\]\]$/.test(l.trim()) || l.startsWith('|') || l.startsWith(':::');
    }

    // ── MARKDOWN TABLE → HTML ────────────────────────────────────
    function mdTableToHtml(raw) {
      const rows = raw.split('\n').map(r => r.trim()).filter(r => r.startsWith('|'));
      if (!rows.length) return '<em style="opacity:.4">tabla vacía</em>';
      let isHead = true;
      let html = '<table class="eb-table"><tbody>';
      for (const row of rows) {
        if (/^\|[\s\-:|]+\|?\s*$/.test(row)) { isHead = false; continue; }
        const tag   = isHead ? 'th' : 'td';
        const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|')
                        .map(c => `<${tag}>${escHtml(c.trim())}</${tag}>`).join('');
        html += `<tr>${cells}</tr>`;
        if (isHead) isHead = false;
      }
      return html + '</tbody></table>';
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

        // toggle blocks: :::toggle Header, :::toggle-h1 Header, etc.
        if (l.startsWith(':::toggle')) {
          const typeMatch = l.match(/^:::(toggle(?:-h[123])?)\s*(.*)/);
          const tType   = typeMatch ? typeMatch[1] : 'toggle';
          const tHeader = typeMatch ? typeMatch[2] : '';
          const bodyLines = [];
          i++;
          while (i < lines.length && !lines[i].startsWith(':::')) { bodyLines.push(lines[i]); i++; }
          if (i < lines.length && lines[i].startsWith(':::')) i++; // skip closing :::
          blocks.push({ id:uid(), type:tType, header:tHeader, body:bodyLines.join('\n'), open:true });
          continue;
        }

        // markdown table — accumulate consecutive | lines
        if (l.startsWith('|')) {
          const tableLines = [l];
          i++;
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]); i++;
          }
          blocks.push({ id:uid(), type:'table', content:tableLines.join('\n') });
          continue;
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
            const li = container.querySelector(`[data-id="${b.id}"] .eb-code-lang`);
            const code = ta ? ta.value : c;
            const lang = li ? li.value : (b.lang || '');
            parts.push('```' + lang + '\n' + code + '\n```');
            break;
          }
          case 'toggle':
          case 'toggle-h1':
          case 'toggle-h2':
          case 'toggle-h3': {
            const hEl = container.querySelector(`[data-id="${b.id}"] .eb-toggle-header`);
            const bEl = container.querySelector(`[data-id="${b.id}"] .eb-toggle-body`);
            const th = hEl ? (hEl.innerText || '') : (b.header || '');
            const tb = bEl ? (bEl.value || '') : (b.body || '');
            parts.push(`:::${b.type} ${th}\n${tb}\n:::`);
            break;
          }
          case 'table':   parts.push(b.content || ''); break;
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
      // Highlight all code blocks after render
      if (window.Prism) {
        container.querySelectorAll('.eb-code-pre code[class*="language-"]').forEach(el => {
          Prism.highlightElement(el);
        });
      }
    }

    function makeEl(b) {
      const wrap = document.createElement('div');
      wrap.className = `eb eb--${b.type}`;
      wrap.dataset.id   = b.id;
      wrap.dataset.type = b.type;

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

      // + button: add new block below
      const optsBtn = document.createElement('button');
      optsBtn.className = 'eb-opts';
      optsBtn.title = 'Añadir bloque abajo';
      optsBtn.innerHTML = '+';
      optsBtn.addEventListener('mousedown', e => { e.preventDefault(); addBlockAfter(b.id, 'text'); });

      controls.appendChild(handle);
      controls.appendChild(optsBtn);
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

      // ── TABLE block ────────────────────────────────────────────
      if (b.type === 'table') {
        const tWrap = document.createElement('div');
        tWrap.className = 'eb-table-wrap';

        const tView = document.createElement('div');
        tView.className = 'eb-table-view';
        tView.innerHTML = mdTableToHtml(b.content || '');

        const tEdit = document.createElement('textarea');
        tEdit.className = 'eb-table-textarea';
        tEdit.value = b.content || '';
        tEdit.rows  = Math.max(4, (b.content || '').split('\n').length + 1);
        tEdit.spellcheck = false;
        tEdit.placeholder = '| Col 1 | Col 2 |\n| --- | --- |\n| val | val |';
        tEdit.style.display = 'none';

        const tEditBtn = document.createElement('button');
        tEditBtn.className = 'eb-table-btn';
        tEditBtn.title = 'Editar tabla';
        tEditBtn.innerHTML = '✎';

        const showView = () => {
          b.content = tEdit.value;
          tView.innerHTML = mdTableToHtml(b.content);
          tEdit.style.display = 'none';
          tView.style.display = '';
          tEditBtn.style.opacity = '';
          sync();
        };
        const showEdit = () => {
          tEdit.style.display = 'block';
          tView.style.display = 'none';
          tEditBtn.style.opacity = '0';
          tEdit.focus();
        };

        tEditBtn.addEventListener('click', e => { e.stopPropagation(); showEdit(); });
        tView.addEventListener('dblclick', showEdit);
        tEdit.addEventListener('blur', showView);
        tEdit.addEventListener('input', () => {
          b.content = tEdit.value;
          tEdit.rows = Math.max(4, tEdit.value.split('\n').length + 1);
          sync();
        });
        tEdit.addEventListener('keydown', e => {
          if (e.key === 'Escape') showView();
          if (e.key === 'Tab') {
            e.preventDefault();
            const s = tEdit.selectionStart;
            tEdit.value = tEdit.value.slice(0, s) + '\t' + tEdit.value.slice(s);
            tEdit.selectionStart = tEdit.selectionEnd = s + 1;
          }
        });

        tWrap.appendChild(tView);
        tWrap.appendChild(tEdit);
        tWrap.appendChild(tEditBtn);
        wrap.appendChild(tWrap);
        return wrap;
      }

      // ── TOGGLE block ────────────────────────────────────────────
      if (b.type === 'toggle' || b.type === 'toggle-h1' || b.type === 'toggle-h2' || b.type === 'toggle-h3') {
        const isOpen = b.open !== false;
        wrap.classList.add('eb--toggle');
        if (b.type !== 'toggle') wrap.classList.add(`eb--${b.type}`);

        // Toggle row: arrow + header
        const tRow = document.createElement('div');
        tRow.className = 'eb-toggle-row';

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

        // Body (collapsible)
        const body = document.createElement('div');
        body.className = 'eb-toggle-body-wrap';
        body.style.display = isOpen ? '' : 'none';

        const bodyTa = document.createElement('textarea');
        bodyTa.className = 'eb-toggle-body';
        bodyTa.value = b.body || '';
        bodyTa.spellcheck = false;
        bodyTa.placeholder = 'Contenido del toggle…';

        const resizeBodyTa = () => {
          bodyTa.style.height = 'auto';
          bodyTa.style.height = Math.max(bodyTa.scrollHeight, 32) + 'px';
        };
        bodyTa.addEventListener('input', () => {
          resizeBodyTa();
          b.body = bodyTa.value;
          sync();
        });
        bodyTa.addEventListener('keydown', e => {
          if (e.key === 'Escape') { bodyTa.blur(); }
        });
        body.appendChild(bodyTa);
        wrap.appendChild(body);

        // Auto-resize after insertion (needs DOM reflow)
        if (b.body) requestAnimationFrame(resizeBodyTa);

        // Arrow toggle
        arrow.addEventListener('click', () => {
          b.open = !b.open;
          arrow.innerHTML = b.open
            ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4 2l4 4-4 4"/></svg>';
          arrow.title = b.open ? 'Colapsar' : 'Expandir';
          body.style.display = b.open ? '' : 'none';
          if (b.open) requestAnimationFrame(resizeBodyTa);
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
        { label:'Convertir en…', icon:'⇄', sub:true },
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
        if (it.sub) {
          el.addEventListener('mouseenter', () => openTurnIntoMenu(blockId, el, m));
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
        if (window._promptPageName) window._promptPageName(blockId);
        return;
      }
      if (type === 'table') {
        const b = _blocks.find(b => b.id === blockId);
        if (b) {
          b.type = 'table';
          b.content = '| Col 1 | Col 2 |\n| --- | --- |\n| val | val |';
          const old = container.querySelector(`[data-id="${blockId}"]`);
          const newEl = makeEl(b);
          old.replaceWith(newEl);
          // Auto-open edit mode
          const tEdit = newEl.querySelector('.eb-table-textarea');
          const tView = newEl.querySelector('.eb-table-view');
          if (tEdit && tView) { tEdit.style.display = 'block'; tView.style.display = 'none'; tEdit.focus(); tEdit.select(); }
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
