/* =============================================
   KANBAN — Trello-like board SPA module
   Exposes window.KanbanApp = { init, showBoards, showBoard }
   ============================================= */

(function () {
  'use strict';

  const BG_PRESETS = [
    'linear-gradient(135deg,#1a1a2e,#16213e)',
    'linear-gradient(135deg,#0f3460,#533483)',
    'linear-gradient(135deg,#1b4332,#2d6a4f)',
    'linear-gradient(135deg,#370617,#6a040f)',
    'linear-gradient(135deg,#03071e,#023e8a)',
    'linear-gradient(135deg,#240046,#7b2d8b)',
    'linear-gradient(135deg,#2d2d2d,#1a1a1a)',
    'linear-gradient(135deg,#0d1117,#161b22)',
    'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
    'linear-gradient(135deg,#16222a,#3a6073)',
    'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)',
    'linear-gradient(135deg,#134e5e,#71b280)',
    'linear-gradient(135deg,#1f4037,#99f2c8)',
    'linear-gradient(135deg,#42275a,#734b6d)',
    'linear-gradient(135deg,#232526,#414345)',
    'linear-gradient(135deg,#141e30,#243b55)',
  ];

  const BG_IMAGE_PRESETS = [
    { label: 'Aurora', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Montanas', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Costa', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Bosque', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Ciudad', url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Escritorio', url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80' },
  ];

  const LABEL_COLORS = [
    '#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46',
    '#c377e0', '#0079bf', '#00c2e0', '#51e898',
  ];

  const BOARD_COLORS = [
    '#1793d1', '#eb5a46', '#61bd4f', '#f2d600',
    '#ff9f1a', '#c377e0', '#00c2e0', '#51e898',
  ];

  const AVATAR_PALETTE = ['#eb5a46','#61bd4f','#f2d600','#0079bf','#c377e0','#ff9f1a','#00c2e0','#51e898'];
  const COVER_COLORS = ['#61bd4f','#f2d600','#ff9f1a','#eb5a46','#c377e0','#0079bf','#00c2e0','#51e898'];

  // ---- State ----
  let _area = null;          // #kanbanArea
  let _boards = [];          // cached boards list
  let _currentBoard = null;  // full board object
  let _dragCard = null;      // { card, fromColId }
  let _dragCol = null;       // column id being dragged
  let _filterText = '';      // filter bar search text
  let _filterLabels = new Set(); // active label color filters
  let _archiveOpen = false;  // archive panel state
  let _kbKeydownHandler = null; // global keydown handler reference

  // ---- Helpers ----
  function uid() {
    return Math.random().toString(36).slice(2, 8);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isOverdue(due) {
    if (!due) return false;
    return new Date(due) < new Date(new Date().toDateString());
  }

  function getDueStatus(due, card) {
    if (!due) return 'none';
    const checklist = card.checklist || [];
    const allDone = card.done === true || (checklist.length > 0 && checklist.every(i => i.done));
    if (allDone) return 'done';
    const now = new Date();
    const dueDate = new Date(due);
    const diffMs = dueDate - now;
    if (diffMs < 0) return 'overdue';
    if (diffMs <= 24 * 60 * 60 * 1000) return 'soon';
    return 'future';
  }

  function avatarColor(name) {
    return AVATAR_PALETTE[name.length % AVATAR_PALETTE.length];
  }

  function imageBackground(url) {
    return `linear-gradient(rgba(15,23,42,0.22),rgba(15,23,42,0.22)), url("${url}") center center / cover no-repeat`;
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2400);
  }

  // ---- API ----
  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadBoards() {
    _boards = await apiFetch('/api/kanban/boards');
    return _boards;
  }

  async function createBoardApi(name, description, color) {
    return apiFetch('/api/kanban/boards', {
      method: 'POST',
      body: JSON.stringify({ name, description, color }),
    });
  }

  async function updateBoardApi(id, data) {
    return apiFetch(`/api/kanban/boards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async function deleteBoardApi(id) {
    return apiFetch(`/api/kanban/boards/${id}`, { method: 'DELETE' });
  }

  async function getBoardApi(id) {
    return apiFetch(`/api/kanban/boards/${id}`);
  }

  async function saveColumnsApi(boardId, columns) {
    return apiFetch(`/api/kanban/boards/${boardId}/columns`, {
      method: 'PUT',
      body: JSON.stringify({ columns }),
    });
  }

  async function saveBoard(boardId) {
    if (!_currentBoard || _currentBoard.id !== boardId) return;
    try {
      await saveColumnsApi(boardId, _currentBoard.columns);
    } catch (e) {
      showToast('Error guardando tablero');
    }
  }

  // ---- Boards list view ----
  function showBoards() {
    _area = document.getElementById('kanbanArea');
    if (!_area) return;
    showKanbanArea();
    _area.style.background = '';
    _archiveOpen = false;
    _currentBoard = null;
    _area.innerHTML = '<div class="kb-boards-header"><h2>Tableros Kanban</h2></div><div class="kb-boards-grid" id="kbBoardsGrid"><div style="color:var(--text-muted);font-size:0.8rem">Cargando…</div></div>';
    loadBoards().then(renderBoardsGrid).catch(() => showToast('Error cargando tableros'));
  }

  function renderBoardsGrid() {
    const grid = document.getElementById('kbBoardsGrid');
    if (!grid) return;
    let html = '';
    for (const b of _boards) {
      html += `<div class="kb-board-card" data-id="${escHtml(b.id)}">
        <div class="kb-board-card-accent" style="background:${escHtml(b.color)}"></div>
        <div class="kb-board-card-body">
          <div class="kb-board-card-name">${escHtml(b.name)}</div>
          <div class="kb-board-card-desc">${escHtml(b.description || '')}</div>
          <div class="kb-board-card-meta">
            <span>${b.col_count} listas</span>
            <span>${b.card_count} tarjetas</span>
          </div>
        </div>
      </div>`;
    }
    html += `<div class="kb-board-card kb-board-card--new" id="kbNewBoardCard">
      <span>+</span><span>Nuevo tablero</span>
    </div>`;
    grid.innerHTML = html;

    grid.querySelectorAll('.kb-board-card[data-id]').forEach(el => {
      el.addEventListener('click', () => showBoard(el.dataset.id));
    });
    const newCard = document.getElementById('kbNewBoardCard');
    if (newCard) newCard.addEventListener('click', openCreateModal);
  }

  // ---- Create board modal ----
  function openCreateModal() {
    let sel = BOARD_COLORS[0];
    const overlay = document.createElement('div');
    overlay.className = 'kb-create-overlay';
    overlay.innerHTML = `
      <div class="kb-create-modal">
        <h3>Nuevo tablero</h3>
        <div class="kb-create-field">
          <label>Nombre</label>
          <input type="text" id="kbcName" placeholder="Mi tablero…" autocomplete="off" />
        </div>
        <div class="kb-create-field">
          <label>Descripción <span style="color:var(--text-faint)">(opcional)</span></label>
          <textarea id="kbcDesc" rows="2" placeholder="Descripción…"></textarea>
        </div>
        <div class="kb-create-field">
          <label>Color</label>
          <div class="kb-color-row" id="kbcColors"></div>
        </div>
        <div class="kb-create-actions">
          <button class="kb-btn" id="kbcCancel">Cancelar</button>
          <button class="kb-btn kb-btn--primary" id="kbcCreate">Crear</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const colRow = overlay.querySelector('#kbcColors');
    BOARD_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'kb-color-swatch' + (c === sel ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        sel = c;
        colRow.querySelectorAll('.kb-color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      colRow.appendChild(sw);
    });

    const nameInput = overlay.querySelector('#kbcName');
    nameInput.focus();

    overlay.querySelector('#kbcCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    });

    overlay.querySelector('#kbcCreate').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const desc = overlay.querySelector('#kbcDesc').value.trim();
      try {
        const board = await createBoardApi(name, desc, sel);
        overlay.remove();
        await loadBoards();
        renderBoardsGrid();
        if (window._loadKanbanSidebar) window._loadKanbanSidebar();
        showBoard(board.id);
      } catch (e) {
        showToast('Error creando tablero');
      }
    });
  }

  // ---- Board view ----
  async function showBoard(id) {
    _area = document.getElementById('kanbanArea');
    if (!_area) return;
    showKanbanArea();
    _area.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:0.8rem">Cargando tablero…</div>';
    _archiveOpen = false;
    try {
      _currentBoard = await getBoardApi(id);
      renderBoardView();
    } catch (e) {
      showToast('Error cargando tablero');
    }
  }

  function renderBoardView() {
    const b = _currentBoard;
    _area.style.background = b.background || '';

    // Count archived cards
    const archiveCount = getArchivedCards().length;

    _area.innerHTML = `
      <div class="kb-board-view" id="kbBoardView">
        <div class="kb-board-topbar">
          <button class="kb-back-btn" id="kbBackBtn">&#8592; Tableros</button>
          <div class="kb-board-color-dot" style="background:${escHtml(b.color)}"></div>
          <input class="kb-board-title-input" id="kbBoardTitle" value="${escHtml(b.name)}" spellcheck="false" />
          <button class="kb-btn" id="kbBgBoardBtn" title="Cambiar fondo" style="font-size:0.72rem;padding:4px 10px;">🎨 Fondo</button>
          <button class="kb-btn kb-archive-topbar-btn" id="kbArchiveBtn" title="Ver archivo">📦 Archivo${archiveCount > 0 ? ` (${archiveCount})` : ''}</button>
          <button class="kb-btn" id="kbDeleteBoardBtn" title="Eliminar tablero" style="font-size:0.72rem;padding:4px 10px;color:var(--text-faint)">× tablero</button>
        </div>
        <div class="kb-filters-bar" id="kbFiltersBar">
          <input class="kb-filter-search" id="kbFilterSearch" placeholder="🔍 Buscar tarjeta…" type="text" value="${escHtml(_filterText)}" />
          <div class="kb-filter-labels" id="kbFilterLabels"></div>
          <button class="kb-filter-clear kb-btn" id="kbFilterClear" style="display:none">× Limpiar</button>
        </div>
        <div class="kb-board-content-wrap" id="kbBoardContentWrap">
          <div class="kb-columns-wrap" id="kbColumnsWrap"></div>
          <div class="kb-archive-panel hidden" id="kbArchivePanel">
            <div class="kb-archive-panel-header">
              <span>📦 Archivo del tablero</span>
              <button class="kb-archive-panel-close" id="kbArchivePanelClose">&times;</button>
            </div>
            <div class="kb-archive-panel-body" id="kbArchivePanelBody"></div>
          </div>
        </div>
      </div>`;

    document.getElementById('kbBackBtn').addEventListener('click', showBoards);

    // Board title inline edit
    const titleInput = document.getElementById('kbBoardTitle');
    titleInput.addEventListener('change', async () => {
      const newName = titleInput.value.trim();
      if (!newName) { titleInput.value = b.name; return; }
      b.name = newName;
      try {
        await updateBoardApi(b.id, { name: newName });
        if (window._loadKanbanSidebar) window._loadKanbanSidebar();
      } catch (e) { showToast('Error actualizando nombre'); }
    });

    document.getElementById('kbDeleteBoardBtn').addEventListener('click', async () => {
      const ok = await kbConfirm(`¿Eliminar el tablero "${b.name}"? Esta acción no se puede deshacer.`);
      if (!ok) return;
      try {
        await deleteBoardApi(b.id);
        await loadBoards();
        if (window._loadKanbanSidebar) window._loadKanbanSidebar();
        showBoards();
      } catch (e) { showToast('Error eliminando tablero'); }
    });

    document.getElementById('kbBgBoardBtn').addEventListener('click', e => {
      e.stopPropagation();
      showBgPicker(document.getElementById('kbBgBoardBtn'), b);
    });

    // Archive button
    document.getElementById('kbArchiveBtn').addEventListener('click', toggleArchivePanel);
    document.getElementById('kbArchivePanelClose').addEventListener('click', toggleArchivePanel);

    // Filter bar events
    const filterSearch = document.getElementById('kbFilterSearch');
    if (filterSearch) {
      filterSearch.addEventListener('input', () => {
        _filterText = filterSearch.value;
        updateFilterClearBtn();
        applyFilters();
      });
    }
    const filterClear = document.getElementById('kbFilterClear');
    if (filterClear) {
      filterClear.addEventListener('click', () => {
        _filterText = '';
        _filterLabels.clear();
        const fs = document.getElementById('kbFilterSearch');
        if (fs) fs.value = '';
        document.querySelectorAll('.kb-filter-chip').forEach(c => c.classList.remove('active'));
        updateFilterClearBtn();
        applyFilters();
      });
    }

    renderColumns();
    setupKeyboardShortcuts();
  }

  // ---- Archive helpers ----
  function getArchivedCards() {
    if (!_currentBoard) return [];
    const result = [];
    _currentBoard.columns.forEach(col => {
      col.cards.forEach(card => {
        if (card.archived) result.push({ card, col });
      });
    });
    return result;
  }

  function toggleArchivePanel() {
    _archiveOpen = !_archiveOpen;
    const panel = document.getElementById('kbArchivePanel');
    if (!panel) return;
    if (_archiveOpen) {
      panel.classList.remove('hidden');
      renderArchivePanel();
    } else {
      panel.classList.add('hidden');
    }
  }

  function renderArchivePanel() {
    const body = document.getElementById('kbArchivePanelBody');
    if (!body) return;
    const archived = getArchivedCards();
    if (archived.length === 0) {
      body.innerHTML = '<div class="kb-archive-empty">No hay tarjetas archivadas.</div>';
      return;
    }
    // Group by column
    const byCol = {};
    archived.forEach(({ card, col }) => {
      if (!byCol[col.id]) byCol[col.id] = { colName: col.name, cards: [] };
      byCol[col.id].cards.push({ card, col });
    });
    body.innerHTML = '';
    Object.values(byCol).forEach(({ colName, cards }) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'kb-archive-group';
      const groupLabel = document.createElement('div');
      groupLabel.className = 'kb-archive-group-label';
      groupLabel.textContent = colName;
      groupEl.appendChild(groupLabel);
      cards.forEach(({ card, col }) => {
        const row = document.createElement('div');
        row.className = 'kb-archive-card-row';
        const titleEl = document.createElement('span');
        titleEl.className = 'kb-archive-card-title';
        titleEl.textContent = card.title;
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'kb-btn kb-btn--primary';
        restoreBtn.style.fontSize = '0.7rem';
        restoreBtn.style.padding = '3px 8px';
        restoreBtn.textContent = 'Restaurar';
        restoreBtn.addEventListener('click', () => {
          card.archived = false;
          saveBoard(_currentBoard.id);
          renderColumns();
          updateArchiveBtnCount();
          renderArchivePanel();
        });
        row.appendChild(titleEl);
        row.appendChild(restoreBtn);
        groupEl.appendChild(row);
      });
      body.appendChild(groupEl);
    });
  }

  function updateArchiveBtnCount() {
    const btn = document.getElementById('kbArchiveBtn');
    if (!btn) return;
    const count = getArchivedCards().length;
    btn.textContent = '📦 Archivo' + (count > 0 ? ` (${count})` : '');
  }

  function showBgPicker(anchor, board) {
    document.querySelectorAll('.kb-bg-picker').forEach(el => el.remove());

    const pop = document.createElement('div');
    pop.className = 'kb-bg-picker';
    pop.innerHTML = `
      <div class="kb-bg-picker-section">
        <div class="kb-bg-picker-label">Sin fondo</div>
        <div class="kb-bg-swatch-grid kb-bg-swatch-grid--single" id="kbBgResetRow"></div>
      </div>
      <div class="kb-bg-picker-section">
        <div class="kb-bg-picker-label">Degradados</div>
        <div class="kb-bg-swatch-grid" id="kbBgGradientGrid"></div>
      </div>
      <div class="kb-bg-picker-section">
        <div class="kb-bg-picker-label">Imagenes</div>
        <div class="kb-bg-swatch-grid" id="kbBgPhotoGrid"></div>
      </div>
      <div class="kb-bg-picker-section">
        <div class="kb-bg-picker-label">URL de imagen</div>
        <div class="kb-bg-custom-row">
          <input type="url" id="kbBgCustomUrl" placeholder="https://..." autocomplete="off" />
          <button type="button" id="kbBgApply">Aplicar</button>
        </div>
      </div>
    `;

    const resetRow = pop.querySelector('#kbBgResetRow');
    const gradientGrid = pop.querySelector('#kbBgGradientGrid');
    const photoGrid = pop.querySelector('#kbBgPhotoGrid');
    const customUrl = pop.querySelector('#kbBgCustomUrl');
    const applyBtn = pop.querySelector('#kbBgApply');

    const applyBackground = async bg => {
      board.background = bg;
      _area.style.background = bg;
      try {
        await updateBoardApi(board.id, { background: bg });
      } catch (e) {
        showToast('Error guardando fondo');
      }
      pop.remove();
    };

    const reset = document.createElement('div');
    reset.className = 'kb-bg-swatch kb-bg-swatch--reset' + (!board.background ? ' selected' : '');
    reset.textContent = '✕';
    reset.title = 'Sin fondo';
    reset.addEventListener('click', async () => {
      await applyBackground('');
    });
    resetRow.appendChild(reset);

    BG_PRESETS.forEach(bg => {
      const sw = document.createElement('div');
      sw.className = 'kb-bg-swatch' + (board.background === bg ? ' selected' : '');
      sw.style.background = bg;
      sw.title = 'Degradado';
      sw.addEventListener('click', async () => {
        await applyBackground(bg);
      });
      gradientGrid.appendChild(sw);
    });

    BG_IMAGE_PRESETS.forEach(preset => {
      const bg = imageBackground(preset.url);
      const sw = document.createElement('div');
      sw.className = 'kb-bg-swatch kb-bg-swatch--photo' + (board.background === bg ? ' selected' : '');
      sw.style.background = bg;
      sw.title = preset.label;
      sw.addEventListener('click', async () => {
        await applyBackground(bg);
      });
      photoGrid.appendChild(sw);
    });

    applyBtn.addEventListener('click', async () => {
      const url = customUrl.value.trim();
      if (!url) {
        customUrl.focus();
        return;
      }
      await applyBackground(imageBackground(url));
    });
    customUrl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyBtn.click();
      }
    });

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    const popW = Math.min(356, window.innerWidth - 16);
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    pop.style.left = left + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';

    const closePicker = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 10);
  }

  function renderColumns() {
    const wrap = document.getElementById('kbColumnsWrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    const b = _currentBoard;
    b.columns.forEach(col => {
      wrap.appendChild(buildColEl(col));
    });

    // Add column button
    const addColBtn = document.createElement('button');
    addColBtn.className = 'kb-add-col-btn';
    addColBtn.textContent = '+ Agregar lista';
    addColBtn.addEventListener('click', addColumn);
    wrap.appendChild(addColBtn);

    // Column drag and drop setup
    setupColumnDnD(wrap);

    // Build label filter chips
    renderFilterLabelChips();

    // Re-apply active filters
    applyFilters();
  }

  function renderFilterLabelChips() {
    const container = document.getElementById('kbFilterLabels');
    if (!container || !_currentBoard) return;
    container.innerHTML = '';
    const seen = new Set();
    _currentBoard.columns.forEach(col => {
      col.cards.forEach(card => {
        (card.labels || []).forEach(lbl => {
          if (!seen.has(lbl.color)) {
            seen.add(lbl.color);
            const chip = document.createElement('div');
            chip.className = 'kb-filter-chip' + (_filterLabels.has(lbl.color) ? ' active' : '');
            chip.style.background = lbl.color;
            chip.title = lbl.color;
            chip.dataset.color = lbl.color;
            chip.addEventListener('click', () => {
              if (_filterLabels.has(lbl.color)) {
                _filterLabels.delete(lbl.color);
                chip.classList.remove('active');
              } else {
                _filterLabels.add(lbl.color);
                chip.classList.add('active');
              }
              updateFilterClearBtn();
              applyFilters();
            });
            container.appendChild(chip);
          }
        });
      });
    });
  }

  function updateFilterClearBtn() {
    const btn = document.getElementById('kbFilterClear');
    if (!btn) return;
    btn.style.display = (_filterText || _filterLabels.size > 0) ? '' : 'none';
  }

  function applyFilters() {
    const searchText = _filterText.toLowerCase();
    const activeLabels = _filterLabels;
    document.querySelectorAll('.kb-card').forEach(cardEl => {
      const title = (cardEl.querySelector('.kb-card-title') || {}).textContent || '';
      const matchesText = !searchText || title.toLowerCase().includes(searchText);
      let matchesLabel = activeLabels.size === 0;
      if (!matchesLabel) {
        const chips = cardEl.querySelectorAll('.kb-label-chip');
        chips.forEach(chip => {
          if (activeLabels.has(chip.style.background || chip.style.backgroundColor)) matchesLabel = true;
        });
        if (!matchesLabel) {
          chips.forEach(chip => {
            const bg = chip.style.background;
            activeLabels.forEach(color => {
              if (bg === color) matchesLabel = true;
            });
          });
        }
      }
      if (matchesText && matchesLabel) {
        cardEl.classList.remove('kb-card--filtered-out');
      } else {
        cardEl.classList.add('kb-card--filtered-out');
      }
    });
    updateFilterClearBtn();
  }

  function buildColEl(col) {
    const el = document.createElement('div');
    el.className = 'kb-col';
    el.dataset.colId = col.id;
    el.draggable = true;

    // Visible (non-archived) cards
    const visibleCards = col.cards.filter(c => !c.archived);
    const wipLimit = col.wip || null;
    const overLimit = wipLimit !== null && visibleCards.length >= wipLimit;
    if (overLimit) el.classList.add('kb-col--over-limit');

    // Header
    const header = document.createElement('div');
    header.className = 'kb-col-header';

    const nameEl = document.createElement('input');
    nameEl.className = 'kb-col-name';
    nameEl.value = col.name;
    nameEl.title = 'Doble clic para renombrar';
    nameEl.readOnly = true;
    nameEl.addEventListener('dblclick', () => {
      nameEl.readOnly = false;
      nameEl.focus();
      nameEl.select();
    });
    nameEl.addEventListener('blur', () => {
      nameEl.readOnly = true;
      const newName = nameEl.value.trim();
      if (newName && newName !== col.name) {
        col.name = newName;
        saveBoard(_currentBoard.id);
      } else {
        nameEl.value = col.name;
      }
    });
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') nameEl.blur();
      if (e.key === 'Escape') { nameEl.value = col.name; nameEl.blur(); }
    });

    const countEl = document.createElement('span');
    countEl.className = 'kb-col-count' + (overLimit ? ' kb-col-count--over' : '');
    countEl.textContent = visibleCards.length;

    // WIP limit indicator
    if (wipLimit !== null) {
      const wipEl = document.createElement('span');
      wipEl.className = 'kb-wip-indicator' + (overLimit ? ' kb-wip-indicator--over' : '');
      wipEl.textContent = `/ ${wipLimit}`;
      header.appendChild(nameEl);
      header.appendChild(countEl);
      header.appendChild(wipEl);
    } else {
      header.appendChild(nameEl);
      header.appendChild(countEl);
    }

    // WIP settings button
    const wipBtn = document.createElement('button');
    wipBtn.className = 'kb-col-wip-btn';
    wipBtn.textContent = '⚙';
    wipBtn.title = 'Límite WIP';
    wipBtn.addEventListener('click', e => {
      e.stopPropagation();
      showWipPopover(wipBtn, col);
    });
    header.appendChild(wipBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'kb-col-del';
    delBtn.textContent = '×';
    delBtn.title = 'Eliminar lista';
    delBtn.addEventListener('click', () => deleteColumn(col.id));
    header.appendChild(delBtn);

    el.appendChild(header);

    // Cards list — only non-archived
    const cardsList = document.createElement('div');
    cardsList.className = 'kb-cards-list';
    cardsList.dataset.colId = col.id;
    visibleCards.forEach(card => {
      cardsList.appendChild(buildCardEl(card, col.id));
    });
    el.appendChild(cardsList);

    // Add card button
    const addBtn = document.createElement('button');
    addBtn.className = 'kb-add-card-btn';
    addBtn.innerHTML = '+ Agregar tarjeta';
    addBtn.addEventListener('click', () => showQuickAdd(col, cardsList, addBtn, countEl));
    el.appendChild(addBtn);

    // Card drag-over on cards list
    setupCardDropZone(cardsList);

    // Column drag events
    el.addEventListener('dragstart', e => {
      if (e.target !== el) return;
      _dragCol = col.id;
      setTimeout(() => el.classList.add('kb-card--dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      _dragCol = null;
      el.classList.remove('kb-card--dragging');
    });

    return el;
  }

  function showWipPopover(anchor, col) {
    document.querySelectorAll('.kb-wip-popover').forEach(p => p.remove());

    const pop = document.createElement('div');
    pop.className = 'kb-wip-popover';
    pop.innerHTML = `
      <div class="kb-wip-popover-title">Límite WIP</div>
      <input type="number" class="kb-wip-input" min="1" placeholder="Sin límite" value="${col.wip != null ? col.wip : ''}" />
      <div class="kb-wip-popover-actions">
        <button class="kb-btn kb-btn--primary kb-wip-save">Guardar</button>
        <button class="kb-btn kb-wip-remove">Quitar límite</button>
      </div>`;

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    let left = rect.left;
    if (left + 180 > window.innerWidth - 8) left = window.innerWidth - 188;
    pop.style.left = left + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';

    const input = pop.querySelector('.kb-wip-input');
    input.focus();

    pop.querySelector('.kb-wip-save').addEventListener('click', () => {
      const val = parseInt(input.value, 10);
      col.wip = isNaN(val) || val < 1 ? null : val;
      saveBoard(_currentBoard.id);
      renderColumns();
      pop.remove();
    });
    pop.querySelector('.kb-wip-remove').addEventListener('click', () => {
      col.wip = null;
      saveBoard(_currentBoard.id);
      renderColumns();
      pop.remove();
    });

    const closeWip = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', closeWip);
      }
    };
    setTimeout(() => document.addEventListener('click', closeWip), 10);
  }

  function buildCardEl(card, colId) {
    const el = document.createElement('div');
    el.className = 'kb-card';
    el.dataset.cardId = card.id;
    el.dataset.colId = colId;
    el.draggable = true;

    // Cover color
    if (card.cover) {
      const coverEl = document.createElement('div');
      coverEl.className = 'kb-card-cover';
      coverEl.style.background = card.cover;
      el.appendChild(coverEl);
    }

    // Labels
    if (card.labels && card.labels.length) {
      const labelsEl = document.createElement('div');
      labelsEl.className = 'kb-card-labels';
      card.labels.forEach(lbl => {
        const chip = document.createElement('span');
        chip.className = 'kb-label-chip';
        chip.style.background = lbl.color;
        chip.title = lbl.text;
        labelsEl.appendChild(chip);
      });
      el.appendChild(labelsEl);
    }

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'kb-card-title';
    titleEl.textContent = card.title;
    el.appendChild(titleEl);

    // Enhanced due date badge
    if (card.due) {
      const status = getDueStatus(card.due, card);
      if (status !== 'none') {
        const dueEl = document.createElement('span');
        const statusMap = {
          future:  { cls: 'kb-card-due--future',  icon: '📅' },
          soon:    { cls: 'kb-card-due--soon',    icon: '⏰' },
          overdue: { cls: 'kb-card-due--overdue', icon: '⚠' },
          done:    { cls: 'kb-card-due--done',    icon: '✓' },
        };
        const s = statusMap[status];
        dueEl.className = 'kb-card-due ' + s.cls;
        dueEl.textContent = s.icon + ' ' + card.due;
        el.appendChild(dueEl);
      }
    }

    // Checklist progress
    if (card.checklist && card.checklist.length > 0) {
      const total = card.checklist.length;
      const done = card.checklist.filter(i => i.done).length;
      const pct = Math.round((done / total) * 100);
      const allDone = done === total;

      const badgeEl = document.createElement('span');
      badgeEl.className = 'kb-checklist-badge' + (allDone ? ' kb-checklist-badge--done' : '');
      badgeEl.textContent = `☑ ${done}/${total}`;
      el.appendChild(badgeEl);

      const barWrap = document.createElement('div');
      barWrap.className = 'kb-checklist-bar';
      const barFill = document.createElement('div');
      barFill.className = 'kb-checklist-bar-fill';
      barFill.style.width = pct + '%';
      barWrap.appendChild(barFill);
      el.appendChild(barWrap);
    }

    // Member avatars
    if (card.members && card.members.length) {
      const avatarsEl = document.createElement('div');
      avatarsEl.className = 'kb-card-avatars';
      card.members.forEach(m => {
        const av = document.createElement('div');
        av.className = 'kb-avatar';
        av.style.background = m.color;
        av.textContent = m.name.charAt(0).toUpperCase();
        av.title = m.name;
        avatarsEl.appendChild(av);
      });
      el.appendChild(avatarsEl);
    }

    // Drag events for card
    el.addEventListener('dragstart', e => {
      _dragCard = { card, fromColId: colId };
      _dragCol = null;
      setTimeout(() => el.classList.add('kb-card--dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    el.addEventListener('dragend', () => {
      _dragCard = null;
      el.classList.remove('kb-card--dragging');
      document.querySelectorAll('.kb-col--drag-over').forEach(c => c.classList.remove('kb-col--drag-over'));
    });

    // Click → open modal
    el.addEventListener('click', () => openCardModal(card, colId));

    return el;
  }

  // ---- Card drop zones ----
  function setupCardDropZone(listEl) {
    listEl.addEventListener('dragover', e => {
      if (_dragCard) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        listEl.closest('.kb-col').classList.add('kb-col--drag-over');
      }
    });
    listEl.addEventListener('dragleave', e => {
      if (!listEl.contains(e.relatedTarget)) {
        listEl.closest('.kb-col').classList.remove('kb-col--drag-over');
      }
    });
    listEl.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragCard) return;
      listEl.closest('.kb-col').classList.remove('kb-col--drag-over');
      const toColId = listEl.dataset.colId;
      moveCard(_dragCard.card, _dragCard.fromColId, toColId, e);
    });
  }

  function moveCard(card, fromColId, toColId, dropEvent) {
    const b = _currentBoard;
    const fromCol = b.columns.find(c => c.id === fromColId);
    const toCol = b.columns.find(c => c.id === toColId);
    if (!fromCol || !toCol) return;

    const idx = fromCol.cards.findIndex(c => c.id === card.id);
    if (idx === -1) return;
    fromCol.cards.splice(idx, 1);

    const listEl = document.querySelector(`.kb-cards-list[data-col-id="${toColId}"]`);
    let insertIdx = toCol.cards.length;
    if (listEl) {
      const cards = [...listEl.querySelectorAll('.kb-card')];
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (dropEvent.clientY < rect.top + rect.height / 2) {
          insertIdx = i;
          break;
        }
      }
    }
    toCol.cards.splice(insertIdx, 0, card);
    card.colId = toColId;

    renderColumns();
    saveBoard(b.id);
  }

  // ---- Column drag and drop ----
  function setupColumnDnD(wrap) {
    wrap.addEventListener('dragover', e => {
      if (!_dragCol) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.kb-col');
      wrap.querySelectorAll('.kb-col--col-drag-over').forEach(c => c.classList.remove('kb-col--col-drag-over'));
      if (target && target.dataset.colId !== _dragCol) {
        target.classList.add('kb-col--col-drag-over');
      }
    });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragCol) return;
      wrap.querySelectorAll('.kb-col--col-drag-over').forEach(c => c.classList.remove('kb-col--col-drag-over'));
      const target = e.target.closest('.kb-col');
      if (!target) return;
      const toColId = target.dataset.colId;
      if (!toColId || toColId === _dragCol) return;
      const b = _currentBoard;
      const fromIdx = b.columns.findIndex(c => c.id === _dragCol);
      const toIdx = b.columns.findIndex(c => c.id === toColId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [col] = b.columns.splice(fromIdx, 1);
      b.columns.splice(toIdx, 0, col);
      renderColumns();
      saveBoard(b.id);
    });
  }

  // ---- Add column ----
  async function addColumn() {
    const name = await kbPrompt('Nombre de la nueva lista:', 'Ej: Por hacer, En progreso…');
    if (!name) return;
    const col = { id: uid(), name, cards: [], wip: null };
    _currentBoard.columns.push(col);
    renderColumns();
    saveBoard(_currentBoard.id);
  }

  // ---- Delete column ----
  async function deleteColumn(colId) {
    const col = _currentBoard.columns.find(c => c.id === colId);
    if (!col) return;
    const visCount = col.cards.filter(c => !c.archived).length;
    if (col.cards.length > 0) {
      const ok = await kbConfirm(`¿Eliminar la lista "${col.name}" y sus ${col.cards.length} tarjeta(s)?`);
      if (!ok) return;
    }
    _currentBoard.columns = _currentBoard.columns.filter(c => c.id !== colId);
    renderColumns();
    saveBoard(_currentBoard.id);
  }

  // ---- Quick add card ----
  function showQuickAdd(col, cardsList, addBtn, countEl) {
    if (cardsList.querySelector('.kb-quick-add')) return;
    addBtn.style.display = 'none';

    const qa = document.createElement('div');
    qa.className = 'kb-quick-add';
    qa.innerHTML = `
      <textarea placeholder="Título de la tarjeta…" id="kbQaText"></textarea>
      <div class="kb-quick-add-actions">
        <button class="kb-quick-add-save">Agregar</button>
        <button class="kb-quick-add-cancel">Cancelar</button>
      </div>`;
    cardsList.parentElement.insertBefore(qa, addBtn);

    const ta = qa.querySelector('textarea');
    ta.focus();

    const cancel = () => {
      qa.remove();
      addBtn.style.display = '';
    };

    qa.querySelector('.kb-quick-add-cancel').addEventListener('click', cancel);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        qa.querySelector('.kb-quick-add-save').click();
      }
    });
    qa.querySelector('.kb-quick-add-save').addEventListener('click', () => {
      const title = ta.value.trim();
      if (!title) return;
      const card = {
        id: uid(),
        title,
        description: '',
        labels: [],
        due: '',
        cover: '',
        members: [],
        done: false,
        archived: false,
        created: new Date().toISOString().slice(0, 19),
      };
      col.cards.push(card);
      const visCount = col.cards.filter(c => !c.archived).length;
      countEl.textContent = visCount;
      cardsList.appendChild(buildCardEl(card, col.id));
      ta.value = '';
      ta.focus();
      saveBoard(_currentBoard.id);
    });
  }

  // ---- Card modal (Trello-exact) ----
  function relativeTime(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'hace un momento';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} día${d > 1 ? 's' : ''}`;
  }

  function openCardModal(card, colId) {
    const existing = document.getElementById('kbCardModal');
    if (existing) existing.remove();

    // Ensure new fields exist
    if (!card.comments) card.comments = [];
    if (!card.attachments) card.attachments = [];
    if (card.cover_full === undefined) card.cover_full = false;

    const overlay = document.createElement('div');
    overlay.className = 'kb-modal-overlay';
    overlay.id = 'kbCardModal';

    const col = _currentBoard.columns.find(c => c.id === colId);
    const colName = col ? col.name : '';
    const boardName = _currentBoard ? _currentBoard.name : '';

    const modal = document.createElement('div');
    modal.className = 'kb-modal kb-modal--trello';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ---- Close helpers ----
    const closeModal = () => {
      overlay.remove();
      renderColumns();
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    const escHandler = e => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    function rebuildModal() {
      modal.innerHTML = '';

      // ---- TOP BAR ----
      const topbar = document.createElement('div');
      topbar.className = 'kb-modal-topbar';
      topbar.innerHTML = `
        <span class="kb-modal-topbar-board">&#9646; ${escHtml(boardName)}</span>
        <div class="kb-modal-topbar-actions">
          <button class="kb-modal-topbar-btn kb-modal-cover-icon-btn" id="kbModalCoverBtn" title="Portada">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <button class="kb-modal-topbar-btn" id="kbModalMoreTopBtn" title="Más">&#8943;</button>
          <button class="kb-modal-close" id="kbModalClose">&times;</button>
        </div>`;
      modal.appendChild(topbar);
      topbar.querySelector('#kbModalClose').addEventListener('click', closeModal);
      topbar.querySelector('#kbModalCoverBtn').addEventListener('click', e => {
        e.stopPropagation();
        showCardCoverPicker(topbar.querySelector('#kbModalCoverBtn'), card, rebuildModal);
      });

      // ---- COVER ----
      if (card.cover) {
        const coverEl = document.createElement('div');
        coverEl.className = 'kb-modal-cover';
        coverEl.style.background = card.cover;
        const coverBtnEl = document.createElement('button');
        coverBtnEl.className = 'kb-modal-cover-btn';
        coverBtnEl.innerHTML = '&#128444; Cambiar portada';
        coverBtnEl.addEventListener('click', e => {
          e.stopPropagation();
          showCardCoverPicker(coverBtnEl, card, rebuildModal);
        });
        coverEl.appendChild(coverBtnEl);
        modal.appendChild(coverEl);
      }

      // ---- BODY (two columns) ----
      const body = document.createElement('div');
      body.className = 'kb-modal-body';
      modal.appendChild(body);

      // ---- LEFT / MAIN ----
      const main = document.createElement('div');
      main.className = 'kb-modal-main';
      body.appendChild(main);

      // Title row
      const titleRow = document.createElement('div');
      titleRow.className = 'kb-modal-title-row';
      const doneCircle = document.createElement('button');
      doneCircle.className = 'kb-modal-done-circle' + (card.done ? ' kb-modal-done-circle--done' : '');
      doneCircle.title = card.done ? 'Marcar como pendiente' : 'Marcar como completada';
      doneCircle.textContent = card.done ? '●' : '○';
      doneCircle.addEventListener('click', () => {
        card.done = !card.done;
        saveBoard(_currentBoard.id);
        rebuildModal();
      });
      const titleTa = document.createElement('textarea');
      titleTa.className = 'kb-modal-title-input kb-modal-title-trello';
      titleTa.value = card.title;
      titleTa.rows = 1;
      titleTa.addEventListener('input', () => {
        titleTa.style.height = 'auto';
        titleTa.style.height = titleTa.scrollHeight + 'px';
      });
      titleTa.addEventListener('blur', () => {
        const val = titleTa.value.trim();
        if (val) { card.title = val; saveBoard(_currentBoard.id); }
      });
      titleRow.appendChild(doneCircle);
      titleRow.appendChild(titleTa);
      main.appendChild(titleRow);
      // Auto-resize on load
      setTimeout(() => {
        titleTa.style.height = 'auto';
        titleTa.style.height = titleTa.scrollHeight + 'px';
      }, 0);

      // In list note
      const inList = document.createElement('div');
      inList.className = 'kb-modal-inlist';
      inList.innerHTML = `en lista <strong>${escHtml(colName)}</strong>`;
      main.appendChild(inList);

      // Action pills row
      const pillsRow = document.createElement('div');
      pillsRow.className = 'kb-modal-action-pills';

      function makePill(icon, text, onClick) {
        const btn = document.createElement('button');
        btn.className = 'kb-modal-pill-btn';
        btn.innerHTML = `${icon} ${escHtml(text)}`;
        btn.addEventListener('click', e => { e.stopPropagation(); onClick(btn, e); });
        return btn;
      }

      // Labels pill
      pillsRow.appendChild(makePill('🏷', 'Etiquetas', btn => {
        showLabelPopover(btn, card, () => renderModalLabelsInline(card, labelsSection));
      }));
      // Due date pill
      const duePillWrap = document.createElement('div');
      duePillWrap.style.position = 'relative';
      const duePill = document.createElement('button');
      duePill.className = 'kb-modal-pill-btn';
      duePill.innerHTML = '📅 ' + escHtml(card.due || 'Fecha');
      const duePillInput = document.createElement('input');
      duePillInput.type = 'date';
      duePillInput.className = 'kb-due-input-hidden';
      duePillInput.value = card.due || '';
      duePill.addEventListener('click', () => duePillInput.showPicker ? duePillInput.showPicker() : duePillInput.focus());
      duePillInput.addEventListener('change', () => {
        card.due = duePillInput.value;
        saveBoard(_currentBoard.id);
        rebuildModal();
      });
      duePillWrap.appendChild(duePill);
      duePillWrap.appendChild(duePillInput);
      pillsRow.appendChild(duePillWrap);

      // Checklist pill
      pillsRow.appendChild(makePill('☑', 'Checklist', () => {
        if (!card.checklist) card.checklist = [];
        renderChecklistSection(card, checklistSection);
        checklistSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
      // Members pill
      pillsRow.appendChild(makePill('👤', 'Miembros', btn => {
        showMembersPopover(btn, card, rebuildModal);
      }));
      main.appendChild(pillsRow);

      // Labels section (inline, below pills)
      const labelsSection = document.createElement('div');
      labelsSection.className = 'kb-modal-labels-section';
      renderModalLabelsInline(card, labelsSection);
      main.appendChild(labelsSection);

      // Members section inline
      if (card.members && card.members.length > 0) {
        const memSection = document.createElement('div');
        memSection.className = 'kb-modal-section';
        const memHeader = document.createElement('div');
        memHeader.className = 'kb-modal-section-header';
        memHeader.innerHTML = '<span class="kb-modal-section-icon">👤</span><span class="kb-modal-section-title">Miembros</span>';
        const memAvatars = document.createElement('div');
        memAvatars.className = 'kb-members-avatars-row';
        card.members.forEach((m, idx) => {
          const av = document.createElement('div');
          av.className = 'kb-avatar';
          av.style.background = m.color;
          av.textContent = m.name.charAt(0).toUpperCase();
          av.title = m.name + ' (click para quitar)';
          av.style.cursor = 'pointer';
          av.addEventListener('click', () => {
            card.members.splice(idx, 1);
            saveBoard(_currentBoard.id);
            rebuildModal();
          });
          memAvatars.appendChild(av);
        });
        memSection.appendChild(memHeader);
        memSection.appendChild(memAvatars);
        main.appendChild(memSection);
      }

      // Description section
      const descSection = document.createElement('div');
      descSection.className = 'kb-modal-section';
      const descHeader = document.createElement('div');
      descHeader.className = 'kb-modal-section-header';
      descHeader.innerHTML = `<span class="kb-modal-section-icon">&#9776;</span><span class="kb-modal-section-title">Descripción</span>`;
      const descEditBtn = document.createElement('button');
      descEditBtn.className = 'kb-modal-section-edit-btn';
      descEditBtn.textContent = 'Editar';
      descHeader.appendChild(descEditBtn);
      descSection.appendChild(descHeader);

      const descDisplay = document.createElement('div');
      descDisplay.className = 'kb-modal-desc-display' + (!card.description ? ' kb-modal-desc-placeholder' : '');
      descDisplay.textContent = card.description || 'Agregar una descripción más detallada…';
      descSection.appendChild(descDisplay);

      const descEditArea = document.createElement('div');
      descEditArea.className = 'kb-modal-desc-edit-area';
      descEditArea.style.display = 'none';
      const descTa = document.createElement('textarea');
      descTa.className = 'kb-modal-desc';
      descTa.placeholder = 'Agregar una descripción más detallada…';
      descTa.value = card.description || '';
      const descBtns = document.createElement('div');
      descBtns.className = 'kb-modal-desc-btns';
      const descSaveBtn = document.createElement('button');
      descSaveBtn.className = 'kb-btn kb-btn--primary';
      descSaveBtn.style.fontSize = '0.75rem';
      descSaveBtn.style.padding = '4px 12px';
      descSaveBtn.textContent = 'Guardar';
      const descCancelBtn = document.createElement('button');
      descCancelBtn.className = 'kb-btn';
      descCancelBtn.style.fontSize = '0.75rem';
      descCancelBtn.style.padding = '4px 12px';
      descCancelBtn.textContent = 'Cancelar';
      descBtns.appendChild(descSaveBtn);
      descBtns.appendChild(descCancelBtn);
      descEditArea.appendChild(descTa);
      descEditArea.appendChild(descBtns);
      descSection.appendChild(descEditArea);
      main.appendChild(descSection);

      const openDescEdit = () => {
        descDisplay.style.display = 'none';
        descEditBtn.style.display = 'none';
        descEditArea.style.display = '';
        descTa.focus();
      };
      descEditBtn.addEventListener('click', openDescEdit);
      descDisplay.addEventListener('click', openDescEdit);
      descSaveBtn.addEventListener('click', () => {
        card.description = descTa.value;
        saveBoard(_currentBoard.id);
        descDisplay.textContent = card.description || 'Agregar una descripción más detallada…';
        descDisplay.className = 'kb-modal-desc-display' + (!card.description ? ' kb-modal-desc-placeholder' : '');
        descDisplay.style.display = '';
        descEditBtn.style.display = '';
        descEditArea.style.display = 'none';
      });
      descCancelBtn.addEventListener('click', () => {
        descTa.value = card.description || '';
        descDisplay.style.display = '';
        descEditBtn.style.display = '';
        descEditArea.style.display = 'none';
      });

      // Checklist section
      const checklistSection = document.createElement('div');
      checklistSection.id = 'kbChecklistSection';
      renderChecklistSection(card, checklistSection);
      main.appendChild(checklistSection);

      // Attachments section
      const attSection = document.createElement('div');
      attSection.className = 'kb-modal-section';
      const attHeader = document.createElement('div');
      attHeader.className = 'kb-modal-section-header';
      attHeader.innerHTML = `<span class="kb-modal-section-icon">&#8853;</span><span class="kb-modal-section-title">Adjuntos</span>`;
      const attBtn = document.createElement('button');
      attBtn.className = 'kb-modal-section-edit-btn';
      attBtn.textContent = 'Adjuntar';
      attHeader.appendChild(attBtn);
      attSection.appendChild(attHeader);

      // File input (hidden)
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.multiple = true;
      attSection.appendChild(fileInput);
      attBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        Array.from(fileInput.files).forEach(file => {
          const reader = new FileReader();
          reader.onload = e => {
            if (!card.attachments) card.attachments = [];
            card.attachments.push({
              id: uid(),
              name: file.name,
              url: e.target.result,
              ts: new Date().toISOString(),
            });
            saveBoard(_currentBoard.id);
            rebuildModal();
          };
          reader.readAsDataURL(file);
        });
        fileInput.value = '';
      });

      const attList = document.createElement('div');
      attList.className = 'kb-attachment-list';
      (card.attachments || []).forEach((att, idx) => {
        const item = document.createElement('div');
        item.className = 'kb-attachment-item';
        const isImage = att.url && att.url.startsWith('data:image');
        if (isImage) {
          const thumb = document.createElement('img');
          thumb.className = 'kb-attachment-thumb';
          thumb.src = att.url;
          thumb.alt = att.name;
          item.appendChild(thumb);
        } else {
          const icon = document.createElement('div');
          icon.className = 'kb-attachment-icon';
          icon.textContent = '📄';
          item.appendChild(icon);
        }
        const meta = document.createElement('div');
        meta.className = 'kb-attachment-meta';
        const nameEl = document.createElement('a');
        nameEl.className = 'kb-attachment-name';
        nameEl.href = att.url;
        nameEl.target = '_blank';
        nameEl.download = att.name;
        nameEl.textContent = att.name;
        const tsEl = document.createElement('span');
        tsEl.className = 'kb-attachment-ts';
        tsEl.textContent = relativeTime(att.ts);
        const delAttBtn = document.createElement('button');
        delAttBtn.className = 'kb-attachment-del';
        delAttBtn.textContent = '× Eliminar';
        delAttBtn.addEventListener('click', () => {
          card.attachments.splice(idx, 1);
          saveBoard(_currentBoard.id);
          rebuildModal();
        });
        meta.appendChild(nameEl);
        meta.appendChild(tsEl);
        meta.appendChild(delAttBtn);
        item.appendChild(meta);
        attList.appendChild(item);
      });
      attSection.appendChild(attList);
      main.appendChild(attSection);

      // Actions section (Move, Copy, Archive, Delete)
      const actSection = document.createElement('div');
      actSection.className = 'kb-modal-section kb-modal-actions-section';

      const moveBtn2 = document.createElement('button');
      moveBtn2.className = 'kb-sidebar-action-btn';
      moveBtn2.innerHTML = '→ Mover';
      moveBtn2.style.width = 'auto';
      moveBtn2.style.display = 'inline-flex';
      moveBtn2.addEventListener('click', e => {
        e.stopPropagation();
        showMovePopover(moveBtn2, card, colId, overlay);
      });

      const copyBtn2 = document.createElement('button');
      copyBtn2.className = 'kb-sidebar-action-btn';
      copyBtn2.innerHTML = '⎘ Copiar';
      copyBtn2.style.width = 'auto';
      copyBtn2.style.display = 'inline-flex';
      copyBtn2.addEventListener('click', () => {
        const col2 = _currentBoard.columns.find(c => c.id === colId);
        if (!col2) return;
        const copy = JSON.parse(JSON.stringify(card));
        copy.id = uid();
        copy.title = 'Copia de ' + card.title;
        copy.checklist = [];
        copy.archived = false;
        const idx = col2.cards.findIndex(c => c.id === card.id);
        col2.cards.splice(idx + 1, 0, copy);
        saveBoard(_currentBoard.id);
        overlay.remove();
        renderColumns();
        showToast('Tarjeta copiada');
      });

      actSection.appendChild(moveBtn2);
      actSection.appendChild(copyBtn2);

      if (card.archived) {
        const delBtn2 = document.createElement('button');
        delBtn2.className = 'kb-sidebar-action-btn kb-sidebar-action-btn--danger';
        delBtn2.innerHTML = '× Eliminar';
        delBtn2.style.width = 'auto';
        delBtn2.style.display = 'inline-flex';
        delBtn2.addEventListener('click', async () => {
          const ok = await kbConfirm('¿Eliminar permanentemente esta tarjeta?');
          if (!ok) return;
          const col2 = _currentBoard.columns.find(c => c.id === colId);
          if (!col2) return;
          col2.cards = col2.cards.filter(c => c.id !== card.id);
          saveBoard(_currentBoard.id);
          overlay.remove();
          renderColumns();
          updateArchiveBtnCount();
        });
        actSection.appendChild(delBtn2);
      }
      main.appendChild(actSection);

      // ---- RIGHT / SIDEBAR ----
      const sidebar = document.createElement('div');
      sidebar.className = 'kb-modal-sidebar kb-modal-sidebar--trello';
      body.appendChild(sidebar);

      // Comments section header
      const commSectionLabel = document.createElement('div');
      commSectionLabel.className = 'kb-modal-sidebar-section-label';
      commSectionLabel.innerHTML = '&#9776; Actividad';
      sidebar.appendChild(commSectionLabel);

      // Comment input
      const commInputWrap = document.createElement('div');
      commInputWrap.className = 'kb-comment-input-wrap';
      const commTa = document.createElement('textarea');
      commTa.className = 'kb-comment-input';
      commTa.placeholder = 'Agregar un comentario…';
      commTa.rows = 2;
      const commSaveBtn = document.createElement('button');
      commSaveBtn.className = 'kb-btn kb-btn--primary kb-comment-save-btn';
      commSaveBtn.textContent = 'Guardar';
      commSaveBtn.style.display = 'none';
      commTa.addEventListener('focus', () => { commSaveBtn.style.display = ''; });
      commTa.addEventListener('blur', () => {
        setTimeout(() => {
          if (!commSaveBtn.matches(':hover') && !commSaveBtn.matches(':focus')) {
            if (!commTa.value.trim()) commSaveBtn.style.display = 'none';
          }
        }, 100);
      });
      commSaveBtn.addEventListener('click', () => {
        const text = commTa.value.trim();
        if (!text) return;
        if (!card.comments) card.comments = [];
        card.comments.push({ id: uid(), text, author: 'Yo', ts: new Date().toISOString() });
        commTa.value = '';
        commSaveBtn.style.display = 'none';
        saveBoard(_currentBoard.id);
        rebuildModal();
      });
      commInputWrap.appendChild(commTa);
      commInputWrap.appendChild(commSaveBtn);
      sidebar.appendChild(commInputWrap);

      // Activity / comment list
      const commList = document.createElement('div');
      commList.className = 'kb-comment-list';

      // System activity: card created
      const createdItem = document.createElement('div');
      createdItem.className = 'kb-comment-item kb-comment-item--system';
      createdItem.innerHTML = `<div class="kb-comment-avatar" style="background:#0079bf">Y</div>
        <div class="kb-comment-body"><span class="kb-comment-author">Yo</span> <span class="kb-comment-text-inline">creó esta tarjeta</span> <span class="kb-comment-ts">${relativeTime(card.created || new Date().toISOString())}</span></div>`;
      commList.appendChild(createdItem);

      // User comments (newest first)
      const comments = (card.comments || []).slice().reverse();
      comments.forEach((c, revIdx) => {
        const origIdx = (card.comments.length - 1) - revIdx;
        const item = document.createElement('div');
        item.className = 'kb-comment-item';
        const av = document.createElement('div');
        av.className = 'kb-comment-avatar';
        av.style.background = avatarColor(c.author);
        av.textContent = c.author.charAt(0).toUpperCase();
        const commBody = document.createElement('div');
        commBody.className = 'kb-comment-body';
        const authorEl = document.createElement('span');
        authorEl.className = 'kb-comment-author';
        authorEl.textContent = c.author;
        const tsEl = document.createElement('span');
        tsEl.className = 'kb-comment-ts';
        tsEl.textContent = relativeTime(c.ts);
        const textEl = document.createElement('div');
        textEl.className = 'kb-comment-text';
        textEl.textContent = c.text;
        const delCommBtn = document.createElement('button');
        delCommBtn.className = 'kb-comment-del';
        delCommBtn.textContent = '× Eliminar';
        delCommBtn.addEventListener('click', () => {
          card.comments.splice(origIdx, 1);
          saveBoard(_currentBoard.id);
          rebuildModal();
        });
        commBody.appendChild(authorEl);
        commBody.appendChild(tsEl);
        commBody.appendChild(textEl);
        commBody.appendChild(delCommBtn);
        item.appendChild(av);
        item.appendChild(commBody);
        commList.appendChild(item);
      });
      sidebar.appendChild(commList);
    }

    rebuildModal();
  }

  function renderModalLabelsInline(card, container) {
    container.innerHTML = '';
    if (!card.labels || !card.labels.length) return;
    (card.labels || []).forEach((lbl, i) => {
      const chip = document.createElement('span');
      chip.className = 'kb-modal-label-chip';
      chip.style.background = lbl.color;
      chip.innerHTML = `${lbl.text ? escHtml(lbl.text) : ''}<button class="kb-modal-label-del" data-idx="${i}">&times;</button>`;
      chip.querySelector('.kb-modal-label-del').addEventListener('click', () => {
        card.labels.splice(i, 1);
        renderModalLabelsInline(card, container);
        saveBoard(_currentBoard.id);
      });
      container.appendChild(chip);
    });
  }

  function showMembersPopover(anchor, card, onUpdate) {
    document.querySelectorAll('.kb-members-popover').forEach(p => p.remove());
    const pop = document.createElement('div');
    pop.className = 'kb-members-popover kb-label-popover';
    pop.style.width = '200px';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:0.75rem;font-weight:600;color:var(--text);margin-bottom:8px';
    titleEl.textContent = 'Miembros';
    pop.appendChild(titleEl);

    if (card.members && card.members.length) {
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px';
      card.members.forEach((m, idx) => {
        const av = document.createElement('div');
        av.className = 'kb-avatar';
        av.style.background = m.color;
        av.style.cursor = 'pointer';
        av.title = m.name + ' (click para quitar)';
        av.textContent = m.name.charAt(0).toUpperCase();
        av.addEventListener('click', () => {
          card.members.splice(idx, 1);
          saveBoard(_currentBoard.id);
          onUpdate();
          pop.remove();
        });
        list.appendChild(av);
      });
      pop.appendChild(list);
    }

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Nombre del miembro…';
    inp.style.cssText = 'width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.8rem;padding:5px 8px;outline:none;margin-bottom:6px;font-family:var(--font-ui)';
    pop.appendChild(inp);
    inp.focus();

    const addBtn = document.createElement('button');
    addBtn.className = 'kb-label-popover-add';
    addBtn.textContent = 'Agregar miembro';
    addBtn.addEventListener('click', () => {
      const name = inp.value.trim();
      if (!name) return;
      if (!card.members) card.members = [];
      card.members.push({ name, color: avatarColor(name) });
      saveBoard(_currentBoard.id);
      onUpdate();
      pop.remove();
    });
    pop.appendChild(addBtn);

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';

    const close = e => {
      if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  // ---- Card cover picker (Trello-style side panel) ----
  const COVER_SOLID_COLORS = [
    '#61bd4f','#f2d600','#ff9f1a','#eb5a46','#c377e0',
    '#0079bf','#00c2e0','#51e898','#ff78cb','#344563',
  ];

  function showCardCoverPicker(pillBtn, card, onUpdate) {
    // Toggle: if already open, close it
    const existing = document.querySelector('.kb-cover-panel');
    if (existing) { existing.remove(); return; }

    const modal = document.getElementById('kbCardModal')?.querySelector('.kb-modal--trello');
    if (!modal) return;

    const panel = document.createElement('div');
    panel.className = 'kb-cover-panel';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'kb-cover-panel-hdr';
    hdr.innerHTML = `<span>Portada</span><button class="kb-cover-panel-close">&times;</button>`;
    hdr.querySelector('.kb-cover-panel-close').addEventListener('click', () => panel.remove());
    panel.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'kb-cover-panel-body';
    panel.appendChild(body);

    // ---- Size selector ----
    if (card.cover) {
      const sizeLabel = document.createElement('div');
      sizeLabel.className = 'kb-cover-panel-section-label';
      sizeLabel.textContent = 'Tamaño';
      body.appendChild(sizeLabel);

      const sizeRow = document.createElement('div');
      sizeRow.className = 'kb-cover-size-row';

      const makeSize = (isHalf, active) => {
        const btn = document.createElement('button');
        btn.className = 'kb-cover-size-btn' + (active ? ' active' : '');
        btn.title = isHalf ? 'Franja lateral' : 'Encabezado completo';
        const preview = document.createElement('div');
        preview.className = 'kb-cover-size-preview' + (isHalf ? ' kb-cover-size-half' : ' kb-cover-size-full');
        preview.style.background = card.cover;
        btn.appendChild(preview);
        btn.addEventListener('click', () => {
          card.cover_full = !isHalf;
          saveBoard(_currentBoard.id);
          onUpdate();
          // refresh size buttons
          sizeRow.querySelectorAll('.kb-cover-size-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
        return btn;
      };
      sizeRow.appendChild(makeSize(false, !card.cover_full === false)); // full
      sizeRow.appendChild(makeSize(true, card.cover_full === false));   // half
      body.appendChild(sizeRow);

      // Remove cover
      const removeBtn = document.createElement('button');
      removeBtn.className = 'kb-cover-remove-btn';
      removeBtn.textContent = 'Quitar portada';
      removeBtn.addEventListener('click', () => {
        card.cover = '';
        card.cover_full = false;
        saveBoard(_currentBoard.id);
        onUpdate();
        panel.remove();
      });
      body.appendChild(removeBtn);
    }

    // ---- Colors ----
    const colorLabel = document.createElement('div');
    colorLabel.className = 'kb-cover-panel-section-label';
    colorLabel.textContent = 'Colores';
    body.appendChild(colorLabel);

    const colorGrid = document.createElement('div');
    colorGrid.className = 'kb-cover-color-grid';
    COVER_SOLID_COLORS.forEach(c => {
      const sw = document.createElement('button');
      sw.className = 'kb-cover-color-swatch' + (card.cover === c ? ' active' : '');
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', () => {
        card.cover = c;
        card.cover_full = true;
        saveBoard(_currentBoard.id);
        onUpdate();
        panel.remove();
      });
      colorGrid.appendChild(sw);
    });
    body.appendChild(colorGrid);

    // ---- Upload ----
    const attachLabel = document.createElement('div');
    attachLabel.className = 'kb-cover-panel-section-label';
    attachLabel.textContent = 'Adjuntos';
    body.appendChild(attachLabel);

    const uploadBtn = document.createElement('label');
    uploadBtn.className = 'kb-cover-upload-btn';
    uploadBtn.textContent = '📎 Subir imagen de portada';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        fetch('/api/upload/cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: ev.target.result, filename: file.name })
        })
        .then(r => r.json())
        .then(d => {
          if (d.url) {
            card.cover = `url("${d.url}") center/cover no-repeat`;
            card.cover_full = true;
            saveBoard(_currentBoard.id);
            onUpdate();
            panel.remove();
          }
        });
      };
      reader.readAsDataURL(file);
    });
    uploadBtn.appendChild(fileInput);
    body.appendChild(uploadBtn);

    // ---- Photos from Unsplash ----
    const photoLabel = document.createElement('div');
    photoLabel.className = 'kb-cover-panel-section-label';
    photoLabel.textContent = 'Fotos de Unsplash';
    body.appendChild(photoLabel);

    const photoGrid = document.createElement('div');
    photoGrid.className = 'kb-cover-photo-grid';
    BG_IMAGE_PRESETS.forEach(preset => {
      const bg = `url("${preset.url}") center/cover no-repeat`;
      const sw = document.createElement('button');
      sw.className = 'kb-cover-photo-swatch' + (card.cover === bg ? ' active' : '');
      sw.style.background = bg;
      sw.title = preset.label;
      sw.addEventListener('click', () => {
        card.cover = bg;
        card.cover_full = true;
        saveBoard(_currentBoard.id);
        onUpdate();
        panel.remove();
      });
      photoGrid.appendChild(sw);
    });
    body.appendChild(photoGrid);

    // Position panel: to the RIGHT of the modal
    document.body.appendChild(panel);
    const modalRect = modal.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = modalRect.top + 'px';
    panel.style.left = (modalRect.right + 8) + 'px';
    panel.style.maxHeight = modalRect.height + 'px';

    // If panel goes off-screen, flip to left side
    const panelW = 240;
    if (modalRect.right + 8 + panelW > window.innerWidth - 8) {
      panel.style.left = (modalRect.left - panelW - 8) + 'px';
    }

    const closePicker = e => {
      if (!panel.contains(e.target) && e.target !== pillBtn) {
        panel.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 10);
  }

  function buildModalSidebar(card, colId, sidebar, overlay) {
    sidebar.innerHTML = '';

    // ---- AGREGAR A LA TARJETA ----
    const addLabel = document.createElement('div');
    addLabel.className = 'kb-sidebar-section-label';
    addLabel.textContent = 'Agregar a la tarjeta';
    sidebar.appendChild(addLabel);

    // Etiquetas button
    const lblBtn = document.createElement('button');
    lblBtn.className = 'kb-sidebar-action-btn';
    lblBtn.innerHTML = '🏷 Etiquetas';
    lblBtn.addEventListener('click', e => {
      e.stopPropagation();
      showLabelPopover(lblBtn, card, () => renderModalLabels(card, overlay.querySelector('#kbModalLabels')));
    });
    sidebar.appendChild(lblBtn);

    // Miembros button
    const memBtn = document.createElement('button');
    memBtn.className = 'kb-sidebar-action-btn';
    memBtn.innerHTML = '👤 Miembros';
    memBtn.addEventListener('click', () => {
      // Toggle members section inline below button
      const existing = sidebar.querySelector('.kb-members-section');
      if (existing) { existing.remove(); return; }
      renderMembersSection(card, sidebar);
    });
    sidebar.appendChild(memBtn);

    // Portada button
    const coverBtn = document.createElement('button');
    coverBtn.className = 'kb-sidebar-action-btn';
    coverBtn.innerHTML = '🎨 Portada';
    coverBtn.addEventListener('click', () => {
      const existing = sidebar.querySelector('.kb-cover-section');
      if (existing) { existing.remove(); return; }
      renderCoverSection(card, sidebar);
    });
    sidebar.appendChild(coverBtn);

    // Checklist button
    const chkBtn = document.createElement('button');
    chkBtn.className = 'kb-sidebar-action-btn';
    chkBtn.innerHTML = '☑ Checklist';
    chkBtn.addEventListener('click', () => {
      // Add a new empty checklist item and re-render checklist section
      if (!card.checklist) card.checklist = [];
      renderChecklistSection(card, overlay.querySelector('#kbChecklistSection'));
      // Scroll to it
      const section = overlay.querySelector('#kbChecklistSection');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    sidebar.appendChild(chkBtn);

    // Fecha límite
    const dueLabel2 = document.createElement('div');
    dueLabel2.className = 'kb-sidebar-section-label';
    dueLabel2.style.marginTop = '6px';
    dueLabel2.textContent = '📅 Fecha límite';
    sidebar.appendChild(dueLabel2);

    // Due date button shows current value, clicking focuses hidden input
    const dueWrap = document.createElement('div');
    dueWrap.style.position = 'relative';

    const dueBtn = document.createElement('button');
    dueBtn.className = 'kb-sidebar-action-btn kb-due-btn';
    dueBtn.textContent = card.due ? card.due : 'Sin fecha';
    dueWrap.appendChild(dueBtn);

    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.className = 'kb-due-input-hidden';
    dueInput.value = card.due || '';
    dueWrap.appendChild(dueInput);

    dueBtn.addEventListener('click', () => dueInput.showPicker ? dueInput.showPicker() : dueInput.focus());
    dueInput.addEventListener('change', () => {
      card.due = dueInput.value;
      dueBtn.textContent = card.due ? card.due : 'Sin fecha';
      saveBoard(_currentBoard.id);
    });
    sidebar.appendChild(dueWrap);

    // ---- ACCIONES ----
    const actLabel = document.createElement('div');
    actLabel.className = 'kb-sidebar-section-label';
    actLabel.style.marginTop = '10px';
    actLabel.textContent = 'Acciones';
    sidebar.appendChild(actLabel);

    // Mover
    const moveBtn = document.createElement('button');
    moveBtn.className = 'kb-sidebar-action-btn';
    moveBtn.innerHTML = '→ Mover';
    moveBtn.addEventListener('click', e => {
      e.stopPropagation();
      showMovePopover(moveBtn, card, colId, overlay);
    });
    sidebar.appendChild(moveBtn);

    // Copiar
    const copyBtn = document.createElement('button');
    copyBtn.className = 'kb-sidebar-action-btn';
    copyBtn.innerHTML = '⎘ Copiar';
    copyBtn.addEventListener('click', () => {
      const col = _currentBoard.columns.find(c => c.id === colId);
      if (!col) return;
      const copy = JSON.parse(JSON.stringify(card));
      copy.id = uid();
      copy.title = 'Copia de ' + card.title;
      copy.checklist = [];
      copy.archived = false;
      const idx = col.cards.findIndex(c => c.id === card.id);
      col.cards.splice(idx + 1, 0, copy);
      saveBoard(_currentBoard.id);
      overlay.remove();
      renderColumns();
      showToast('Tarjeta copiada');
    });
    sidebar.appendChild(copyBtn);

    // Archivar
    const archBtn = document.createElement('button');
    archBtn.className = 'kb-sidebar-action-btn';
    archBtn.innerHTML = '📦 Archivar';
    archBtn.addEventListener('click', () => {
      card.archived = true;
      saveBoard(_currentBoard.id);
      overlay.remove();
      renderColumns();
      updateArchiveBtnCount();
      showToast('Tarjeta archivada');
    });
    sidebar.appendChild(archBtn);

    // Eliminar — only shown if card is archived
    if (card.archived) {
      const delBtn = document.createElement('button');
      delBtn.className = 'kb-sidebar-action-btn kb-sidebar-action-btn--danger';
      delBtn.innerHTML = '× Eliminar';
      delBtn.addEventListener('click', async () => {
        const ok = await kbConfirm('¿Eliminar permanentemente esta tarjeta?');
        if (!ok) return;
        const col = _currentBoard.columns.find(c => c.id === colId);
        if (!col) return;
        col.cards = col.cards.filter(c => c.id !== card.id);
        saveBoard(_currentBoard.id);
        overlay.remove();
        renderColumns();
        updateArchiveBtnCount();
      });
      sidebar.appendChild(delBtn);
    }
  }

  // ---- Move card popover ----
  function showMovePopover(anchor, card, fromColId, modalOverlay) {
    document.querySelectorAll('.kb-move-popover').forEach(p => p.remove());

    const pop = document.createElement('div');
    pop.className = 'kb-move-popover';
    pop.innerHTML = `
      <div class="kb-move-popover-title">Mover tarjeta</div>
      <label class="kb-move-label">Tablero</label>
      <select class="kb-move-select" id="kbMoveBoardSel"></select>
      <label class="kb-move-label">Columna</label>
      <select class="kb-move-select" id="kbMoveColSel"></select>
      <label class="kb-move-label">Posición</label>
      <select class="kb-move-select" id="kbMovePosSel"></select>
      <button class="kb-btn kb-btn--primary kb-move-confirm" style="width:100%;margin-top:8px;font-size:0.75rem">Mover</button>`;

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    let left = rect.right + 8;
    if (left + 210 > window.innerWidth - 8) left = rect.left - 218;
    pop.style.left = left + 'px';
    pop.style.top = Math.min(rect.top, window.innerHeight - 280) + 'px';

    const boardSel = pop.querySelector('#kbMoveBoardSel');
    const colSel = pop.querySelector('#kbMoveColSel');
    const posSel = pop.querySelector('#kbMovePosSel');

    // Populate boards
    _boards.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === _currentBoard.id) opt.selected = true;
      boardSel.appendChild(opt);
    });

    function populateCols(boardId) {
      colSel.innerHTML = '';
      posSel.innerHTML = '';
      let cols;
      if (boardId === _currentBoard.id) {
        cols = _currentBoard.columns;
      } else {
        // Try to get from boards list (limited info), default to current
        cols = _currentBoard.columns;
      }
      cols.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col.id;
        opt.textContent = col.name;
        if (col.id === fromColId) opt.selected = true;
        colSel.appendChild(opt);
      });
      populatePos(boardId);
    }

    function populatePos(boardId) {
      posSel.innerHTML = '';
      const selColId = colSel.value;
      let targetCol;
      if (boardId === _currentBoard.id) {
        targetCol = _currentBoard.columns.find(c => c.id === selColId);
      }
      const count = targetCol ? targetCol.cards.filter(c => !c.archived).length : 0;
      for (let i = 1; i <= count + 1; i++) {
        const opt = document.createElement('option');
        opt.value = i - 1; // 0-indexed
        opt.textContent = i === count + 1 ? `${i} (al final)` : String(i);
        posSel.appendChild(opt);
      }
      // Default: position of current card or end
      if (boardId === _currentBoard.id && selColId === fromColId && targetCol) {
        const cardIdx = targetCol.cards.filter(c => !c.archived).findIndex(c => c.id === card.id);
        if (cardIdx >= 0) posSel.value = cardIdx;
      } else {
        posSel.value = count; // al final
      }
    }

    boardSel.addEventListener('change', async () => {
      const bid = boardSel.value;
      if (bid !== _currentBoard.id) {
        // Fetch that board's columns
        try {
          const remoteBoard = await getBoardApi(bid);
          colSel.innerHTML = '';
          remoteBoard.columns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col.id;
            opt.textContent = col.name;
            colSel.appendChild(opt);
          });
          // Store for use during confirm
          pop._remoteBoard = remoteBoard;
          populatePosFromRemote(remoteBoard);
        } catch (e) {
          showToast('Error cargando tablero');
        }
      } else {
        pop._remoteBoard = null;
        populateCols(bid);
      }
    });

    function populatePosFromRemote(remoteBoard) {
      posSel.innerHTML = '';
      const selColId = colSel.value;
      const targetCol = remoteBoard.columns.find(c => c.id === selColId);
      const count = targetCol ? targetCol.cards.filter(c => !c.archived).length : 0;
      for (let i = 1; i <= count + 1; i++) {
        const opt = document.createElement('option');
        opt.value = i - 1;
        opt.textContent = i === count + 1 ? `${i} (al final)` : String(i);
        posSel.appendChild(opt);
      }
      posSel.value = count;
    }

    colSel.addEventListener('change', () => {
      const bid = boardSel.value;
      if (pop._remoteBoard) {
        populatePosFromRemote(pop._remoteBoard);
      } else {
        populatePos(bid);
      }
    });

    populateCols(_currentBoard.id);

    pop.querySelector('.kb-move-confirm').addEventListener('click', async () => {
      const toBoardId = boardSel.value;
      const toColId = colSel.value;
      const toPos = parseInt(posSel.value, 10);

      if (toBoardId === _currentBoard.id) {
        // Same board move
        const fromCol = _currentBoard.columns.find(c => c.id === fromColId);
        const toCol = _currentBoard.columns.find(c => c.id === toColId);
        if (!fromCol || !toCol) return;

        // Remove from source
        const srcIdx = fromCol.cards.findIndex(c => c.id === card.id);
        if (srcIdx === -1) return;
        fromCol.cards.splice(srcIdx, 1);

        // Find actual insertion index accounting for archived
        let nonArchivedCount = 0;
        let insertIdx = toCol.cards.length;
        for (let i = 0; i <= toCol.cards.length; i++) {
          if (nonArchivedCount === toPos) {
            insertIdx = i;
            break;
          }
          if (i < toCol.cards.length && !toCol.cards[i].archived) nonArchivedCount++;
        }
        toCol.cards.splice(insertIdx, 0, card);
        card.colId = toColId;

        saveBoard(_currentBoard.id);
        pop.remove();
        modalOverlay.remove();
        renderColumns();
      } else {
        // Different board
        try {
          const remoteBoard = pop._remoteBoard || await getBoardApi(toBoardId);
          const fromCol = _currentBoard.columns.find(c => c.id === fromColId);
          if (!fromCol) return;
          const srcIdx = fromCol.cards.findIndex(c => c.id === card.id);
          if (srcIdx === -1) return;
          fromCol.cards.splice(srcIdx, 1);

          const toCol = remoteBoard.columns.find(c => c.id === toColId);
          if (!toCol) return;
          toCol.cards.splice(toPos, 0, card);

          await saveColumnsApi(_currentBoard.id, _currentBoard.columns);
          await saveColumnsApi(toBoardId, remoteBoard.columns);

          pop.remove();
          modalOverlay.remove();
          renderColumns();
          showToast('Tarjeta movida al tablero ' + remoteBoard.name);
        } catch (e) {
          showToast('Error moviendo tarjeta');
        }
      }
    });

    const closeMove = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', closeMove);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMove), 10);
  }

  function renderCoverSection(card, sidebar) {
    const existing = sidebar.querySelector('.kb-cover-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'kb-cover-section';

    const label = document.createElement('div');
    label.className = 'kb-modal-section-label';
    label.style.marginTop = '8px';
    label.textContent = '🎨 Portada';
    section.appendChild(label);

    if (card.cover) {
      const preview = document.createElement('div');
      preview.className = 'kb-cover-preview';
      preview.style.background = card.cover;
      section.appendChild(preview);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'kb-sidebar-action-btn';
    toggleBtn.textContent = card.cover ? 'Cambiar portada' : 'Agregar portada';
    section.appendChild(toggleBtn);

    const picker = document.createElement('div');
    picker.className = 'kb-cover-picker';
    picker.style.display = 'none';

    COVER_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'kb-cover-swatch';
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', () => {
        card.cover = c;
        saveBoard(_currentBoard.id);
        renderCoverSection(card, sidebar);
      });
      picker.appendChild(sw);
    });

    const noneBtn = document.createElement('div');
    noneBtn.className = 'kb-cover-swatch kb-cover-swatch--none';
    noneBtn.textContent = '✕';
    noneBtn.title = 'Sin portada';
    noneBtn.addEventListener('click', () => {
      card.cover = '';
      saveBoard(_currentBoard.id);
      renderCoverSection(card, sidebar);
    });
    picker.appendChild(noneBtn);

    toggleBtn.addEventListener('click', () => {
      picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    });

    section.appendChild(picker);
    sidebar.appendChild(section);
  }

  function renderMembersSection(card, sidebar) {
    if (!card.members) card.members = [];

    const existing = sidebar.querySelector('.kb-members-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'kb-members-section';

    const label = document.createElement('div');
    label.className = 'kb-modal-section-label';
    label.style.marginTop = '8px';
    label.textContent = '👤 Miembros';
    section.appendChild(label);

    const avatarsRow = document.createElement('div');
    avatarsRow.className = 'kb-members-avatars-row';
    card.members.forEach((m, idx) => {
      const av = document.createElement('div');
      av.className = 'kb-avatar kb-avatar-sm';
      av.style.background = m.color;
      av.textContent = m.name.charAt(0).toUpperCase();
      av.title = m.name + ' (click para quitar)';
      av.style.cursor = 'pointer';
      av.addEventListener('click', () => {
        card.members.splice(idx, 1);
        saveBoard(_currentBoard.id);
        renderMembersSection(card, sidebar);
      });
      avatarsRow.appendChild(av);
    });
    section.appendChild(avatarsRow);

    const addBtn = document.createElement('button');
    addBtn.className = 'kb-sidebar-action-btn';
    addBtn.textContent = '+ Agregar miembro';
    section.appendChild(addBtn);

    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'none';
    const memberInput = document.createElement('input');
    memberInput.type = 'text';
    memberInput.className = 'kb-checklist-add-input';
    memberInput.placeholder = 'Nombre…';
    inputWrap.appendChild(memberInput);
    section.appendChild(inputWrap);

    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      inputWrap.style.display = '';
      memberInput.focus();
    });

    const saveMember = () => {
      const name = memberInput.value.trim();
      if (name) {
        card.members.push({ name, color: avatarColor(name) });
        saveBoard(_currentBoard.id);
      }
      addBtn.style.display = '';
      inputWrap.style.display = 'none';
      memberInput.value = '';
      renderMembersSection(card, sidebar);
    };

    memberInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveMember(); }
      if (e.key === 'Escape') {
        addBtn.style.display = '';
        inputWrap.style.display = 'none';
        memberInput.value = '';
      }
    });
    memberInput.addEventListener('blur', saveMember);

    sidebar.appendChild(section);
  }

  function renderChecklistSection(card, container) {
    container.innerHTML = '';
    if (!card.checklist) card.checklist = [];

    const section = document.createElement('div');
    section.className = 'kb-checklist-section';

    const label = document.createElement('div');
    label.className = 'kb-modal-section-label';
    label.textContent = 'Checklist';
    section.appendChild(label);

    const total = card.checklist.length;
    const done = card.checklist.filter(i => i.done).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    if (total > 0) {
      const progWrap = document.createElement('div');
      progWrap.className = 'kb-checklist-progress';
      const progFill = document.createElement('div');
      progFill.className = 'kb-checklist-bar-fill';
      progFill.style.width = pct + '%';
      progWrap.appendChild(progFill);
      section.appendChild(progWrap);
    }

    card.checklist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'kb-checklist-item' + (item.done ? ' kb-checklist-item--done' : '');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.done;
      cb.addEventListener('change', () => {
        item.done = cb.checked;
        saveBoard(_currentBoard.id);
        renderChecklistSection(card, container);
      });

      const txt = document.createElement('span');
      txt.className = 'kb-checklist-text';
      txt.textContent = item.text;

      const del = document.createElement('button');
      del.className = 'kb-checklist-del';
      del.textContent = '×';
      del.title = 'Eliminar ítem';
      del.addEventListener('click', () => {
        card.checklist.splice(idx, 1);
        saveBoard(_currentBoard.id);
        renderChecklistSection(card, container);
      });

      row.appendChild(cb);
      row.appendChild(txt);
      row.appendChild(del);
      section.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'kb-checklist-add-btn';
    addBtn.textContent = '+ Agregar ítem';

    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'none';
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.className = 'kb-checklist-add-input';
    addInput.placeholder = 'Nuevo ítem…';
    inputWrap.appendChild(addInput);

    const saveItem = () => {
      const text = addInput.value.trim();
      if (text) {
        card.checklist.push({ id: uid(), text, done: false });
        saveBoard(_currentBoard.id);
      }
      addInput.value = '';
      inputWrap.style.display = 'none';
      addBtn.style.display = '';
      renderChecklistSection(card, container);
    };

    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveItem(); }
      if (e.key === 'Escape') {
        addInput.value = '';
        inputWrap.style.display = 'none';
        addBtn.style.display = '';
      }
    });
    addInput.addEventListener('blur', saveItem);

    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      inputWrap.style.display = '';
      addInput.focus();
    });

    section.appendChild(addBtn);
    section.appendChild(inputWrap);
    container.appendChild(section);
  }

  function renderModalLabels(card, container) {
    container.innerHTML = '';
    (card.labels || []).forEach((lbl, i) => {
      const chip = document.createElement('span');
      chip.className = 'kb-modal-label-chip';
      chip.style.background = lbl.color;
      chip.innerHTML = `${lbl.text ? escHtml(lbl.text) : ''}<button class="kb-modal-label-del" data-idx="${i}">&times;</button>`;
      chip.querySelector('.kb-modal-label-del').addEventListener('click', () => {
        card.labels.splice(i, 1);
        renderModalLabels(card, container);
        saveBoard(_currentBoard.id);
      });
      container.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'kb-add-label-btn';
    addBtn.textContent = '+ Etiqueta';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      showLabelPopover(addBtn, card, () => renderModalLabels(card, container));
    });
    container.appendChild(addBtn);
  }

  function showLabelPopover(anchor, card, onAdd) {
    document.querySelectorAll('.kb-label-popover').forEach(el => el.remove());

    let selColor = LABEL_COLORS[0];
    const pop = document.createElement('div');
    pop.className = 'kb-label-popover';

    // Preview chip
    const preview = document.createElement('div');
    preview.className = 'kb-label-preview-chip';
    preview.style.background = selColor;
    preview.textContent = ' ';
    pop.appendChild(preview);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Texto (opcional)…';
    textInput.className = 'kb-label-text-input';
    textInput.addEventListener('input', () => {
      preview.textContent = textInput.value.trim() || ' ';
    });
    pop.appendChild(textInput);

    const grid = document.createElement('div');
    grid.className = 'kb-label-color-grid';
    LABEL_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'kb-label-color-swatch' + (c === selColor ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        selColor = c;
        grid.querySelectorAll('.kb-label-color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        preview.style.background = c;
      });
      grid.appendChild(sw);
    });
    pop.appendChild(grid);

    const addBtn = document.createElement('button');
    addBtn.className = 'kb-label-popover-add';
    addBtn.textContent = 'Agregar etiqueta';
    addBtn.addEventListener('click', () => {
      const text = textInput.value.trim();
      if (!card.labels) card.labels = [];
      card.labels.push({ text, color: selColor });
      saveBoard(_currentBoard.id);
      onAdd();
      pop.remove();
    });
    pop.appendChild(addBtn);

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 250) + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';

    const closePopover = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', closePopover);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopover), 10);
  }

  // ---- Keyboard shortcuts ----
  function setupKeyboardShortcuts() {
    // Remove previous handler
    if (_kbKeydownHandler) {
      document.removeEventListener('keydown', _kbKeydownHandler);
    }

    _kbKeydownHandler = function(e) {
      const kanbanArea = document.getElementById('kanbanArea');
      if (!kanbanArea || kanbanArea.classList.contains('hidden')) return;

      // Don't intercept when typing in inputs
      const tag = e.target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Escape: close shortcuts overlay or clear filters
      if (e.key === 'Escape') {
        const shortcutsOverlay = document.getElementById('kbShortcutsOverlay');
        if (shortcutsOverlay) { shortcutsOverlay.remove(); return; }
        const modal = document.getElementById('kbCardModal');
        if (modal) return; // handled by modal's own handler
        if (document.activeElement && document.activeElement.id === 'kbFilterSearch') {
          _filterText = '';
          _filterLabels.clear();
          document.activeElement.value = '';
          document.querySelectorAll('.kb-filter-chip').forEach(c => c.classList.remove('active'));
          updateFilterClearBtn();
          applyFilters();
        }
        return;
      }

      if (isInput) return; // don't intercept other keys in inputs

      // f — focus filter search
      if (e.key === 'f' || e.key === 'F') {
        const fs = document.getElementById('kbFilterSearch');
        if (fs) { e.preventDefault(); fs.focus(); }
        return;
      }

      // ? — show shortcuts overlay
      if (e.key === '?') {
        e.preventDefault();
        showShortcutsOverlay();
        return;
      }
    };

    document.addEventListener('keydown', _kbKeydownHandler);
  }

  function showShortcutsOverlay() {
    const existing = document.getElementById('kbShortcutsOverlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'kb-shortcuts-overlay';
    overlay.id = 'kbShortcutsOverlay';
    overlay.innerHTML = `
      <div class="kb-shortcuts-modal">
        <div class="kb-shortcuts-header">
          <span>⌨ Atajos de teclado</span>
          <button class="kb-modal-close" id="kbShortcutsClose">&times;</button>
        </div>
        <table class="kb-shortcuts-table">
          <thead><tr><th>Tecla</th><th>Acción</th></tr></thead>
          <tbody>
            <tr><td><kbd>f</kbd></td><td>Enfocar búsqueda</td></tr>
            <tr><td><kbd>?</kbd></td><td>Mostrar atajos</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Cerrar modal / limpiar filtros</td></tr>
          </tbody>
        </table>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#kbShortcutsClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  // ---- Custom dialogs ----
  function kbConfirm(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'kb-dialog-overlay';
      overlay.innerHTML = `
        <div class="kb-dialog">
          <div class="kb-dialog-msg">${escHtml(message)}</div>
          <div class="kb-dialog-actions">
            <button class="kb-btn" id="kbDialogCancel">Cancelar</button>
            <button class="kb-btn kb-btn--danger" id="kbDialogOk">Eliminar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = val => { overlay.remove(); resolve(val); };
      overlay.querySelector('#kbDialogOk').addEventListener('click', () => close(true));
      overlay.querySelector('#kbDialogCancel').addEventListener('click', () => close(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
      const esc = e => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); } };
      document.addEventListener('keydown', esc);
      overlay.querySelector('#kbDialogOk').focus();
    });
  }

  function kbPrompt(label, placeholder = '') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'kb-dialog-overlay';
      overlay.innerHTML = `
        <div class="kb-dialog">
          <div class="kb-dialog-msg">${escHtml(label)}</div>
          <input class="kb-dialog-input" type="text" placeholder="${escHtml(placeholder)}" autocomplete="off" />
          <div class="kb-dialog-actions">
            <button class="kb-btn" id="kbDialogCancel">Cancelar</button>
            <button class="kb-btn kb-btn--primary" id="kbDialogOk">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('.kb-dialog-input');
      input.focus();
      const close = val => { overlay.remove(); resolve(val); };
      overlay.querySelector('#kbDialogOk').addEventListener('click', () => close(input.value.trim() || null));
      overlay.querySelector('#kbDialogCancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') close(input.value.trim() || null);
        if (e.key === 'Escape') close(null);
      });
    });
  }

  // ---- Helper: show kanban area, hide others ----
  function showKanbanArea() {
    const kanbanArea = document.getElementById('kanbanArea');
    const entryView = document.getElementById('entryView');
    const welcome = document.getElementById('welcome');
    if (entryView) entryView.classList.add('hidden');
    if (welcome) welcome.classList.add('hidden');
    if (kanbanArea) kanbanArea.classList.remove('hidden');
  }

  // ---- Public API ----
  const KanbanApp = {
    init() {
      _area = document.getElementById('kanbanArea');
    },
    showBoards,
    showBoard,
  };

  window.KanbanApp = KanbanApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KanbanApp.init());
  } else {
    KanbanApp.init();
  }
})();
