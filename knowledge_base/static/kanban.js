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
    // Check if all checklist done or card.done
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
    _area.innerHTML = `
      <div class="kb-board-view" id="kbBoardView">
        <div class="kb-board-topbar">
          <button class="kb-back-btn" id="kbBackBtn">&#8592; Tableros</button>
          <div class="kb-board-color-dot" style="background:${escHtml(b.color)}"></div>
          <input class="kb-board-title-input" id="kbBoardTitle" value="${escHtml(b.name)}" spellcheck="false" />
          <button class="kb-btn" id="kbBgBoardBtn" title="Cambiar fondo" style="font-size:0.72rem;padding:4px 10px;">🎨 Fondo</button>
          <button class="kb-btn" id="kbDeleteBoardBtn" title="Eliminar tablero" style="font-size:0.72rem;padding:4px 10px;color:var(--text-faint)">× tablero</button>
        </div>
        <div class="kb-filters-bar" id="kbFiltersBar">
          <input class="kb-filter-search" id="kbFilterSearch" placeholder="🔍 Buscar tarjeta…" type="text" value="${escHtml(_filterText)}" />
          <div class="kb-filter-labels" id="kbFilterLabels"></div>
          <button class="kb-filter-clear kb-btn" id="kbFilterClear" style="display:none">× Limpiar</button>
        </div>
        <div class="kb-columns-wrap" id="kbColumnsWrap"></div>
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
  }

  function showBgPicker(anchor, board) {
    document.querySelectorAll('.kb-bg-picker').forEach(el => el.remove());

    const pop = document.createElement('div');
    pop.className = 'kb-bg-picker';

    // "Sin fondo" reset option
    const reset = document.createElement('div');
    reset.className = 'kb-bg-swatch kb-bg-swatch--reset' + (!board.background ? ' selected' : '');
    reset.textContent = '✕';
    reset.title = 'Sin fondo';
    reset.addEventListener('click', async () => {
      board.background = '';
      _area.style.background = '';
      try { await updateBoardApi(board.id, { background: '' }); } catch (e) { showToast('Error guardando fondo'); }
      pop.remove();
    });
    pop.appendChild(reset);

    BG_PRESETS.forEach(bg => {
      const sw = document.createElement('div');
      sw.className = 'kb-bg-swatch' + (board.background === bg ? ' selected' : '');
      sw.style.background = bg;
      sw.title = bg;
      sw.addEventListener('click', async () => {
        board.background = bg;
        _area.style.background = bg;
        try { await updateBoardApi(board.id, { background: bg }); } catch (e) { showToast('Error guardando fondo'); }
        pop.remove();
      });
      pop.appendChild(sw);
    });

    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    const popW = 220;
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
          // also check data or computed color
        });
        // Try matching by background color string in the chips
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
    countEl.className = 'kb-col-count';
    countEl.textContent = col.cards.length;

    const delBtn = document.createElement('button');
    delBtn.className = 'kb-col-del';
    delBtn.textContent = '×';
    delBtn.title = 'Eliminar lista';
    delBtn.addEventListener('click', () => deleteColumn(col.id));

    header.appendChild(nameEl);
    header.appendChild(countEl);
    header.appendChild(delBtn);
    el.appendChild(header);

    // Cards list
    const cardsList = document.createElement('div');
    cardsList.className = 'kb-cards-list';
    cardsList.dataset.colId = col.id;
    col.cards.forEach(card => {
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

    // Remove from source
    const idx = fromCol.cards.findIndex(c => c.id === card.id);
    if (idx === -1) return;
    fromCol.cards.splice(idx, 1);

    // Find insertion index in destination
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
    // Update colId reference
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
      // highlight target col
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
    const col = { id: uid(), name, cards: [] };
    _currentBoard.columns.push(col);
    renderColumns();
    saveBoard(_currentBoard.id);
  }

  // ---- Delete column ----
  async function deleteColumn(colId) {
    const col = _currentBoard.columns.find(c => c.id === colId);
    if (!col) return;
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
        <button class="kb-quick-add-cancel">×</button>
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
        created: new Date().toISOString().slice(0, 19),
      };
      col.cards.push(card);
      countEl.textContent = col.cards.length;
      cardsList.appendChild(buildCardEl(card, col.id));
      ta.value = '';
      ta.focus();
      saveBoard(_currentBoard.id);
    });
  }

  // ---- Card modal ----
  function openCardModal(card, colId) {
    // Remove existing modal if any
    const existing = document.getElementById('kbCardModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'kb-modal-overlay';
    overlay.id = 'kbCardModal';

    const col = _currentBoard.columns.find(c => c.id === colId);
    const colName = col ? col.name : '';

    overlay.innerHTML = `
      <div class="kb-modal">
        <div class="kb-modal-header">
          <span class="kb-modal-header-icon">&#9646;</span>
          <textarea class="kb-modal-title-input" id="kbCardTitle" rows="2">${escHtml(card.title)}</textarea>
          <button class="kb-modal-close" id="kbModalClose">&times;</button>
        </div>
        <div style="padding:4px 20px 0;font-size:0.7rem;color:var(--text-faint)">en lista <strong>${escHtml(colName)}</strong></div>
        <div class="kb-modal-body">
          <div class="kb-modal-main">
            <div>
              <div class="kb-modal-section-label">Etiquetas</div>
              <div class="kb-modal-labels" id="kbModalLabels"></div>
            </div>
            <div>
              <div class="kb-modal-section-label">Descripción</div>
              <textarea class="kb-modal-desc" id="kbCardDesc" placeholder="Agregar descripción…">${escHtml(card.description || '')}</textarea>
            </div>
            <div id="kbChecklistSection"></div>
          </div>
          <div class="kb-modal-sidebar">
            <div class="kb-modal-section-label">Fecha límite</div>
            <input type="date" class="kb-due-input" id="kbCardDue" value="${escHtml(card.due || '')}" />
            <div class="kb-modal-section-label" style="margin-top:12px">Acciones</div>
            <button class="kb-modal-action-btn danger" id="kbDeleteCardBtn">× Eliminar tarjeta</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Render labels
    renderModalLabels(card, overlay.querySelector('#kbModalLabels'));

    // Render checklist
    renderChecklistSection(card, overlay.querySelector('#kbChecklistSection'));

    // Close handlers
    const closeModal = () => {
      overlay.remove();
      // Re-render board to reflect changes
      renderColumns();
    };
    overlay.querySelector('#kbModalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    const escHandler = e => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // Title save
    const titleEl = overlay.querySelector('#kbCardTitle');
    titleEl.addEventListener('blur', () => {
      const val = titleEl.value.trim();
      if (val) { card.title = val; saveBoard(_currentBoard.id); }
    });

    // Description save
    const descEl = overlay.querySelector('#kbCardDesc');
    descEl.addEventListener('blur', () => {
      card.description = descEl.value;
      saveBoard(_currentBoard.id);
    });

    // Due date
    const dueEl = overlay.querySelector('#kbCardDue');
    dueEl.addEventListener('change', () => {
      card.due = dueEl.value;
      saveBoard(_currentBoard.id);
    });

    // Delete card
    overlay.querySelector('#kbDeleteCardBtn').addEventListener('click', () => {
      const col = _currentBoard.columns.find(c => c.id === colId);
      if (!col) return;
      col.cards = col.cards.filter(c => c.id !== card.id);
      saveBoard(_currentBoard.id);
      closeModal();
    });

    // Cover section
    const sidebar = overlay.querySelector('.kb-modal-sidebar');
    renderCoverSection(card, sidebar);

    // Members section
    renderMembersSection(card, sidebar);
  }

  function renderCoverSection(card, sidebar) {
    // Remove existing cover section if any
    const existing = sidebar.querySelector('.kb-cover-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'kb-cover-section';

    const label = document.createElement('div');
    label.className = 'kb-modal-section-label';
    label.style.marginTop = '12px';
    label.textContent = '🎨 Portada';
    section.appendChild(label);

    // Preview swatch if cover set
    if (card.cover) {
      const preview = document.createElement('div');
      preview.className = 'kb-cover-preview';
      preview.style.background = card.cover;
      section.appendChild(preview);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'kb-modal-action-btn';
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

    // "Sin portada" option
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
    label.style.marginTop = '12px';
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
    addBtn.className = 'kb-modal-action-btn';
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

    // Label
    const label = document.createElement('div');
    label.className = 'kb-modal-section-label';
    label.textContent = 'Checklist';
    section.appendChild(label);

    // Progress bar
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

    // Items list
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

    // Add item button & inline input
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
      chip.innerHTML = `${escHtml(lbl.text)}<button class="kb-modal-label-del" data-idx="${i}">&times;</button>`;
      chip.querySelector('.kb-modal-label-del').addEventListener('click', () => {
        card.labels.splice(i, 1);
        renderModalLabels(card, container);
        saveBoard(_currentBoard.id);
      });
      container.appendChild(chip);
    });

    // Add label button
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
    // Remove existing popovers
    document.querySelectorAll('.kb-label-popover').forEach(el => el.remove());

    let selColor = LABEL_COLORS[0];
    const pop = document.createElement('div');
    pop.className = 'kb-label-popover';
    pop.innerHTML = `
      <input type="text" placeholder="Texto de la etiqueta…" id="kbLblText" />
      <div class="kb-label-color-grid" id="kbLblColors"></div>
      <button class="kb-label-popover-add" id="kbLblAdd">Agregar etiqueta</button>`;

    const grid = pop.querySelector('#kbLblColors');
    LABEL_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'kb-label-color-swatch' + (c === selColor ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        selColor = c;
        grid.querySelectorAll('.kb-label-color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      grid.appendChild(sw);
    });

    // Position popover near anchor
    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 250) + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';

    pop.querySelector('#kbLblAdd').addEventListener('click', () => {
      const text = pop.querySelector('#kbLblText').value.trim();
      if (!text) return;
      if (!card.labels) card.labels = [];
      card.labels.push({ text, color: selColor });
      saveBoard(_currentBoard.id);
      onAdd();
      pop.remove();
    });

    const closePopover = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', closePopover);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopover), 10);
  }

  // ---- Custom dialogs (replace native prompt/confirm) ----

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

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KanbanApp.init());
  } else {
    KanbanApp.init();
  }
})();
