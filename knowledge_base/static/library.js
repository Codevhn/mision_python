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

  const HL_COLORS = {
    yellow: '#e2c545', green: '#8a9d6e', blue: '#7b9fde',
    red: '#d9776b', purple: '#a68bd9', gray: '#a8a59c',
  };
  // Color order shown everywhere a row of swatches appears.
  const HL_COLOR_KEYS = Object.keys(HL_COLORS);

  function _hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // What each color MEANS is entirely up to whoever is using it — we never
  // ship a fixed "red = urgent" label. Starts blank; _colorLegend fills in
  // from the backend once loaded, and stays blank for any color the user
  // hasn't named yet.
  let _colorLegend = {};
  async function _loadColorLegend() {
    try {
      const r = await fetch('/api/library/color-legend');
      const d = await r.json();
      _colorLegend = (d && d.legend) || {};
    } catch (e) { _colorLegend = {}; }
  }
  async function _setColorLegendLabel(color, label) {
    _colorLegend[color] = label;
    try {
      const r = await fetch('/api/library/color-legend', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color, label }),
      });
      const d = await r.json();
      if (d && d.legend) _colorLegend = d.legend;
    } catch (e) { /* kept the optimistic local value either way */ }
  }
  _loadColorLegend();

  // ── Notificaciones propias del sistema — reemplazan alert()/confirm()/
  // prompt() del navegador, que rompen el estilo visual de toda la app. ──
  function _toast(message, type) {
    const tray = $('libToastTray');
    if (!tray) return;
    const el = document.createElement('div');
    el.className = 'lib-toast' + (type ? ' ' + type : '');
    el.textContent = message;
    tray.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.25s ease'; setTimeout(() => el.remove(), 260); }, 3400);
  }

  function _focusLibraryDialog(overlay, cancel) {
    const modal = overlay.querySelector('.lib-modal');
    modal.setAttribute('role', 'dialog');modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', modal.querySelector('.lib-modal-title').textContent);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      if (event.key === 'Tab') {
        const fields = [...modal.querySelectorAll('button,input,select')].filter(node => !node.disabled);
        const first = fields[0], last = fields[fields.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
      }
    });
    queueMicrotask(() => { if (overlay.isConnected) (modal.querySelector('input') || modal.querySelector('button'))?.focus(); });
  }

  function _confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'lib-modal-overlay';
      overlay.innerHTML = `
        <div class="lib-modal">
          <div class="lib-modal-title">${_escHtml(opts.title || 'Confirmar')}</div>
          <div class="lib-modal-sub">${_escHtml(message)}</div>
          <div class="lib-modal-actions">
            <button class="lib-modal-btn" id="libDlgCancel">Cancelar</button>
            <button class="lib-modal-btn ${opts.danger ? 'danger' : 'primary'}" id="libDlgOk">${_escHtml(opts.okLabel || 'Confirmar')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const previousFocus = document.activeElement;
      const finish = (val) => { overlay.remove(); previousFocus?.focus(); resolve(val); };
      _focusLibraryDialog(overlay, () => finish(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
      overlay.querySelector('#libDlgCancel').onclick = () => finish(false);
      overlay.querySelector('#libDlgOk').onclick = () => finish(true);
    });
  }

  function _promptDialog(title, defaultValue, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'lib-modal-overlay';
      overlay.innerHTML = `
        <div class="lib-modal">
          <div class="lib-modal-title">${_escHtml(title)}</div>
          ${opts.sub ? `<div class="lib-modal-sub">${_escHtml(opts.sub)}</div>` : ''}
          <input type="text" class="lib-modal-input" id="libDlgInput" placeholder="${_escHtml(opts.placeholder || '')}" value="${_escHtml(defaultValue || '')}">
          <div class="lib-modal-actions">
            <button class="lib-modal-btn" id="libDlgCancel">Cancelar</button>
            <button class="lib-modal-btn primary" id="libDlgOk">${_escHtml(opts.okLabel || 'Guardar')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#libDlgInput');
      const previousFocus = document.activeElement;
      const finish = (val) => { overlay.remove(); previousFocus?.focus(); resolve(val); };
      _focusLibraryDialog(overlay, () => finish(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
      overlay.querySelector('#libDlgCancel').onclick = () => finish(null);
      overlay.querySelector('#libDlgOk').onclick = () => finish(input.value);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
      });
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }

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
    const pct = Math.max(0, Math.min(100, Number(st.storage.pct) || 0));
    const remainingGB = Math.max(0, (st.storage.free_cap_bytes - st.storage.used_bytes) / 1073741824).toFixed(2);
    const continuing = _continueReadingBook(st.books);
    const warn = pct >= 85;

    let html = `
      <div class="lib-overview${continuing ? '' : ' lib-overview-single'}">
      <div class="storage-card${warn ? ' storage-warning' : ''}">
        <div class="storage-ring" style="--pct:${pct}" aria-hidden="true"><span><strong>${usedGB}</strong><small>GB</small></span></div>
        <div class="storage-body">
          <div class="storage-title">Almacenamiento</div>
          <div class="storage-sub"><b>${usedGB} GB</b> usados de <b>${capGB} GB</b> · ${st.books.length} libro${st.books.length === 1 ? '' : 's'} subido${st.books.length === 1 ? '' : 's'}</div>
          <div class="storage-bar-wrap" role="progressbar" aria-label="Espacio utilizado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${usedGB} GB usados de ${capGB} GB"><div class="storage-bar-fill" style="width:${pct}%;min-width:${pct > 0 ? '3px' : '0'}"></div></div>
          <div class="storage-note">${warn ? 'Queda poco espacio. Puedes borrar libros que ya no necesites.' : `${remainingGB} GB disponibles`}</div>
        </div>
      </div>
      ${continuing ? _continueReadingCardHtml(continuing) : ''}
      </div>
      <div class="lib-head">
        <h1>${st.tab === 'notes' ? 'Tus apuntes' : 'Tu biblioteca'}</h1>
        <div class="lib-filters">
          <button type="button" class="lib-filter ${st.tab === 'books' ? 'active' : ''}" data-tab="books" aria-pressed="${st.tab === 'books'}">Libros</button>
          <button type="button" class="lib-filter ${st.tab === 'notes' ? 'active' : ''}" data-tab="notes" aria-pressed="${st.tab === 'notes'}">Apuntes</button>
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
        const ok = await _confirmDialog('Esto también borra sus notas y marcadores.', { title: 'Borrar este libro', okLabel: 'Borrar', danger: true });
        if (!ok) return;
        await fetch('/api/library/' + el.dataset.delBook, { method: 'DELETE' });
        _toast('Libro borrado.', 'success');
        window._renderLibrarySpace();
      });
    });
  }

  function _wireLibraryTabs() {
    const resume = document.querySelector('#libraryBody .lib-continue-btn');
    resume?.addEventListener('click', () => window._openLibraryReader(resume.closest('[data-book]').dataset.book));
    resume?.closest('.lib-continue-card').addEventListener('click', event => {
      if (!event.target.closest('button')) window._openLibraryReader(resume.closest('[data-book]').dataset.book);
    });
    document.querySelectorAll('#libraryBody .lib-filter[data-tab]').forEach(el => {
      el.addEventListener('click', () => { _lib.tab = el.dataset.tab; _renderLibraryBody(); });
    });
  }

  function _fmtBadgesHtml(book) {
    let html = '<div class="book-fmt-row">';
    if (book.formats.pdf) {
      html += book.formats.pdf.has_text_layer === false
        ? '<span class="book-fmt scan"><svg class="atlas-system-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/static/aero-icons.svg#image"></use></svg> Escaneado</span>'
        : '<span class="book-fmt">PDF</span>';
    }
    if (book.formats.epub) html += '<span class="book-fmt">EPUB</span>';
    html += '</div>';
    return html;
  }

  // Shared with the "Continuar leyendo" card below — same self-healing
  // cover fallback either place uses it.
  function _bookCoverImgHtml(b) {
    return b.cover_url
      ? `<img src="${b.cover_url}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;spine-title&quot;>${_escHtml(b.title)}</span>'">`
      : `<span class="spine-title">${_escHtml(b.title)}</span>`;
  }

  function _bookCardHtml(b) {
    const pct = b.progress ? Math.round(b.progress.percent) : 0;
    const ring = pct > 0 ? `<div class="book-progress-ring" style="--bp:${pct}"></div>` : '';
    // A thin always-on track (not just the corner ring, which only shows
    // once pct > 0) so a book you haven't touched yet still reads as
    // "0 progress" instead of looking identical to one mid-read with the
    // ring just not rendered — same visual language on every card.
    const track = `<div class="book-progress-track"><div class="book-progress-fill" style="width:${pct}%"></div></div>`;
    const scanNoOcr = b.formats.pdf && b.formats.pdf.has_text_layer === false && !b.formats.pdf.ocr_applied;
    // Status used to only get appended when there was no author text yet —
    // a book with an author but 0% progress silently showed nothing at all
    // ("sin empezar" never appeared), so it looked identical to one you'd
    // already started. It's its own line now, always computed.
    let status;
    if (pct >= 100) status = 'terminado';
    else if (pct > 0) status = pct + '%';
    else if (scanNoOcr) status = 'Sin OCR aplicado';
    else status = 'sin empezar';
    const author = _escHtml(b.author || '');
    const meta = author ? `${author} · ${status}` : status;
    const missing = [];
    if (!b.formats.pdf) missing.push({ ext: 'pdf', label: '+ PDF' });
    if (!b.formats.epub) missing.push({ ext: 'epub', label: '+ EPUB' });
    const addFmtHtml = missing.map(m => `<span class="book-fmt-add" data-add-fmt="${b.id}" data-want-ext="${m.ext}" title="Añadir ${m.ext.toUpperCase()} a este libro">${m.label}</span>`).join('');
    return `
      <div class="book-card" data-book="${b.id}">
        <div class="book-cover">${_bookCoverImgHtml(b)}${_fmtBadgesHtml(b)}${ring}${track}</div>
        <div class="book-title">${_escHtml(b.title)}</div>
        <div class="book-meta">${meta}${addFmtHtml}</div>
        <span class="book-del" data-del-book="${b.id}" title="Borrar libro">✕</span>
      </div>`;
  }

  // The most recently read book that isn't finished yet — "continuar
  // leyendo" is this one, not just "the last book you uploaded" (the grid
  // order below is unrelated to reading activity).
  function _continueReadingBook(books) {
    const inProgress = books.filter(b => b.progress && b.progress.percent > 0 && b.progress.percent < 100);
    if (!inProgress.length) return null;
    inProgress.sort((a, b) => (b.progress.updated_at || '').localeCompare(a.progress.updated_at || ''));
    return inProgress[0];
  }

  function _continueReadingCardHtml(b) {
    const pct = Math.round(Math.max(0, Math.min(100, Number(b.progress.percent) || 0)));
    const author = _escHtml(b.author || '');
    return `
      <div class="lib-continue-card" data-book="${b.id}">
        <div class="lib-continue-cover">${_bookCoverImgHtml(b)}</div>
        <div class="lib-continue-body">
          <div class="lib-continue-eyebrow">Continuar leyendo</div>
          <div class="lib-continue-title">${_escHtml(b.title)}</div>
          ${author ? `<div class="lib-continue-author">${author}</div>` : ''}
          <div class="lib-continue-bar-wrap"><div class="lib-continue-bar-fill" style="width:${pct}%"></div></div>
          <div class="lib-continue-pct">${pct}% leído</div>
        </div>
        <button class="lib-continue-btn">Seguir leyendo →</button>
      </div>`;
  }

  // ── Subida — XHR (no fetch) porque necesitamos xhr.upload.onprogress:
  // fetch no expone progreso de subida real, solo de descarga. Cada archivo
  // tiene su propia tarjeta en la bandeja con tamaño y % en vivo, y el grid
  // se refresca en cuanto ESE archivo termina — no espera a los demás — así
  // los libros van apareciendo uno a uno en vez de todos de golpe al final. ──
  function _fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function _wireUploadButton() {
    const btn = $('libraryUploadBtn');
    const input = $('libraryUploadInput');
    if (!btn || !input || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => { input.removeAttribute('data-book-id'); input.accept = '.pdf,.epub'; input.click(); });
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      const bookId = input.dataset.bookId || '';
      input.value = '';
      delete input.dataset.bookId;
      _queueUploads(files, bookId);
    });
  }

  // Subidas en cola, una a la vez: cada tarjeta sigue mostrando su propio
  // progreso, pero nunca hay dos peticiones de subida en vuelo al mismo
  // tiempo — evita que dos libros nuevos lleguen a la vez al servidor y uno
  // pise el registro del otro.
  let _uploadQueue = Promise.resolve();
  function _queueUploads(files, bookId) {
    files.forEach(f => {
      _uploadQueue = _uploadQueue.then(() => _uploadOneFile(f, bookId));
    });
  }

  function _addFormatToBook(bookId, wantExt) {
    const input = $('libraryUploadInput');
    input.accept = '.' + wantExt;
    input.dataset.bookId = bookId;
    input.click();
  }

  function _uploadOneFile(file, bookId) {
    const tray = $('libraryUploadTray');
    if (!tray) return Promise.resolve();
    return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'lib-upload-card';
    card.innerHTML = `
      <div class="lib-upload-card-head">
        <span class="lib-upload-name">${_escHtml(file.name)}</span>
        <span class="lib-upload-size">${_fmtBytes(file.size)}</span>
      </div>
      <div class="lib-upload-bar-wrap"><div class="lib-upload-bar-fill" style="width:0%"></div></div>
      <div class="lib-upload-status">Subiendo…</div>`;
    tray.appendChild(card);
    const fill = card.querySelector('.lib-upload-bar-fill');
    const status = card.querySelector('.lib-upload-status');

    const fd = new FormData();
    fd.append('file', file);
    if (bookId) fd.append('book_id', bookId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/library/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      fill.style.width = pct + '%';
      status.textContent = pct < 100
        ? `Subiendo… ${pct}% (${_fmtBytes(e.loaded)} de ${_fmtBytes(e.total)})`
        : 'Procesando (portada, texto)…';
    });
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        card.classList.add('done');
        fill.style.width = '100%';
        status.textContent = 'Listo';
        _toast(`"${data.title || file.name}" subido.`, 'success');
        if (_lib.tab === 'books') window._renderLibrarySpace();
        setTimeout(() => card.remove(), 2000);
      } else {
        card.classList.add('error');
        status.textContent = data.error || 'Error al subir';
        _toast(data.error || ('Error al subir ' + file.name), 'error');
        setTimeout(() => card.remove(), 6000);
      }
      resolve();
    };
    xhr.onerror = () => {
      card.classList.add('error');
      status.textContent = 'Error de red';
      _toast('Error de red al subir ' + file.name, 'error');
      setTimeout(() => card.remove(), 6000);
      resolve();
    };
    xhr.send(fd);
    });
  }

  // ── Apuntes globales ─────────────────────────────────────────────────────
  let _notesCache = [];

  // A thin, always-visible strip over the notes list — not a wall of text
  // explaining what each color "should" mean (we never decide that), just
  // the colors you've actually used with whatever name you gave each one,
  // editable right here. Blank until you type something.
  function _colorLegendBarHtml() {
    const items = HL_COLOR_KEYS.map(key => `
      <span class="lib-legend-item">
        <i class="lib-legend-dot" style="background:${HL_COLORS[key]}"></i>
        <span class="lib-legend-label" data-legend-key="${key}" contenteditable="true"
              aria-label="Nombre del color ${key}" data-placeholder="Nombrar color">${_escHtml(_colorLegend[key] || '')}</span>
      </span>`).join('');
    return `<div class="lib-legend-bar" aria-label="Colores de tus apuntes">${items}</div>`;
  }

  function _wireColorLegendBar(area) {
    area.querySelectorAll('[data-legend-key]').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
      el.addEventListener('blur', () => {
        const key = el.dataset.legendKey;
        const val = el.textContent.trim();
        if (val !== (_colorLegend[key] || '')) _setColorLegendLabel(key, val);
      });
    });
  }

  async function _renderLibraryNotesTab() {
    const area = $('libraryNotesArea');
    if (!area) return;
    await _loadColorLegend();
    const res = await fetch('/api/library/notes');
    const data = await res.json();
    _notesCache = data.notes || [];
    if (!_notesCache.length) {
      area.innerHTML = _colorLegendBarHtml()
        + '<div class="lab-empty">Aún no tienes resaltados ni notas. Ábrelos desde el lector, seleccionando cualquier texto.</div>';
      _wireColorLegendBar(area);
      return;
    }
    area.innerHTML = _colorLegendBarHtml() + '<div class="notes-list">' + _notesCache.map(_noteCardHtml).join('') + '</div>';
    _wireColorLegendBar(area);
    area.querySelectorAll('[data-goto-book]').forEach(el => el.addEventListener('click', () => window._openLibraryReader(el.dataset.gotoBook)));
    area.querySelectorAll('[data-to-concept]').forEach(el => el.addEventListener('click', () => _promptNoteToConcept(el.dataset.bookId, el.dataset.toConcept)));
    area.querySelectorAll('[data-quiz-note]').forEach(el => el.addEventListener('click', () => {
      const n = _notesCache.find(x => x.id === el.dataset.quizNote);
      if (n) window._quizFromLibraryText(n.book_title, (n.note_text ? n.note_text + '\n\n' : '') + n.quote_text, '');
    }));
    area.querySelectorAll('[data-del-note]').forEach(el => el.addEventListener('click', async () => {
      const ok = await _confirmDialog('Se eliminará este resaltado o nota.', { title: 'Eliminar', okLabel: 'Eliminar', danger: true });
      if (!ok) return;
      try {
        const r = await fetch(`/api/library/${el.dataset.delBook}/notes/${el.dataset.delNote}`, { method: 'DELETE' });
        if (!r.ok) { _toast('No se pudo eliminar', 'error'); return; }
      } catch (e) { _toast('No se pudo eliminar', 'error'); return; }
      _notesCache = _notesCache.filter(n => n.id !== el.dataset.delNote);
      _toast('Eliminado.', 'success');
      el.closest('.note-card')?.remove();
      if (!_notesCache.length) _renderLibraryNotesTab();
    }));
  }

  function _noteCardHtml(n) {
    const hlColor = HL_COLORS[n.color] || HL_COLORS.yellow;
    return `
      <div class="note-card">
        <div class="note-src"><span>${_escHtml(n.book_title)}${n.chapter_title ? ' · ' + _escHtml(n.chapter_title) : ''}</span><span>${_timeAgo(n.created_at)}</span></div>
        <div class="note-quote"><span class="hl" style="background:${_hexToRgba(hlColor, 0.30)}">&ldquo;${_escHtml(n.quote_text)}&rdquo;</span></div>
        ${n.note_text ? `<div class="note-body">${_escHtml(n.note_text)}</div>` : ''}
        <div class="note-actions">
          <button type="button" data-goto-book="${n.book_id}">Ir al libro →</button>
          <button type="button" data-to-concept="${n.id}" data-book-id="${n.book_id}">Convertir en concepto</button>
          <button type="button" data-quiz-note="${n.id}">Generar quiz de esto</button>
          <button type="button" data-del-note="${n.id}" data-del-book="${n.book_id}" class="note-del-act">Eliminar</button>
        </div>
      </div>`;
  }

  async function _promptNoteToConcept(bookId, noteId) {
    let courses = [];
    try { courses = await fetch('/api/courses').then(r => r.json()); } catch (e) {}
    if (!Array.isArray(courses) || !courses.length) {
      _toast('Crea primero un curso en Cursos para poder convertir esto en un concepto.', 'error');
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
        if (r.ok) _toast(`Concepto "${d.name}" creado.`, 'success');
        else _toast(d.error || 'Error al crear el concepto', 'error');
      } catch (e) {
        overlay.remove();
        _toast('Error al crear el concepto', 'error');
      }
    };
  }

  // ── LECTOR ───────────────────────────────────────────────────────────────
  const _reader = {
    bookId: null, book: null, format: null,
    pdfDoc: null, pdfPage: 1, pdfPageCount: 0, pdfScale: 1.35, pdfFit:true,
    epubBook: null, epubRendition: null, epubFontPct: 100,
    tocItems: [], notes: [], bookmarks: [],
    _progressTimer: null,
  };

  window._openLibraryReader = async function (bookId) {
    let book;
    try {
      book = await fetch('/api/library/' + bookId).then(r => r.json());
    } catch (e) {
      _toast('No se pudo abrir el libro', 'error'); return;
    }
    if (book.error) { _toast(book.error, 'error'); return; }
    _reader.bookId = bookId;
    _reader.book = book;
    const isMobile = window.innerWidth < 820;
    let fmt = (book.progress && book.progress.format && book.formats[book.progress.format]) ? book.progress.format : null;
    if (!fmt) {
      if (book.formats.epub && book.formats.pdf) fmt = isMobile ? 'epub' : 'pdf';
      else fmt = book.formats.epub ? 'epub' : 'pdf';
    }
    _reader.format = fmt;
    _reader.pdfFit = true;
    window._activeLibraryBookId = bookId;
    window.switchSpace('library');
  };

  window._reopenLibraryReader = async function () {
    const book = _reader.book;
    if (!book) return;
    _flushReaderProgress();
    if (_reader.epubRendition) { try { _reader.epubRendition.destroy(); } catch {} }
    _reader.epubRendition=null;
    _reader.pdfDoc=null;
    $('readerTitle').textContent = book.title;
    $('readerTitle').title=book.title;
    $('readerScanBanner').classList.add('hidden');
    $('readerTocPanel').classList.add('hidden');
    $('readerTocPanel').innerHTML = '';
    $('readerPage').innerHTML = '<div class="lab-hint">Cargando libro…</div>';
    $('readerPrevBtn').disabled = true;
    $('readerNextBtn').disabled = true;
    _wireReaderChrome();
    await _loadReaderNotesAndBookmarks(book.id);
    try {
      if (_reader.format === 'epub') await _loadEpubReader(book);
      else await _loadPdfReader(book);
    } catch (error) {
      $('readerPage').innerHTML='<div class="reader-load-error" role="alert"><h2>No se pudo abrir el libro</h2><p>Vuelve a intentarlo o regresa a Biblioteca.</p><button type="button" id="readerRetry">Reintentar</button></div>';
      $('readerRetry').addEventListener('click',()=>window._reopenLibraryReader());
    }
  };

  function _closeLibraryReader() {
    _flushReaderProgress();
    if (_reader.epubRendition) { try { _reader.epubRendition.destroy(); } catch (e) {} }
    _reader.epubRendition = null;
    _reader.epubBook = null;
    _reader.pdfDoc = null;
    window._activeLibraryBookId = null;
    window.switchSpace('library');
  }

  const PDF_ZOOM_MIN = 0.3, PDF_ZOOM_MAX = 3.0, PDF_ZOOM_STEP = 0.15;
  let readerPrefs = {appearance:'auto',font:100,line:'1.85',spread:'none',dimPdf:false};
  try {
    const saved = JSON.parse(localStorage.getItem('atlas_reader_preferences') || '{}');
    if (['auto','paper','sepia','night'].includes(saved.appearance)) readerPrefs.appearance=saved.appearance;
    if (Number.isInteger(saved.font) && saved.font>=90 && saved.font<=160) readerPrefs.font=saved.font;
    if (['1.6','1.85','2.1'].includes(saved.line)) readerPrefs.line=saved.line;
    if (['none','auto'].includes(saved.spread)) readerPrefs.spread=saved.spread;
    readerPrefs.dimPdf=saved.dimPdf===true;
  } catch {}
  function _applyReaderPreferences() {
    $('libraryReaderView').dataset.appearance=readerPrefs.appearance;
    $('libraryReaderView').dataset.dimPdf=String(readerPrefs.dimPdf);
    _reader.epubFontPct=readerPrefs.font;
    if (_reader.epubRendition) _applyEpubTheme(_reader.epubRendition);
  }
  function _readerKey(event) {
    if ($('libraryReaderView').classList.contains('hidden') || !document.getElementById('assistantArea').classList.contains('hidden')) return;
    if (event.key==='Escape') {
      if (!$('readerSettings').classList.contains('hidden')) { _toggleReaderSettings(false); event.preventDefault(); return; }
      if (document.body.classList.contains('reader-focus')) { $('readerFocusBtn').click(); event.preventDefault(); return; }
    }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest('input,textarea,select,button,[contenteditable="true"],dialog') ||
        document.querySelector('dialog[open],.cmd-overlay--open') || event.target.ownerDocument?.getSelection()?.isCollapsed===false) return;
    const id=event.key==='ArrowRight'?'readerNextBtn':event.key==='ArrowLeft'?'readerPrevBtn':null;
    if(id && !$(id).disabled){event.preventDefault();$(id).click();}
  }
  function _toggleReaderSettings(open) {
    $('readerSettings').classList.toggle('hidden',!open);
    $('readerFontBtn').setAttribute('aria-expanded',String(open));
    if(open) $('readerAppearance').focus(); else $('readerFontBtn').focus({preventScroll:true});
  }

  function _updateZoomLabel() {
    const label = $('readerZoomLabel');
    if (label) label.textContent = Math.round(_reader.pdfScale * 100) + '%';
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

    const zoomOut = $('readerZoomOutBtn'), zoomIn = $('readerZoomInBtn'), fontBtn = $('readerFontBtn');
    if (zoomOut && !zoomOut._wired) {
      zoomOut._wired = true;
      zoomOut.addEventListener('click', () => {
        _reader.pdfFit = false;
        _reader.pdfScale = Math.max(PDF_ZOOM_MIN, +(_reader.pdfScale - PDF_ZOOM_STEP).toFixed(2));
        _updateZoomLabel();
        _renderPdfPage();
      });
    }
    if (zoomIn && !zoomIn._wired) {
      zoomIn._wired = true;
      zoomIn.addEventListener('click', () => {
        _reader.pdfFit = false;
        _reader.pdfScale = Math.min(PDF_ZOOM_MAX, +(_reader.pdfScale + PDF_ZOOM_STEP).toFixed(2));
        _updateZoomLabel();
        _renderPdfPage();
      });
    }
    if (fontBtn && !fontBtn._wired) {
      fontBtn._wired=true;
      fontBtn.setAttribute('aria-controls','readerSettings');
      fontBtn.setAttribute('aria-expanded','false');
      fontBtn.addEventListener('click',()=>_toggleReaderSettings($('readerSettings').classList.contains('hidden')));
      $('readerSettingsClose').addEventListener('click',()=>_toggleReaderSettings(false));
      const update=()=>{
        readerPrefs={appearance:$('readerAppearance').value,font:Number($('readerFontSize').value),
          line:$('readerLineHeight').value,spread:$('readerSpread').value,dimPdf:$('readerDimPdf').checked};
        $('readerFontValue').textContent=readerPrefs.font+'%';
        try{localStorage.setItem('atlas_reader_preferences',JSON.stringify(readerPrefs));}catch{}
        _applyReaderPreferences();
        _reader.epubRendition?.spread(readerPrefs.spread);
      };
      ['readerAppearance','readerLineHeight','readerSpread','readerDimPdf'].forEach(id=>$(id).addEventListener('change',update));
      $('readerFontSize').addEventListener('input',update);
      $('readerAssistantBtn').addEventListener('click',()=>{_toggleReaderSettings(false);$('assistantLauncher').click();});
      $('readerFocusBtn').addEventListener('click',()=>{
        const active=document.body.classList.toggle('reader-focus');
        $('readerFocusBtn').setAttribute('aria-pressed',String(active));
        $('readerFocusBtn').setAttribute('aria-label',active?'Salir de lectura sin distracciones':'Activar lectura sin distracciones');
        setTimeout(()=>{_reader.epubRendition?.resize();if(_reader.format==='pdf'&&_reader.pdfFit)_renderPdfPage();},0);
      });
      $('readerFitBtn').addEventListener('click',()=>{_reader.pdfFit=true;_renderPdfPage();});
      document.addEventListener('keydown',_readerKey);
      document.addEventListener('pointerdown',e=>{
        if(!$('readerSettings').classList.contains('hidden') && !e.target.closest('#readerSettings,#readerFontBtn')){
          $('readerSettings').classList.add('hidden');fontBtn.setAttribute('aria-expanded','false');
        }
      });
    }
    $('readerAppearance').value=readerPrefs.appearance;
    $('readerFontSize').value=readerPrefs.font;
    $('readerFontValue').textContent=readerPrefs.font+'%';
    $('readerLineHeight').value=readerPrefs.line;
    $('readerSpread').value=readerPrefs.spread;
    $('readerDimPdf').checked=readerPrefs.dimPdf;
    $('readerEpubSettings').classList.toggle('hidden',_reader.format!=='epub');
    $('readerPdfSettings').classList.toggle('hidden',_reader.format!=='pdf');
    _applyReaderPreferences();
    // Zoom es específico de PDF; en EPUB el tamaño de letra se controla con "Aa".
    const showZoom = _reader.format === 'pdf';
    [zoomOut, $('readerZoomLabel'), zoomIn, $('readerFitBtn')].forEach(el => { if (el) el.classList.toggle('hidden', !showZoom); });
    if (showZoom) _updateZoomLabel();

    // Página anterior/siguiente vive en el pie fijo del lector (visible sin
    // scrollear) en vez de junto al contenido — antes había que bajar hasta
    // el final de la página para ver "‹ Anterior / Siguiente ›".
    const prevBtn = $('readerPrevBtn'), nextBtn = $('readerNextBtn');
    if (prevBtn && !prevBtn._wired) {
      prevBtn._wired = true;
      prevBtn.addEventListener('click', () => {
        if (_reader.format === 'epub') _reader.epubRendition?.prev();
        else _pdfGoTo(_reader.pdfPage - 1);
      });
    }
    if (nextBtn && !nextBtn._wired) {
      nextBtn._wired = true;
      nextBtn.addEventListener('click', () => {
        if (_reader.format === 'epub') _reader.epubRendition?.next();
        else _pdfGoTo(_reader.pdfPage + 1);
      });
    }
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
    $('readerPctLabel').title='Progreso de lectura';
    $('readerProgressFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  let pendingReaderProgress=null;
  function _flushReaderProgress() {
    clearTimeout(_reader._progressTimer);
    if(!pendingReaderProgress)return;
    const {bookId,...data}=pendingReaderProgress;pendingReaderProgress=null;
    fetch(`/api/library/${bookId}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data),keepalive:true}).catch(()=>{});
  }
  function _saveProgressThrottled(format, location, percent) {
    clearTimeout(_reader._progressTimer);
    pendingReaderProgress={bookId:_reader.bookId,format,location,percent};
    _reader._progressTimer=setTimeout(_flushReaderProgress,800);
  }

  function _renderReaderToc() {
    const panel = $('readerTocPanel');
    if (!_reader.tocItems.length) {
      panel.innerHTML = '<div class="lab-hint" style="padding:12px">Este libro no trae un índice navegable.</div>';
      return;
    }
    panel.innerHTML = _reader.tocItems.map((it, i) => (
      `<button type="button" class="toc-item" data-toc-idx="${i}" style="padding-left:${10 + (it.depth || 0) * 14}px">${_escHtml(it.title)}</button>`
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

  async function _addBookmarkAtCurrentLocation() {
    const location = _reader.format === 'epub'
      ? (_reader._epubCurrentCfi || '')
      : `page:${_reader.pdfPage}`;
    const label = await _promptDialog('Nombre para este marcador', _reader.format === 'epub' ? '' : `Página ${_reader.pdfPage}`);
    if (label === null) return;
    fetch(`/api/library/${_reader.bookId}/bookmarks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: _reader.format, location, label }),
    }).then(() => _toast('Marcador guardado.', 'success'));
  }

  function _startOcrForCurrentBook() {
    const bookId = _reader.bookId;
    fetch(`/api/library/${bookId}/ocr`, { method: 'POST' }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) { _toast(d.error || 'No se pudo iniciar el OCR', 'error'); return; }
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
            _toast('OCR aplicado — ya puedes resaltar y buscar en este libro.', 'success');
            setTimeout(() => window._reopenLibraryReader(), 600);
          } else {
            banner.querySelector('b').textContent = 'Aplicar OCR a este libro';
            _toast('El OCR falló: ' + (st.error || 'error desconocido'), 'error');
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

  // The toolbar only ever hid itself from inside its own button handlers —
  // clicking anywhere else (to clear the selection, or just to keep
  // reading) left it stuck on screen with no selection behind it anymore.
  // One mousedown listener per document (the main page, plus each epub
  // chapter's own iframe document — those don't bubble across the frame
  // boundary) closes it unless the click is on the toolbar itself.
  function _wireSelectionDismiss(doc) {
    if (!doc || doc._libSelDismissWired) return;
    doc._libSelDismissWired = true;
    doc.addEventListener('mousedown', (e) => {
      if (e.target.closest && e.target.closest('.sel-toolbar-floating')) return;
      _removeSelToolbar();
    });
  }
  _wireSelectionDismiss(document);

  function _showSelectionToolbar(text, location, rect) {
    _removeSelToolbar();
    if (!text || !text.trim()) return;
    const bar = document.createElement('div');
    bar.className = 'sel-toolbar sel-toolbar-floating';
    const swatchesHtml = HL_COLOR_KEYS.map(key => {
      const label = _colorLegend[key];
      return `<span class="swatch" data-color="${key}" style="background:${HL_COLORS[key]}" title="${_escHtml(label || '')}"></span>`;
    }).join('');
    bar.innerHTML = `
      ${swatchesHtml}
      <span class="sep"></span>
      <span class="act" data-act="note"><svg class="atlas-system-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="/static/aero-icons.svg#edit"></use></svg> Nota</span>
      <span class="act" data-act="ask"><svg class="atlas-system-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="/static/aero-icons.svg#hint"></use></svg> Preguntar a la IA</span>
      <span class="act" data-act="concept"><svg class="atlas-system-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/static/aero-icons.svg#practice"></use></svg> Crear concepto</span>
    `;
    bar.style.position = 'fixed';
    bar.style.zIndex = 9999;
    bar.style.visibility = 'hidden';
    document.body.appendChild(bar);
    // Measure after it's in the DOM (needs its real offsetWidth/Height to
    // clamp against the viewport), then reveal — avoids a visible jump.
    const barW = bar.offsetWidth || 260;
    const barH = bar.offsetHeight || 36;
    const top = Math.min(Math.max(8, rect.top - barH - 10), window.innerHeight - barH - 8);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - barW - 8);
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
    bar.style.visibility = 'visible';

    bar.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', async () => {
        await _createNoteFromSelection(text, location, sw.dataset.color, '');
        _removeSelToolbar();
      });
    });
    bar.querySelector('[data-act="note"]').addEventListener('click', async () => {
      const noteText = await _promptDialog('Tu nota sobre esto', '', { sub: text.length > 140 ? text.slice(0, 140) + '…' : text });
      if (noteText === null) return;
      await _createNoteFromSelection(text, location, 'yellow', noteText);
      _removeSelToolbar();
    });
    bar.querySelector('[data-act="ask"]').addEventListener('click', () => {
      _removeSelToolbar();
      if (typeof window._openAiAskPanel === 'function') window._openAiAskPanel(text, { title: $('readerTitle').textContent || 'Biblioteca' });
      else _toast('El panel de IA no está disponible aquí todavía.', 'error');
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
      if (!res.ok) { _toast(note.error || 'No se pudo guardar el resaltado', 'error'); return null; }
      _reader.notes.push(note);
      if (_reader.format === 'epub' && location) _applyEpubHighlight(note);
      if (_reader.format === 'pdf') _applyPdfHighlightsForPage(_reader.pdfPage);
      _toast('Resaltado guardado.', 'success');
      return note;
    } catch (e) {
      _toast('No se pudo guardar el resaltado', 'error');
      return null;
    }
  }

  // A Range's own getBoundingClientRect() can collapse to a bogus
  // (0,0)-ish rect when the selection spans several of pdf.js's
  // individually absolutely-positioned text-layer spans — that's what sent
  // the toolbar to the top-left corner. getClientRects() returns one rect
  // per fragment instead, which stays accurate for this exact layout.
  function _selectionRect(range) {
    const rects = range.getClientRects();
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (r.width > 0 || r.height > 0) return r;
    }
    return range.getBoundingClientRect();
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
      const rect = _selectionRect(sel.getRangeAt(0));
      if (!rect || (!rect.width && !rect.height)) return;
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

  let pdfRenderSequence=0;
  async function _renderPdfPage() {
    const sequence=++pdfRenderSequence;
    const pdf = _reader.pdfDoc;
    if(!pdf)return;
    const page = await pdf.getPage(_reader.pdfPage);
    if(pdf!==_reader.pdfDoc || sequence!==pdfRenderSequence)return;
    if (_reader.pdfFit) {
      const width=page.getViewport({scale:1}).width;
      _reader.pdfScale=Math.min(PDF_ZOOM_MAX,Math.max(.1,($('readerPage').clientWidth-40)/width));
      _updateZoomLabel();
    }
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
      // pdf.js 4.x sizes the text layer and every span inside it with
      // calc()/round() expressions against --scale-factor instead of fixed
      // pixel values (so its own highlight/annotation layers can share one
      // source of truth for scale) — it never sets this custom property
      // itself, expecting whoever embeds it to. We don't, so it resolves to
      // nothing, the layer's width collapses to 0, and — paired with its
      // overflow:hidden — every span ends up clipped out of existence:
      // visually invisible either way (color: transparent), but now also
      // unreachable by the mouse, so a drag over the page can never
      // actually select anything. One line fixes it.
      textLayerDiv.style.setProperty('--scale-factor', _reader.pdfScale);
      wrap.appendChild(textLayerDiv);
      await window.pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).promise;
    }

    if(pdf!==_reader.pdfDoc || sequence!==pdfRenderSequence || $('libraryReaderView').classList.contains('hidden'))return;
    const pageEl = $('readerPage');
    pageEl.innerHTML = '';
    const scroller = document.createElement('div');
    scroller.className = 'pdf-scroller';
    scroller.appendChild(wrap);
    pageEl.appendChild(scroller);

    if (!scanned) _applyPdfHighlightsForPage(_reader.pdfPage);

    $('readerPrevBtn').disabled = _reader.pdfPage <= 1;
    $('readerNextBtn').disabled = _reader.pdfPage >= _reader.pdfPageCount;

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
    layer.querySelectorAll('span[data-lib-hl]').forEach(s => {
      s.style.background = ''; s.style.opacity = '';
      s.removeAttribute('data-lib-hl');
      s.onclick = null;
    });
    const notesHere = _reader.notes.filter(n => n.format === 'pdf' && n.location === `page:${pageNum}`);
    if (!notesHere.length) return;
    const spans = Array.from(layer.querySelectorAll('span'));
    // pdf.js gives each text line its own span, and a selection spanning
    // several lines joins them with "\n" in sel.toString() — the quote we
    // store is exactly that string. Concatenating spans with NO separator
    // here made that "\n" never match anything (a multi-line quote's first
    // 60 chars almost always contain one), and even on the rare quote that
    // did match by luck, every "\n" it counted towards its own length with
    // no matching character on this side pushed the highlighted range past
    // where the selection actually ended — painting whole extra paragraphs.
    // Joining with "\n" here too keeps both sides counting the same way.
    const fullText = spans.map(s => s.textContent).join('\n');
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
          // Same affordance as the epub reader: click an existing highlight
          // to remove it. There was no way to undo one before this.
          s.onclick = (e) => { e.stopPropagation(); _confirmRemovePdfHighlight(note); };
        }
        pos += len + 1; // +1 for the "\n" joiner between this span and the next
      }
    }
  }

  async function _confirmRemovePdfHighlight(note) {
    const ok = await _confirmDialog('Se eliminará este resaltado y la nota asociada.', {
      title: 'Quitar resaltado', okLabel: 'Quitar', danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/library/${_reader.bookId}/notes/${note.id}`, { method: 'DELETE' });
      if (!res.ok) { _toast('No se pudo quitar el resaltado', 'error'); return; }
    } catch (e) { _toast('No se pudo quitar el resaltado', 'error'); return; }
    _reader.notes = _reader.notes.filter(n => n.id !== note.id);
    _applyPdfHighlightsForPage(_reader.pdfPage);
    _toast('Resaltado eliminado.', 'success');
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
    const rendition = epubBook.renderTo('readerPage', { width: '100%', height: '100%', spread:readerPrefs.spread });
    rendition.hooks.content.register(contents => { _syncEpubDocument(contents.document); contents.document.addEventListener('keydown',_readerKey); });
    _reader.epubRendition = rendition;
    _applyEpubTheme(rendition);

    let startCfi;
    if (book.progress && book.progress.format === 'epub' && book.progress.location) startCfi = book.progress.location;

    epubBook.loaded.navigation.then(nav => {
      if(_reader.epubRendition!==rendition)return;
      const flatten=(items,depth=0)=>items.flatMap(it=>[{title:String(it.label || '').trim(),href:it.href,depth},...flatten(it.subitems || [],depth+1)]);
      _reader.tocItems = flatten(nav.toc || []);
      _renderReaderToc();
    });

    rendition.on('relocated', (location) => {
      _reader._epubCurrentCfi = location.start.cfi;
      if(_reader.epubRendition!==rendition)return;
      const displayed=location.start.displayed;
      const chapters=Math.max(1,epubBook.spine.spineItems.length);
      const pct=location.atEnd?100:Math.min(99,Math.round(((location.start.index || 0)+(displayed?(displayed.page-1)/Math.max(1,displayed.total):0))/chapters*100));
      const pageLabel=displayed?`Cap. ${(location.start.index || 0)+1}/${chapters} · pág. ${displayed.page}/${displayed.total}`:'';
      _updateReaderFooter(pageLabel || 'Leyendo…', pct);
      $('readerPctLabel').textContent=(location.atEnd?'':'≈')+pct+'%';
      $('readerPctLabel').title='Progreso estimado según capítulo y página';
      $('readerPrevBtn').disabled = !!location.atStart;
      $('readerNextBtn').disabled = !!location.atEnd;
      _saveProgressThrottled('epub', location.start.cfi, pct);
      const chapterItem = _reader.tocItems.find(t => t.href && location.start.href && location.start.href.includes(t.href.split('#')[0]));
      _reader._epubCurrentChapter = chapterItem ? chapterItem.title : '';
      _applyAllEpubHighlights();
    });

    rendition.on('selected', (cfiRange, contents) => {
      try { _wireSelectionDismiss(contents.document); } catch (e) { /* ignore */ }
      epubBook.getRange(cfiRange).then(range => {
        const text = range ? range.toString() : '';
        if (!text.trim()) return;
        // epub.js renders each chapter in its own iframe; translate the
        // selection's rect from that iframe's coordinate space into the
        // parent page's, so the floating toolbar lands in the right spot.
        let rect = { top: 120, left: 60, width: 0, height: 0 };
        try {
          const sel = contents.window.getSelection();
          if (sel && sel.rangeCount) {
            const r = _selectionRect(sel.getRangeAt(0));
            const iframe = contents.document.defaultView.frameElement;
            const iframeRect = iframe.getBoundingClientRect();
            rect = { top: iframeRect.top + r.top, left: iframeRect.left + r.left, width: r.width, height: r.height };
          }
        } catch (e) { /* fall back to the default corner position above */ }
        _showSelectionToolbar(text, cfiRange, rect);
      });
    });
    await rendition.display(startCfi || undefined);
  }

  // epub.js renders each chapter inside its own iframe with the EPUB's own
  // (often unstyled) CSS, so without this its text defaults to black-on-
  // white regardless of our reader's actual paper/dark theme — reading the
  // shell's own computed colors keeps the two in sync with zero duplicated
  // theme logic.
  function _syncEpubDocument(doc) {
    const shell=getComputedStyle($('libraryReaderView'));
    const paper=shell.getPropertyValue('--reader-paper').trim(), ink=shell.getPropertyValue('--reader-ink').trim();
    [doc.documentElement,doc.body].filter(Boolean).forEach(node=>{
      node.style.setProperty('background-color',paper,'important');
      node.style.setProperty('color',ink,'important');
      node.style.setProperty('color-scheme',paper==='#152638'?'dark':'light');
    });
  }
  function _applyEpubTheme(rendition) {
    const shell=getComputedStyle($('libraryReaderView'));
    const paper=shell.getPropertyValue('--reader-paper').trim(), ink=shell.getPropertyValue('--reader-ink').trim();
    rendition.themes.default({
      html:{'background-color':paper+' !important',color:ink+' !important'},
      body:{color:ink+' !important','background-color':paper+' !important',
        'font-family':"'Lora', Georgia, serif !important",'font-size':readerPrefs.font+'% !important',
        'line-height':readerPrefs.line+' !important',padding:(window.innerWidth<700?'18px 20px':'28px 48px')+' !important'},
      'p, li, div, section, article, blockquote, h1, h2, h3, h4, h5, h6':{color:'inherit !important','background-color':'transparent !important'},
      'p, li':{'font-size':'inherit !important','line-height':'inherit !important'},
      'p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol':{'max-width':(readerPrefs.spread==='none'?'720px':'none')+' !important','margin-left':'auto !important','margin-right':'auto !important'},
      'img, svg':{'max-width':'100% !important'},
      'a, a:link':{color:ink+' !important','text-decoration':'underline !important'}
    });
    rendition.getContents().forEach(contents=>_syncEpubDocument(contents.document));
  }

  function _applyEpubHighlight(note) {
    if (!_reader.epubRendition) return;
    try {
      // epub.js's annotations.add() keys its internal map by the CFI range
      // string, but when that key already exists it only swaps the map
      // entry — it never detaches the OLD highlight's SVG mark from the
      // page first. Re-highlighting the same passage (or re-rendering on
      // 'relocated') left every earlier mark orphaned in the DOM, stacking
      // translucent layers on top of each other until the text underneath
      // was unreadable. remove() first so there's at most one mark per spot.
      _reader.epubRendition.annotations.remove(note.location, 'highlight');
      _reader.epubRendition.annotations.add(
        'highlight', note.location, {}, () => _confirmRemoveEpubHighlight(note), 'epub-hl',
        { fill: HL_COLORS[note.color] || HL_COLORS.yellow, 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
      );
    } catch (e) { /* a stale CFI from an edited book export — skip silently */ }
  }

  function _applyAllEpubHighlights() {
    if (!_reader.epubRendition) return;
    _reader.notes.filter(n => n.format === 'epub' && n.location).forEach(_applyEpubHighlight);
  }

  // Clicking an existing highlight mark is the only way to get rid of one —
  // there was no affordance for this before, so a wrong or duplicate
  // highlight was stuck forever.
  async function _confirmRemoveEpubHighlight(note) {
    const ok = await _confirmDialog('Se eliminará este resaltado y la nota asociada.', {
      title: 'Quitar resaltado', okLabel: 'Quitar', danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/library/${_reader.bookId}/notes/${note.id}`, { method: 'DELETE' });
      if (!res.ok) { _toast('No se pudo quitar el resaltado', 'error'); return; }
    } catch (e) { _toast('No se pudo quitar el resaltado', 'error'); return; }
    _reader.notes = _reader.notes.filter(n => n.id !== note.id);
    try { _reader.epubRendition.annotations.remove(note.location, 'highlight'); } catch (e) { /* already gone */ }
    _toast('Resaltado eliminado.', 'success');
  }

  // The app's global light/dark toggle (app.js, outside this module) has no
  // way to reach into the epub.js iframe on its own — without this, the
  // reader kept the PREVIOUS theme's text color baked into its injected
  // stylesheet as `!important`, so after switching themes the text color
  // matched the new background exactly and the whole page looked blank
  // until something else (e.g. the font-size button) happened to re-run
  // _applyEpubTheme.
  window._reapplyEpubReaderTheme = function () {
    if (_reader.format === 'epub' && _reader.epubRendition) _applyEpubTheme(_reader.epubRendition);
  };
  const readerShell=$('libraryReaderView');
  const syncReaderVisibility=()=>{
    const active=!readerShell.classList.contains('hidden');
    document.body.classList.toggle('reader-active',active);
    if(!active){
      document.body.classList.remove('reader-focus');
      $('readerFocusBtn').setAttribute('aria-pressed','false');
      $('readerFocusBtn').setAttribute('aria-label','Activar lectura sin distracciones');
      $('readerSettings').classList.add('hidden');
      _flushReaderProgress();
    }
  };
  new MutationObserver(syncReaderVisibility).observe(readerShell,{attributes:true,attributeFilter:['class']});
  syncReaderVisibility();
  let readerResizeTimer;
  new ResizeObserver(()=>{
    clearTimeout(readerResizeTimer);
    readerResizeTimer=setTimeout(()=>{
      if(readerShell.classList.contains('hidden'))return;
      if(_reader.epubRendition)_applyEpubTheme(_reader.epubRendition);
      if(_reader.format==='pdf' && _reader.pdfDoc && _reader.pdfFit)_renderPdfPage();
    },120);
  }).observe($('readerPage'));
  window.addEventListener('pagehide',_flushReaderProgress);
})();
