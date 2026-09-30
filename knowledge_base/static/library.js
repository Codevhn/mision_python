// ── FEATURE: Biblioteca — lector de PDF/EPUB con progreso, marcadores,
// resaltados/notas y OCR bajo demanda. Backend en /api/library/*. pdf.js y
// epub.js están vendorizados en /static/vendor (ver index.html) — pdfjsLib
// llega en window desde el <script type="module"> del template; ePub y
// JSZip llegan como globals clásicos desde epub.min.js/jszip.min.js.
(function () {
  function $(id) { return document.getElementById(id); }

  function _escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function _timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T'));
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.round(diffH / 24);
    return `hace ${diffD}d`;
  }

  const HL_COLORS = { yellow: '#e2c545', green: '#8a9d6e', blue: '#7b9fde' };

  // ── Estado del espacio Biblioteca (grid + apuntes) ──────────────────────
  const _lib = { tab: 'books', books: [], storage: null };

  window._renderLibrarySpace = async function () {
    const body = $('libraryBody');
    if (!body) return;
    body.innerHTML = '<div class="lab-hint">Cargando biblioteca…</div>';
    _wireUploadButton();
    try {
      const [books, storage] = await Promise.all([
        fetch('/api/library').then(r => r.json()),
        fetch('/api/library/storage').then(r => r.json()),
      ]);
      _lib.books = books.books || [];
      _lib.storage = storage;
    } catch (e) {
      body.innerHTML = '<div class="lab-empty">No se pudo cargar la biblioteca.</div>';
      return;
    }
    _renderLibraryBody();
  };

  function _renderLibraryBody() {
    const body = $('libraryBody');
    const st = _lib;
    const usedGB = (st.storage.used_bytes / 1073741824).toFixed(2);
    const capGB = Math.round(st.storage.free_cap_bytes / 1073741824);
    const pct = Math.min(100, st.storage.pct);
    const warn = pct >= 85;

    let html = `
      <div class="storage-card">
        <div class="storage-ring" style="--pct:${pct}">${usedGB}GB</div>
        <div class="storage-body">
          <div class="storage-title">Almacenamiento de la Biblioteca</div>
          <div class="storage-sub"><b>${usedGB} GB</b> usados de <b>${capGB} GB gratis</b> — ${st.books.length} libro${st.books.length === 1 ? '' : 's'} subido${st.books.length === 1 ? '' : 's'}</div>
          <div class="storage-bar-wrap"><div class="storage-bar-fill" style="width:${pct}%;background:${warn ? 'var(--danger)' : 'var(--amber)'}"></div></div>
        </div>
        <div class="storage-note">${warn ? 'Te acercas al límite gratis de Fly.io — considera borrar libros que ya terminaste.' : 'Al acercarte al límite, te avisamos aquí antes de que algo falle.'}</div>
      </div>
      <div class="lib-head">
        <h1>Tu biblioteca</h1>
        <div class="lib-filters">
          <div class="lib-filter ${st.tab === 'books' ? 'active' : ''}" data-tab="books">Libros</div>
          <div class="lib-filter ${st.tab === 'notes' ? 'active' : ''}" data-tab="notes">Apuntes</div>
        </div>
      </div>
    `;

    if (st.tab === 'notes') {
      html += '<div id="libraryNotesArea"><div class="lab-hint">Cargando apuntes…</div></div>';
      body.innerHTML = html;
      _wireLibraryTabs();
      _renderLibraryNotesTab();
      return;
    }

    if (!st.books.length) {
      html += '<div class="lab-empty">Aún no subes ningún libro. Usa "↑ Subir libro" arriba para empezar.</div>';
    } else {
      html += '<div class="book-grid">' + st.books.map(_bookCardHtml).join('') + '</div>';
    }
    body.innerHTML = html;
    _wireLibraryTabs();
    body.querySelectorAll('.book-card[data-book]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-fmt]') || e.target.closest('[data-del-book]')) return;
        window._openLibraryReader(el.dataset.book);
      });
    });
    body.querySelectorAll('[data-add-fmt]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        _addFormatToBook(el.dataset.addFmt, el.dataset.wantExt);
      });
    });
    body.querySelectorAll('[data-del-book]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Borrar este libro de la Biblioteca? Esto también borra sus notas y marcadores.')) return;
        await fetch('/api/library/' + el.dataset.delBook, { method: 'DELETE' });
        window._renderLibrarySpace();
      });
    });
  }

  function _wireLibraryTabs() {
    document.querySelectorAll('#libraryBody .lib-filter[data-tab]').forEach(el => {
      el.addEventListener('click', () => { _lib.tab = el.dataset.tab; _renderLibraryBody(); });
    });
  }

  function _fmtBadgesHtml(book) {
    let html = '<div class="book-fmt-row">';
    if (book.formats.pdf) {
      html += book.formats.pdf.has_text_layer === false
        ? '<span class="book-fmt scan">🖼️ Escaneado</span>'
        : '<span class="book-fmt">PDF</span>';
    }
    if (book.formats.epub) html += '<span class="book-fmt">EPUB</span>';
    html += '</div>';
    return html;
  }

  function _bookCardHtml(b) {
    const pct = b.progress ? Math.round(b.progress.percent) : 0;
    const cover = b.cover_url
      ? `<img src="${b.cover_url}" alt="" loading="lazy">`
      : `<span class="spine-title">${_escHtml(b.title)}</span>`;
    const ring = pct > 0 ? `<div class="book-progress-ring" style="--bp:${pct}"></div>` : '';
    let meta = _escHtml(b.author || '');
    const scanNoOcr = b.formats.pdf && b.formats.pdf.has_text_layer === false && !b.formats.pdf.ocr_applied;
    if (pct >= 100) meta = (meta ? meta + ' · ' : '') + 'terminado';
    else if (pct > 0) meta = (meta ? meta + ' · ' : '') + pct + '%';
    else if (scanNoOcr) meta = 'Sin OCR aplicado';
    else if (!meta) meta = 'sin empezar';
    const missing = [];
    if (!b.formats.pdf) missing.push({ ext: 'pdf', label: '+ PDF' });
    if (!b.formats.epub) missing.push({ ext: 'epub', label: '+ EPUB' });
    const addFmtHtml = missing.map(m => `<span class="book-fmt-add" data-add-fmt="${b.id}" data-want-ext="${m.ext}" title="Añadir ${m.ext.toUpperCase()} a este libro">${m.label}</span>`).join('');
    return `
      <div class="book-card" data-book="${b.id}">
        <div class="book-cover">${cover}${_fmtBadgesHtml(b)}${ring}</div>
        <div class="book-title">${_escHtml(b.title)}</div>
        <div class="book-meta">${meta}${addFmtHtml}</div>
        <span class="book-del" data-del-book="${b.id}" title="Borrar libro">✕</span>
      </div>`;
  }

  // ── Subida ───────────────────────────────────────────────────────────────
  function _wireUploadButton() {
    const btn = $('libraryUploadBtn');
    const input = $('libraryUploadInput');
    if (!btn || !input || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => { input.removeAttribute('data-book-id'); input.click(); });
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      const bookId = input.dataset.bookId || '';
      input.value = '';
      delete input.dataset.bookId;
      for (const f of files) await _uploadOneFile(f, bookId);
      window._renderLibrarySpace();
    });
  }

  function _addFormatToBook(bookId, wantExt) {
    const input = $('libraryUploadInput');
    input.accept = '.' + wantExt;
    input.dataset.bookId = bookId;
    input.click();
  }

  async function _uploadOneFile(file, bookId) {
    const fd = new FormData();
    fd.append('file', file);
    if (bookId) fd.append('book_id', bookId);
    try {
      const res = await fetch('/api/library/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) alert(data.error || ('Error al subir ' + file.name));
    } catch (e) {
      alert('Error al subir ' + file.name);
    }
  }

  // ── Apuntes globales ─────────────────────────────────────────────────────
  let _notesCache = [];

  async function _renderLibraryNotesTab() {
    const area = $('libraryNotesArea');
    if (!area) return;
    const res = await fetch('/api/library/notes');
    const data = await res.json();
    _notesCache = data.notes || [];
    if (!_notesCache.length) {
      area.innerHTML = '<div class="lab-empty">Aún no tienes resaltados ni notas. Ábrelos desde el lector, seleccionando cualquier texto.</div>';
      return;
    }
    area.innerHTML = '<div class="notes-list">' + _notesCache.map(_noteCardHtml).join('') + '</div>';
    area.querySelectorAll('[data-goto-book]').forEach(el => el.addEventListener('click', () => window._openLibraryReader(el.dataset.gotoBook)));
    area.querySelectorAll('[data-to-concept]').forEach(el => el.addEventListener('click', () => _promptNoteToConcept(el.dataset.bookId, el.dataset.toConcept)));
    area.querySelectorAll('[data-quiz-note]').forEach(el => el.addEventListener('click', () => {
      const n = _notesCache.find(x => x.id === el.dataset.quizNote);
      if (n) window._quizFromLibraryText(n.book_title, (n.note_text ? n.note_text + '\n\n' : '') + n.quote_text, '');
    }));
  }

  function _noteCardHtml(n) {
    const colorClass = n.color === 'green' ? 'green' : (n.color === 'blue' ? 'blue' : '');
    return `
      <div class="note-card">
        <div class="note-src"><span>${_escHtml(n.book_title)}${n.chapter_title ? ' · ' + _escHtml(n.chapter_title) : ''}</span><span>${_timeAgo(n.created_at)}</span></div>
        <div class="note-quote"><span class="hl ${colorClass}">&ldquo;${_escHtml(n.quote_text)}&rdquo;</span></div>
        ${n.note_text ? `<div class="note-body">${_escHtml(n.note_text)}</div>` : ''}
        <div class="note-actions">
          <a data-goto-book="${n.book_id}">Ir al libro →</a>
          <a data-to-concept="${n.id}" data-book-id="${n.book_id}">Convertir en concepto</a>
          <a data-quiz-note="${n.id}">Generar quiz de esto</a>
        </div>
      </div>`;
  }

  async function _promptNoteToConcept(bookId, noteId) {
    let courses = [];
    try { courses = await fetch('/api/courses').then(r => r.json()); } catch (e) {}
    if (!Array.isArray(courses) || !courses.length) {
      alert('Crea primero un curso en Cursos para poder convertir esto en un concepto.');
      return;
    }
    const options = courses.map(c => `<option value="${_escHtml(c.id)}">${_escHtml(c.label)}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'lib-modal-overlay';
    overlay.innerHTML = `
      <div class="lib-modal">
        <div class="lib-modal-title">Convertir en concepto</div>
        <div class="lib-modal-sub">¿A qué curso pertenece?</div>
        <select class="lib-modal-select" id="libConceptCourseSel">${options}</select>
        <div class="lib-modal-actions">
          <button class="lib-modal-btn" id="libConceptCancel">Cancelar</button>
          <button class="lib-modal-btn primary" id="libConceptConfirm">Crear concepto</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#libConceptCancel').onclick = () => overlay.remove();
    overlay.querySelector('#libConceptConfirm').onclick = async () => {
      const course = overlay.querySelector('#libConceptCourseSel').value;
      try {
        const r = await fetch(`/api/library/${bookId}/notes/${noteId}/to-concept`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course }),
        });
        const d = await r.json();
        overlay.remove();
        alert(r.ok ? `Concepto "${d.name}" creado.` : (d.error || 'Error al crear el concepto'));
      } catch (e) {
        overlay.remove();
        alert('Error al crear el concepto');
      }
    };
  }

  // ── LECTOR ───────────────────────────────────────────────────────────────
  const _reader = {
    bookId: null, book: null, format: null,
    pdfDoc: null, pdfPage: 1, pdfPageCount: 0, pdfScale: 1.35,
    epubBook: null, epubRendition: null,
    tocItems: [], notes: [], bookmarks: [],
    _progressTimer: null,
  };

  window._openLibraryReader = async function (bookId) {
    let book;
    try {
      book = await fetch('/api/library/' + bookId).then(r => r.json());
    } catch (e) {
      alert('No se pudo abrir el libro'); return;
    }
    if (book.error) { alert(book.error); return; }
    _reader.bookId = bookId;
    _reader.book = book;
    const isMobile = window.innerWidth < 820;
    let fmt = (book.progress && book.progress.format && book.formats[book.progress.format]) ? book.progress.format : null;
    if (!fmt) {
      if (book.formats.epub && book.formats.pdf) fmt = isMobile ? 'epub' : 'pdf';
      else fmt = book.formats.epub ? 'epub' : 'pdf';
    }
    _reader.format = fmt;
    window._activeLibraryBookId = bookId;
    window.switchSpace('library');
  };

  window._reopenLibraryReader = async function () {
    const book = _reader.book;
    if (!book) return;
    $('readerTitle').textContent = book.title;
    $('readerScanBanner').classList.add('hidden');
    $('readerTocPanel').classList.add('hidden');
    $('readerTocPanel').innerHTML = '';
    $('readerPage').innerHTML = '<div class="lab-hint">Cargando libro…</div>';
    _wireReaderChrome();
    await _loadReaderNotesAndBookmarks(book.id);
    if (_reader.format === 'epub') await _loadEpubReader(book);
    else await _loadPdfReader(book);
  };

  function _closeLibraryReader() {
    if (_reader.epubRendition) { try { _reader.epubRendition.destroy(); } catch (e) {} }
    _reader.epubRendition = null;
    _reader.epubBook = null;
    _reader.pdfDoc = null;
    window._activeLibraryBookId = null;
    window.switchSpace('library');
  }

  function _wireReaderChrome() {
    const back = $('readerBackBtn');
    if (back && !back._wired) { back._wired = true; back.addEventListener('click', _closeLibraryReader); }
    const tocBtn = $('readerTocBtn');
    if (tocBtn && !tocBtn._wired) {
      tocBtn._wired = true;
      tocBtn.addEventListener('click', () => $('readerTocPanel').classList.toggle('hidden'));
    }
    const bmBtn = $('readerBookmarkBtn');
    if (bmBtn && !bmBtn._wired) { bmBtn._wired = true; bmBtn.addEventListener('click', _addBookmarkAtCurrentLocation); }
    const ocrBtn = $('readerOcrBtn');
    if (ocrBtn && !ocrBtn._wired) { ocrBtn._wired = true; ocrBtn.addEventListener('click', _startOcrForCurrentBook); }
  }

  async function _loadReaderNotesAndBookmarks(bookId) {
    try {
      const [notesRes, bmRes] = await Promise.all([
        fetch(`/api/library/${bookId}/notes`).then(r => r.json()),
        fetch(`/api/library/${bookId}/bookmarks`).then(r => r.json()),
      ]);
      _reader.notes = notesRes.notes || [];
      _reader.bookmarks = bmRes.bookmarks || [];
    } catch (e) {
      _reader.notes = []; _reader.bookmarks = [];
    }
  }

  function _updateReaderFooter(locLabel, pct) {
    $('readerLocLabel').textContent = locLabel;
    $('readerPctLabel').textContent = pct + '%';
    $('readerProgressFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function _saveProgressThrottled(format, location, percent) {
    clearTimeout(_reader._progressTimer);
    _reader._progressTimer = setTimeout(() => {
      fetch(`/api/library/${_reader.bookId}/progress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, location, percent }),
      }).catch(() => {});
    }, 800);
  }

  function _renderReaderToc() {
    const panel = $('readerTocPanel');
    if (!_reader.tocItems.length) {
      panel.innerHTML = '<div class="lab-hint" style="padding:12px">Este libro no trae un índice navegable.</div>';
      return;
    }
    panel.innerHTML = _reader.tocItems.map((it, i) => (
      `<div class="toc-item" data-toc-idx="${i}" style="padding-left:${10 + (it.depth || 0) * 14}px">${_escHtml(it.title)}</div>`
    )).join('');
    panel.querySelectorAll('[data-toc-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const item = _reader.tocItems[+el.dataset.tocIdx];
        if (_reader.format === 'epub') _reader.epubRendition.display(item.href);
        else if (item.page) _pdfGoTo(item.page);
        panel.classList.add('hidden');
      });
    });
  }

  function _addBookmarkAtCurrentLocation() {
    const location = _reader.format === 'epub'
      ? (_reader._epubCurrentCfi || '')
      : `page:${_reader.pdfPage}`;
    const label = prompt('Nombre para este marcador:', _reader.format === 'epub' ? '' : `Página ${_reader.pdfPage}`);
    if (label === null) return;
    fetch(`/api/library/${_reader.bookId}/bookmarks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: _reader.format, location, label }),
    }).then(() => alert('Marcador guardado.'));
  }

  function _startOcrForCurrentBook() {
    const bookId = _reader.bookId;
    fetch(`/api/library/${bookId}/ocr`, { method: 'POST' }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'No se pudo iniciar el OCR'); return; }
      const banner = $('readerScanBanner');
      banner.querySelector('b').textContent = 'Aplicando OCR… 0%';
      const poll = setInterval(async () => {
        const st = await fetch(`/api/library/${bookId}/ocr/status`).then(x => x.json());
        if (st.status === 'running') {
          banner.querySelector('b').textContent = `Aplicando OCR… ${st.progress}%`;
        } else {
          clearInterval(poll);
          if (st.status === 'done') {
            banner.querySelector('b').textContent = 'OCR aplicado';
            setTimeout(() => window._reopenLibraryReader(), 600);
          } else {
            banner.querySelector('b').textContent = 'Aplicar OCR a este libro';
            alert('El OCR falló: ' + (st.error || 'error desconocido'));
          }
        }
      }, 2500);
    });
  }

  // ── Selección de texto → barra flotante (resaltar / nota / IA / concepto) ─
  function _currentChapterTitle() {
    if (_reader.format === 'pdf') return `Página ${_reader.pdfPage}`;
    return _reader._epubCurrentChapter || '';
  }

  function _removeSelToolbar() {
    document.querySelectorAll('.sel-toolbar-floating').forEach(el => el.remove());
  }

  function _showSelectionToolbar(text, location, rect) {
    _removeSelToolbar();
    if (!text || !text.trim()) return;
    const bar = document.createElement('div');
    bar.className = 'sel-toolbar sel-toolbar-floating';
    bar.innerHTML = `
      <span class="swatch" data-color="yellow" style="background:${HL_COLORS.yellow}"></span>
      <span class="swatch" data-color="green" style="background:${HL_COLORS.green}"></span>
      <span class="swatch" data-color="blue" style="background:${HL_COLORS.blue}"></span>
      <span class="sep"></span>
      <span class="act" data-act="note">✎ Nota</span>
      <span class="act" data-act="ask">✦ Preguntar a la IA</span>
      <span class="act" data-act="concept">🎯 Crear concepto</span>
    `;
    document.body.appendChild(bar);
    const top = Math.max(8, rect.top - 46);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - bar.offsetWidth - 8);
    bar.style.position = 'fixed';
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
    bar.style.zIndex = 9999;

    bar.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', async () => {
        await _createNoteFromSelection(text, location, sw.dataset.color, '');
        _removeSelToolbar();
      });
    });
    bar.querySelector('[data-act="note"]').addEventListener('click', async () => {
      const noteText = prompt('Tu nota sobre esto:', '');
      if (noteText === null) return;
      await _createNoteFromSelection(text, location, 'yellow', noteText);
      _removeSelToolbar();
    });
    bar.querySelector('[data-act="ask"]').addEventListener('click', () => {
      _removeSelToolbar();
      if (typeof window._openAiAskPanel === 'function') window._openAiAskPanel(text);
      else alert('El panel de IA no está disponible aquí todavía.');
    });
    bar.querySelector('[data-act="concept"]').addEventListener('click', async () => {
      const note = await _createNoteFromSelection(text, location, 'yellow', '');
      _removeSelToolbar();
      if (note) _promptNoteToConcept(_reader.bookId, note.id);
    });
  }

  async function _createNoteFromSelection(quoteText, location, color, noteText) {
    try {
      const res = await fetch(`/api/library/${_reader.bookId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: _reader.format, location, quote_text: quoteText, note_text: noteText,
          color, chapter_title: _currentChapterTitle(),
        }),
      });
      const note = await res.json();
      if (!res.ok) { alert(note.error || 'No se pudo guardar el resaltado'); return null; }
      _reader.notes.push(note);
      if (_reader.format === 'epub' && location) _applyEpubHighlight(note);
      if (_reader.format === 'pdf') _applyPdfHighlightsForPage(_reader.pdfPage);
      return note;
    } catch (e) {
      alert('No se pudo guardar el resaltado');
      return null;
    }
  }

  document.addEventListener('mouseup', () => {
    const readerPage = $('readerPage');
    if (!readerPage || readerPage.closest('.hidden')) return;
    if (window._activeLibraryBookId == null) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || _reader.format !== 'pdf') return; // epub handled via rendition 'selected' event
      if (!sel.rangeCount) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.top && !rect.left)) return;
      _showSelectionToolbar(text, `page:${_reader.pdfPage}`, rect);
    }, 10);
  });

  // ── PDF (pdf.js) ─────────────────────────────────────────────────────────
  async function _loadPdfReader(book) {
    const url = `/api/library/${book.id}/file/pdf`;
    const scanned = book.formats.pdf.has_text_layer === false;
    $('readerScanBanner').classList.toggle('hidden', !scanned);

    const pdf = await window.pdfjsLib.getDocument(url).promise;
    _reader.pdfDoc = pdf;
    _reader.pdfPageCount = pdf.numPages;

    let startPage = 1;
    if (book.progress && book.progress.format === 'pdf' && book.progress.location) {
      startPage = parseInt(String(book.progress.location).replace('page:', ''), 10) || 1;
    }
    _reader.pdfPage = Math.min(Math.max(1, startPage), pdf.numPages);

    try {
      const outline = await pdf.getOutline();
      _reader.tocItems = outline && outline.length ? await _flattenPdfOutline(pdf, outline) : [];
    } catch (e) {
      _reader.tocItems = [];
    }
    _renderReaderToc();
    await _renderPdfPage();
  }

  async function _flattenPdfOutline(pdf, items, depth) {
    depth = depth || 0;
    let out = [];
    for (const it of items) {
      let pageNum = null;
      try {
        const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
        if (dest) pageNum = (await pdf.getPageIndex(dest[0])) + 1;
      } catch (e) { /* some outline entries have no resolvable page */ }
      out.push({ title: it.title, page: pageNum, depth });
      if (it.items && it.items.length) out = out.concat(await _flattenPdfOutline(pdf, it.items, depth + 1));
    }
    return out;
  }

  async function _renderPdfPage() {
    const pdf = _reader.pdfDoc;
    const page = await pdf.getPage(_reader.pdfPage);
    const viewport = page.getViewport({ scale: _reader.pdfScale });

    const wrap = document.createElement('div');
    wrap.className = 'pdf-page-wrap';
    wrap.style.width = viewport.width + 'px';
    wrap.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const scanned = _reader.book.formats.pdf.has_text_layer === false;
    if (!scanned) {
      const textContent = await page.getTextContent();
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'pdf-text-layer';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      wrap.appendChild(textLayerDiv);
      await window.pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).promise;
    }

    const pageEl = $('readerPage');
    pageEl.innerHTML = '';
    const scroller = document.createElement('div');
    scroller.className = 'pdf-scroller';
    scroller.appendChild(wrap);
    pageEl.appendChild(scroller);

    const nav = document.createElement('div');
    nav.className = 'pdf-page-nav';
    nav.innerHTML = `<button id="pdfPrevPage" ${_reader.pdfPage <= 1 ? 'disabled' : ''}>‹ Anterior</button><span>Página ${_reader.pdfPage} de ${_reader.pdfPageCount}</span><button id="pdfNextPage" ${_reader.pdfPage >= _reader.pdfPageCount ? 'disabled' : ''}>Siguiente ›</button>`;
    pageEl.appendChild(nav);
    $('pdfPrevPage').onclick = () => _pdfGoTo(_reader.pdfPage - 1);
    $('pdfNextPage').onclick = () => _pdfGoTo(_reader.pdfPage + 1);

    if (!scanned) _applyPdfHighlightsForPage(_reader.pdfPage);

    const pct = Math.round((_reader.pdfPage / _reader.pdfPageCount) * 100);
    _updateReaderFooter(`Página ${_reader.pdfPage} de ${_reader.pdfPageCount}`, pct);
    _saveProgressThrottled('pdf', `page:${_reader.pdfPage}`, pct);
  }

  function _pdfGoTo(n) {
    n = Math.max(1, Math.min(_reader.pdfPageCount, n));
    if (n === _reader.pdfPage) return;
    _reader.pdfPage = n;
    _renderPdfPage();
  }

  // Aproximación pragmática: pdf.js no trae un sistema de resaltados
  // persistentes de fábrica. En vez de guardar coordenadas exactas (frágil
  // ante cualquier cambio de zoom/render), guardamos el texto citado y, al
  // volver a esa página, buscamos ese texto entre los <span> de la capa de
  // texto para pintarlos — funciona bien mientras la cita no se repita
  // varias veces en la misma página.
  function _applyPdfHighlightsForPage(pageNum) {
    const layer = document.querySelector('.pdf-text-layer');
    if (!layer) return;
    layer.querySelectorAll('span[data-lib-hl]').forEach(s => { s.style.background = ''; s.removeAttribute('data-lib-hl'); });
    const notesHere = _reader.notes.filter(n => n.format === 'pdf' && n.location === `page:${pageNum}`);
    if (!notesHere.length) return;
    const spans = Array.from(layer.querySelectorAll('span'));
    const fullText = spans.map(s => s.textContent).join('');
    for (const note of notesHere) {
      const quote = (note.quote_text || '').trim();
      if (!quote) continue;
      const idx = fullText.indexOf(quote.slice(0, Math.min(quote.length, 60)));
      if (idx === -1) continue;
      let pos = 0;
      for (const s of spans) {
        const len = s.textContent.length;
        if (pos + len > idx && pos < idx + quote.length) {
          s.style.background = HL_COLORS[note.color] || HL_COLORS.yellow;
          s.style.opacity = '0.55';
          s.setAttribute('data-lib-hl', note.id);
        }
        pos += len;
      }
    }
  }

  // ── EPUB (epub.js) ───────────────────────────────────────────────────────
  async function _loadEpubReader(book) {
    const url = `/api/library/${book.id}/file/epub`;
    // Our URL has no ".epub" extension (it's a Flask route, not a static
    // file), so epub.js's own extension-sniffing can't tell it's a packed
    // archive and tries to fetch "container.xml" relative to it instead —
    // openAs forces the correct binary-archive path.
    const epubBook = window.ePub(url, { openAs: 'epub' });
    _reader.epubBook = epubBook;
    $('readerPage').innerHTML = '';
    const rendition = epubBook.renderTo('readerPage', { width: '100%', height: '100%' });
    _reader.epubRendition = rendition;
    _applyEpubTheme(rendition);

    let startCfi;
    if (book.progress && book.progress.format === 'epub' && book.progress.location) startCfi = book.progress.location;
    await rendition.display(startCfi || undefined);

    epubBook.loaded.navigation.then(nav => {
      _reader.tocItems = (nav.toc || []).map(it => ({ title: it.label.trim(), href: it.href, depth: 0 }));
      _renderReaderToc();
    });

    rendition.on('relocated', (location) => {
      _reader._epubCurrentCfi = location.start.cfi;
      const pct = Math.round((location.start.percentage || 0) * 100);
      const pageLabel = location.start.displayed ? `Ubicación ${location.start.displayed.page} de ${location.start.displayed.total}` : '';
      _updateReaderFooter(pageLabel || 'Leyendo…', pct);
      _saveProgressThrottled('epub', location.start.cfi, pct);
      const chapterItem = _reader.tocItems.find(t => t.href && location.start.href && location.start.href.includes(t.href.split('#')[0]));
      _reader._epubCurrentChapter = chapterItem ? chapterItem.title : '';
      _applyAllEpubHighlights();
    });

    rendition.on('selected', (cfiRange, contents) => {
      epubBook.getRange(cfiRange).then(range => {
        const text = range ? range.toString() : '';
        if (!text.trim()) return;
        // epub.js renders each chapter in its own iframe; translate the
        // selection's rect from that iframe's coordinate space into the
        // parent page's, so the floating toolbar lands in the right spot.
        let rect = { top: 120, left: 60 };
        try {
          const sel = contents.window.getSelection();
          if (sel && sel.rangeCount) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            const iframe = contents.document.defaultView.frameElement;
            const iframeRect = iframe.getBoundingClientRect();
            rect = { top: iframeRect.top + r.top, left: iframeRect.left + r.left };
          }
        } catch (e) { /* fall back to the default corner position above */ }
        _showSelectionToolbar(text, cfiRange, rect);
      });
    });
  }

  // epub.js renders each chapter inside its own iframe with the EPUB's own
  // (often unstyled) CSS, so without this its text defaults to black-on-
  // white regardless of our reader's actual paper/dark theme — reading the
  // shell's own computed colors keeps the two in sync with zero duplicated
  // theme logic.
  function _applyEpubTheme(rendition) {
    const shell = document.querySelector('.reader-shell');
    const cs = getComputedStyle(shell);
    rendition.themes.default({
      html: { background: 'transparent !important' },
      body: {
        color: cs.color + ' !important',
        background: 'transparent !important',
        'font-family': "'Lora', Georgia, serif !important",
        'font-size': '112% !important',
        'line-height': '1.85 !important',
        padding: '30px 50px !important',
      },
      'a, a:link': { color: cs.color + ' !important' },
    });
  }

  function _applyEpubHighlight(note) {
    if (!_reader.epubRendition) return;
    try {
      _reader.epubRendition.annotations.add(
        'highlight', note.location, {}, null, 'epub-hl',
        { fill: HL_COLORS[note.color] || HL_COLORS.yellow, 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
      );
    } catch (e) { /* a stale CFI from an edited book export — skip silently */ }
  }

  function _applyAllEpubHighlights() {
    if (!_reader.epubRendition) return;
    _reader.notes.filter(n => n.format === 'epub' && n.location).forEach(_applyEpubHighlight);
  }
})();
