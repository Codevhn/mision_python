'use strict';
// ============================================================
// BLOCK EDITOR — factory, multiple instances, slash commands
// ============================================================
window.BlockEditor = (() => {

  // Shared across all editor instances — tracks the block being dragged cross-editor
  let _crossDrag = null; // { srcEditor, blockId }
  let _activeSelectionEditor = null;

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
    { type:'database',  label:'Base de datos',   desc:'Tabla tipo Notion DB',      icon:'⊞',   keys:['database','db','tabla','grid','notion'] },
    { type:'table',     label:'Tabla (md)',      desc:'Tabla markdown simple',     icon:'▦',   keys:['table','tabla','markdown','md'] },
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
    todo:'Tarea pendiente', table:'', database:'',
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
    let _selected   = new Set();  // selected block IDs
    let _lastSelIdx = -1;         // last selected block index (for range select)
    const _nestedMenus = new Map(); // blockId → slash-menu DOM element
    let _selfRef = null;            // set after createInstance returns (for page-create in nested editors)

    // ── TREE / INDENT MODEL (Notion-like) ──────────────────────
    // Hierarchy is represented as a flat list with `indent` levels.
    // A block is a descendant of a previous block if its indent is greater.
    // Toggle blocks control visibility of their descendant range.
    const INDENT_STEP_PX = 24;
    const getIndent = (b) => Math.max(0, (b?.indent | 0));
    function subtreeEndIndex(startIdx) {
      if (startIdx < 0) return startIdx;
      const base = getIndent(_blocks[startIdx]);
      let i = startIdx + 1;
      while (i < _blocks.length && getIndent(_blocks[i]) > base) i++;
      return i; // first index AFTER subtree
    }
    function parentToggleIndex(idx) {
      const indent = idx >= 0 ? getIndent(_blocks[idx]) : 0;
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(_blocks[i]) < indent && _blocks[i].type?.startsWith('toggle')) return i;
      }
      return -1;
    }
    function sliceSubtree(startIdx) {
      const end = subtreeEndIndex(startIdx);
      return _blocks.slice(startIdx, end);
    }
    function editableSelector(id) {
      return `[data-id="${id}"] .eb-content, [data-id="${id}"] .eb-toggle-header`;
    }
    function focusBlock(id) {
      const el = container.querySelector(editableSelector(id));
      if (el) { el.focus(); placeCursorEnd(el); }
    }
    function adjustSubtreeIndent(blocks, newRootIndent) {
      if (!blocks || !blocks.length) return blocks || [];
      const delta = newRootIndent - getIndent(blocks[0]);
      blocks.forEach(b => { b.indent = Math.max(0, getIndent(b) + delta); });
      return blocks;
    }

    // ── UNDO HISTORY ────────────────────────────────────────────
    const _undoStack = [];
    const MAX_UNDO = 60;
    let _lastSavedMd = null;        // avoid duplicate snapshots
    let _structuralDirty = false;   // true after a structural op, false after typing
    let _undoing = false;           // block saveHistory during undo restore
    let _pendingStructuralUndo = false;
    let _textEditedSinceStructure = false;
    let _toggleStateKey = '';

    function saveHistory() {
      if (_undoing) return;
      const md = blocksToMd();
      if (md === _lastSavedMd) return;
      _undoStack.push(md);
      if (_undoStack.length > MAX_UNDO) _undoStack.shift();
      _lastSavedMd = md;
      _structuralDirty = true;
      _pendingStructuralUndo = true;
      _textEditedSinceStructure = false;
    }

    function toggleStateSnapshot() {
      const bySig = new Map();
      const byIndex = new Map();
      const sigCounts = new Map();
      let toggleIdx = 0;
      _blocks.forEach(b => {
        if (!b.type?.startsWith('toggle')) return;
        const sigBase = `${b.type}\u0000${b.content || ''}`;
        const sigCount = (sigCounts.get(sigBase) || 0) + 1;
        sigCounts.set(sigBase, sigCount);
        const state = b.open !== false;
        bySig.set(`${sigBase}\u0000${sigCount}`, state);
        byIndex.set(toggleIdx, state);
        toggleIdx++;
      });
      return { bySig, byIndex };
    }

    function applyToggleStateSnapshot(snapshot) {
      if (!snapshot) return;
      const sigCounts = new Map();
      let toggleIdx = 0;
      _blocks.forEach(b => {
        if (!b.type?.startsWith('toggle')) return;
        const sigBase = `${b.type}\u0000${b.content || ''}`;
        const sigCount = (sigCounts.get(sigBase) || 0) + 1;
        sigCounts.set(sigBase, sigCount);
        const sigKey = `${sigBase}\u0000${sigCount}`;
        if (snapshot.bySig.has(sigKey)) b.open = snapshot.bySig.get(sigKey);
        else if (snapshot.byIndex.has(toggleIdx)) b.open = snapshot.byIndex.get(toggleIdx);
        toggleIdx++;
      });
    }

    function saveToggleStateSnapshot() {
      if (!_toggleStateKey) return;
      try {
        const snapshot = toggleStateSnapshot();
        localStorage.setItem(_toggleStateKey, JSON.stringify({
          bySig: Array.from(snapshot.bySig.entries()),
          byIndex: Array.from(snapshot.byIndex.entries()),
        }));
      } catch (_) {}
    }

    function loadToggleStateSnapshot() {
      if (!_toggleStateKey) return null;
      try {
        const raw = localStorage.getItem(_toggleStateKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
          bySig: new Map(Array.isArray(parsed.bySig) ? parsed.bySig : []),
          byIndex: new Map(Array.isArray(parsed.byIndex) ? parsed.byIndex : []),
        };
      } catch (_) {
        return null;
      }
    }

    function undo() {
      if (_undoStack.length === 0) return;
      const prev = _undoStack.pop();
      const toggleStates = toggleStateSnapshot();
      _undoing = true;
      _lastSavedMd = prev;
      _structuralDirty = false;
      _pendingStructuralUndo = _undoStack.length > 0;
      _textEditedSinceStructure = false;
      _blocks = mdToBlocks(prev);
      applyToggleStateSnapshot(toggleStates);
      render();
      saveToggleStateSnapshot();
      if (onChange) onChange(prev);
      _undoing = false;
    }

    // ── HELPERS ─────────────────────────────────────────────────
    function isSpecialLine(l) {
      if (!l) return false;
      return /^#{1,4} /.test(l) || l.startsWith('- ') || l.startsWith('* ') || l.startsWith('> ') ||
             l === '---' || l === '***' || l.startsWith('```') || /^\d+\. /.test(l) ||
             /^\[\[.+\]\]$/.test(l.trim()) || l.startsWith('|') || l.startsWith(':::');
    }

    // ── BLOCK SELECTION ─────────────────────────────────────────
    function clearSelection() {
      _selected.forEach(id => container.querySelector(`[data-id="${id}"]`)?.classList.remove('eb--selected'));
      _selected.clear();
      _lastSelIdx = -1;
      if (_activeSelectionEditor === _selfRef) _activeSelectionEditor = null;
    }
    function selectBlock(id, additive, range) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (!additive && !range) clearSelection();
      _activeSelectionEditor = _selfRef;
      if (range && _lastSelIdx >= 0) {
        const [from, to] = _lastSelIdx < idx ? [_lastSelIdx, idx] : [idx, _lastSelIdx];
        for (let i = from; i <= to; i++) {
          _selected.add(_blocks[i].id);
          container.querySelector(`[data-id="${_blocks[i].id}"]`)?.classList.add('eb--selected');
        }
      } else if (additive && _selected.has(id)) {
        _selected.delete(id);
        container.querySelector(`[data-id="${id}"]`)?.classList.remove('eb--selected');
      } else {
        _selected.add(id);
        container.querySelector(`[data-id="${id}"]`)?.classList.add('eb--selected');
        _lastSelIdx = idx;
      }
    }

    function selectAllBlocks() {
      clearSelection();
      _activeSelectionEditor = _selfRef;
      _blocks.forEach(b => {
        _selected.add(b.id);
        container.querySelector(`[data-id="${b.id}"]`)?.classList.add('eb--selected');
      });
      _lastSelIdx = _blocks.length - 1;
    }

    function selectedIndexes() {
      return _blocks.map((b, i) => _selected.has(b.id) ? i : -1).filter(i => i >= 0);
    }

    function selectedBlocksInOrder() {
      return _blocks.filter(b => _selected.has(b.id));
    }

    function deleteSelectedBlocks(opts = {}) {
      const idxs = selectedIndexes();
      if (!idxs.length) return false;
      saveHistory();
      const firstIdx = idxs[0];
      for (let i = idxs.length - 1; i >= 0; i--) _blocks.splice(idxs[i], 1);
      const replacement = (_blocks.length === 0 && opts.keepEmpty !== false)
        ? [{ id: uid(), type:'text', content:'', checked:false, indent: 0 }]
        : [];
      if (replacement.length) _blocks.splice(0, 0, ...replacement);
      clearSelection();
      render();
      const focusId = replacement[0]?.id || _blocks[Math.min(firstIdx, _blocks.length - 1)]?.id || _blocks[Math.max(0, firstIdx - 1)]?.id;
      if (focusId) focusBlock(focusId);
      sync();
      return true;
    }

    function replaceSelectedBlocks(newBlocks) {
      const idxs = selectedIndexes();
      if (!idxs.length || !newBlocks?.length) return false;
      saveHistory();
      const insertAt = idxs[0];
      for (let i = idxs.length - 1; i >= 0; i--) _blocks.splice(idxs[i], 1);
      _blocks.splice(insertAt, 0, ...newBlocks);
      clearSelection();
      render();
      focusBlock(newBlocks[0].id);
      sync();
      return true;
    }

    function normalizePastedText(text) {
      if (!text) return '';
      return text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line
          .replace(/^\s*[•◦▪▸▹►▻]\s+/, '* ')
          .replace(/^(\s*)(\d+)\)\s+/, '$1$2. ')
        )
        .join('\n');
    }

    // Detect if text looks like markdown (should be parsed as blocks)
    function looksLikeMarkdown(text) {
      const normalized = normalizePastedText(text);
      const lines = normalized.split('\n');
      if (lines.length > 3) return true;
      return lines.some(l => /^#{1,4} |^[-*] |^> |^\d+\. |^```|^\|/.test(l.trim()));
    }

    function tsvToMd(text) {
      const rows = text.split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.trim())
        .map(line => line.split('\t').map(cell => cell.trim()));
      if (rows.length < 2 || rows.some(row => row.length < 2) || !rows.every(row => row.length === rows[0].length)) return null;
      const escCell = cell => cell.replace(/\|/g, '\\|');
      const fmt = cells => '| ' + cells.map(escCell).join(' | ') + ' |';
      return [fmt(rows[0]), fmt(rows[0].map(() => '---')), ...rows.slice(1).map(fmt)].join('\n');
    }

    function inferCodeLang(code = '') {
      const s = String(code);
      if (/\b(def|import|from|class|print|elif|except)\b|:\s*(#.*)?\n\s{2,}\S/.test(s)) return 'python';
      if (/\b(function|const|let|var|=>|console\.log|document\.|window\.)\b/.test(s)) return 'javascript';
      if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(s)) return 'json';
      if (/\b(select|from|where|insert into|update|delete from)\b/i.test(s)) return 'sql';
      if (/^\s*(sudo\s+|apt\s+|cd\s+|ls\b|git\s+|python3?\s+)/m.test(s)) return 'bash';
      return '';
    }

    function isEditableTarget(target) {
      return !!target?.closest?.('input, textarea, select, [contenteditable="true"], .CodeMirror');
    }

    function editableText(target) {
      if (!target) return '';
      if (target.classList?.contains('CodeMirror')) return '';
      return (target.innerText || target.textContent || '').replace(/\n$/, '');
    }

    function writeSelectedBlocksToClipboard(e) {
      if (_activeSelectionEditor !== _selfRef) return false;
      if (_selected.size === 0) return false;
      const md = blocksToMd(selectedBlocksInOrder());
      if (!md) return false;
      e.clipboardData?.setData('text/plain', md);
      e.preventDefault();
      return true;
    }

    function codeMirrorMode(lang) {
      const l = String(lang || '').toLowerCase();
      if (l === 'python' || l === 'py') return 'python';
      if (l === 'javascript' || l === 'js' || l === 'typescript' || l === 'ts') return 'javascript';
      if (l === 'json') return { name: 'javascript', json: true };
      if (l === 'html' || l === 'htm') return 'htmlmixed';
      if (l === 'xml') return 'xml';
      if (l === 'css') return 'css';
      if (l === 'java') return 'text/x-java';
      if (l === 'bash' || l === 'sh' || l === 'shell') return 'shell';
      if (l === 'sql') return 'sql';
      if (l === 'yaml' || l === 'yml') return 'yaml';
      return null;
    }

    function codeLangLabel(lang) {
      const l = String(lang || '').trim().toLowerCase();
      if (!l) return 'Plain text';
      const labels = {
        py:'Python', python:'Python',
        js:'JavaScript', javascript:'JavaScript', ts:'TypeScript', typescript:'TypeScript',
        json:'JSON', html:'HTML', htm:'HTML', xml:'XML', css:'CSS',
        java:'Java', bash:'Bash', sh:'Shell', shell:'Shell',
        sql:'SQL', yaml:'YAML', yml:'YAML',
      };
      return labels[l] || l.toUpperCase();
    }

    // ── INLINE MARKDOWN ─────────────────────────────────────────
    // WYSIWYG model: rendered HTML stays visible while editing.
    // We read back plaintext by walking the DOM (htmlToMd).

    function renderInline(text) {
      let h = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      h = h.replace(/`([^`\n]+)`/g, '<code class="eb-ic">$1</code>');
      h = h.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
      h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
      h = h.replace(/(?<![a-zA-Z0-9])\*([^*\n]+)\*(?![a-zA-Z0-9])/g, '<em>$1</em>');
      h = h.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, '<em>$1</em>');
      h = h.replace(/\n/g, '<br>');
      return h;
    }

    function hasInlineMarkdown(text) {
      return /`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|__[^_]+__|_[^_\n]+_/.test(text);
    }

    // Walk DOM → extract plain markdown text (reverse of renderInline)
    function htmlToMd(el) {
      let out = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {          // TEXT_NODE
          out += node.textContent;
        } else if (node.nodeName === 'CODE') {
          out += '`' + node.textContent + '`';
        } else if (node.nodeName === 'STRONG') {
          const inner = htmlToMd(node);
          out += '**' + inner + '**';
        } else if (node.nodeName === 'EM') {
          out += '*' + htmlToMd(node) + '*';
        } else if (node.nodeName === 'BR') {
          out += '\n';
        } else if (node.nodeName === 'DIV') {  // contenteditable wraps new lines in <div>
          out += '\n' + htmlToMd(node);
        } else {
          out += htmlToMd(node);
        }
      }
      return out;
    }

    // Re-apply inline rendering after editing, preserving cursor if focused
    function reRenderInline(div) {
      const plain = htmlToMd(div).replace(/\n$/, '');
      div.dataset.plaintext = plain;
      if (plain && hasInlineMarkdown(plain)) {
        div.innerHTML = renderInline(plain);
        div.dataset.rendered = '1';
      } else {
        // No markdown — keep as plain text but mark clean
        delete div.dataset.rendered;
      }
    }

    function applyInlineRender(div, plaintext) {
      if (!plaintext) return;
      div.dataset.plaintext = plaintext;
      if (hasInlineMarkdown(plaintext)) {
        div.innerHTML = renderInline(plaintext);
        div.dataset.rendered = '1';
      }
    }

    // ── MARKDOWN TABLES ────────────────────────────────────────
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

    // Parse HTML table (from clipboard/Notion) to markdown table
    function htmlTableToMd(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const table = tmp.querySelector('table');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return null;
      const parseRow = tr => Array.from(tr.querySelectorAll('th,td')).flatMap(c => {
        const text = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
        const span = Math.max(1, parseInt(c.getAttribute('colspan') || '1', 10) || 1);
        return Array.from({ length: span }, (_, i) => i === 0 ? text : '');
      });
      const allRows = rows.map(parseRow).filter(r => r.some(c => c.trim()));
      if (!allRows.length) return null;
      const width = Math.max(...allRows.map(r => r.length));
      const normalized = allRows.map(r => Array.from({ length: width }, (_, i) => r[i] || ''));
      const headers = normalized[0].map((h, i) => h || `Col ${i + 1}`);
      const sep = headers.map(() => '---');
      const dataRows = normalized.slice(1);
      const escCell = cell => String(cell || '').replace(/\|/g, '\\|');
      const fmt = cells => '| ' + cells.map(escCell).join(' | ') + ' |';
      return [fmt(headers), fmt(sep), ...dataRows.map(fmt)].join('\n');
    }

    function htmlToPasteBlocks(html, baseIndent = 0) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('.eb-controls, .eb-between-add, .eb-table-toolbar, script, style').forEach(el => el.remove());
      const blocks = [];
      const cleanText = el => (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
      const blockTags = new Set(['h1','h2','h3','h4','p','div','section','article','ul','ol','li','blockquote','pre','table','hr']);
      const pushText = (type, content, extra = {}) => {
        if (!content && type !== 'divider') return;
        blocks.push({ id: uid(), type, content, checked:false, indent: baseIndent, ...extra });
      };
      const walk = (node, indent = baseIndent) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) pushText('text', text, { indent });
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'style' || tag === 'script') return;
        if (tag === 'table') {
          const md = htmlTableToMd(node.outerHTML);
          if (md) pushText('table', md, { indent });
          return;
        }
        if (/^h[1-4]$/.test(tag)) {
          pushText(tag, cleanText(node), { indent });
          return;
        }
        if (tag === 'pre') {
          const code = node.querySelector('code');
          const codeText = cleanText(code || node);
          const langClass = Array.from((code || node).classList || []).find(cls => cls.startsWith('language-') || cls.startsWith('lang-')) || '';
          const lang = langClass.replace(/^language-/, '').replace(/^lang-/, '') || inferCodeLang(codeText);
          pushText('code', codeText, { indent, lang });
          return;
        }
        if (tag === 'blockquote') {
          pushText('quote', cleanText(node), { indent });
          return;
        }
        if (tag === 'hr') {
          blocks.push({ id: uid(), type:'divider', content:'', checked:false, indent });
          return;
        }
        if (tag === 'ul' || tag === 'ol') {
          Array.from(node.children).forEach(child => {
            if (child.tagName?.toLowerCase() !== 'li') return;
            const nested = Array.from(child.children).filter(c => ['ul','ol'].includes(c.tagName?.toLowerCase()));
            nested.forEach(n => n.remove());
            const liText = cleanText(child);
            pushText(tag === 'ol' ? 'numbered' : 'bullet', liText, { indent });
            nested.forEach(n => walk(n, indent + 1));
          });
          return;
        }
        if (tag === 'li') {
          pushText('bullet', cleanText(node), { indent });
          return;
        }
        if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
          const hasBlockChildren = Array.from(node.children).some(child => blockTags.has(child.tagName?.toLowerCase()));
          if (!hasBlockChildren) {
            pushText('text', cleanText(node), { indent });
            return;
          }
          const childBlocksBefore = blocks.length;
          Array.from(node.children).forEach(child => walk(child, indent));
          if (blocks.length === childBlocksBefore) pushText('text', cleanText(node), { indent });
          return;
        }
        Array.from(node.childNodes).forEach(child => walk(child, indent));
      };
      const editorBlocks = Array.from(tmp.querySelectorAll('.eb[data-type]'));
      if (editorBlocks.length) {
        editorBlocks.forEach(el => {
          const type = el.dataset.type || 'text';
          const indent = baseIndent + Math.max(0, parseInt(el.dataset.indent || '0', 10) || 0);
          if (type === 'table') {
            const table = el.querySelector('.eb-simple-table');
            const md = table ? htmlTableToMd(table.outerHTML) : '';
            if (md) pushText('table', md, { indent });
            return;
          }
          if (type === 'database') return;
          if (type === 'divider') { blocks.push({ id: uid(), type:'divider', content:'', checked:false, indent }); return; }
          if (type === 'code') {
            const code = el.querySelector('.eb-code')?.value || '';
            const lang = el.querySelector('.eb-code')?.dataset?.lang || inferCodeLang(code);
            pushText('code', code, { indent, lang });
            return;
          }
          if (type === 'page') {
            pushText('page', cleanText(el.querySelector('.eb-page-name') || el), { indent });
            return;
          }
          const contentEl = el.querySelector(':scope > .eb-content, :scope > .eb-toggle-row > .eb-toggle-header');
          const content = cleanText(contentEl || el);
          pushText(type, content, { indent });
        });
      } else {
        Array.from(tmp.childNodes).forEach(node => walk(node, baseIndent));
      }
      return blocks;
    }

    function makeSimpleTable(wrap, b, sync) {
      let active = { row: 0, col: 0 };

      function getModel() {
        const parsed = parseMdTable(b.content || '');
        const headers = parsed.columns.length ? parsed.columns.map(c => c.title || '') : ['Col 1', 'Col 2'];
        const rows = parsed.data.length
          ? parsed.data.map(r => headers.map((_, i) => r[`c${i}`] || ''))
          : [headers.map(() => '')];
        return { headers, rows };
      }

      function modelToMd(headers, rows) {
        const fmt = cells => '| ' + cells.map(c => String(c || '').replace(/\n/g, '<br>')).join(' | ') + ' |';
        return [fmt(headers), fmt(headers.map(() => '---')), ...rows.map(fmt)].join('\n');
      }

      function saveFromDom() {
        const headers = Array.from(wrap.querySelectorAll('.eb-simple-th')).map(th => th.innerText.trim());
        const rows = Array.from(wrap.querySelectorAll('tbody tr')).map(tr =>
          Array.from(tr.querySelectorAll('.eb-simple-cell')).map(td => td.innerText.replace(/\n$/, ''))
        );
        b.content = modelToMd(headers, rows);
        sync();
      }

      function readLatestModel() {
        if (wrap.querySelector('.eb-simple-table')) saveFromDom();
        return getModel();
      }

      function focusCell(row, col, header = false) {
        const selector = header
          ? `.eb-simple-th[data-col="${col}"]`
          : `.eb-simple-cell[data-row="${row}"][data-col="${col}"]`;
        const el = wrap.querySelector(selector);
        if (el) { el.focus(); placeCursorEnd(el); }
      }

      function addRow(after = active.row) {
        const { headers, rows } = readLatestModel();
        const at = Math.max(0, Math.min(rows.length, after + 1));
        rows.splice(at, 0, headers.map(() => ''));
        b.content = modelToMd(headers, rows);
        build();
        focusCell(at, active.col);
        sync();
      }

      function addCol(after = active.col) {
        const { headers, rows } = readLatestModel();
        const at = Math.max(0, Math.min(headers.length, after + 1));
        headers.splice(at, 0, `Col ${headers.length + 1}`);
        rows.forEach(r => r.splice(at, 0, ''));
        b.content = modelToMd(headers, rows);
        build();
        focusCell(active.row, at);
        sync();
      }

      function deleteRow(row = active.row) {
        const { headers, rows } = readLatestModel();
        if (rows.length <= 1) return;
        const at = Math.max(0, Math.min(rows.length - 1, row));
        rows.splice(at, 1);
        b.content = modelToMd(headers, rows);
        build();
        focusCell(Math.min(at, rows.length - 1), active.col);
        sync();
      }

      function deleteCol(col = active.col) {
        const { headers, rows } = readLatestModel();
        if (headers.length <= 1) return;
        const at = Math.max(0, Math.min(headers.length - 1, col));
        headers.splice(at, 1);
        rows.forEach(r => r.splice(at, 1));
        b.content = modelToMd(headers, rows);
        build();
        focusCell(active.row, Math.min(at, headers.length - 1));
        sync();
      }

      function moveFocus(row, col) {
        const { headers, rows } = getModel();
        if (row >= rows.length) {
          addRow(rows.length - 1);
          return;
        }
        active = {
          row: Math.max(0, Math.min(rows.length - 1, row)),
          col: Math.max(0, Math.min(headers.length - 1, col)),
        };
        focusCell(active.row, active.col);
      }

      function build() {
        wrap.innerHTML = '';
        const { headers, rows } = getModel();

        const menuWrap = document.createElement('div');
        menuWrap.className = 'eb-table-menu';
        menuWrap.innerHTML = `
          <button class="eb-table-menu-btn" type="button" title="Opciones de tabla" aria-label="Opciones de tabla">...</button>
          <div class="eb-table-menu-pop" role="menu">
            <button type="button" data-act="row">Agregar fila debajo</button>
            <button type="button" data-act="col">Agregar columna a la derecha</button>
            <button type="button" data-act="del-row">Eliminar fila activa</button>
            <button type="button" data-act="del-col">Eliminar columna activa</button>
          </div>
        `;
        const menuBtn = menuWrap.querySelector('.eb-table-menu-btn');
        const menuPop = menuWrap.querySelector('.eb-table-menu-pop');
        menuBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          menuPop.classList.toggle('is-open');
          menuWrap.classList.toggle('is-open', menuPop.classList.contains('is-open'));
        });
        menuPop.querySelectorAll('[data-act]').forEach(btn => {
          btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const act = btn.dataset.act;
            if (act === 'row') addRow();
            if (act === 'col') addCol();
            if (act === 'del-row') deleteRow();
            if (act === 'del-col') deleteCol();
            menuPop.classList.remove('is-open');
            menuWrap.classList.remove('is-open');
          });
        });
        menuWrap.addEventListener('mouseleave', () => {
          menuPop.classList.remove('is-open');
          menuWrap.classList.remove('is-open');
        });
        wrap.appendChild(menuWrap);

        const scroller = document.createElement('div');
        scroller.className = 'eb-simple-table-scroll';
        const table = document.createElement('table');
        table.className = 'eb-simple-table';

        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        headers.forEach((h, ci) => {
          const th = document.createElement('th');
          th.className = 'eb-simple-th';
          th.contentEditable = 'true';
          th.spellcheck = false;
          th.dataset.col = String(ci);
          th.innerText = h || `Col ${ci + 1}`;
          th.addEventListener('focus', () => { active.col = ci; });
          th.addEventListener('input', saveFromDom);
          th.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); focusCell(0, ci); }
            if (e.key === 'Tab') { e.preventDefault(); focusCell(0, e.shiftKey ? Math.max(0, ci - 1) : ci); }
          });
          htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach((row, ri) => {
          const tr = document.createElement('tr');
          headers.forEach((_, ci) => {
            const td = document.createElement('td');
            td.className = 'eb-simple-cell';
            td.contentEditable = 'true';
            td.spellcheck = false;
            td.dataset.row = String(ri);
            td.dataset.col = String(ci);
            td.innerText = row[ci] || '';
            td.addEventListener('focus', () => { active = { row: ri, col: ci }; });
            td.addEventListener('input', saveFromDom);
            td.addEventListener('keydown', e => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const delta = e.shiftKey ? -1 : 1;
                let nr = ri, nc = ci + delta;
                if (nc >= headers.length) { nr++; nc = 0; }
                if (nc < 0) { nr = Math.max(0, nr - 1); nc = headers.length - 1; }
                moveFocus(nr, nc);
              }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                addRow(ri);
              }
            });
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        scroller.appendChild(table);
        wrap.appendChild(scroller);
      }

      build();
    }

    // ── DATABASE block ──────────────────────────────────────────
    function makeDatabase(wrap, b, sync) {
      const DB_TYPES = [
        ['text', 'Text'],
        ['number', 'Number'],
        ['select', 'Select'],
        ['multi-select', 'Multi-select'],
        ['checkbox', 'Checkbox'],
        ['date', 'Date'],
        ['url', 'URL'],
      ];
      function dbUid() { return 'x' + Math.random().toString(36).slice(2,8); }
      function getData() {
        try { return JSON.parse(b.content || '{}'); } catch(_) { return { cols:[], rows:[] }; }
      }
      function normalizeData(d) {
        d = d && typeof d === 'object' ? d : {};
        d.cols = Array.isArray(d.cols) ? d.cols : [];
        d.rows = Array.isArray(d.rows) ? d.rows : [];
        if (!d.cols.length) {
          d.cols = [
            { id: dbUid(), name: 'Nombre', type: 'text', width: 260 },
            { id: dbUid(), name: 'Estado', type: 'select', width: 180, options: ['Pendiente', 'En curso', 'Listo'] },
          ];
        }
        d.cols = d.cols.map((col, i) => ({
          id: col.id || dbUid(),
          name: col.name || `Columna ${i + 1}`,
          type: DB_TYPES.some(([t]) => t === col.type) ? col.type : 'text',
          width: Math.max(120, Math.min(520, Number(col.width) || 220)),
          options: Array.isArray(col.options) ? col.options.filter(Boolean) : [],
        }));
        d.rows = d.rows.map(row => {
          const next = { id: row.id || dbUid(), cells: row.cells && typeof row.cells === 'object' ? row.cells : {} };
          d.cols.forEach(col => { if (next.cells[col.id] === undefined) next.cells[col.id] = defaultCellValue(col.type); });
          return next;
        });
        if (!d.rows.length) {
          const cells = {};
          d.cols.forEach(col => { cells[col.id] = defaultCellValue(col.type); });
          d.rows.push({ id: dbUid(), cells });
        }
        d.view = d.view && typeof d.view === 'object' ? d.view : {};
        d.view.search = d.view.search || '';
        d.view.filters = d.view.filters && typeof d.view.filters === 'object' ? d.view.filters : {};
        d.view.sort = d.view.sort && d.view.sort.col ? d.view.sort : null;
        return d;
      }
      function defaultCellValue(type) {
        if (type === 'checkbox') return false;
        if (type === 'multi-select') return [];
        return '';
      }
      function saveData(d) {
        b.content = JSON.stringify(d);
        sync();
      }
      function cellText(value) {
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value ?? '');
      }
      function optionList(text) {
        return String(text || '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);
      }
      function visibleRows(d) {
        let rows = d.rows.slice();
        const q = String(d.view.search || '').trim().toLowerCase();
        if (q) rows = rows.filter(row => d.cols.some(col => cellText(row.cells[col.id]).toLowerCase().includes(q)));
        Object.entries(d.view.filters || {}).forEach(([cid, value]) => {
          const needle = String(value || '').trim().toLowerCase();
          if (!needle) return;
          rows = rows.filter(row => cellText(row.cells[cid]).toLowerCase().includes(needle));
        });
        const sort = d.view.sort;
        if (sort && sort.col) {
          const dir = sort.dir === 'desc' ? -1 : 1;
          rows.sort((a, b2) => {
            const av = cellText(a.cells[sort.col]).toLowerCase();
            const bv = cellText(b2.cells[sort.col]).toLowerCase();
            const an = Number(av), bn = Number(bv);
            const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : av.localeCompare(bv);
            return cmp * dir;
          });
        }
        return rows;
      }
      function addRow(d) {
        const cells = {};
        d.cols.forEach(col => { cells[col.id] = defaultCellValue(col.type); });
        d.rows.push({ id: dbUid(), cells });
        saveData(d);
        buildTable();
      }
      function addColumn(d) {
        const col = { id: dbUid(), name: `Columna ${d.cols.length + 1}`, type: 'text', width: 220, options: [] };
        d.cols.push(col);
        d.rows.forEach(row => { row.cells[col.id] = ''; });
        saveData(d);
        buildTable();
      }
      function removeColumn(d, col) {
        if (d.cols.length <= 1) return;
        d.cols = d.cols.filter(c => c.id !== col.id);
        d.rows.forEach(row => { delete row.cells[col.id]; });
        delete d.view.filters[col.id];
        if (d.view.sort?.col === col.id) d.view.sort = null;
        saveData(d);
        buildTable();
      }
      function moveColumn(d, fromId, toId) {
        if (!fromId || !toId || fromId === toId) return;
        const from = d.cols.findIndex(c => c.id === fromId);
        const to = d.cols.findIndex(c => c.id === toId);
        if (from < 0 || to < 0) return;
        const [col] = d.cols.splice(from, 1);
        d.cols.splice(to, 0, col);
        saveData(d);
        buildTable();
      }
      function resizeColumn(d, col, startX, startWidth) {
        const onMove = e => {
          col.width = Math.max(120, Math.min(620, startWidth + e.clientX - startX));
          wrap.querySelectorAll(`[data-col-id="${col.id}"]`).forEach(el => { el.style.width = `${col.width}px`; });
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveData(d);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }
      function renderCellEditor(td, d, row, col) {
        const value = row.cells[col.id];
        const commit = next => {
          row.cells[col.id] = next;
          saveData(d);
        };
        if (col.type === 'checkbox') {
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'eb-db-check';
          input.checked = value === true || value === 'true';
          input.addEventListener('change', () => commit(input.checked));
          td.appendChild(input);
          return;
        }
        if (col.type === 'select') {
          const select = document.createElement('select');
          select.className = 'eb-db-input eb-db-select';
          const empty = document.createElement('option');
          empty.value = '';
          empty.textContent = '';
          select.appendChild(empty);
          col.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
          });
          select.value = cellText(value);
          select.addEventListener('change', () => commit(select.value));
          td.appendChild(select);
          return;
        }
        if (col.type === 'multi-select') {
          const input = document.createElement('input');
          input.className = 'eb-db-input';
          input.value = Array.isArray(value) ? value.join(', ') : cellText(value);
          input.placeholder = 'Opcion 1, Opcion 2';
          input.addEventListener('change', () => commit(optionList(input.value)));
          input.addEventListener('input', () => commit(optionList(input.value)));
          td.appendChild(input);
          return;
        }
        if (col.type === 'number' || col.type === 'date' || col.type === 'url') {
          const input = document.createElement('input');
          input.className = 'eb-db-input';
          input.type = col.type === 'url' ? 'url' : col.type;
          input.value = cellText(value);
          input.addEventListener('input', () => commit(input.value));
          td.appendChild(input);
          return;
        }
        const editor = document.createElement('div');
        editor.className = 'eb-db-cell-editor';
        editor.contentEditable = 'true';
        editor.spellcheck = false;
        editor.textContent = cellText(value);
        editor.addEventListener('input', () => commit(editor.innerText.replace(/\n$/, '')));
        editor.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const nextRow = td.parentElement?.nextElementSibling;
            const next = nextRow?.querySelector(`[data-col-id="${col.id}"] .eb-db-cell-editor`);
            if (next) { next.focus(); placeCursorEnd(next); }
          }
        });
        td.appendChild(editor);
      }

      // ---- Row Peek Panel (Notion-style side panel) ----
      function openRowPeek(d, row) {
        // Remove existing peek
        const existing = document.getElementById('ebDbPeek');
        if (existing) {
          if (existing.dataset.rowId === row.id) { existing.remove(); return; }
          existing.remove();
        }

        // Ensure row has a page object
        if (!row.page) row.page = { content: '' };

        const panel = document.createElement('div');
        panel.id = 'ebDbPeek';
        panel.className = 'eb-db-peek';
        panel.dataset.rowId = row.id;

        // ── Resize handle (drag left edge) ──
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'eb-db-peek-resize';
        resizeHandle.addEventListener('mousedown', e => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = panel.getBoundingClientRect().width;
          const onMove = mv => {
            const newW = Math.max(300, Math.min(window.innerWidth * 0.85, startW + (startX - mv.clientX)));
            panel.style.width = newW + 'px';
          };
          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
        panel.appendChild(resizeHandle);

        // Header
        const header = document.createElement('div');
        header.className = 'eb-db-peek-header';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'eb-db-peek-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => panel.remove());

        const titleInput = document.createElement('div');
        titleInput.className = 'eb-db-peek-title';
        titleInput.contentEditable = 'true';
        titleInput.textContent = (row.cells[d.cols[0]?.id] || '').toString() || 'Sin título';
        titleInput.addEventListener('input', () => {
          if (d.cols[0]) {
            row.cells[d.cols[0].id] = titleInput.textContent.trim();
            saveData(d);
            buildTable();
          }
        });

        header.appendChild(closeBtn);
        header.appendChild(titleInput);
        panel.appendChild(header);

        // Properties (all columns as property rows)
        const propsSection = document.createElement('div');
        propsSection.className = 'eb-db-peek-props';

        d.cols.forEach((col, i) => {
          if (i === 0) return; // skip title column
          const propRow = document.createElement('div');
          propRow.className = 'eb-db-peek-prop-row';

          const propLabel = document.createElement('div');
          propLabel.className = 'eb-db-peek-prop-label';
          const typeIcons = { text:'T', number:'#', select:'○', 'multi-select':'◎', checkbox:'☑', date:'⬚', url:'⤤' };
          propLabel.innerHTML = `<span class="eb-db-peek-prop-icon">${typeIcons[col.type]||'T'}</span>${col.name}`;

          const propVal = document.createElement('div');
          propVal.className = 'eb-db-peek-prop-val';

          // Render editable value based on type
          const val = row.cells[col.id];
          if (col.type === 'checkbox') {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!val;
            cb.addEventListener('change', () => { row.cells[col.id] = cb.checked; saveData(d); buildTable(); });
            propVal.appendChild(cb);
          } else if (col.type === 'select') {
            const sel = document.createElement('select');
            sel.innerHTML = `<option value="">—</option>` + (col.options||[]).map(o=>`<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('');
            sel.addEventListener('change', () => { row.cells[col.id] = sel.value; saveData(d); buildTable(); });
            propVal.appendChild(sel);
          } else if (col.type === 'date') {
            const inp = document.createElement('input');
            inp.type = 'date'; inp.value = val||'';
            inp.addEventListener('change', () => { row.cells[col.id] = inp.value; saveData(d); buildTable(); });
            propVal.appendChild(inp);
          } else {
            const inp = document.createElement('div');
            inp.contentEditable = 'true';
            inp.className = 'eb-db-peek-prop-input';
            inp.textContent = Array.isArray(val) ? val.join(', ') : (val||'');
            inp.addEventListener('blur', () => { row.cells[col.id] = inp.textContent.trim(); saveData(d); buildTable(); });
            propVal.appendChild(inp);
          }

          propRow.appendChild(propLabel);
          propRow.appendChild(propVal);
          propsSection.appendChild(propRow);
        });
        panel.appendChild(propsSection);

        // Divider
        const divider = document.createElement('div');
        divider.className = 'eb-db-peek-divider';
        panel.appendChild(divider);

        // Content area (mini markdown editor as textarea)
        const contentLabel = document.createElement('div');
        contentLabel.className = 'eb-db-peek-content-label';
        contentLabel.textContent = 'Contenido';
        panel.appendChild(contentLabel);

        const contentArea = document.createElement('textarea');
        contentArea.className = 'eb-db-peek-content';
        contentArea.placeholder = 'Escribe aquí el contenido de esta página…';
        contentArea.value = row.page.content || '';
        contentArea.addEventListener('input', () => {
          row.page.content = contentArea.value;
          // Auto-resize
          contentArea.style.height = 'auto';
          contentArea.style.height = contentArea.scrollHeight + 'px';
          saveData(d);
        });
        panel.appendChild(contentArea);

        // Append peek panel to the editor's parent container
        const editorRoot = wrap.closest('.entry-body') || wrap.closest('.editor-root') || document.body;
        editorRoot.appendChild(panel);

        // Animate in
        requestAnimationFrame(() => panel.classList.add('eb-db-peek--open'));

        // Auto-resize textarea
        setTimeout(() => {
          contentArea.style.height = 'auto';
          contentArea.style.height = (contentArea.scrollHeight || 120) + 'px';
        }, 50);
      }

      function buildTable() {
        wrap.innerHTML = '';
        const d = normalizeData(getData());

        // ── Notion-style compact icon toolbar ──────────────────
        const toolbar = document.createElement('div');
        toolbar.className = 'eb-db-toolbar';

        // Left: view label
        const viewLabel = document.createElement('span');
        viewLabel.className = 'eb-db-view-label';
        viewLabel.innerHTML = '<span class="eb-db-view-icon">⊞</span> Tabla';
        toolbar.appendChild(viewLabel);

        // Spacer
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        toolbar.appendChild(spacer);

        // Icon buttons: filter, sort, search, fullscreen
        const TOOLBAR_BTNS = [
          { icon: '⊟', title: 'Filtrar', action: () => {
            const q = wrap.querySelector('.eb-db-search-inline');
            if (q) { q.style.display = q.style.display === 'none' ? 'flex' : 'none'; if (q.style.display === 'flex') q.querySelector('input').focus(); }
          }},
          { icon: '↕', title: 'Ordenar', action: null },
          { icon: '⊕', title: 'Propiedades', action: null },
        ];
        TOOLBAR_BTNS.forEach(({ icon, title, action }) => {
          const btn = document.createElement('button');
          btn.className = 'eb-db-icon-btn';
          btn.type = 'button';
          btn.title = title;
          btn.textContent = icon;
          if (action) btn.addEventListener('click', action);
          toolbar.appendChild(btn);
        });

        // New button
        const newBtn = document.createElement('button');
        newBtn.className = 'eb-db-new-btn';
        newBtn.type = 'button';
        newBtn.textContent = 'New';
        newBtn.addEventListener('click', e => { e.preventDefault(); addRow(d); });
        toolbar.appendChild(newBtn);
        wrap.appendChild(toolbar);

        // Inline search bar (hidden by default, shown on filter icon click)
        const searchBar = document.createElement('div');
        searchBar.className = 'eb-db-search-inline';
        searchBar.style.display = 'none';
        const searchIcon = document.createElement('span');
        searchIcon.textContent = '🔍';
        searchIcon.style.cssText = 'font-size:0.75rem;opacity:0.5;';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'eb-db-search';
        searchInput.placeholder = 'Buscar en la tabla…';
        searchInput.value = d.view.search || '';
        searchInput.addEventListener('input', () => {
          d.view.search = searchInput.value;
          saveData(d);
          buildTable();
          const next = wrap.querySelector('.eb-db-search');
          if (next) next.focus();
        });
        searchBar.appendChild(searchIcon);
        searchBar.appendChild(searchInput);
        wrap.appendChild(searchBar);

        if (d.view.search) searchBar.style.display = 'flex';

        const tableWrap = document.createElement('div');
        tableWrap.className = 'eb-db-wrap';
        const viewport = document.createElement('div');
        viewport.className = 'eb-db-viewport';

        const table = document.createElement('table');
        table.className = 'eb-db-table';

        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        const gutterTh = document.createElement('th');
        gutterTh.className = 'eb-db-gutter-th';
        htr.appendChild(gutterTh);

        const COL_ICONS = { text:'Aa', number:'#', select:'⊙', 'multi-select':'⊕', checkbox:'☑', date:'⊡', url:'↗', email:'@', phone:'☎' };

        d.cols.forEach(col => {
          const th = document.createElement('th');
          th.className = 'eb-db-th';
          th.dataset.colId = col.id;
          th.draggable = true;
          th.style.width = `${col.width}px`;
          th.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', col.id);
          });
          th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('is-drop-target'); });
          th.addEventListener('dragleave', () => th.classList.remove('is-drop-target'));
          th.addEventListener('drop', e => {
            e.preventDefault();
            th.classList.remove('is-drop-target');
            moveColumn(d, e.dataTransfer.getData('text/plain'), col.id);
          });

          const headMain = document.createElement('div');
          headMain.className = 'eb-db-head-main';

          const typeIconSpan = document.createElement('span');
          typeIconSpan.className = 'eb-db-col-type-icon';
          typeIconSpan.textContent = COL_ICONS[col.type] || 'Aa';
          headMain.appendChild(typeIconSpan);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'eb-db-col-name';
          nameSpan.contentEditable = 'true';
          nameSpan.spellcheck = false;
          nameSpan.textContent = col.name;
          nameSpan.addEventListener('blur', () => {
            col.name = nameSpan.innerText.trim() || col.name;
            saveData(d);
          });

          // ── Notion-style column context menu ──
          const menuWrap = document.createElement('div');
          menuWrap.className = 'eb-db-col-menu-wrap';
          const menuBtn = document.createElement('button');
          menuBtn.className = 'eb-db-col-menu-btn';
          menuBtn.type = 'button';
          menuBtn.title = 'Opciones de propiedad';
          menuBtn.textContent = '···';

          const menu = document.createElement('div');
          menu.className = 'eb-db-col-menu eb-db-col-menu--notion';

          // Column name header in menu
          const menuHeader = document.createElement('div');
          menuHeader.className = 'eb-db-col-menu-header';
          const menuNameInput = document.createElement('input');
          menuNameInput.className = 'eb-db-col-menu-name';
          menuNameInput.value = col.name;
          menuNameInput.addEventListener('input', () => {
            col.name = menuNameInput.value.trim() || col.name;
            nameSpan.textContent = col.name;
            typeIconSpan.textContent = COL_ICONS[col.type] || 'Aa';
            saveData(d);
          });
          menuHeader.appendChild(menuNameInput);
          menu.appendChild(menuHeader);

          // Menu items
          const MENU_ITEMS = [
            { label: 'Cambiar tipo', icon: '⇄', sub: true, action: null },
            { sep: true },
            { label: 'Filtrar', icon: '⊟', action: () => { searchBar.style.display = 'flex'; searchInput.focus(); menu.classList.remove('is-open'); } },
            { label: 'Orden A→Z', icon: '↑', action: () => { d.view.sort = { col: col.id, dir: 'asc' }; saveData(d); buildTable(); } },
            { label: 'Orden Z→A', icon: '↓', action: () => { d.view.sort = { col: col.id, dir: 'desc' }; saveData(d); buildTable(); } },
            { sep: true },
            { label: 'Insertar a la izquierda', icon: '←', action: () => {
              const idx = d.cols.findIndex(c => c.id === col.id);
              const nc = { id: dbUid(), name: 'Propiedad', type: 'text', width: 180, options: [] };
              d.cols.splice(idx, 0, nc);
              d.rows.forEach(r => { r.cells[nc.id] = ''; });
              saveData(d); buildTable();
            }},
            { label: 'Insertar a la derecha', icon: '→', action: () => {
              const idx = d.cols.findIndex(c => c.id === col.id);
              const nc = { id: dbUid(), name: 'Propiedad', type: 'text', width: 180, options: [] };
              d.cols.splice(idx + 1, 0, nc);
              d.rows.forEach(r => { r.cells[nc.id] = ''; });
              saveData(d); buildTable();
            }},
            { label: 'Duplicar propiedad', icon: '⧉', action: () => {
              const idx = d.cols.findIndex(c => c.id === col.id);
              const nc = { ...col, id: dbUid(), name: col.name + ' (copia)' };
              d.cols.splice(idx + 1, 0, nc);
              d.rows.forEach(r => { r.cells[nc.id] = r.cells[col.id]; });
              saveData(d); buildTable();
            }},
            { sep: true },
            { label: 'Eliminar propiedad', icon: '🗑', danger: true, action: () => removeColumn(d, col) },
          ];

          MENU_ITEMS.forEach(item => {
            if (item.sep) {
              const sep = document.createElement('div');
              sep.className = 'eb-db-col-menu-sep';
              menu.appendChild(sep);
              return;
            }
            const btn = document.createElement('button');
            btn.className = 'eb-db-col-menu-item' + (item.danger ? ' is-danger' : '');
            btn.type = 'button';
            btn.innerHTML = `<span class="eb-db-col-menu-icon">${item.icon}</span><span>${item.label}</span>${item.sub ? '<span class="eb-db-col-menu-arrow">›</span>' : ''}`;
            if (item.action) btn.addEventListener('click', e => { e.stopPropagation(); item.action(); });

            // Change type: show type picker submenu
            if (item.sub) {
              const subMenu = document.createElement('div');
              subMenu.className = 'eb-db-col-submenu';
              const PROP_TYPES = [
                ['text','Text','Aa'],['number','Number','#'],['select','Select','⊙'],
                ['multi-select','Multi-select','⊕'],['checkbox','Checkbox','☑'],
                ['date','Date','⊡'],['url','URL','↗'],['email','Email','@'],['phone','Phone','☏'],
              ];
              PROP_TYPES.forEach(([value, label, icon]) => {
                const si = document.createElement('button');
                si.className = 'eb-db-col-menu-item' + (col.type === value ? ' is-active' : '');
                si.type = 'button';
                si.innerHTML = `<span class="eb-db-col-menu-icon">${icon}</span><span>${label}</span>`;
                si.addEventListener('click', e => {
                  e.stopPropagation();
                  col.type = value;
                  d.rows.forEach(r => { if (r.cells[col.id] === undefined) r.cells[col.id] = defaultCellValue(value); });
                  saveData(d); buildTable();
                });
                subMenu.appendChild(si);
              });
              btn.appendChild(subMenu);
              btn.classList.add('has-submenu');
            }
            menu.appendChild(btn);
          });

          menuBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            wrap.querySelectorAll('.eb-db-col-menu--notion.is-open').forEach(m => { if (m !== menu) m.classList.remove('is-open'); });
            menu.classList.toggle('is-open');
            if (menu.classList.contains('is-open')) setTimeout(() => menuNameInput.focus(), 50);
          });
          document.addEventListener('click', () => menu.classList.remove('is-open'), { capture: true });
          menu.addEventListener('click', e => e.stopPropagation());
          menuWrap.appendChild(menuBtn);
          menuWrap.appendChild(menu);

          headMain.appendChild(nameSpan);
          headMain.appendChild(menuWrap);
          th.appendChild(headMain);

          const resizer = document.createElement('span');
          resizer.className = 'eb-db-resizer';
          resizer.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            resizeColumn(d, col, e.clientX, col.width);
          });
          th.appendChild(resizer);
          htr.appendChild(th);
        });

        // Simple + button at end (like Notion corner)
        const addColTh = document.createElement('th');
        addColTh.className = 'eb-db-add-col-th';
        const addColBtn = document.createElement('button');
        addColBtn.className = 'eb-db-add-col';
        addColBtn.title = 'Agregar propiedad';
        addColBtn.textContent = '+';
        addColBtn.addEventListener('click', e => { e.preventDefault(); addColumn(d); });
        addColTh.appendChild(addColBtn);
        htr.appendChild(addColTh);

        thead.appendChild(htr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        visibleRows(d).forEach((row, rowIdx) => {
          const ri = d.rows.findIndex(r => r.id === row.id);
          const tr = document.createElement('tr');
          tr.className = 'eb-db-row';
          tr.dataset.rowId = row.id;

          const gutterTd = document.createElement('td');
          gutterTd.className = 'eb-db-gutter';
          // Row number: shown normally, hidden on row hover
          const rowNum = document.createElement('span');
          rowNum.className = 'eb-db-row-num';
          rowNum.textContent = rowIdx + 1;
          // Hover actions: open + delete
          const gutterActions = document.createElement('span');
          gutterActions.className = 'eb-db-gutter-actions';
          const gutterOpenBtn = document.createElement('button');
          gutterOpenBtn.className = 'eb-db-gutter-open';
          gutterOpenBtn.title = 'Abrir página';
          gutterOpenBtn.textContent = '⤢';
          gutterOpenBtn.addEventListener('click', e => { e.preventDefault(); openRowPeek(d, row); });
          const delRowBtn = document.createElement('button');
          delRowBtn.className = 'eb-db-row-del';
          delRowBtn.title = 'Eliminar fila';
          delRowBtn.textContent = '×';
          delRowBtn.addEventListener('click', e => {
            e.preventDefault();
            d.rows.splice(ri, 1);
            saveData(d); buildTable();
          });
          gutterActions.appendChild(gutterOpenBtn);
          gutterActions.appendChild(delRowBtn);
          gutterTd.appendChild(rowNum);
          gutterTd.appendChild(gutterActions);
          tr.appendChild(gutterTd);

          d.cols.forEach((col, colIdx) => {
            const td = document.createElement('td');
            td.className = `eb-db-cell eb-db-cell--${col.type}`;
            td.dataset.colId = col.id;
            td.style.width = `${col.width}px`;
            td.addEventListener('keydown', e => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const allCells = Array.from(table.querySelectorAll('.eb-db-cell input, .eb-db-cell select, .eb-db-cell-editor'));
                const idx = allCells.indexOf(e.target);
                const next = allCells[e.shiftKey ? idx - 1 : idx + 1];
                if (next) next.focus();
              }
            });
            renderCellEditor(td, d, row, col);

            // First column: add OPEN peek button
            if (colIdx === 0) {
              const openBtn = document.createElement('button');
              openBtn.className = 'eb-db-open-btn';
              openBtn.textContent = 'OPEN';
              openBtn.title = 'Abrir página';
              openBtn.addEventListener('click', e => {
                e.stopPropagation();
                openRowPeek(d, row);
              });
              td.appendChild(openBtn);
            }

            tr.appendChild(td);
          });

          const emptyTd = document.createElement('td');
          emptyTd.className = 'eb-db-add-col-filler';
          tr.appendChild(emptyTd);

          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        viewport.appendChild(table);
        tableWrap.appendChild(viewport);

        const addRowBtn = document.createElement('button');
        addRowBtn.className = 'eb-db-add-row';
        addRowBtn.innerHTML = '<span style="font-size:0.9rem;opacity:0.6">+</span> Nueva página';
        addRowBtn.addEventListener('click', e => {
          e.preventDefault();
          const cells = {};
          d.cols.forEach(col => { cells[col.id] = defaultCellValue(col.type); });
          const newRow = { id: dbUid(), cells, page: { content: '' } };
          d.rows.push(newRow);
          saveData(d);
          buildTable();
          // Open peek for the newly added row
          const fresh = normalizeData(getData());
          const added = fresh.rows[fresh.rows.length - 1];
          if (added) openRowPeek(fresh, added);
        });
        tableWrap.appendChild(addRowBtn);

        // Row count footer (like Notion)
        const countBar = document.createElement('div');
        countBar.className = 'eb-db-count';
        countBar.textContent = `COUNT  ${visibleRows(d).length}`;
        tableWrap.appendChild(countBar);

        wrap.appendChild(tableWrap);
      }

      buildTable();
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
      if (!md || !md.trim()) return [{ id:uid(), type:'text', content:'', checked:false, indent: 0 }];
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
        if (l.startsWith('#### '))  { pushBlock({ id:uid(), type:'h4', content:l.slice(5), indent: 0 }); i++; continue; }
        if (l.startsWith('### '))   { pushBlock({ id:uid(), type:'h3', content:l.slice(4), indent: 0 }); i++; continue; }
        if (l.startsWith('## '))    { pushBlock({ id:uid(), type:'h2', content:l.slice(3), indent: 0 }); i++; continue; }
        if (l.startsWith('# '))     { pushBlock({ id:uid(), type:'h1', content:l.slice(2), indent: 0 }); i++; continue; }

        // todo
        if (l.startsWith('- [x] ')) { pushBlock({ id:uid(), type:'todo', content:l.slice(6), checked:true,  indent: 0 }); i++; continue; }
        if (l.startsWith('- [ ] ')) { pushBlock({ id:uid(), type:'todo', content:l.slice(6), checked:false, indent: 0 }); i++; continue; }

        // list
        if (l.startsWith('- '))     { pushBlock({ id:uid(), type:'bullet',   content:l.slice(2), indent: 0 }); i++; continue; }
        if (l.startsWith('* '))     { pushBlock({ id:uid(), type:'bullet',   content:l.slice(2), indent: 0 }); i++; continue; }
        if (/^\d+\. /.test(l))      { pushBlock({ id:uid(), type:'numbered', content:l.replace(/^\d+\. /, ''), indent: 0 }); i++; continue; }

        // quote
        if (l.startsWith('> '))     { pushBlock({ id:uid(), type:'quote',   content:l.slice(2), indent: 0 }); i++; continue; }

        // divider
        if (l === '---' || l === '***') { pushBlock({ id:uid(), type:'divider', content:'', indent: 0 }); i++; continue; }

        // page link: [[title]] or [[title|entry-id]]
        if (/^\[\[.+\]\]$/.test(l.trim())) {
          const inner = l.trim().slice(2, -2);
          const pipe  = inner.lastIndexOf('|');
          const title  = pipe >= 0 ? inner.slice(0, pipe) : inner;
          const pageId = pipe >= 0 ? inner.slice(pipe + 1) : undefined;
          pushBlock({ id:uid(), type:'page', content:title, pageId, indent: 0 }); i++; continue;
        }

        // toggle blocks: :::toggle Header, :::toggle-h1 Header, etc.
        if (l.startsWith(':::toggle')) {
          const typeMatch = l.match(/^:::(toggle(?:-h[123])?)\s*(.*)/);
          const tType   = typeMatch ? typeMatch[1] : 'toggle';
          const tHeader = typeMatch ? typeMatch[2] : '';
          const bodyLines = [];
          i++;
          while (i < lines.length && !lines[i].startsWith(':::')) {
            bodyLines.push(lines[i]); i++;
          }
          if (i < lines.length && lines[i].startsWith(':::')) i++; // skip closing :::
          const tid = uid();
          pushBlock({ id:tid, type:tType, content:tHeader, open:true, indent: 0 });
          const bodyMd = bodyLines.join('\n').trim();
          if (bodyMd) {
            const childBlocks = mdToBlocks(bodyMd);
            // mdToBlocks returns an empty text block for empty input; avoid creating
            // a fake child when the body is effectively empty.
            const meaningful = childBlocks.filter(b => (b.type !== 'text') || (b.content || '').trim());
            meaningful.forEach(cb => { cb.indent = getIndent(cb) + 1; pushBlock(cb); });
          }
          continue;
        }

        // database block: :::database\n{json}\n:::
        if (l.startsWith(':::database')) {
          const bodyLines = [];
          i++;
          while (i < lines.length && !lines[i].startsWith(':::')) { bodyLines.push(lines[i]); i++; }
          if (i < lines.length && lines[i].startsWith(':::')) i++;
          let dbData;
          try { dbData = JSON.parse(bodyLines.join('\n')); } catch(_) { dbData = null; }
          if (!dbData) {
            dbData = { cols:[{id:'c0',name:'Nombre'},{id:'c1',name:'Estado'}], rows:[{id:'r0',cells:{c0:'',c1:''}}] };
          }
          pushBlock({ id:uid(), type:'database', content:JSON.stringify(dbData), indent: 0 });
          continue;
        }

        // markdown table — accumulate consecutive | lines
        if (l.startsWith('|')) {
          const tableLines = [l];
          i++;
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]); i++;
          }
          pushBlock({ id:uid(), type:'table', content:tableLines.join('\n'), indent: 0 });
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
          pushBlock({ id:uid(), type:'code', content:code.join('\n'), lang, indent: 0 });
          continue;
        }

        // plain text paragraph — accumulate consecutive non-special, non-blank lines
        const paraLines = [l];
        i++;
        while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
          paraLines.push(lines[i]);
          i++;
        }
        pushBlock({ id:uid(), type:'text', content:paraLines.join('\n'), indent: 0 });
      }

      return blocks.length ? blocks : [{ id:uid(), type:'text', content:'', checked:false, indent: 0 }];
    }

    // ── BLOCKS → MD ─────────────────────────────────────────────
    function readContent(id) {
      const b = _blocks.find(x => x.id === id);
      if (b && b.type === 'database') return b.content; // JSON stored directly
      const el = container.querySelector(`[data-id="${id}"] .eb-content`);
      if (!el) return null;
      // Hidden blocks (e.g. inside collapsed toggles) may return empty innerText.
      // In that case, prefer the persisted model value.
      if (el.offsetParent === null && b && b.content !== undefined) return b.content;
      // When inline-rendered, use stored plain text to avoid reading HTML tags
      if (el.dataset.rendered && el.dataset.plaintext !== undefined) return el.dataset.plaintext;
      return (typeof el.innerText !== 'undefined') ? el.innerText : el.textContent;
    }

    function blocksToMd(arr) {
      const parts = [];
      const isListLike = type => ['bullet', 'numbered', 'todo'].includes(type);
      const list = (arr || _blocks);
      for (let idx = 0; idx < list.length; idx++) {
        const b = list[idx];
        const colorPrefix = (b.color && b.color !== 'default') || (b.bgColor && b.bgColor !== 'default')
          ? `<!-- color:${b.color||'default'}${b.bgColor ? ' bgColor:'+b.bgColor : ''} -->\n`
          : '';
        const c = (readContent(b.id) ?? b.content ?? '').replace(/\n$/, ''); // trim trailing \n
        const push = (raw) => parts.push({ raw: colorPrefix + raw, type: b.type, indent: getIndent(b) });
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
            const code = ta ? ta.value : c;
            const lang = b.lang || ta?.dataset?.lang || '';
            push('```' + lang + '\n' + code + '\n```');
            break;
          }
          case 'toggle':
          case 'toggle-h1':
          case 'toggle-h2':
          case 'toggle-h3': {
            const hEl = container.querySelector(`[data-id="${b.id}"] .eb-toggle-header`);
            const th = hEl ? (hEl.innerText || '') : (b.content || '');
            const baseIndent = getIndent(b);
            const child = [];
            let j = idx + 1;
            while (j < list.length && getIndent(list[j]) > baseIndent) {
              const nb = { ...list[j] };
              // Normalize child indent inside toggle body so nested toggles round-trip.
              nb.indent = Math.max(0, getIndent(nb) - (baseIndent + 1));
              child.push(nb);
              j++;
            }
            const tb = child.length ? blocksToMd(child) : '';
            push(`:::${b.type} ${th}\n${tb}\n:::`);
            idx = j - 1; // skip descendants already serialized into the toggle body
            break;
          }
          case 'database': push(':::database\n' + (b.content || '{}') + '\n:::'); break;
          case 'table':   push(b.content || ''); break;
          case 'divider': push('---'); break;
          case 'page':    push('[[' + c + (b.pageId ? '|' + b.pageId : '') + ']]'); break;
          default: if (c.trim()) push(c);
        }
      }
      let out = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const next = parts[i + 1];
        out += part.raw;
        if (!next) continue;
        const tightList = isListLike(part.type) && isListLike(next.type) && part.indent === next.indent;
        out += tightList ? '\n' : '\n\n';
      }
      return out;
    }

    // ── RENDER ──────────────────────────────────────────────────
    // Render every block synchronously so restore/load cannot leave a partial
    // page visible if an animation frame is delayed or skipped.
    function render() {
      _nestedMenus.forEach(m => m.remove());
      _nestedMenus.clear();
      container.innerHTML = '';

      if (_blocks.length === 0) {
        _blocks = [{ id:uid(), type:'text', content:'', checked:false, indent: 0 }];
        container.appendChild(makeEl(_blocks[0]));
        return;
      }

      const toggleStack = []; // [{ indent, bodyEl }]
      for (let idx = 0; idx < _blocks.length; idx++) {
        const b = _blocks[idx];
        const el = makeEl(b);
        const ind = getIndent(b);
        while (toggleStack.length && ind <= toggleStack[toggleStack.length - 1].indent) toggleStack.pop();
        const parentToggle = toggleStack.length ? toggleStack[toggleStack.length - 1] : null;
        const parentBody = parentToggle ? parentToggle.bodyEl : null;
        const relativeIndent = parentToggle ? Math.max(0, ind - parentToggle.indent - 1) : ind;
        el.style.marginLeft = relativeIndent ? `${relativeIndent * INDENT_STEP_PX}px` : '';
        if (parentToggle?.trail) el.dataset.trail = parentToggle.trail;
        (parentBody || container).appendChild(el);
        if (b.type && b.type.startsWith('toggle')) {
          const bodyEl = el.querySelector(':scope > .eb-toggle-body-wrap > .eb-toggle-nested');
          if (bodyEl) {
            const label = (b.content || 'Toggle').trim();
            const trail = parentToggle?.trail ? `${parentToggle.trail} / ${label}` : label;
            toggleStack.push({ indent: ind, bodyEl, trail });
          }
        }
      }
    }

    function applyBlockColor(wrap, b) {
      const col = b.color && b.color !== 'default' ? COLOR_NAMES[b.color] : '';
      const bg  = b.bgColor && b.bgColor !== 'default' ? BG_NAMES[b.bgColor] : '';
      // For toggles, scope the background to the row only (not the body)
      const isToggle = b.type && b.type.startsWith('toggle');
      const bgTarget = isToggle ? (wrap.querySelector(':scope > .eb-toggle-row') || wrap) : wrap;
      if (bg) {
        bgTarget.style.setProperty('background', bg, 'important');
        bgTarget.style.borderRadius = '3px';
      } else {
        bgTarget.style.removeProperty('background');
        bgTarget.style.borderRadius = '';
      }
      // Color: set on wrap AND on direct content/header child to beat CSS specificity
      wrap.style.color = col || '';
      const contentEl = wrap.querySelector(':scope > .eb-content, :scope > .eb-toggle-row > .eb-toggle-header');
      if (contentEl) contentEl.style.color = col || '';
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
      wrap.dataset.indent = String(getIndent(b));
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
        _crossDrag = { srcEditor: _selfRef, blockId: b.id };
        setTimeout(() => wrap.classList.add('eb--dragging'), 0);
      });
      handle.addEventListener('dragend', () => {
        wrap.classList.remove('eb--dragging');
        dragSrcId = null;
        _crossDrag = null;
        container.querySelectorAll('.eb--drag-top, .eb--drag-bot, .eb--drop-end').forEach(el =>
          el.classList.remove('eb--drag-top', 'eb--drag-bot', 'eb--drop-end'));
      });
      // Click handle: modifier keys → selection; plain click → block menu
      handle.addEventListener('click', e => {
        e.preventDefault();
        if (e.shiftKey)            { selectBlock(b.id, true, true); }
        else if (e.ctrlKey || e.metaKey) { selectBlock(b.id, true, false); }
        else                       { openBlockMenu(b.id, handle); }
      });

      // + button first, then handle — same layout as Notion
      const optsBtn = document.createElement('button');
      optsBtn.className = 'eb-opts';
      optsBtn.title = 'Añadir bloque abajo';
      optsBtn.innerHTML = '+';
      optsBtn.addEventListener('mousedown', e => { e.preventDefault(); addBlockAfter(b.id, 'text'); });

      controls.appendChild(optsBtn);
      controls.appendChild(handle);
      wrap.appendChild(controls);

      const betweenAdd = document.createElement('button');
      betweenAdd.className = 'eb-between-add';
      betweenAdd.title = 'Añadir bloque debajo';
      betweenAdd.type = 'button';
      betweenAdd.textContent = '+';
      betweenAdd.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        addBlockAfter(b.id, 'text');
      });
      wrap.appendChild(betweenAdd);

      // Drop zone events on every block (same-editor + cross-editor)
      wrap.addEventListener('dragover', e => {
        const sameEd  = dragSrcId  && dragSrcId !== b.id;
        const crossEd = !dragSrcId && _crossDrag && _crossDrag.srcEditor !== _selfRef;
        if (!sameEd && !crossEd) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = wrap.getBoundingClientRect();
        container.querySelectorAll('.eb--drag-top, .eb--drag-bot').forEach(el => el.classList.remove('eb--drag-top', 'eb--drag-bot'));
        wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'eb--drag-top' : 'eb--drag-bot');
      });
      wrap.addEventListener('dragleave', e => {
        if (!e.currentTarget.contains(e.relatedTarget)) wrap.classList.remove('eb--drag-top', 'eb--drag-bot');
      });
      wrap.addEventListener('drop', e => {
        const sameEd  = dragSrcId  && dragSrcId !== b.id;
        const crossEd = !dragSrcId && _crossDrag && _crossDrag.srcEditor !== _selfRef;
        if (!sameEd && !crossEd) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = wrap.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        wrap.classList.remove('eb--drag-top', 'eb--drag-bot');
        if (sameEd) {
          moveBlock(dragSrcId, b.id, before);
          dragSrcId = null;
        } else {
          const { srcEditor, blockId } = _crossDrag;
          const moved = srcEditor._removeBlock(blockId);
          if (moved && moved.length) {
            const ti = _blocks.findIndex(x => x.id === b.id);
            const insertAt = before ? ti : subtreeEndIndex(ti);
            _blocks.splice(insertAt, 0, ...moved);
            render();
            sync();
          }
          _crossDrag = null;
        }
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
        const lang = (b.lang || inferCodeLang(b.content || '')).trim();
        b.lang = lang;

        const codeWrap = document.createElement('div');
        codeWrap.className = 'eb-code-cm-wrap';
        codeWrap.dataset.lang = lang;

        const ta = document.createElement('textarea');
        ta.className = 'eb-code';
        ta.value = b.content || '';
        ta.spellcheck = false;
        ta.autocomplete = 'off';
        ta.autocorrect = 'off';
        ta.autocapitalize = 'off';
        ta.dataset.lang = lang;

        const setLang = nextLang => {
          const l = (nextLang || '').trim();
          b.lang = l;
          ta.dataset.lang = l;
          codeWrap.dataset.lang = l;
          if (langBadge) langBadge.textContent = codeLangLabel(l);
          if (cm) cm.setOption('mode', codeMirrorMode(l));
        };

        const langBadge = document.createElement('span');
        langBadge.className = 'eb-code-lang-badge';
        langBadge.textContent = codeLangLabel(lang);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'eb-code-copy-floating';
        copyBtn.type = 'button';
        copyBtn.textContent = 'copy';
        copyBtn.title = 'Copiar codigo';
        copyBtn.addEventListener('mousedown', e => e.preventDefault());
        copyBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard?.writeText(ta.value).then(() => {
            copyBtn.textContent = 'copied';
            setTimeout(() => { copyBtn.textContent = 'copy'; }, 1200);
          }).catch(() => {});
        });

        codeWrap.appendChild(ta);
        codeWrap.appendChild(langBadge);
        codeWrap.appendChild(copyBtn);
        wrap.appendChild(codeWrap);

        let cm = null;
        if (window.CodeMirror) {
          requestAnimationFrame(() => {
            if (!container.contains(ta)) return;
            cm = CodeMirror.fromTextArea(ta, {
              mode: codeMirrorMode(lang),
              theme: 'material-darker',
              lineNumbers: true,
              lineWrapping: false,
              indentUnit: 2,
              tabSize: 2,
              indentWithTabs: false,
              viewportMargin: Infinity,
              extraKeys: {
                Tab(editor) {
                  if (editor.somethingSelected()) editor.indentSelection('add');
                  else editor.replaceSelection('  ', 'end');
                },
                Esc(editor) {
                  editor.getInputField().blur();
                },
              },
            });
            cm.on('change', editor => {
              b.content = editor.getValue();
              ta.value = b.content;
              if (!b.lang) {
                const detected = inferCodeLang(b.content);
                if (detected) setLang(detected);
              }
              sync();
            });
          });
        } else {
          ta.addEventListener('input', () => {
            b.content = ta.value;
            if (!b.lang) {
              const detected = inferCodeLang(b.content);
              if (detected) setLang(detected);
            }
            sync();
          });
        }

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
        const link = document.createElement(b.pageId ? 'a' : 'span');
        link.className = 'eb-page-link' + (b.pageId ? ' eb-page-navigable' : '');
        link.dataset.pageTitle = b.content || '';
        link.dataset.pageId    = b.pageId || '';
        if (b.pageId) link.href = '#';
        link.title = b.pageId ? 'Clic para abrir esta página' : 'Sub-página';
        link.innerHTML = `<span class="eb-page-icon">⬡</span><span class="eb-page-name">${escHtml(b.content || 'Sin título')}</span><span class="eb-page-arrow">→</span>`;
        link.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (b.pageId && window._loadEntryById) window._loadEntryById(b.pageId);
        });
        wrap.appendChild(link);
        return wrap;
      }

      // ── DATABASE block ──────────────────────────────────────────
      if (b.type === 'database') {
        const dbContainer = document.createElement('div');
        dbContainer.className = 'eb-db-container';
        makeDatabase(dbContainer, b, sync);
        wrap.appendChild(dbContainer);
        return wrap;
      }

      // ── TABLE block ─────────────────────────────────────────────
      if (b.type === 'table') {
        const tWrap = document.createElement('div');
        tWrap.className = 'eb-table-wrap';
        tWrap.tabIndex = 0;
        tWrap.addEventListener('keydown', e => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteBlock(b.id);
          }
        });
        wrap.appendChild(tWrap);
        makeSimpleTable(tWrap, b, sync);
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
        if (b.content) hDiv.innerText = b.content;
        if (hTag) hDiv.dataset.headingTag = hTag;

        tRow.appendChild(arrow);
        tRow.appendChild(hDiv);
        wrap.appendChild(tRow);

        // Body — real child blocks (same editor tree), collapsible
        const body = document.createElement('div');
        body.className = 'eb-toggle-body-wrap';
        body.style.display = isOpen ? '' : 'none';

        const nestedContainer = document.createElement('div');
        nestedContainer.className = 'eb-toggle-nested';
        body.appendChild(nestedContainer);
        wrap.appendChild(body);

        body.addEventListener('dragover', e => {
          const sameEd  = dragSrcId && dragSrcId !== b.id;
          const crossEd = !dragSrcId && _crossDrag && _crossDrag.srcEditor !== _selfRef;
          if (!sameEd && !crossEd) return;
          if (e.target.closest('.eb[data-id]') && e.target.closest('.eb[data-id]') !== wrap) return;
          e.preventDefault();
          e.stopPropagation();
          body.classList.add('eb-toggle-body-wrap--drop');
        });
        body.addEventListener('dragleave', e => {
          if (!body.contains(e.relatedTarget)) body.classList.remove('eb-toggle-body-wrap--drop');
        });
        body.addEventListener('drop', e => {
          const sameEd  = dragSrcId && dragSrcId !== b.id;
          const crossEd = !dragSrcId && _crossDrag && _crossDrag.srcEditor !== _selfRef;
          if (!sameEd && !crossEd) return;
          if (e.target.closest('.eb[data-id]') && e.target.closest('.eb[data-id]') !== wrap) return;
          e.preventDefault();
          e.stopPropagation();
          body.classList.remove('eb-toggle-body-wrap--drop');
          if (sameEd) {
            moveBlockIntoToggle(dragSrcId, b.id);
            dragSrcId = null;
          } else {
            const { srcEditor, blockId } = _crossDrag;
            const moved = srcEditor._removeBlock(blockId);
            if (moved && moved.length) {
              saveHistory();
              appendBlocksToToggle(moved, b.id);
            }
            _crossDrag = null;
          }
        });

        // Arrow toggle
        arrow.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const prevScroll = container.scrollTop;
          b.open = !b.open;
          arrow.innerHTML = b.open
            ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4 2l4 4-4 4"/></svg>';
          arrow.title = b.open ? 'Colapsar' : 'Expandir';
          body.style.display = b.open ? '' : 'none';
          saveToggleStateSnapshot();
          container.scrollTop = prevScroll;
        });

        // Header keydown
        hDiv.addEventListener('keydown', e => onKeydown(e, b, hDiv));
        hDiv.addEventListener('input',   e => {
          if (e.inputType && !e.inputType.startsWith('history')) _textEditedSinceStructure = true;
          if (e.inputType && e.inputType.startsWith('history')) _textEditedSinceStructure = false;
          b.content = hDiv.innerText;
          sync({ defer: true });
        });
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
      div.dataset.plaintext = b.content || '';

      // Set initial content and apply inline rendering
      if (b.content) {
        div.innerText = b.content;
        applyInlineRender(div, b.content);
      }

      div.addEventListener('keydown', e => onKeydown(e, b, div));
      div.addEventListener('input', e => {
        _structuralDirty = false;
        if (e.inputType && !e.inputType.startsWith('history')) _textEditedSinceStructure = true;
        if (e.inputType && e.inputType.startsWith('history')) _textEditedSinceStructure = false;
        div.dataset.plaintext = htmlToMd(div).replace(/\n$/, '');
        onInput(b, div);
      });
      div.addEventListener('focus', () => {
        wrap.classList.add('eb--focused');
      });
      div.addEventListener('blur', () => {
        reRenderInline(div);
        wrap.classList.remove('eb--focused');
        sync();
      });
      wrap.appendChild(div);
      return wrap;
    }

    // ── BLOCK OPS ───────────────────────────────────────────────
    function addBlockAfter(afterId, type, content = '', opts = {}) {
      if (opts.recordHistory !== false) saveHistory();
      const idx = _blocks.findIndex(b => b.id === afterId);
      const baseIndent = getIndent(_blocks[idx]);
      const insertAt = subtreeEndIndex(idx);
      const nb = { id: uid(), type, content, checked: false, indent: baseIndent };
      _blocks.splice(insertAt, 0, nb);
      // Re-render to ensure the new block is attached under the correct parent toggle body.
      render();
      const newEl = container.querySelector(`[data-id="${nb.id}"]`);
      const c = newEl.querySelector('.eb-content');
      if (c && !opts.noFocus) { c.focus(); placeCursorEnd(c); }
      sync();
      return nb;
    }

    function insertBlockBefore(beforeId, type, content = '', opts = {}) {
      if (opts.recordHistory !== false) saveHistory();
      const idx = _blocks.findIndex(b => b.id === beforeId);
      if (idx < 0) return;
      const nb = { id: uid(), type, content, checked: false, indent: getIndent(_blocks[idx]) };
      _blocks.splice(idx, 0, nb);
      render();
      const newEl = container.querySelector(`[data-id="${nb.id}"]`);
      const c = newEl.querySelector('.eb-content');
      if (c) { c.focus(); placeCursorEnd(c); }
      sync();
    }

    function deleteBlock(id) {
      saveHistory();
      const idx = _blocks.findIndex(b => b.id === id);
      if (_blocks.length <= 1) { clearBlock(id); return; }
      const end = subtreeEndIndex(idx);
      _blocks.splice(idx, end - idx);
      const el = container.querySelector(`[data-id="${id}"]`);
      // Clean up any nested slash menu for this toggle block
      const nm = _nestedMenus.get(id);
      if (nm) { nm.remove(); _nestedMenus.delete(id); }
      const prevId = _blocks[Math.max(0, idx - 1)].id;
      render();
      const prevC = container.querySelector(`[data-id="${prevId}"] .eb-content`);
      if (prevC) { prevC.focus(); placeCursorEnd(prevC); }
      sync();
    }

    function clearBlock(id) {
      const el = container.querySelector(`[data-id="${id}"] .eb-content`);
      if (el) el.innerText = '';
      sync();
    }

    function mergeBlockIntoPrevious(id) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx <= 0) return false;
      const prev = _blocks[idx - 1];
      const cur = _blocks[idx];
      if (!prev || !cur) return false;
      if (['table','code','divider','page','database'].includes(prev.type)) return false;
      if (['table','code','divider','page','database'].includes(cur.type)) return false;

      saveHistory();
      const prevText = readContent(prev.id) ?? prev.content ?? '';
      const curText = readContent(cur.id) ?? cur.content ?? '';
      prev.content = prevText + curText;
      _blocks.splice(idx, 1);
      render();
      const prevEl = container.querySelector(editableSelector(prev.id));
      if (prevEl) {
        prevEl.focus();
        placeCursorTextOffset(prevEl, prevText.length);
      }
      sync();
      return true;
    }

    function convertBlock(id, newType) {
      saveHistory();
      const idx = _blocks.findIndex(b => b.id === id);
      const b = idx >= 0 ? _blocks[idx] : null;
      if (!b) return;
      const isToggleSrc = b.type.startsWith('toggle');
      const isToggleDst = newType.startsWith('toggle');
      if (isToggleSrc) {
        // reading from toggle header
        const hEl = container.querySelector(`[data-id="${id}"] .eb-toggle-header`);
        const src = hEl ? (hEl.innerText || '') : (b.content || '');
        b.content = src;
      } else {
        b.content = readContent(id) ?? b.content;
        if (isToggleDst) {
          // Adopt following sibling blocks as toggle children by indenting them.
          const baseIndent = getIndent(_blocks[idx]);
          for (let j = idx + 1; j < _blocks.length; j++) {
            const nb = _blocks[j];
            if (getIndent(nb) < baseIndent) break;
            if (getIndent(nb) === baseIndent && ['h1','h2','toggle-h1','toggle-h2','divider'].includes(nb.type)) break;
            if (!['toggle','toggle-h1','toggle-h2','toggle-h3','table','code','divider','page','database'].includes(nb.type)) {
              nb.content = readContent(nb.id) ?? nb.content ?? '';
            }
            nb.indent = Math.max(getIndent(nb), baseIndent + 1);
          }
        }
      }
      b.type = newType;
      if (isToggleDst && b.open === undefined) b.open = true;
      render();
      const newEl = container.querySelector(`[data-id="${id}"]`);
      const c = newEl?.querySelector('.eb-toggle-header, .eb-content');
      if (c) { c.focus(); placeCursorEnd(c); }
      sync();
    }

    // ── CONVERT MENU ────────────────────────────────────────────
    function openConvertMenu(blockId, anchor) {
      closeConvertMenu();
      const m = document.createElement('div');
      m.className = 'eb-convert-menu';
      // Build content first (off-screen) so we can measure real height
      m.style.visibility = 'hidden';
      m.style.position = 'fixed';
      m.innerHTML = CMDS.filter(c => c.type !== 'page' && c.type !== 'divider' && c.type !== 'table').map(c =>
        `<div class="eb-convert-item" data-type="${c.type}"><span>${c.icon}</span>${c.label}</div>`
      ).join('');
      document.body.appendChild(m);

      const rect = anchor.getBoundingClientRect();
      const menuH = m.offsetHeight;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      let top;
      if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
        top = rect.bottom + 4;
        m.style.maxHeight = Math.max(spaceBelow, 100) + 'px';
      } else {
        m.style.maxHeight = Math.max(spaceAbove, 100) + 'px';
        top = rect.top - Math.min(menuH, spaceAbove) - 4;
      }
      m.style.top = Math.max(8, top) + 'px';
      m.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
      m.style.overflowY = 'auto';
      m.style.visibility = '';

      m.querySelectorAll('.eb-convert-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          convertBlock(blockId, el.dataset.type);
          closeConvertMenu();
        });
      });
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
        { label:'Copiar Markdown', icon:'⧉', action: () => {
          const idx = _blocks.findIndex(b => b.id === blockId);
          if (idx >= 0) navigator.clipboard?.writeText(blocksToMd(sliceSubtree(idx))).catch(() => {});
          closeBlockMenu();
        } },
        { label:'Seleccionar hijos', icon:'□', action: () => {
          clearSelection();
          const idx = _blocks.findIndex(b => b.id === blockId);
          const end = subtreeEndIndex(idx);
          for (let j = idx; j < end; j++) {
            _selected.add(_blocks[j].id);
            container.querySelector(`[data-id="${_blocks[j].id}"]`)?.classList.add('eb--selected');
          }
          closeBlockMenu();
        } },
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

      m.addEventListener('mouseleave', e => {
        if (!colorMenu?.contains(e.relatedTarget) && !turnIntoMenu?.contains(e.relatedTarget)) {
          closeColorMenu();
          closeTurnIntoMenu();
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
      m.addEventListener('mouseleave', e => {
        if (!blockMenu?.contains(e.relatedTarget)) closeColorMenu();
      });
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
      m.style.visibility = 'hidden';
      m.style.position = 'fixed';

      const types = CMDS.filter(c => !['page','divider','table'].includes(c.type));
      m.innerHTML = types.map(c =>
        `<div class="eb-bm-item" data-type="${c.type}">
           <span class="eb-bm-icon">${c.icon}</span><span>${c.label}</span>
         </div>`
      ).join('');
      document.body.appendChild(m);

      const menuH = m.offsetHeight;
      const menuW = m.offsetWidth || 200;
      const spaceBelow = window.innerHeight - rect.top - 8;
      const spaceRight = window.innerWidth - rect.right - 8;
      const left = spaceRight >= menuW ? rect.right + 4 : rect.left - menuW - 4;
      let top = rect.top;
      if (top + menuH > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuH - 8);
      }
      m.style.maxHeight = (window.innerHeight - top - 8) + 'px';
      m.style.overflowY = 'auto';
      m.style.top  = top + 'px';
      m.style.left = Math.max(8, left) + 'px';
      m.style.visibility = '';

      m.querySelectorAll('.eb-bm-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          convertBlock(blockId, el.dataset.type);
          closeBlockMenu();
        });
      });
      turnIntoMenu = m;
      m.addEventListener('mouseleave', e => {
        if (!blockMenu?.contains(e.relatedTarget)) closeTurnIntoMenu();
      });
    }
    function closeTurnIntoMenu() { if (turnIntoMenu) { turnIntoMenu.remove(); turnIntoMenu = null; } }

    // ── MOVE BLOCK (drag & drop) ────────────────────────────────
    function moveBlock(srcId, targetId, before) {
      saveHistory();
      const si = _blocks.findIndex(b => b.id === srcId);
      if (si < 0) return;
      const moved = sliceSubtree(si);
      const se = subtreeEndIndex(si);
      _blocks.splice(si, se - si);
      const ti = _blocks.findIndex(b => b.id === targetId);
      if (ti < 0) { _blocks.push(...moved); render(); sync(); return; }
      const insertAt = before ? ti : subtreeEndIndex(ti);
      _blocks.splice(insertAt, 0, ...moved);
      render();
      sync();
    }

    function appendBlocksToToggle(blocks, toggleId) {
      const ti = _blocks.findIndex(b => b.id === toggleId);
      if (ti < 0 || !_blocks[ti].type?.startsWith('toggle') || !blocks?.length) return false;
      _blocks[ti].open = true;
      adjustSubtreeIndent(blocks, getIndent(_blocks[ti]) + 1);
      _blocks.splice(subtreeEndIndex(ti), 0, ...blocks);
      render();
      focusBlock(blocks[0].id);
      sync();
      return true;
    }

    function moveBlockIntoToggle(srcId, toggleId) {
      const si = _blocks.findIndex(b => b.id === srcId);
      const ti = _blocks.findIndex(b => b.id === toggleId);
      if (si < 0 || ti < 0 || srcId === toggleId) return false;
      const se = subtreeEndIndex(si);
      if (ti >= si && ti < se) return false;
      saveHistory();
      const moved = _blocks.splice(si, se - si);
      return appendBlocksToToggle(moved, toggleId);
    }

    function moveBlockByKeyboard(id, direction) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx < 0) return false;
      const indent = getIndent(_blocks[idx]);
      const end = subtreeEndIndex(idx);

      if (direction < 0) {
        let prev = idx - 1;
        while (prev >= 0 && getIndent(_blocks[prev]) > indent) prev--;
        if (prev < 0 || getIndent(_blocks[prev]) !== indent) return false;
        saveHistory();
        const moved = _blocks.splice(idx, end - idx);
        _blocks.splice(prev, 0, ...moved);
        render();
        focusBlock(id);
        sync();
        return true;
      }

      let next = end;
      if (next >= _blocks.length || getIndent(_blocks[next]) !== indent) return false;
      const nextEnd = subtreeEndIndex(next);
      saveHistory();
      const moved = _blocks.splice(idx, end - idx);
      const insertAt = nextEnd - moved.length;
      _blocks.splice(insertAt, 0, ...moved);
      render();
      focusBlock(id);
      sync();
      return true;
    }

    function indentBlock(id, direction) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx < 0) return false;
      const current = getIndent(_blocks[idx]);
      let next = current;
      if (direction > 0) {
        if (idx === 0) return false;
        const prev = _blocks[idx - 1];
        next = Math.min(current + 1, getIndent(prev) + 1);
      } else if (current > 0) {
        next = current - 1;
      }
      if (next === current) return false;

      saveHistory();
      const delta = next - current;
      const end = subtreeEndIndex(idx);
      for (let i = idx; i < end; i++) {
        _blocks[i].indent = Math.max(0, getIndent(_blocks[i]) + delta);
      }
      render();
      focusBlock(id);
      sync();
      return true;
    }

    // ── DUPLICATE BLOCK ─────────────────────────────────────────
    function duplicateBlock(id) {
      saveHistory();
      const si = _blocks.findIndex(b => b.id === id);
      if (si < 0) return;
      const se = subtreeEndIndex(si);
      // Read live DOM content before cloning
      for (let i = si; i < se; i++) {
        const b = _blocks[i];
        if (!['toggle','toggle-h1','toggle-h2','toggle-h3','table','code','divider','page','database'].includes(b.type)) {
          b.content = readContent(b.id) ?? b.content;
        }
      }
      const subtree = _blocks.slice(si, se).map(b => ({ ...b, id: uid() }));
      _blocks.splice(se, 0, ...subtree);
      render();
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

    function placeCursorTextOffset(el, offset) {
      try {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let remaining = Math.max(0, offset);
        let node = walker.nextNode();
        while (node) {
          if (remaining <= node.textContent.length) {
            const r = document.createRange();
            r.setStart(node, remaining);
            r.collapse(true);
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(r);
            return;
          }
          remaining -= node.textContent.length;
          node = walker.nextNode();
        }
        placeCursorEnd(el);
      } catch(e) {
        placeCursorEnd(el);
      }
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
      for (let i = idx - 1; i >= 0; i--) {
        const prevId = _blocks[i].id;
        const prevEl = container.querySelector(`[data-id="${prevId}"] .eb-content, [data-id="${prevId}"] .eb-toggle-header`);
        if (prevEl && prevEl.offsetParent !== null) { prevEl.focus(); placeCursorEnd(prevEl); return; }
      }
    }

    function focusNextBlock(id) {
      const idx = _blocks.findIndex(b => b.id === id);
      if (idx >= _blocks.length - 1) return;
      for (let i = idx + 1; i < _blocks.length; i++) {
        const nextId = _blocks[i].id;
        const nextEl = container.querySelector(`[data-id="${nextId}"] .eb-content, [data-id="${nextId}"] .eb-toggle-header`);
        if (nextEl && nextEl.offsetParent !== null) { nextEl.focus(); placeCursorStart(nextEl); return; }
      }
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

      if (e.key === 'Escape') {
        const idx = _blocks.findIndex(x => x.id === b.id);
        const parentIdx = parentToggleIndex(idx);
        if (parentIdx >= 0) {
          e.preventDefault();
          focusBlock(_blocks[parentIdx].id);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveBlockByKeyboard(b.id, e.key === 'ArrowUp' ? -1 : 1);
        return;
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

      // Tab / Shift+Tab → indent or outdent current block subtree.
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        indentBlock(b.id, 1);
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        indentBlock(b.id, -1);
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
        // Toggle header behaves like Notion: Enter creates first/next child inside the toggle.
        if (b.type.startsWith('toggle') && div.classList.contains('eb-toggle-header')) {
          if (!b.open) {
            addBlockAfter(b.id, 'text');
            return;
          }
          const idx = _blocks.findIndex(x => x.id === b.id);
          const nb = { id: uid(), type: 'text', content: '', checked:false, indent: getIndent(b) + 1 };
          _blocks.splice(idx + 1, 0, nb);
          render();
          const c = container.querySelector(`[data-id="${nb.id}"] .eb-content`);
          if (c) { c.focus(); placeCursorEnd(c); }
          sync();
          return;
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
      if (e.key === 'Backspace' && isCursorAtStart(div) && div.innerText.trim() !== '') {
        if (mergeBlockIntoPrevious(b.id)) {
          e.preventDefault();
          hideMenu();
          return;
        }
      }
      if (e.key === 'Backspace' && div.innerText.trim() === '') {
        e.preventDefault();
        hideMenu();
        if (b.type !== 'text') { convertBlock(b.id, 'text'); return; }
        deleteBlock(b.id);
        return;
      }
    }

    function applyMarkdownShortcut(b, div, text) {
      if (div.classList.contains('eb-toggle-header')) return false;
      const shortcuts = {
        '# ': 'h1',
        '## ': 'h2',
        '### ': 'h3',
        '#### ': 'h4',
        '- ': 'bullet',
        '* ': 'bullet',
        '1. ': 'numbered',
        '> ': 'quote',
      };
      let type = shortcuts[text];
      let checked = false;
      if (!type && (text === '[ ] ' || text === '[] ' || text === '- [ ] ')) {
        type = 'todo';
      }
      if (!type && (text === '[x] ' || text === '- [x] ')) {
        type = 'todo';
        checked = true;
      }
      if (!type && text === '```') type = 'code';
      if (!type && text === '---') type = 'divider';
      if (!type) return false;

      saveHistory();
      b.type = type;
      b.content = '';
      if (type === 'todo') b.checked = checked;
      render();
      if (type === 'divider') {
        addBlockAfter(b.id, 'text');
      } else {
        focusBlock(b.id);
      }
      sync();
      return true;
    }

    // ── INPUT / SLASH ────────────────────────────────────────────
    function onInput(b, div) {
      const text = div.innerText || div.textContent;
      if (applyMarkdownShortcut(b, div, text)) return;
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
      // Keep the model updated so collapsed/hidden blocks serialize correctly.
      b.content = div.dataset.plaintext !== undefined ? div.dataset.plaintext : (htmlToMd(div).replace(/\n$/, ''));
      sync({ defer: true });
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
      if (type === 'divider') { convertBlock(blockId, 'divider'); addBlockAfter(blockId, 'text', '', { recordHistory: false }); return; }
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
          render();
        }
        sync(); return;
      }
      convertBlock(blockId, type);
    }

    // ── SYNC ────────────────────────────────────────────────────
    let _syncHistoryTimer = null;
    function sync(opts = {}) {
      if (_loading) return; // never fire onChange during load
      if (opts.defer) {
        clearTimeout(_syncHistoryTimer);
        _syncHistoryTimer = setTimeout(() => sync(), 80);
        return;
      }
      const md = blocksToMd();
      if (syncTarget) syncTarget.value = md;
      if (onChange) onChange(md);
      clearTimeout(_syncHistoryTimer);
      _syncHistoryTimer = null;
    }

    // ── PUBLIC ──────────────────────────────────────────────────
    function load(md) {
      _loading = true;
      clearTimeout(_syncHistoryTimer);
      _undoStack.length = 0;
      _lastSavedMd = null;
      _structuralDirty = false;
      _blocks = mdToBlocks(md);
      applyToggleStateSnapshot(loadToggleStateSnapshot());
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
        const nb = { id: uid(), type: 'page', content: pageName, pageId, indent: 0 };
        _blocks.push(nb);
        render();
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
      const focused = document.activeElement;

      const html = e.clipboardData?.getData('text/html') || '';
      const text = e.clipboardData?.getData('text/plain') || '';
      const normalizedText = normalizePastedText(text);
      const focusedWrap = focused?.closest?.('[data-id]');
      const focusedId = focusedWrap?.dataset?.id;
      const focusedIdx = focusedId ? _blocks.findIndex(x => x.id === focusedId) : -1;
      const focusedBlock = focusedIdx >= 0 ? _blocks[focusedIdx] : null;
      const baseIndent = focusedBlock ? getIndent(focusedBlock) : 0;
      const inToggleHeader = !!(focused && focused.classList?.contains('eb-toggle-header'));
      const insertIndent = inToggleHeader ? (baseIndent + 1) : baseIndent;
      const bumpIndent = (arr, delta) => arr.forEach(b => { b.indent = getIndent(b) + delta; });
      const insertBlocks = (newBlocks) => {
        if (!newBlocks.length) return;
        if (_selected.size > 0 && replaceSelectedBlocks(newBlocks)) return;
        saveHistory();
        if (focusedIdx >= 0) {
          const replace = focusedBlock && focusedBlock.type === 'text' && !(focusedBlock.content || '').trim();
          const insertAt = inToggleHeader ? (focusedIdx + 1) : (replace ? focusedIdx : focusedIdx + 1);
          if (replace && !inToggleHeader) _blocks.splice(focusedIdx, 1, ...newBlocks);
          else _blocks.splice(insertAt, 0, ...newBlocks);
        } else {
          _blocks.push(...newBlocks);
        }
        render();
        focusBlock(newBlocks[0].id);
        sync();
      };

      // If the clipboard is only a table, convert it directly. Otherwise parse
      // the full HTML fragment so a table inside a copied page does not swallow
      // the rest of the pasted content.
      const tableOnlyHtml = html && /<table[\s>]/i.test(html) && (() => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('style, script, meta, link').forEach(el => el.remove());
        return tmp.children.length === 1 && tmp.firstElementChild?.tagName?.toLowerCase() === 'table';
      })();
      if (tableOnlyHtml) {
        const md = htmlTableToMd(html);
        if (md) {
          e.preventDefault();
          const nb = { id: uid(), type: 'table', content: md, indent: insertIndent };
          if (focusedIdx >= 0) {
            const replace = focusedBlock && focusedBlock.type === 'text' && !(focusedBlock.content || '').trim();
            if (replace) _blocks.splice(focusedIdx, 1, nb);
            else _blocks.splice(focusedIdx + 1, 0, nb);
          } else {
            _blocks.push(nb);
          }
          render(); sync(); return;
        }
      }

      const tsvMd = normalizedText ? tsvToMd(normalizedText) : null;
      if (tsvMd) {
        e.preventDefault();
        insertBlocks([{ id: uid(), type: 'table', content: tsvMd, indent: insertIndent }]);
        return;
      }

      // Markdown paste: works whether clipboard has HTML or only plain text
      if (normalizedText && looksLikeMarkdown(normalizedText)) {
        e.preventDefault();
        const newBlocks = mdToBlocks(normalizedText);
        newBlocks.forEach(b => {
          if (b.type === 'code' && !b.lang) b.lang = inferCodeLang(b.content || '');
        });
        bumpIndent(newBlocks, insertIndent);
        insertBlocks(newBlocks);
        return;
      }

      if (html && /<(h[1-4]|p|div|ul|ol|li|blockquote|pre|table|hr)\b/i.test(html)) {
        const htmlBlocks = htmlToPasteBlocks(html, insertIndent);
        if (htmlBlocks.length) {
          e.preventDefault();
          insertBlocks(htmlBlocks);
          return;
        }
      }

      // Plain text paste: let browser handle, sync plaintext tracking after
      if (_selected.size > 0 && normalizedText) {
        e.preventDefault();
        const blocks = mdToBlocks(normalizedText);
        replaceSelectedBlocks(blocks);
        return;
      }

      // Plain text paste: let browser handle, sync plaintext tracking after
      if (focused?.classList.contains('eb-content')) {
        setTimeout(() => {
          focused.dataset.plaintext = focused.innerText.replace(/\n$/, '');
        }, 0);
      }
    });

    // Container-level drag: handles drops in empty space / below all blocks
    container.addEventListener('dragover', e => {
      const sameEd  = !!dragSrcId;
      const crossEd = _crossDrag && _crossDrag.srcEditor !== _selfRef;
      if (!sameEd && !crossEd) return;
      if (e.target.closest('[data-id]')) return; // block-level handler takes priority
      e.preventDefault();
      container.classList.add('eb--drop-end');
    });
    container.addEventListener('dragleave', e => {
      if (!container.contains(e.relatedTarget)) container.classList.remove('eb--drop-end');
    });
    container.addEventListener('drop', e => {
      container.classList.remove('eb--drop-end');
      if (e.target.closest('[data-id]')) return; // block-level handler took it
      if (dragSrcId) {
        const last = _blocks[_blocks.length - 1];
        if (last && last.id !== dragSrcId) moveBlock(dragSrcId, last.id, false);
        dragSrcId = null;
      } else if (_crossDrag && _crossDrag.srcEditor !== _selfRef) {
        e.preventDefault();
        const { srcEditor, blockId } = _crossDrag;
        const moved = srcEditor._removeBlock(blockId);
        if (moved && moved.length) { _blocks.push(...moved); render(); sync(); }
        _crossDrag = null;
      }
    });

    document.addEventListener('copy', e => {
      writeSelectedBlocksToClipboard(e);
    });

    document.addEventListener('cut', e => {
      if (!writeSelectedBlocksToClipboard(e)) return;
      deleteSelectedBlocks({ keepEmpty: true });
    });

    // Selection + undo keyboard shortcuts
    document.addEventListener('keydown', e => {
      const hasFocus = container.contains(document.activeElement);
      const activeIsEditable = isEditableTarget(document.activeElement);
      const activeText = editableText(document.activeElement);
      if (!hasFocus && _selected.size === 0) return;
      if (_selected.size > 0 && e.key === 'Escape') { clearSelection(); return; }
      if (_selected.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelectedBlocks();
        return;
      }
      // Let the browser handle text-level undo/redo inside editable blocks.
      // Use editor-level undo only for structural actions or block selections.
      if ((_selected.size > 0 ||
           (hasFocus && !activeIsEditable) ||
           (hasFocus && activeIsEditable && _pendingStructuralUndo && !_textEditedSinceStructure)) &&
          (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (hasFocus && (e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement;
        if (!isEditableTarget(active)) {
          // Not in a text field — select all blocks directly
          e.preventDefault();
          selectAllBlocks();
        } else {
          // In an editable: first press selects text in block (native),
          // second press (when all text already selected) selects all blocks
          const sel = window.getSelection();
          const text = editableText(active);
          const selectedText = sel ? sel.toString() : '';
          if (text && selectedText.replace(/\n$/, '') === text.replace(/\n$/, '')) {
            e.preventDefault();
            selectAllBlocks();
          }
          // else: let browser handle native text selection
        }
      }
    });

    // Clicking the container background deselects
    container.addEventListener('mousedown', e => {
      if (_selected.size === 0) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) return;
      clearSelection();
    });

    // Drag-select blocks from the left margin.
    let marginSelecting = false;
    let marginStartIdx = -1;
    container.addEventListener('mousedown', e => {
      const blockEl = e.target.closest('.eb[data-id]');
      if (!blockEl || e.target.closest('.eb-content, .eb-toggle-header, button, input, textarea, table')) return;
      const rect = blockEl.getBoundingClientRect();
      if (e.clientX > rect.left + 54) return;
      e.preventDefault();
      marginSelecting = true;
      marginStartIdx = _blocks.findIndex(b => b.id === blockEl.dataset.id);
      clearSelection();
      selectBlock(blockEl.dataset.id, true, false);
    });
    document.addEventListener('mousemove', e => {
      if (!marginSelecting) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.eb[data-id]');
      if (!el || !container.contains(el)) return;
      const idx = _blocks.findIndex(b => b.id === el.dataset.id);
      if (idx < 0 || marginStartIdx < 0) return;
      clearSelection();
      const from = Math.min(marginStartIdx, idx);
      const to = Math.max(marginStartIdx, idx);
      for (let i = from; i <= to; i++) {
        _selected.add(_blocks[i].id);
        container.querySelector(`[data-id="${_blocks[i].id}"]`)?.classList.add('eb--selected');
      }
      _lastSelIdx = idx;
    });
    document.addEventListener('mouseup', () => {
      marginSelecting = false;
      marginStartIdx = -1;
    });

    // Notion-like click: clicking in vertical whitespace inserts a new block at that position.
    // Also: clicking inside an empty toggle body inserts a child block inside that toggle.
    container.addEventListener('click', e => {
      // If clicking inside a toggle body wrap but not on an actual child block, insert as last child.
      const bodyWrap = e.target.closest('.eb-toggle-body-wrap');
      const childBlock = bodyWrap ? e.target.closest('.eb[data-id]') : null;
      if (bodyWrap && childBlock && childBlock.closest('.eb-toggle-body-wrap') === bodyWrap) {
        // Click was on an existing child block; let normal behavior happen.
        return;
      }
      if (bodyWrap) {
        const toggleWrap = bodyWrap.closest('.eb[data-id]');
        const tid = toggleWrap?.dataset?.id;
        const ti = tid ? _blocks.findIndex(b => b.id === tid) : -1;
        if (ti >= 0) {
          const insertAt = subtreeEndIndex(ti);
          const nb = { id: uid(), type: 'text', content: '', checked:false, indent: getIndent(_blocks[ti]) + 1 };
          _blocks.splice(insertAt, 0, nb);
          render();
          const editable = container.querySelector(`[data-id="${nb.id}"] .eb-content`);
          if (editable) { editable.focus(); placeCursorEnd(editable); }
          sync();
          return;
        }
      }

      // If click is not on a block at all, insert based on Y position.
      if (!e.target.closest('.eb[data-id]')) {
        const visible = Array.from(container.querySelectorAll('.eb[data-id]')).filter(el => el.offsetParent !== null);
        const y = e.clientY;
        let beforeId = null;
        for (const el of visible) {
          const r = el.getBoundingClientRect();
          if (y < (r.top + r.height / 2)) { beforeId = el.dataset.id; break; }
        }
        if (beforeId) insertBlockBefore(beforeId, 'text');
        else {
          const last = _blocks[_blocks.length - 1];
          if (!last) { _blocks.push({ id: uid(), type: 'text', content: '', checked:false, indent: 0 }); render(); return; }
          addBlockAfter(last.id, 'text');
        }
      }
    });

    // Initial empty state
    _blocks = [{ id:uid(), type:'text', content:'', checked:false, indent: 0 }];
    render();

    let _findMatches = [];
    let _findIdx = -1;
    function findText(query) {
      const q = (query || '').toLowerCase();
      _findMatches = q
        ? _blocks.map((b, i) => ({ b, i, text: (readContent(b.id) ?? b.content ?? '').toLowerCase() }))
            .filter(x => x.text.includes(q))
        : [];
      _findIdx = _findMatches.length ? 0 : -1;
      if (_findIdx >= 0) {
        focusBlock(_findMatches[_findIdx].b.id);
        container.querySelector(`[data-id="${_findMatches[_findIdx].b.id}"]`)?.scrollIntoView({ block:'center', behavior:'smooth' });
      }
      return { count: _findMatches.length, index: _findIdx };
    }
    function findNext() {
      if (!_findMatches.length) return { count: 0, index: -1 };
      _findIdx = (_findIdx + 1) % _findMatches.length;
      focusBlock(_findMatches[_findIdx].b.id);
      container.querySelector(`[data-id="${_findMatches[_findIdx].b.id}"]`)?.scrollIntoView({ block:'center', behavior:'smooth' });
      return { count: _findMatches.length, index: _findIdx };
    }
    function replaceAllText(query, replacement) {
      if (!query) return 0;
      saveHistory();
      const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let changed = 0;
      _blocks.forEach(b => {
        if (['table','code','divider','page','database'].includes(b.type)) return;
        const text = readContent(b.id) ?? b.content ?? '';
        if (!re.test(text)) return;
        re.lastIndex = 0;
        b.content = text.replace(re, replacement || '');
        changed++;
      });
      if (changed) { render(); sync(); }
      return changed;
    }

    _selfRef = {
      load, loadMarkdown: load, getMarkdown, addPageBlock, focusFirst,
      selectAllBlocks,
      findText,
      findNext,
      replaceAllText,
      setPersistenceKey(key) {
        _toggleStateKey = key ? `kb_toggle_state:${key}` : '';
      },
      // Cross-editor drag API
      _removeBlock(id) {
        const idx = _blocks.findIndex(b => b.id === id);
        if (idx < 0) return null;
        const end = subtreeEndIndex(idx);
        const removed = _blocks.splice(idx, end - idx);
        render();
        sync();
        return removed;
      },
      _appendBlock(blocks) {
        const arr = Array.isArray(blocks) ? blocks : [blocks];
        _blocks.push(...arr);
        render();
        sync();
      },
    };
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
