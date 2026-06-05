/* =============================================
   KNOWLEDGE BASE — Frontend Logic
   ============================================= */

const $ = id => document.getElementById(id);

// ---- State ----
let currentEntryId = null;
let currentEntryMeta = null;
let treeState = {};
let coursesTreeState = {};
let starredMap = {};
let pinnedMap = {};
let statusMap = {};
let _reviewEntries = [];
let _reviewIndex = 0;
let _inlineEditor = null;  // inline entry editor instance
let _autoSaveTimer = null;
let _restoreInProgress = false;

const ENTRY_ICON_DEFAULTS = {
  knowledge: "lucide:file-text",
  course: "lucide:graduation-cap",
  teamspace: "lucide:briefcase",
  page: "lucide:file",
};

const ICON_CATALOG = [
  { group: "General", label: "Documento", icon: "lucide:file-text", tags: ["page", "documento", "nota", "entry"] },
  { group: "General", label: "Carpeta", icon: "lucide:folder-open", tags: ["folder", "categoria", "tema"] },
  { group: "General", label: "Libro", icon: "lucide:book-open", tags: ["book", "curso", "guia"] },
  { group: "General", label: "Capa", icon: "lucide:layers-3", tags: ["stack", "modulo", "coleccion"] },
  { group: "General", label: "Meta", icon: "lucide:target", tags: ["objetivo", "target"] },
  { group: "General", label: "Idea", icon: "lucide:lightbulb", tags: ["idea", "brainstorm"] },
  { group: "General", label: "Cohete", icon: "lucide:rocket", tags: ["launch", "proyecto"] },
  { group: "General", label: "Paleta", icon: "lucide:palette", tags: ["design", "ui", "ux"] },
  { group: "Workspace", label: "Teamspace", icon: "lucide:briefcase", tags: ["workspace", "space", "equipo"] },
  { group: "Workspace", label: "Personas", icon: "lucide:users", tags: ["team", "usuarios", "miembros"] },
  { group: "Workspace", label: "Empresa", icon: "lucide:building-2", tags: ["org", "company"] },
  { group: "Workspace", label: "Tablero", icon: "lucide:kanban-square", tags: ["kanban", "trello", "board"] },
  { group: "Workspace", label: "Base de datos", icon: "lucide:database", tags: ["db", "datos"] },
  { group: "Workspace", label: "Servidor", icon: "lucide:server", tags: ["backend", "infra"] },
  { group: "Workspace", label: "Red", icon: "lucide:network", tags: ["network", "topologia"] },
  { group: "Workspace", label: "Escudo", icon: "lucide:shield", tags: ["security", "seguridad"] },
  { group: "Tech", label: "Python", icon: "simple-icons:python", color: "#3776AB", tags: ["python", "lenguaje"] },
  { group: "Tech", label: "JavaScript", icon: "simple-icons:javascript", color: "#F7DF1E", tags: ["javascript", "js"] },
  { group: "Tech", label: "TypeScript", icon: "simple-icons:typescript", color: "#3178C6", tags: ["typescript", "ts"] },
  { group: "Tech", label: "HTML", icon: "simple-icons:html5", color: "#E34F26", tags: ["html", "frontend"] },
  { group: "Tech", label: "CSS", icon: "simple-icons:css", color: "#1572B6", tags: ["css", "styles"] },
  { group: "Tech", label: "React", icon: "simple-icons:react", color: "#61DAFB", tags: ["react"] },
  { group: "Tech", label: "Node", icon: "simple-icons:nodedotjs", color: "#339933", tags: ["node", "nodejs"] },
  { group: "Tech", label: "Docker", icon: "simple-icons:docker", color: "#2496ED", tags: ["docker", "contenedor"] },
  { group: "Tech", label: "Git", icon: "simple-icons:git", color: "#F05032", tags: ["git", "control de versiones"] },
  { group: "Tech", label: "GitHub", icon: "simple-icons:github", color: "#ffffff", tags: ["github", "repo"] },
  { group: "Tech", label: "Linux", icon: "simple-icons:linux", color: "#FCC624", tags: ["linux", "sistema"] },
  { group: "Tech", label: "PostgreSQL", icon: "simple-icons:postgresql", color: "#4169E1", tags: ["postgres", "database"] },
  { group: "Tech", label: "MySQL", icon: "simple-icons:mysql", color: "#4479A1", tags: ["mysql", "database"] },
  { group: "Tech", label: "MongoDB", icon: "simple-icons:mongodb", color: "#47A248", tags: ["mongodb", "database"] },
];

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  // Modal block editor (for new entries)
  BlockEditor.init({
    container:   document.getElementById("blockEditor"),
    syncTarget:  document.getElementById("fieldContent"),
    menuEl:      document.getElementById("slashMenu"),
    onPageCreate: null,
  });

  // Inline entry editor (for viewing/editing entries)
  _inlineEditor = BlockEditor.create({
    container:    document.getElementById("entryBody"),
    menuEl:       document.getElementById("slashMenuInline"),
    onChange:     _scheduleAutoSave,
    onPageCreate: true,  // enable page creation (handled via window._promptPageName)
  });

  // Inline title auto-save
  const inlineTitle = document.getElementById("inlineTitle");
  if (inlineTitle) {
    inlineTitle.addEventListener("blur", () => {
      const newTitle = inlineTitle.textContent.trim();
      if (newTitle && currentEntryId && newTitle !== (currentEntryMeta && currentEntryMeta.title)) {
        _patchContent({ title: newTitle });
        if (currentEntryMeta) currentEntryMeta.title = newTitle;
        // Update sidebar label
        document.querySelectorAll(`.tree-entry[data-id="${currentEntryId}"] .tree-entry-title`).forEach(el => el.textContent = newTitle);
      }
    });
    inlineTitle.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); inlineTitle.blur(); document.getElementById("entryBody").querySelector(".eb-content")?.focus(); }
    });
  }

  // Allow block editor page links to navigate to sub-pages
  window._loadEntryById = (id) => loadEntry(id);

  initPageNameModal();
  initIconPickers();
  renderHome();

  loadTree();
  Promise.all([loadCategorySuggestions(), loadTopicSuggestions()]).then(initSmartSelects);
  loadCourseSuggestions();
  bindEvents();
  loadKanbanSidebar();
  applyTheme();
  initFocusMode();
  initStarFeature();
  initTOC();
  initScratchpad();
  initStats();
  initContextMenu();
  initTemplates();
  initHistory();
  initDuplicate();
  initMove();
  initPin();
  initStatus();
  initReview();
  initPageFind();
  initRelationsPanel();
  // KanbanApp.init() is called from kanban.js DOMContentLoaded

  // Modal type toggle
  let currentModalMode = "knowledge";
  window._getModalMode = () => currentModalMode;
  window._setModalMode = (mode) => { currentModalMode = mode; };
  document.querySelectorAll(".type-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentModalMode = tab.dataset.mode;
      document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t === tab));
      $("knowledgeFields").classList.toggle("hidden",  currentModalMode !== "knowledge");
      $("courseFields").classList.toggle("hidden",     currentModalMode !== "course");
      $("teamspaceFields").classList.toggle("hidden",  currentModalMode !== "teamspace");
      $("templatePickerGroup").classList.toggle("hidden", currentModalMode !== "knowledge");
      const iconBtn = $("entryIconBtn");
      if (iconBtn && iconBtn.dataset.userPicked !== "true") {
        setIconButtonValue(iconBtn, getDefaultIconForMode(currentModalMode), getDefaultIconForMode(currentModalMode));
      }
    });
  });
});

function bindEvents() {
  $("newEntryBtn").addEventListener("click", handleNewEntryTopbar);
  // Knowledge sidebar + button
  const sidebarNewBtn = $("newEntryBtnSidebar");
  if (sidebarNewBtn) sidebarNewBtn.addEventListener("click", openNewModal);
  // newTeamspaceEntryBtn is now handled by openNewTeamspaceModal defined below
  // welcomeNewBtn is rendered dynamically by renderHome() — handled there
  $("themeToggle").addEventListener("click", toggleTheme);
  $("themeToggleSidebar").addEventListener("click", toggleTheme);
  $("sidebarToggle").addEventListener("click", toggleSidebar);

  // Clicking in the wrap padding area (outside the block-editor div) triggers same behavior
  $("blockEditorWrap").addEventListener("click", e => {
    const editor = document.getElementById("blockEditor");
    if (!editor || e.target === editor || editor.contains(e.target)) return;
    editor.dispatchEvent(new MouseEvent("click", { bubbles: false }));
  });

  // Workspace quick nav
  $("wsHome").addEventListener("click", e => {
    e.preventDefault();
    document.querySelectorAll(".workspace-nav-item").forEach(n => n.classList.remove("active"));
    e.currentTarget.classList.add("active");
    // Reset any sidebar filters
    document.querySelectorAll(".tree-entry").forEach(el => el.style.display = "");
    document.querySelectorAll(".tree-topic").forEach(el => el.style.display = "");
    document.querySelectorAll(".tree-cat").forEach(el => el.style.display = "");
    // Go to home screen
    $("entryView").classList.add("hidden");
    $("entryCover").classList.add("hidden"); $("entryAddCover").classList.add("hidden");
    $("kanbanArea").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    renderHome();
  });
  $("wsSearch").addEventListener("click", e => {
    e.preventDefault();
    if (window.CommandPalette) window.CommandPalette.open();
    else { $("searchInput").focus(); $("searchInput").select(); }
  });
  const _cmdTriggerBtn = document.getElementById("cmdTriggerBtn");
  if (_cmdTriggerBtn) _cmdTriggerBtn.addEventListener("click", () => {
    if (window.CommandPalette) window.CommandPalette.open();
  });
  $("wsStarred").addEventListener("click", e => {
    e.preventDefault();
    document.querySelectorAll(".workspace-nav-item").forEach(n => n.classList.remove("active"));
    e.currentTarget.classList.add("active");
    // Show only starred entries; hide categories/topics with no starred entries
    const starredIds = new Set(Object.entries(starredMap).filter(([,v]) => v).map(([id]) => id));
    document.querySelectorAll(".tree-cat").forEach(cat => {
      const hasStarred = [...cat.querySelectorAll(".tree-entry")].some(e => starredIds.has(e.dataset.id));
      cat.style.display = hasStarred ? "" : "none";
      if (hasStarred) {
        cat.querySelectorAll(".tree-entry").forEach(e => {
          e.style.display = starredIds.has(e.dataset.id) ? "" : "none";
        });
      }
    });
  });
  $("sidebarOverlay").addEventListener("click", closeSidebarMobile);

  // Mobile ··· dropdown
  $("moreActionsBtn").addEventListener("click", e => {
    e.stopPropagation();
    $("moreActionsDropdown").classList.toggle("open");
  });
  document.addEventListener("click", () => $("moreActionsDropdown").classList.remove("open"));
  // Wire duplicate buttons in dropdown to same handlers
  $("moreExportMd").addEventListener("click",  () => exportEntry("md"));
  $("moreExportPdf").addEventListener("click", () => exportEntry("pdf"));
  $("moreToc").addEventListener("click",       () => $("tocBtn").click());
  $("moreHistory").addEventListener("click",   () => $("historyBtn").click());
  $("moreStar").addEventListener("click",      () => $("starBtn").click());
  $("morePin").addEventListener("click",       () => $("pinBtn").click());
  $("moreDup").addEventListener("click",       () => $("dupBtn").click());
  $("moreMove").addEventListener("click",      () => $("moveBtn").click());
  $("moreFocus").addEventListener("click",     () => $("focusBtn").click());
  $("modalClose").addEventListener("click", closeModal);
  $("cancelBtn").addEventListener("click", closeModal);
  $("saveBtn").addEventListener("click", saveEntry);
  $("editBtn").addEventListener("click", openEditModal);
  $("deleteBtn").addEventListener("click", deleteEntry);
  $("exportMdBtn").addEventListener("click", () => exportEntry("md"));
  $("exportPdfBtn").addEventListener("click", () => exportEntry("pdf"));
  $("modalOverlay").addEventListener("click", e => { if (e.target === $("modalOverlay")) closeModal(); });

  // Search
  let searchTimer;
  $("searchInput").addEventListener("input", e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) { $("searchResults").innerHTML = ""; $("searchResults").classList.add("hidden"); return; }
    searchTimer = setTimeout(() => runSearch(q), 280);
  });
  document.addEventListener("click", e => {
    if (!$("searchResults").contains(e.target) && e.target !== $("searchInput")) {
      $("searchResults").innerHTML = "";
      $("searchResults").classList.add("hidden");
    }
  });

  // Editor tabs
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Auto-extract title from content
  $("fieldContent").addEventListener("input", autoExtractTitle);
  $("fieldContent").addEventListener("paste", () => setTimeout(autoExtractTitle, 50));

  // Topic custom input toggle

  // Kanban sidebar button
  $("newKanbanBoardBtn").addEventListener("click", () => {
    showKanbanArea();
    if (window.KanbanApp) window.KanbanApp.showBoards();
  });
}

// ---- KANBAN ----
function showKanbanArea() {
  $("entryView").classList.add("hidden");
  $("entryCover").classList.add("hidden"); $("entryAddCover").classList.add("hidden");
  $("welcome").classList.add("hidden");
  if ($("ctxBar")) $("ctxBar").classList.add("hidden");
  $("kanbanArea").classList.remove("hidden");
}

async function loadKanbanSidebar() {
  const tree = $("kanbanTree");
  if (!tree) return;
  try {
    const res = await fetch("/api/kanban/boards");
    if (!res.ok) return;
    const boards = await res.json();
    if (!boards.length) {
      tree.innerHTML = '<div class="tree-empty">No hay tableros aún.</div>';
      return;
    }
    tree.innerHTML = boards.map(b => `
      <div class="kanban-board-item" data-id="${b.id}">
        <span class="kanban-board-dot" style="background:${b.color}"></span>
        <span>${b.name}</span>
      </div>`).join('');
    tree.querySelectorAll('.kanban-board-item').forEach(el => {
      el.addEventListener('click', () => {
        tree.querySelectorAll('.kanban-board-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        showKanbanArea();
        if (window.KanbanApp) window.KanbanApp.showBoard(el.dataset.id);
      });
    });
  } catch (e) {
    // silently ignore
  }
}

// Expose for kanban.js to call after mutations
window._loadKanbanSidebar = loadKanbanSidebar;

function autoExtractTitle() {
  if ($("fieldTitle").value.trim()) return;
  const content = $("fieldContent").value;
  const firstLine = content.trimStart().split("\n")[0];
  const match = firstLine.match(/^#{1,3}\s+(.+)/);
  if (match) {
    $("fieldTitle").value = match[1].trim();
  }
}

// ---- THEME ----
function applyTheme() {
  const saved = localStorage.getItem("kb_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  const t = $("themeToggle"); if (t) t.textContent = "◐";
  const abIcon = document.querySelector('#themeToggleSidebar .ab-icon') || $("themeToggleSidebar");
  if (abIcon) abIcon.textContent = "◐";
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kb_theme", next);
  const t = $("themeToggle"); if (t) t.textContent = "◐";
  const abIcon = document.querySelector('#themeToggleSidebar .ab-icon') || $("themeToggleSidebar");
  if (abIcon) abIcon.textContent = "◐";
}

// ---- SIDEBAR ----
function isMobile() { return window.innerWidth <= 768; }

// Android Chrome: body overflow:hidden blocks touch scroll on fixed elements.
// Handle sidebar scroll manually via touch events.
(function() {
  const sidebar = $("sidebar");
  let startY = 0;
  let startScroll = 0;
  sidebar.addEventListener("touchstart", e => {
    startY = e.touches[0].clientY;
    startScroll = sidebar.scrollTop;
  }, { passive: true });
  sidebar.addEventListener("touchmove", e => {
    const dy = startY - e.touches[0].clientY;
    sidebar.scrollTop = startScroll + dy;
    e.stopPropagation();
    // Only prevent default if sidebar can actually scroll
    const canScrollUp = sidebar.scrollTop > 0;
    const canScrollDown = sidebar.scrollTop < (sidebar.scrollHeight - sidebar.clientHeight);
    if ((dy > 0 && canScrollDown) || (dy < 0 && canScrollUp)) {
      e.preventDefault();
    }
  }, { passive: false });
})();

function toggleSidebar() {
  if (isMobile()) {
    const open = $("sidebar").classList.toggle("mobile-open");
    $("sidebarOverlay").classList.toggle("active", open);
  } else {
    $("sidebar").classList.toggle("collapsed");
  }
}

function closeSidebarMobile() {
  $("sidebar").classList.remove("mobile-open");
  $("sidebarOverlay").classList.remove("active");
}

// ---- TREE ----
let _index = [];

async function loadTree() {
  const [r1, r2, r3, r4] = await Promise.all([fetch("/api/tree"), fetch("/api/courses/tree"), fetch("/api/teamspace/tree"), fetch("/api/entries")]);
  const knowledgeTree  = await r1.json();
  const coursesTree    = await r2.json();
  const teamspaceTree  = await r3.json();
  _index = await r4.json();
  _coursesTreeData = coursesTree; // cache for course detail view
  renderTree(knowledgeTree);
  renderTeamspaceTree(teamspaceTree);
  renderCourseList(); // sidebar course list (async)
  // Restore starred section from starredMap
  renderStarredSection(
    Object.fromEntries(
      Object.entries(starredMap).filter(([, v]) => v).map(([id, starred]) => [id, { starred, title: "" }])
    )
  );
  // Restore pinned section from pinnedMap (merged with localStorage)
  const localPinned = JSON.parse(localStorage.getItem("kb_pinned") || "{}");
  Object.assign(pinnedMap, localPinned);
  renderPinnedSection();
}

function renderTree(tree) {
  const nav = $("tree");
  if (Object.keys(tree).length === 0) {
    nav.innerHTML = '<div class="tree-empty">No hay entradas aún.<br>Crea la primera con el botón +</div>';
    return;
  }

  nav.innerHTML = "";
  for (const [cat, catData] of Object.entries(tree)) {
    // Support both new format {_label, _topics} and legacy flat format
    const catLabel = catData._label || cat;
    const topicsMap = catData._topics || catData;

    if (!treeState[cat]) treeState[cat] = { open: true, topics: {} };
    const catEl = document.createElement("div");
    catEl.className = "tree-category" + (treeState[cat].open ? " open" : "");
    catEl.dataset.cat = cat;

    catEl.innerHTML = `
      <div class="tree-category-header">
        <span class="arrow">▶</span>
        <span>${escapeHtml(catLabel)}</span>
      </div>
      <div class="tree-topics"></div>
    `;
    catEl.querySelector(".tree-category-header").addEventListener("click", () => {
      treeState[cat].open = !treeState[cat].open;
      catEl.classList.toggle("open");
    });

    const topicsEl = catEl.querySelector(".tree-topics");
    for (const [topic, topicData] of Object.entries(topicsMap)) {
      if (topic.startsWith("_")) continue;
      // Support both new {_label, _entries} and legacy array format
      const topicLabel = topicData._label || topic;
      const entries = topicData._entries || topicData;

      if (!treeState[cat].topics[topic]) treeState[cat].topics[topic] = { open: true };
      const topicEl = document.createElement("div");
      topicEl.className = "tree-topic" + (treeState[cat].topics[topic].open ? " open" : "");
      topicEl.innerHTML = `
        <div class="tree-topic-header">
          <span class="arrow">▶</span>
          <span>${escapeHtml(topicLabel || topic)}</span>
          <button class="tree-topic-play" title="Review mode">▶</button>
        </div>
        <div class="tree-entries"></div>
      `;
      topicEl.querySelector(".tree-topic-header").addEventListener("click", e => {
        if (e.target.classList.contains("tree-topic-play")) return;
        treeState[cat].topics[topic].open = !treeState[cat].topics[topic].open;
        topicEl.classList.toggle("open");
      });
      topicEl.querySelector(".tree-topic-play").addEventListener("click", e => {
        e.stopPropagation();
        startReview(entries);
      });

      const entriesEl = topicEl.querySelector(".tree-entries");
      entries.forEach(entry => {
        const entryEl = document.createElement("div");
        entryEl.className = "tree-entry" + (entry.id === currentEntryId ? " active" : "");
        entryEl.title = entry.title;
        entryEl.dataset.id = entry.id;
        entryEl.draggable = true;

        const status = entry.status || "pendiente";
        statusMap[entry.id] = status;
        const dot = document.createElement("span");
        dot.className = `status-dot status-${status}`;
        entryEl.appendChild(dot);
        const label = document.createElement("span");
        label.className = "tree-entry-label";
        label.innerHTML = renderTreeEntryLabel(entry.icon, entry.title, ENTRY_ICON_DEFAULTS.knowledge);
        entryEl.appendChild(label);

        entryEl.addEventListener("click", () => loadEntry(entry.id));

        // Drag-and-drop for reordering
        entryEl.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", entry.id);
          entryEl.classList.add("dragging");
        });
        entryEl.addEventListener("dragend", () => {
          entryEl.classList.remove("dragging");
          entriesEl.querySelectorAll(".tree-entry").forEach(el => el.classList.remove("drag-over"));
        });
        entryEl.addEventListener("dragover", e => {
          e.preventDefault();
          entriesEl.querySelectorAll(".tree-entry").forEach(el => el.classList.remove("drag-over"));
          entryEl.classList.add("drag-over");
        });
        entryEl.addEventListener("drop", async e => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId === entry.id) return;
          const allEntries = Array.from(entriesEl.querySelectorAll(".tree-entry"));
          const draggedEl = entriesEl.querySelector(`.tree-entry[data-id="${draggedId}"]`);
          if (!draggedEl) return;
          const targetIdx = allEntries.indexOf(entryEl);
          const draggedIdx = allEntries.indexOf(draggedEl);
          if (draggedIdx < targetIdx) {
            entriesEl.insertBefore(draggedEl, entryEl.nextSibling);
          } else {
            entriesEl.insertBefore(draggedEl, entryEl);
          }
          const newOrder = Array.from(entriesEl.querySelectorAll(".tree-entry")).map(el => el.dataset.id);
          await fetch("/api/entry/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: newOrder }),
          });
          entryEl.classList.remove("drag-over");
        });

        entriesEl.appendChild(entryEl);
      });

      topicsEl.appendChild(topicEl);
    }

    nav.appendChild(catEl);
  }
}

function getFirstEntry(topics) {
  for (const entries of Object.values(topics)) {
    if (entries.length > 0) return entries[0];
  }
  return {};
}

// renderCoursesTree — when filterSlug is given, renders modules directly (no course-name header)
function renderCoursesTree(tree, filterSlug) {
  const nav = $("coursesTree");
  if (!nav) return;
  if (!filterSlug || Object.keys(tree).length === 0) {
    nav.innerHTML = '<div class="tree-empty">No hay lecciones aún.</div>';
    return;
  }

  const courseData = tree[filterSlug];
  if (!courseData) {
    nav.innerHTML = '<div class="tree-empty">No hay lecciones aún.</div>';
    return;
  }

  if (!coursesTreeState[filterSlug]) coursesTreeState[filterSlug] = { open: true, modules: {} };
  const state = coursesTreeState[filterSlug];
  const courseSlug = filterSlug;

  // Render modules directly into nav — no course-name wrapper
  nav.innerHTML = "";
  const modulesDiv = nav; // modules go straight into nav

    for (const [moduleSlug, moduleData] of Object.entries(courseData.modules)) {
      if (!state.modules[moduleSlug]) state.modules[moduleSlug] = { open: true };
      const modState = state.modules[moduleSlug];

      const topicDiv = document.createElement("div");
      topicDiv.className = "tree-topic" + (modState.open ? " open" : "");

      const topicHeader = document.createElement("div");
      topicHeader.className = "tree-topic-header";

      const entries = moduleData.entries;
      const playBtn = document.createElement("button");
      playBtn.className = "tree-topic-play";
      playBtn.title = "Review mode";
      playBtn.textContent = "▶";
      playBtn.addEventListener("click", e => { e.stopPropagation(); startReview(entries); });

      topicHeader.innerHTML = `<span class="arrow">▶</span> <span>${escapeHtml(moduleData.label)}</span>`;
      topicHeader.appendChild(playBtn);
      topicDiv.appendChild(topicHeader);

      const entriesDiv = document.createElement("div");
      entriesDiv.className = "tree-entries";
      entriesDiv.dataset.topic = moduleSlug;
      entriesDiv.dataset.category = courseSlug;
      if (!modState.open) entriesDiv.style.display = "none";

      topicHeader.addEventListener("click", e => {
        if (e.target.classList.contains("tree-topic-play")) return;
        modState.open = !modState.open;
        topicDiv.classList.toggle("open", modState.open);
        entriesDiv.style.display = modState.open ? "" : "none";
      });

      entries.forEach(entry => {
        const entryEl = document.createElement("div");
        entryEl.className = "tree-entry";
        entryEl.dataset.id = entry.id;
        entryEl.draggable = true;
        const dot = document.createElement("span");
        dot.className = `status-dot status-${entry.status || "pendiente"}`;
        const nameSpan = document.createElement("span");
        nameSpan.className = "tree-entry-label";
        nameSpan.innerHTML = renderTreeEntryLabel(entry.icon, entry.title, ENTRY_ICON_DEFAULTS.course);
        entryEl.appendChild(dot);
        entryEl.appendChild(nameSpan);
        if (entry.id === currentEntryId) entryEl.classList.add("active");
        entryEl.addEventListener("click", () => loadEntry(entry.id));
        entryEl.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", entry.id);
          entryEl.classList.add("dragging");
        });
        entryEl.addEventListener("dragend", () => entryEl.classList.remove("dragging"));
        entryEl.addEventListener("dragover", e => { e.preventDefault(); entryEl.classList.add("drag-over"); });
        entryEl.addEventListener("dragleave", () => entryEl.classList.remove("drag-over"));
        entryEl.addEventListener("drop", async e => {
          e.preventDefault();
          entryEl.classList.remove("drag-over");
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId === entry.id) return;
          const ids = Array.from(entriesDiv.querySelectorAll(".tree-entry")).map(el => el.dataset.id);
          const from = ids.indexOf(draggedId);
          const to   = ids.indexOf(entry.id);
          if (from === -1 || to === -1) return;
          ids.splice(from, 1); ids.splice(to, 0, draggedId);
          await fetch("/api/entry/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          await loadTree();
        });
        entriesDiv.appendChild(entryEl);
      });

      topicDiv.appendChild(entriesDiv);
      modulesDiv.appendChild(topicDiv);
    }
}

// ---- TEAMSPACE TREE ----
function renderTeamspaceTree(tree) {
  const nav = $("teamspaceTree");
  const label = $("teamspaceSectionLabel");
  label.style.display = "flex";
  nav.innerHTML = "";
  if (!tree || Object.keys(tree).length === 0) {
    nav.innerHTML = '<div class="tree-empty" style="font-size:0.75rem;padding:4px 12px;color:var(--text-faint);">Sin teamspaces. Pulsa + para crear uno.</div>';
    return;
  }

  for (const [spaceSlug, spaceData] of Object.entries(tree)) {
    const spaceLabel = spaceData._label || spaceSlug;
    const entries    = spaceData._entries || [];
    const icon       = spaceData._icon || ENTRY_ICON_DEFAULTS.teamspace;
    const homeId     = spaceData._home_id || "";

    const spaceDiv = document.createElement("div");
    spaceDiv.className = "tree-cat ts-space-block";

    const spaceHeader = document.createElement("div");
    spaceHeader.className = "tree-cat-header ts-space-header";
    spaceHeader.innerHTML = `
      <button class="ts-space-toggle-btn" title="Expandir o colapsar">
        <span class="tree-arrow">▾</span>
      </button>
      <button class="ts-space-main" data-home-id="${escapeHtml(homeId)}" title="${homeId ? `Abrir ${escapeHtml(spaceLabel)}` : escapeHtml(spaceLabel)}">
        <span class="ts-space-icon">${renderIconMarkup(icon, "ts-space-icon-glyph", ENTRY_ICON_DEFAULTS.teamspace)}</span>
        <span class="tree-cat-label ts-space-label">${escapeHtml(spaceLabel)}</span>
      </button>
      <button class="ts-add-page-btn" data-space="${escapeHtml(spaceSlug)}" data-label="${escapeHtml(spaceLabel)}" title="Nueva página en ${escapeHtml(spaceLabel)}">+</button>
    `;
    let spaceOpen = true;

    const toggleBtn = spaceHeader.querySelector(".ts-space-toggle-btn");
    const mainBtn = spaceHeader.querySelector(".ts-space-main");

    toggleBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      spaceOpen = !spaceOpen;
      spaceHeader.querySelector(".tree-arrow").textContent = spaceOpen ? "▾" : "▸";
      entryList.style.display = spaceOpen ? "" : "none";
    });

    mainBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      if (homeId) loadEntry(homeId);
      else toggleBtn.click();
    });

    // "+" button → open new page modal for this space
    spaceHeader.querySelector(".ts-add-page-btn").addEventListener("click", e => {
      e.stopPropagation();
      openTsPageModal(spaceSlug, spaceLabel);
    });

    const entryList = document.createElement("div");
    entryList.className = "tree-topic";
    for (const entry of entries) {
      const item = document.createElement("div");
      item.className = "tree-entry ts-item";
      item.dataset.id = entry.id;
      item.innerHTML = renderTreeEntryLabel(entry.icon, entry.title, ENTRY_ICON_DEFAULTS.page);
      item.addEventListener("click", () => loadEntry(entry.id));
      entryList.appendChild(item);
    }
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "tree-empty ts-empty-hint";
      empty.textContent = "Sin páginas aún";
      entryList.appendChild(empty);
    }

    spaceDiv.appendChild(spaceHeader);
    spaceDiv.appendChild(entryList);
    nav.appendChild(spaceDiv);
  }
}

// ---- NEW TEAMSPACE MODAL ----
function openNewTeamspaceModal() {
  $("ntsName").value = "";
  $("ntsDesc").value = "";
  setIconButtonValue($("ntsIconBtn"), ENTRY_ICON_DEFAULTS.teamspace, ENTRY_ICON_DEFAULTS.teamspace);
  $("newTeamspaceOverlay").classList.remove("hidden");
  setTimeout(() => $("ntsName").focus(), 50);
}

$("newTeamspaceEntryBtn").addEventListener("click", openNewTeamspaceModal);
$("ntsClose").addEventListener("click", () => $("newTeamspaceOverlay").classList.add("hidden"));
$("ntsCancel").addEventListener("click", () => $("newTeamspaceOverlay").classList.add("hidden"));
$("newTeamspaceOverlay").addEventListener("click", e => { if (e.target === $("newTeamspaceOverlay")) $("newTeamspaceOverlay").classList.add("hidden"); });

$("ntsName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("ntsCreate").click(); } });

$("ntsCreate").addEventListener("click", async () => {
  const name = $("ntsName").value.trim();
  if (!name) { $("ntsName").focus(); return; }
  const icon = getIconButtonValue("ntsIconBtn");
  const desc = $("ntsDesc").value.trim();
  // Create a teamspace by creating a special index entry
  const content = desc ? `> ${desc}` : "";
  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry_type: "teamspace", teamspace: name, title: name, raw_text: content, icon, is_teamspace_home: true, already_markdown: true }),
  });
  if (res.ok) {
    $("newTeamspaceOverlay").classList.add("hidden");
    showToast(`Teamspace "${name}" creado`);
    await loadTree();
  } else {
    showToast("Error al crear teamspace", "error");
  }
});

// ---- NEW PAGE IN TEAMSPACE ----
let _tsPageCurrentSpace = "", _tsPageCurrentLabel = "";

function openTsPageModal(spaceSlug, spaceLabel) {
  _tsPageCurrentSpace = spaceSlug;
  _tsPageCurrentLabel = spaceLabel;
  $("tsPageSpaceName").textContent = spaceLabel;
  $("tsPageTitle").value = "";
  setIconButtonValue($("tsPageIconBtn"), ENTRY_ICON_DEFAULTS.page, ENTRY_ICON_DEFAULTS.page);
  $("tsPageOverlay").classList.remove("hidden");
  setTimeout(() => $("tsPageTitle").focus(), 50);
}

$("tsPageClose").addEventListener("click", () => $("tsPageOverlay").classList.add("hidden"));
$("tsPageCancel").addEventListener("click", () => $("tsPageOverlay").classList.add("hidden"));
$("tsPageOverlay").addEventListener("click", e => { if (e.target === $("tsPageOverlay")) $("tsPageOverlay").classList.add("hidden"); });
$("tsPageTitle").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("tsPageCreate").click(); } });

$("tsPageCreate").addEventListener("click", async () => {
  const title = $("tsPageTitle").value.trim();
  if (!title) { $("tsPageTitle").focus(); return; }
  const icon = getIconButtonValue("tsPageIconBtn");
  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry_type: "teamspace", teamspace: _tsPageCurrentSpace, title, raw_text: "", icon, already_markdown: true }),
  });
  if (res.ok) {
    const data = await res.json();
    $("tsPageOverlay").classList.add("hidden");
    await loadTree();
    if (data.id) loadEntry(data.id);
  } else {
    showToast("Error al crear página", "error");
  }
});

// ---- RECENTLY VISITED ----
const KB_RECENT_KEY = "kb_recent_v2";
const KB_RECENT_MAX = 12;

function _trackRecent(id, title, category, topic, cover, icon) {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(KB_RECENT_KEY) || "[]"); } catch {}
  const prev = recent.find(r => r.id === id);
  recent = recent.filter(r => r.id !== id);
  recent.unshift({ id, title, category, topic, cover: cover || prev?.cover || "", icon: icon || prev?.icon || "", ts: Date.now() });
  if (recent.length > KB_RECENT_MAX) recent = recent.slice(0, KB_RECENT_MAX);
  localStorage.setItem(KB_RECENT_KEY, JSON.stringify(recent));
}

function _getRecent() {
  try { return JSON.parse(localStorage.getItem(KB_RECENT_KEY) || "[]"); } catch { return []; }
}

function renderHome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const recent  = _getRecent();
  const pinned  = Object.entries(pinnedMap).filter(([,v]) => v).map(([id]) => _index.find(e => e.id === id)).filter(Boolean);
  const starred = Object.entries(starredMap).filter(([,v]) => v).map(([id]) => _index.find(e => e.id === id)).filter(Boolean);

  // Stats from _index
  const totalEntries = _index.length;
  const categories   = new Set(_index.map(e => e.category).filter(Boolean)).size;
  const pinnedCount  = pinned.length;
  const starredCount = starred.length;

  function cardHtml(r) {
    const coverStyle = r.cover
      ? (r.cover.startsWith('url(')
          ? `background-image:${r.cover};background-size:cover;background-position:center`
          : `background:${r.cover}`)
      : '';
    return `<div class="home-card" data-id="${r.id}">
      <div class="home-card-cover" style="${coverStyle}"></div>
      <div class="home-card-body">
        <div class="home-card-icon">${renderIconMarkup(r.icon || ENTRY_ICON_DEFAULTS.knowledge, "home-card-icon-glyph")}</div>
        <div class="home-card-title">${escapeHtml(r.title || "Sin título")}</div>
        <div class="home-card-meta">${escapeHtml(r.category || "")}${r.topic ? " / " + escapeHtml(r.topic) : ""}</div>
      </div>
    </div>`;
  }

  const welcome = $("welcome");
  welcome.innerHTML = `
    <div class="home-wrap">
      <h1 class="home-greeting">${greeting}</h1>

      <div class="home-stats-row">
        <div class="home-stat"><span class="home-stat-num">${totalEntries}</span><span class="home-stat-label">entradas</span></div>
        <div class="home-stat"><span class="home-stat-num">${categories}</span><span class="home-stat-label">categorías</span></div>
        <div class="home-stat"><span class="home-stat-num">${starredCount}</span><span class="home-stat-label">destacadas</span></div>
        <div class="home-stat"><span class="home-stat-num">${pinnedCount}</span><span class="home-stat-label">fijadas</span></div>
      </div>

      ${pinned.length ? `
      <section class="home-section">
        <div class="home-section-label">⊞ Fijadas</div>
        <div class="home-recent-grid">${pinned.slice(0,6).map(cardHtml).join("")}</div>
      </section>` : ''}

      ${starred.length ? `
      <section class="home-section">
        <div class="home-section-label">☆ Destacadas</div>
        <div class="home-recent-grid">${starred.slice(0,6).map(cardHtml).join("")}</div>
      </section>` : ''}

      ${recent.length ? `
      <section class="home-section">
        <div class="home-section-label">⟳ Visitados recientemente</div>
        <div class="home-recent-grid">${recent.map(cardHtml).join("")}</div>
      </section>` : `
      <div class="home-empty">
        <p>Selecciona una entrada del panel izquierdo o crea una nueva.</p>
        <button class="btn-primary large" id="welcomeNewBtn2">+ nueva entrada</button>
      </div>`}
    </div>
  `;

  welcome.querySelectorAll(".home-card").forEach(card => {
    card.addEventListener("click", () => loadEntry(card.dataset.id));
  });
  const newBtn2 = $("welcomeNewBtn2");
  if (newBtn2) newBtn2.addEventListener("click", openNewModal);
}

// ---- ENTRY VIEW ----
async function loadEntry(id, opts = {}) {
  // CRITICAL: cancel any pending auto-save from the previous entry before switching
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
  currentEntryId = id;
  if (isMobile()) closeSidebarMobile();
  document.querySelectorAll(".tree-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
  document.querySelectorAll(".tree-starred-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
  document.querySelectorAll(".tree-pinned-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  const entryUrl = opts.force ? `/api/entry/${id}?_=${Date.now()}` : `/api/entry/${id}`;
  const res = await fetch(entryUrl, opts.force ? { cache: "no-store" } : undefined);
  if (!res.ok) { showToast("Error al cargar la entrada", "error"); return; }
  const data = await res.json();

  $("welcome").classList.add("hidden");
  $("kanbanArea").classList.add("hidden");
  $("entryView").classList.remove("hidden");
  if ($("ctxBar")) $("ctxBar").classList.remove("hidden");

  // Close move panel and history panel on new entry load
  $("movePanel").classList.add("hidden");
  $("historyPanel").classList.add("hidden");
  $("historyBtn").classList.remove("active");

  const m = data.meta;
  currentEntryMeta = m;
  const date = m.created_at ? m.created_at.slice(0, 10) : "—";

  // Track in recently visited
  _trackRecent(id, m.title, m.category_label || m.category, m.topic_label || m.topic, m.cover || "", m.icon || "");

  // Render inline editor with entry markdown
  const isNote = (m.category || "").toLowerCase() === "quick notes" || (m.category || "").toLowerCase() === "quick-notes";
  $("entryBody").classList.toggle("note-entry", isNote);
  if (_inlineEditor.setPersistenceKey) _inlineEditor.setPersistenceKey(id);
  _inlineEditor.load(data.markdown);
  $("contentArea").scrollTo(0, 0);

  // Set inline title
  const titleEl = $("inlineTitle");
  if (titleEl) {
    titleEl.textContent = m.title || "";
    titleEl.classList.toggle("is-empty", !m.title);
  }

  // Set page icon button (Notion-style large icon before title)
  _setPageIconBtn(m.icon);

  // Set status button from meta
  const entryStatus = m.status || "pendiente";
  statusMap[id] = entryStatus;
  updateStatusBtn($("statusBtn"), entryStatus);

  // Word count + reading time
  const wordCount = getWordCount($("entryBody"));
  const readMin = Math.max(1, Math.round(wordCount / 200));

  const _isTeamspace = m.type === "teamspace" || !!m.teamspace;
  const _isCourse    = m.type === "course"    || !!m.course;
  const catLabel   = _isCourse    ? (m.course_label    || m.course)    :
                    _isTeamspace ? "Teamspace"                         :
                    (m.category_label || m.category);
  const topicLabel = _isCourse    ? (m.module_label    || m.module)    :
                    _isTeamspace ? (m.teamspace_label || m.teamspace) :
                    (m.topic_label || m.topic);
  const entryIconHtml = m.icon
    ? renderIconMarkup(m.icon, "meta-entry-icon-glyph", "")
    : `<span class="meta-seg-icon">󰣇</span>`;
  $("entryMeta").innerHTML = `
    <span class="meta-seg meta-seg-cat">
      ${entryIconHtml}
      ${escapeHtml(catLabel || "")}
    </span>
    <span class="meta-seg meta-seg-topic">
      <span class="meta-seg-icon"> </span>
      ${escapeHtml(topicLabel || "")}
    </span>
    <span class="meta-seg meta-seg-date">
      <span class="meta-seg-icon"> </span>
      ${date}
    </span>
    <span class="meta-seg meta-seg-words">
      <iconify-icon icon="lucide:keyboard" class="meta-seg-icon" style="font-size:0.82rem;width:0.82rem;height:0.82rem;margin-right:5px"></iconify-icon>${wordCount} words
    </span>
    <span class="meta-seg meta-seg-readtime">
      <span class="meta-seg-icon">◷</span>
      ~${readMin} min
    </span>
  `;

  // Update star button
  const starred = m.starred || false;
  starredMap[id] = starred;
  updateStarBtn(starred);

  // Update pin button
  const pinned = m.pinned || false;
  pinnedMap[id] = pinned;
  localStorage.setItem("kb_pinned", JSON.stringify(pinnedMap));
  updatePinBtn(pinned);

  // Breadcrumb
  buildBreadcrumb(m);

  // Build TOC (from markdown headings, not DOM)
  buildTOC();

  // Backlinks (async, non-blocking)
  loadBacklinks(id);

  // Properties panel
  if (window.Properties && $("propContainer")) {
    Properties.render(id, m.properties || [], $("propContainer"), false);
  }
  loadEntryChildren(id);

  // Tags bar — prepend to entry body
  const existingTagBar = $("propContainer").querySelector(".entry-tags-bar");
  if (existingTagBar) existingTagBar.remove();
  const tags = m.tags || [];
  if (tags.length) {
    const bar = document.createElement("div");
    bar.className = "entry-tags-bar";
    bar.innerHTML = tags.map(t =>
      `<span class="entry-tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`
    ).join("");
    bar.querySelectorAll(".entry-tag").forEach(chip => {
      chip.addEventListener("click", () => {
        $("searchInput").value = chip.dataset.tag;
        $("searchInput").dispatchEvent(new Event("input"));
      });
    });
    $("propContainer").after(bar);
  }

  // Cover banner
  applyCover(m.cover || "");

  // Relations panel
  loadRelations(m.uid || id);
}

// ---- PAGE ICON (Notion-style, before inline title) ----
function _setPageIconBtn(icon) {
  const btn = $("entryPageIconBtn");
  if (!btn) return;
  const fallback = ENTRY_ICON_DEFAULTS[currentEntryMeta?.type] || ENTRY_ICON_DEFAULTS.knowledge;
  const effective = icon || fallback;
  btn.innerHTML = renderIconMarkup(effective, "page-icon-glyph");

  // Bind click once (remove old listener by replacing node clone trick via flag)
  if (!btn._iconPickerBound) {
    btn._iconPickerBound = true;
    btn.addEventListener("click", () => {
      openIconPicker(btn, currentEntryMeta?.icon || "", async (chosenIcon) => {
        if (!currentEntryId) return;
        await fetch(`/api/entry/${currentEntryId}/icon`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: chosenIcon }),
        });
        if (currentEntryMeta) currentEntryMeta.icon = chosenIcon;
        _setPageIconBtn(chosenIcon);
        // Update sidebar label
        document.querySelectorAll(`.tree-entry[data-id="${currentEntryId}"] .tree-entry-icon`).forEach(el => {
          el.innerHTML = renderIconMarkup(chosenIcon, "tree-entry-icon-glyph");
        });
        // Update meta bar
        const glyph = $("entryMeta")?.querySelector(".meta-entry-icon-glyph, .meta-seg-icon");
        if (glyph) glyph.replaceWith(...(new DOMParser().parseFromString(renderIconMarkup(chosenIcon, "meta-entry-icon-glyph"), "text/html").body.childNodes));
        // Update recent icon
        try {
          let rec = JSON.parse(localStorage.getItem(KB_RECENT_KEY) || "[]");
          rec = rec.map(r => r.id === currentEntryId ? { ...r, icon: chosenIcon } : r);
          localStorage.setItem(KB_RECENT_KEY, JSON.stringify(rec));
        } catch {}
        renderHome();
      });
    });
  }
}


// ---- ENTRY COVER ----
const COVER_PRESETS = [
  "linear-gradient(135deg,#1a1a2e,#16213e)",
  "linear-gradient(135deg,#0f3460,#533483)",
  "linear-gradient(135deg,#1b4332,#2d6a4f)",
  "linear-gradient(135deg,#370617,#6a040f)",
  "linear-gradient(135deg,#03071e,#023e8a)",
  "linear-gradient(135deg,#240046,#7b2d8b)",
  "linear-gradient(135deg,#7f5a83,#0d324d)",
  "linear-gradient(135deg,#232526,#414345)",
  "linear-gradient(135deg,#134e5e,#71b280)",
  "linear-gradient(135deg,#1793d1,#0f3460)",
  "linear-gradient(135deg,#eb5a46,#c0392b)",
  "linear-gradient(135deg,#f2d600,#ff9f1a)",
];

const COVER_IMAGE_PRESETS = [
  { label: "Aurora",     url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80" },
  { label: "Montañas",   url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80" },
  { label: "Costa",      url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80" },
  { label: "Bosque",     url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80" },
  { label: "Ciudad",     url: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80" },
  { label: "Escritorio", url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80" },
  { label: "Galaxia",    url: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1200&q=80" },
  { label: "Desierto",   url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1200&q=80" },
];

function applyCover(coverValue) {
  const coverEl  = $("entryCover");
  const addCoverEl = $("entryAddCover");
  if (!coverEl) return;
  if (coverValue) {
    if (coverValue.startsWith("url(")) {
      coverEl.setAttribute("style",
        `background-image:${coverValue};background-size:cover;background-position:center`);
    } else {
      coverEl.setAttribute("style", `background:${coverValue}`);
    }
    coverEl.classList.remove("hidden");
    if (addCoverEl) addCoverEl.classList.add("hidden");
  } else {
    coverEl.removeAttribute("style");
    coverEl.classList.add("hidden");
    if (addCoverEl) addCoverEl.classList.remove("hidden");
  }
}

function openCoverPicker() {
  document.querySelectorAll(".cover-picker-overlay").forEach(e => e.remove());
  const overlay = document.createElement("div");
  overlay.className = "cover-picker-overlay";
  overlay.innerHTML = `
    <div class="cover-picker">
      <div class="cover-picker-title">Elige una portada</div>
      <div class="cover-picker-tabs">
        <button class="cover-tab active" data-tab="Gradients">Degradados</button>
        <button class="cover-tab" data-tab="Photos">Imágenes</button>
        <button class="cover-tab" data-tab="Image">URL</button>
        <button class="cover-tab" data-tab="Upload">Subir</button>
      </div>
      <div class="cover-tab-panel" id="coverTabGradients">
        <div class="cover-picker-grid" id="coverPickerGrid"></div>
      </div>
      <div class="cover-tab-panel hidden" id="coverTabPhotos">
        <div class="cover-picker-grid cover-photo-grid" id="coverPhotoGrid"></div>
      </div>
      <div class="cover-tab-panel hidden" id="coverTabImage">
        <div class="cover-url-wrap">
          <input type="url" id="coverUrlInput" class="cover-url-input" placeholder="https://ejemplo.com/imagen.jpg" />
          <div class="cover-url-preview" id="coverUrlPreview"></div>
          <button class="btn-primary" id="coverUrlApply">Aplicar</button>
        </div>
      </div>
      <div class="cover-tab-panel hidden" id="coverTabUpload">
        <div class="cover-url-wrap">
          <label class="cover-upload-label">
            <input type="file" id="coverFileInput" accept="image/*" style="display:none" />
            <span class="cover-upload-zone" id="coverUploadZone">📁 Haz clic o arrastra una imagen aquí</span>
          </label>
          <div class="cover-url-preview" id="coverUploadPreview"></div>
          <button class="btn-primary" id="coverUploadApply" disabled>Aplicar imagen</button>
        </div>
      </div>
      <div class="cover-picker-actions">
        <button class="btn-ghost" id="coverPickerCancel">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll(".cover-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      overlay.querySelectorAll(".cover-tab").forEach(t => t.classList.remove("active"));
      overlay.querySelectorAll(".cover-tab-panel").forEach(p => p.classList.add("hidden"));
      tab.classList.add("active");
      overlay.querySelector(`#coverTab${tab.dataset.tab}`).classList.remove("hidden");
    });
  });

  // Gradient swatches
  const grid = overlay.querySelector("#coverPickerGrid");
  COVER_PRESETS.forEach(preset => {
    const swatch = document.createElement("div");
    swatch.className = "cover-preset-swatch";
    swatch.style.background = preset;
    swatch.addEventListener("click", async () => {
      await saveCover(preset);
      overlay.remove();
    });
    grid.appendChild(swatch);
  });

  // Photo presets
  const photoGrid = overlay.querySelector("#coverPhotoGrid");
  COVER_IMAGE_PRESETS.forEach(photo => {
    const swatch = document.createElement("div");
    swatch.className = "cover-preset-swatch cover-photo-swatch";
    swatch.style.cssText = `background-image:url(${photo.url});background-size:cover;background-position:center`;
    swatch.title = photo.label;
    const lbl = document.createElement("span");
    lbl.className = "cover-photo-label";
    lbl.textContent = photo.label;
    swatch.appendChild(lbl);
    swatch.addEventListener("click", async () => {
      await saveCover(`url(${photo.url})`);
      overlay.remove();
    });
    photoGrid.appendChild(swatch);
  });

  // URL image tab
  const urlInput = overlay.querySelector("#coverUrlInput");
  const urlPreview = overlay.querySelector("#coverUrlPreview");
  urlInput.addEventListener("input", () => {
    const val = urlInput.value.trim();
    if (val) {
      urlPreview.style.cssText = `background-image:url(${val});background-size:cover;background-position:center;display:block`;
    } else { urlPreview.style.display = "none"; }
  });
  overlay.querySelector("#coverUrlApply").addEventListener("click", async () => {
    const val = urlInput.value.trim();
    if (!val) return;
    await saveCover(`url(${val})`);
    overlay.remove();
  });

  // File upload tab
  let _uploadDataUrl = null;
  const fileInput = overlay.querySelector("#coverFileInput");
  const uploadPreview = overlay.querySelector("#coverUploadPreview");
  const uploadApply = overlay.querySelector("#coverUploadApply");
  const uploadZone = overlay.querySelector("#coverUploadZone");

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      _uploadDataUrl = e.target.result;
      uploadPreview.style.cssText = `background-image:url(${_uploadDataUrl});background-size:cover;background-position:center;display:block`;
      uploadApply.disabled = false;
      uploadZone.textContent = `✓ ${file.name}`;
    };
    reader.readAsDataURL(file);
  }
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.style.borderColor = "var(--accent)"; });
  uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
  uploadZone.addEventListener("drop", e => { e.preventDefault(); uploadZone.style.borderColor = ""; handleFile(e.dataTransfer.files[0]); });
  uploadZone.addEventListener("click", () => fileInput.click());

  uploadApply.addEventListener("click", async () => {
    if (!_uploadDataUrl) return;
    uploadApply.disabled = true;
    uploadApply.textContent = "Subiendo…";
    const res = await fetch("/api/upload/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: _uploadDataUrl }),
    });
    if (!res.ok) { showToast("Error al subir imagen", "error"); uploadApply.disabled = false; uploadApply.textContent = "Aplicar imagen"; return; }
    const { url } = await res.json();
    await saveCover(`url(${url})`);
    overlay.remove();
  });

  overlay.querySelector("#coverPickerCancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); }
  });
}

async function saveCover(coverValue) {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}/cover`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cover: coverValue }),
  });
  if (!res.ok) return showToast("Error guardando portada");
  applyCover(coverValue);
  if (currentEntryMeta) currentEntryMeta.cover = coverValue;
  // Update recent entry cover
  _updateRecentCover(currentEntryId, coverValue);
  renderHome();
}

function _updateRecentCover(id, cover) {
  try {
    let recent = JSON.parse(localStorage.getItem(KB_RECENT_KEY) || "[]");
    recent = recent.map(r => r.id === id ? { ...r, cover } : r);
    localStorage.setItem(KB_RECENT_KEY, JSON.stringify(recent));
  } catch {}
}

// Init cover buttons (called once)
(function initCoverButtons() {
  document.addEventListener("DOMContentLoaded", () => {
    const addBtn    = $("addCoverBtn");
    const changeBtn = $("coverChangeBtn");
    const removeBtn = $("coverRemoveBtn");
    if (addBtn)    addBtn.addEventListener("click", openCoverPicker);
    if (changeBtn) changeBtn.addEventListener("click", openCoverPicker);
    if (removeBtn) removeBtn.addEventListener("click", () => saveCover(""));
  });
})();

// ---- INLINE AUTO-SAVE ----
function _scheduleAutoSave(md) {
  if (_restoreInProgress) return;
  clearTimeout(_autoSaveTimer);
  _setAutosaveStatus("saving");
  const savedId = currentEntryId; // capture at schedule time
  _autoSaveTimer = setTimeout(() => {
    // Guard: only save if we're still on the same entry
    if (!currentEntryId || currentEntryId !== savedId) return;
    _patchContent({ raw_text: md, already_markdown: true });
  }, 1200);
}

async function _patchContent(payload) {
  if (!currentEntryId) return;
  try {
    const res = await fetch(`/api/entry/${currentEntryId}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      _setAutosaveStatus("saved");
    } else {
      _setAutosaveStatus("error");
    }
  } catch {
    _setAutosaveStatus("error");
  }
}

function _setAutosaveStatus(state) {
  const el = $("autosaveIndicator");
  if (!el) return;
  el.className = "autosave-indicator autosave-" + state;
  if (state === "saving") el.textContent = "● guardando…";
  else if (state === "saved") { el.textContent = "✓ guardado"; setTimeout(() => { if (el.textContent === "✓ guardado") el.textContent = ""; }, 2000); }
  else if (state === "error") el.textContent = "✗ error al guardar";
}

// ---- MODAL ----
function openNewModal() {
  $("modalTitle").textContent = "Nueva entrada";
  $("fieldCategory").value = "";
  $("fieldTopic").value = "";
  $("fieldTitle").value = "";
  $("fieldContent").value = "";
  $("fieldTeamspace").value = "";
  $("fieldCourse").value = "";
  $("fieldModule").value = "";
  BlockEditor.loadMarkdown("");
  $("previewPane").innerHTML = "";
  switchTab("write");
  $("saveBtn").dataset.mode = "new";
  $("saveBtn").dataset.id = "";
  $("saveBtn").textContent = "Guardar entrada";
  // Mark modal as new-mode so CSS hides the type tabs
  $("modal").classList.add("modal--new-mode");
  $("modalOverlay").classList.remove("hidden");
  // Reset template chips
  document.querySelectorAll(".template-chip").forEach(c => c.classList.remove("active"));
  // Force knowledge mode
  if (window._setModalMode) window._setModalMode("knowledge");
  document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "knowledge"));
  $("knowledgeFields").classList.remove("hidden");
  $("courseFields").classList.add("hidden");
  $("teamspaceFields").classList.add("hidden");
  $("templatePickerGroup").classList.remove("hidden");
  const iconBtn = $("entryIconBtn");
  if (iconBtn) {
    iconBtn.dataset.userPicked = "false";
    setIconButtonValue(iconBtn, ENTRY_ICON_DEFAULTS.knowledge, ENTRY_ICON_DEFAULTS.knowledge);
  }
  setTimeout(() => $("fieldCategory").focus(), 60);
}

async function openEditModal() {
  if (!currentEntryId) return;
  const m = currentEntryMeta;
  if (!m) return;

  // Edit modal is metadata-only (title, category/topic) — content is inline
  $("modalTitle").textContent = "Editar información";
  $("fieldTitle").value = m.title;
  const iconBtn = $("entryIconBtn");
  if (iconBtn) {
    iconBtn.dataset.userPicked = "true";
    setIconButtonValue(iconBtn, m.icon || getDefaultIconForMode(m.type === "teamspace" ? "page" : (m.type || "knowledge")), getDefaultIconForMode(m.type === "teamspace" ? "page" : (m.type || "knowledge")));
  }
  $("saveBtn").dataset.mode = "edit";
  $("saveBtn").dataset.id = currentEntryId;
  $("saveBtn").textContent = "Actualizar";
  $("modalOverlay").classList.remove("hidden");

  // Hide content section — editing is inline
  const contentGroup = $("blockEditorWrap")?.closest(".form-group");
  if (contentGroup) contentGroup.style.display = "none";
  const editorTabs = document.querySelector(".editor-tabs");
  if (editorTabs) editorTabs.style.display = "none";
  const previewPane = $("previewPane");
  if (previewPane) previewPane.classList.add("hidden");
  $("templatePickerGroup").classList.add("hidden");

  // Hide type toggle — can't change type on existing entry
  document.querySelector(".entry-type-toggle")?.style && (document.querySelector(".entry-type-toggle").style.display = "none");

  if (m.type === "course") {
    if (window._setModalMode) window._setModalMode("course");
    document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "course"));
    $("knowledgeFields").classList.add("hidden");
    $("courseFields").classList.remove("hidden");
    $("fieldCourse").value = m.course_label || m.course || "";
    $("fieldModule").value = m.module_label || m.module || "";
    updateModuleSuggestions();
  } else if (m.type === "teamspace") {
    if (window._setModalMode) window._setModalMode("teamspace");
    document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "teamspace"));
    $("knowledgeFields").classList.add("hidden");
    $("courseFields").classList.add("hidden");
    $("teamspaceFields").classList.remove("hidden");
    $("fieldTeamspace").value = m.teamspace_label || m.teamspace || "";
  } else {
    if (window._setModalMode) window._setModalMode("knowledge");
    document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "knowledge"));
    $("knowledgeFields").classList.remove("hidden");
    $("courseFields").classList.add("hidden");
    $("fieldCategory").value = m.category_label || m.category;
    $("fieldTopic").value = m.topic_label || m.topic || "";
  }
}

function closeModal() {
  $("modalOverlay").classList.add("hidden");
  $("modal").classList.remove("modal--new-mode");
  // Restore content section (hidden during metadata-only edit)
  const contentGroup = $("blockEditorWrap")?.closest(".form-group");
  if (contentGroup) contentGroup.style.display = "";
  const editorTabs = document.querySelector(".editor-tabs");
  if (editorTabs) editorTabs.style.display = "";
  const typeToggle = document.querySelector(".entry-type-toggle");
  if (typeToggle) typeToggle.style.display = "";
}

function getTopicValue() {
  const sel = $("fieldTopic").value;
  return sel;
}

async function saveEntry() {
  const mode = $("saveBtn").dataset.mode;
  const title = $("fieldTitle").value.trim();
  const content = BlockEditor.getMarkdown().trim();
  const currentModalMode = window._getModalMode ? window._getModalMode() : "knowledge";
  const icon = getIconButtonValue("entryIconBtn");

  if (currentModalMode === "course") {
    const course  = $("fieldCourse").value.trim();
    const module  = $("fieldModule").value.trim();
    if (!course || !module || !title || !content) { showToast("Completa todos los campos", "error"); return; }
    const editingId = mode === "edit" ? $("saveBtn").dataset.id : null;
    const method = editingId ? "PUT" : "POST";
    const url    = editingId ? `/api/entry/${editingId}` : "/api/courses/entry";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, module, title, raw_text: content, icon, already_markdown: true }),
    });
    if (res.ok) {
      const d = await res.json();
      closeModal();
      await loadTree();
      loadEntry(editingId || d.id);
      showToast(editingId ? "Actualizado" : "Entrada de curso guardada");
    } else {
      showToast("Error al guardar", "error");
    }
    return;
  }

  const category = $("fieldCategory").value.trim();
  const topic = getTopicValue();
  const raw_text = content;

  if (mode === "edit") {
    // Metadata-only update — content is auto-saved inline
    const id = $("saveBtn").dataset.id;
    if (currentModalMode === "teamspace") {
      const teamspace = $("fieldTeamspace").value.trim() || "General";
      if (!title) { showToast("Ingresa un título", "error"); return; }
      const res = await fetch(`/api/entry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, teamspace, icon }),
      });
      if (res.ok) {
        closeModal();
        showToast("Información actualizada");
        await loadTree();
        if (currentEntryMeta) {
          currentEntryMeta.title = title;
          currentEntryMeta.teamspace_label = teamspace;
          currentEntryMeta.icon = icon;
        }
        const titleEl = $("inlineTitle");
        if (titleEl) titleEl.textContent = title;
      } else {
        showToast("Error al actualizar", "error");
      }
      return;
    }
    if (!title || !category || !topic) { showToast("Completa los campos", "error"); return; }
    const res = await fetch(`/api/entry/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, topic, icon }),
    });
    if (res.ok) {
      closeModal();
      showToast("Información actualizada");
      await loadTree();
      // Update inline title if changed
      const titleEl = $("inlineTitle");
      if (titleEl) titleEl.textContent = title;
      if (currentEntryMeta) {
        currentEntryMeta.title = title;
        currentEntryMeta.category_label = category;
        currentEntryMeta.topic_label = topic;
        currentEntryMeta.icon = icon;
      }
    } else {
      showToast("Error al actualizar", "error");
    }
    return;
  }

  // Teamspace new entry
  if (currentModalMode === "teamspace") {
    const teamspace = $("fieldTeamspace").value.trim() || "General";
    if (!title) { showToast("Ingresa un título", "error"); return; }
    const res = await fetch("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_type: "teamspace", teamspace, title, raw_text: content, icon, already_markdown: true }),
    });
    if (res.ok) {
      const d = await res.json();
      closeModal();
      await loadTree();
      loadEntry(d.id);
      showToast("Entrada de teamspace guardada");
    } else {
      showToast("Error al guardar", "error");
    }
    return;
  }

  if (!category || !topic || !title || !raw_text) {
    showToast("Completa todos los campos", "error");
    return;
  }

  {
    const res = await fetch("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, topic, title, raw_text, icon, already_markdown: true }),
    });
    if (res.ok) {
      const data = await res.json();
      closeModal();
      showToast("Entrada guardada");
      await loadTree();
      Promise.all([loadCategorySuggestions(), loadTopicSuggestions()]).then(initSmartSelects);
      loadEntry(data.id);
    } else {
      showToast("Error al guardar", "error");
    }
  }
}

async function deleteEntry() {
  if (!currentEntryId) return;
  const isNote = currentEntryMeta && (currentEntryMeta.category || "").toLowerCase().replace(" ", "-") === "quick-notes";
  const label = isNote ? "nota" : "entrada";
  const ok = await showConfirm(`rm -f ${label}`, `¿Eliminar esta ${label}? Esta acción no se puede deshacer.`);
  if (!ok) return;
  const res = await fetch(`/api/entry/${currentEntryId}`, { method: "DELETE" });
  if (res.ok) {
    currentEntryId = null;
    $("entryView").classList.add("hidden");
    $("entryCover").classList.add("hidden"); $("entryAddCover").classList.add("hidden");
    $("kanbanArea").classList.add("hidden");
    if ($("ctxBar")) $("ctxBar").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    renderHome();
    showToast("Entrada eliminada");
    await loadTree();
  }
}

function showConfirm(title, msg) {
  return new Promise(resolve => {
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = msg;
    $("confirmOverlay").classList.remove("hidden");
    const cleanup = (result) => {
      $("confirmOverlay").classList.add("hidden");
      $("confirmOk").removeEventListener("click", onOk);
      $("confirmCancel").removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    $("confirmOk").addEventListener("click", onOk);
    $("confirmCancel").addEventListener("click", onCancel);
  });
}

// ---- EXPORT ----
function exportEntry(format) {
  if (!currentEntryId) return;
  window.open(`/api/export/${currentEntryId}/${format}`, "_blank");
}

// ---- SEARCH ----
async function runSearch(q) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const results = await res.json();
  const container = $("searchResults");
  container.classList.remove("hidden");

  if (results.length === 0) {
    container.innerHTML = '<div class="search-result-item"><span class="sr-snippet">Sin resultados para "' + escapeHtml(q) + '"</span></div>';
    return;
  }

  container.innerHTML = results.map(r => `
    <div class="search-result-item" data-id="${r.id}">
      <div class="sr-title">${escapeHtml(r.title)}${r.tag_match ? ' <span class="sr-tag-match">tag</span>' : ""}</div>
      <div class="sr-path">${escapeHtml(r.category_label)} › ${escapeHtml(r.topic_label)}</div>
      ${r.tags && r.tags.length ? `<div class="sr-tags">${r.tags.map(t => `<span class="sr-tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div class="sr-snippet">${escapeHtml(r.snippet)}</div>
    </div>
  `).join("");

  container.querySelectorAll(".search-result-item").forEach(el => {
    el.addEventListener("click", () => {
      loadEntry(el.dataset.id);
      $("searchInput").value = "";
      container.innerHTML = "";
      container.classList.add("hidden");
    });
  });
}

// ---- EDITOR TABS ----
async function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  const editorWrap = $("blockEditorWrap");
  const preview = $("previewPane");

  if (tab === "preview") {
    const raw = BlockEditor.getMarkdown().trim();
    if (raw) {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw, already_markdown: true }),
      });
      const data = await res.json();
      preview.innerHTML = '<div class="entry-body">' + data.html + "</div>";
    } else {
      preview.innerHTML = '<span style="color:var(--text-faint)">Sin contenido aún.</span>';
    }
    if (editorWrap) editorWrap.classList.add("hidden");
    preview.classList.remove("hidden");
  } else {
    if (editorWrap) editorWrap.classList.remove("hidden");
    preview.classList.add("hidden");
    BlockEditor.focusFirst();
  }
}

// ---- SMART CATEGORY / TOPIC SELECT ----
let _allCategories = [];   // [{ key, label }]
let _allTopics = [];       // flat list of topic labels
let _treeCache = null;

async function loadCategorySuggestions() {
  try {
    // Load from tree so we get ALL categories, not just those in the local index
    const res = await fetch("/api/tree");
    if (!res.ok) return;
    const tree = await res.json();
    _allCategories = Object.entries(tree)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => ({ key: k, label: v._label || k }));
  } catch {}
}

async function loadTopicSuggestions() {
  try {
    if (!_treeCache) {
      const res = await fetch("/api/tree");
      if (!res.ok) return;
      _treeCache = await res.json();
    }
    const topics = new Set();
    for (const catData of Object.values(_treeCache)) {
      // Only iterate _topics — never treat category keys as topics
      const topicsMap = catData._topics;
      if (!topicsMap) continue;
      for (const [key, topicData] of Object.entries(topicsMap)) {
        if (key.startsWith("_")) continue;
        topics.add(topicData._label || key);
      }
    }
    _allTopics = [...topics].sort();
  } catch {}
}

function _buildSmartSelect(inputEl, dropdownEl, getItems, onSelect) {
  function showDropdown(filter) {
    const items = getItems(filter);
    if (!items.length) { dropdownEl.classList.add("hidden"); return; }
    dropdownEl.innerHTML = items.map((item, i) =>
      `<div class="ss-item" data-value="${escapeHtml(item)}">${escapeHtml(item)}</div>`
    ).join("");
    dropdownEl.querySelectorAll(".ss-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        onSelect(el.dataset.value);
        dropdownEl.classList.add("hidden");
      });
    });
    dropdownEl.classList.remove("hidden");
  }

  inputEl.addEventListener("click", () => showDropdown(inputEl.value));
  inputEl.addEventListener("input", () => showDropdown(inputEl.value));
  inputEl.addEventListener("blur", () => setTimeout(() => dropdownEl.classList.add("hidden"), 150));
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Escape") dropdownEl.classList.add("hidden");
    if (e.key === "ArrowDown") {
      const first = dropdownEl.querySelector(".ss-item");
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  dropdownEl.addEventListener("keydown", e => {
    const items = [...dropdownEl.querySelectorAll(".ss-item")];
    const idx = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && idx < items.length - 1) { e.preventDefault(); items[idx + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); idx > 0 ? items[idx - 1].focus() : inputEl.focus(); }
    if (e.key === "Enter" && idx >= 0) { e.preventDefault(); items[idx].dispatchEvent(new Event("mousedown")); }
  });
}

function initSmartSelects() {
  const catInput    = $("fieldCategory");
  const catDrop     = $("catDropdown");
  const topicInput  = $("fieldTopic");
  const topicDrop   = $("topicDropdown");
  if (!catInput || !catDrop) return;

  _buildSmartSelect(catInput, catDrop,
    filter => {
      const f = filter.toLowerCase();
      const matches = _allCategories
        .map(c => c.label)
        .filter(l => !f || l.toLowerCase().includes(f));
      if (filter.trim() && !matches.find(l => l.toLowerCase() === f)) {
        matches.push(`+ Nueva: "${filter.trim()}"`);
      }
      return matches;
    },
    val => {
      catInput.value = val.startsWith('+ Nueva: "') ? val.slice(10, -1) : val;
      // Auto-populate topics for this category
      _refreshTopicDropdown(val);
    }
  );

  _buildSmartSelect(topicInput, topicDrop,
    filter => {
      const f = filter.toLowerCase();
      // First try topics from selected category
      const catVal = catInput.value.trim().toLowerCase();
      let catTopics = [];
      if (_treeCache) {
        for (const [catKey, catData] of Object.entries(_treeCache)) {
          const label = (catData._label || catKey).toLowerCase();
          if (label === catVal || catKey.toLowerCase() === catVal) {
            const topicsMap = catData._topics || catData;
            for (const [k, td] of Object.entries(topicsMap)) {
              if (!k.startsWith("_")) catTopics.push(td._label || k);
            }
            break;
          }
        }
      }
      const pool = catTopics.length ? catTopics : _allTopics;
      const matches = pool.filter(t => !f || t.toLowerCase().includes(f));
      if (filter.trim() && !matches.find(t => t.toLowerCase() === f)) {
        matches.push(`+ Nuevo: "${filter.trim()}"`);
      }
      return matches;
    },
    val => {
      topicInput.value = val.startsWith('+ Nuevo: "') ? val.slice(10, -1) : val;
    }
  );
}

function _refreshTopicDropdown(catLabel) {
  // When category changes, clear topic and hint
  const topicInput = $("fieldTopic");
  if (topicInput) topicInput.value = "";
}

let _coursesTree = {};
let _coursesTreeData = {}; // full courses tree from /api/courses/tree
let _activeCourseSlug = null;

async function loadCourseSuggestions() {
  const res = await fetch("/api/courses/tree");
  if (!res.ok) return;
  _coursesTree = await res.json();
  const dl = $("courseSuggestions");
  if (!dl) return;
  dl.innerHTML = Object.values(_coursesTree).map(c => `<option value="${escapeHtml(c.label)}">`).join("");

  const courseInput = $("fieldCourse");
  if (courseInput && !courseInput._moduleListenerAdded) {
    courseInput._moduleListenerAdded = true;
    courseInput.addEventListener("input", updateModuleSuggestions);
    courseInput.addEventListener("change", updateModuleSuggestions);
  }
}

function updateModuleSuggestions() {
  const courseVal = $("fieldCourse").value.trim().toLowerCase();
  const dl = $("moduleSuggestions");
  if (!dl) return;
  const match = Object.values(_coursesTree).find(c => c.label.toLowerCase() === courseVal);
  if (!match) { dl.innerHTML = ""; return; }
  dl.innerHTML = Object.values(match.modules)
    .map(m => `<option value="${escapeHtml(m.label)}">`)
    .join("");
}

// ---- UTILS ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getDefaultIconForMode(mode) {
  return ENTRY_ICON_DEFAULTS[mode] || ENTRY_ICON_DEFAULTS.knowledge;
}

function renderIconMarkup(icon, className = "", fallback = ENTRY_ICON_DEFAULTS.knowledge) {
  const value = icon || fallback;
  const cls = className ? ` class="${className}"` : "";
  if (value && value.includes(":")) {
    return `<iconify-icon icon="${escapeHtml(value)}"${cls}></iconify-icon>`;
  }
  return `<span${cls}>${escapeHtml(value || "•")}</span>`;
}

function setIconButtonValue(button, icon, fallback) {
  if (!button) return;
  const preview = icon || fallback;
  button.dataset.icon = icon || preview;
  button.dataset.fallback = fallback;
  button.innerHTML = renderIconMarkup(preview, "icon-preview-glyph", fallback);
}

function getIconButtonValue(id) {
  return $(id)?.dataset.icon || "";
}

function renderTreeEntryLabel(icon, title, fallback = ENTRY_ICON_DEFAULTS.knowledge) {
  return `<span class="tree-entry-icon">${renderIconMarkup(icon || fallback, "tree-entry-icon-glyph", fallback)}</span><span class="tree-entry-title">${escapeHtml(title)}</span>`;
}

function openIconPicker(anchor, initialIcon, onPick) {
  document.querySelectorAll(".icon-picker-popover").forEach(el => el.remove());
  const pop = document.createElement("div");
  pop.className = "icon-picker-popover";
  pop.innerHTML = `
    <div class="icon-picker-head">
      <div class="icon-picker-title">Seleccionar icono</div>
      <input class="icon-picker-search" type="text" placeholder="Buscar icono…" autocomplete="off" />
    </div>
    <div class="icon-picker-body"></div>
  `;

  const body = pop.querySelector(".icon-picker-body");
  const search = pop.querySelector(".icon-picker-search");

  function renderCatalog(query = "") {
    const q = query.trim().toLowerCase();
    const items = ICON_CATALOG.filter(item => {
      if (!q) return true;
      return item.label.toLowerCase().includes(q)
        || item.icon.toLowerCase().includes(q)
        || item.tags.some(tag => tag.includes(q));
    });
    const groups = [];
    items.forEach(item => {
      let group = groups.find(g => g.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });

    body.innerHTML = groups.map(group => `
      <section class="icon-picker-group">
        <div class="icon-picker-group-title">${escapeHtml(group.name)}</div>
        <div class="icon-picker-grid">
          ${group.items.map(item => `
            <button type="button" class="icon-picker-item${item.icon === initialIcon ? " selected" : ""}" data-icon="${escapeHtml(item.icon)}" title="${escapeHtml(item.label)}"${item.color ? ` data-color="${escapeHtml(item.color)}"` : ''}>
              ${renderIconMarkup(item.icon, "icon-picker-item-glyph", item.icon)}
              <span>${escapeHtml(item.label)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("") || '<div class="icon-picker-empty">Sin coincidencias.</div>';

    // Apply brand colors to tech icons
    body.querySelectorAll(".icon-picker-item[data-color]").forEach(btn => {
      const glyph = btn.querySelector(".icon-picker-item-glyph, iconify-icon");
      if (glyph) glyph.style.color = btn.dataset.color;
    });

    body.querySelectorAll(".icon-picker-item").forEach(btn => {
      btn.addEventListener("click", () => {
        onPick(btn.dataset.icon);
        pop.remove();
      });
    });
  }

  renderCatalog("");
  search.addEventListener("input", () => renderCatalog(search.value));

  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  const popWidth = Math.min(480, window.innerWidth - 24);
  let left = rect.left;
  if (left + popWidth > window.innerWidth - 12) left = window.innerWidth - popWidth - 12;
  pop.style.width = `${popWidth}px`;
  pop.style.left = `${Math.max(12, left)}px`;
  pop.style.top = `${rect.bottom + 8}px`;
  search.focus();

  const closePicker = e => {
    if (!pop.contains(e.target) && e.target !== anchor) {
      pop.remove();
      document.removeEventListener("mousedown", closePicker);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", closePicker), 0);
}

function initIconButton(buttonId, modeOrFallback) {
  const btn = $(buttonId);
  if (!btn) return;
  const resolveFallback = () => typeof modeOrFallback === "function" ? modeOrFallback() : modeOrFallback;
  setIconButtonValue(btn, btn.dataset.icon || "", resolveFallback());
  btn.addEventListener("click", () => {
    const fallback = resolveFallback();
    openIconPicker(btn, btn.dataset.icon || fallback, icon => {
      setIconButtonValue(btn, icon, fallback);
      btn.dataset.userPicked = "true";
    });
  });
}

function initIconPickers() {
  initIconButton("entryIconBtn", () => getDefaultIconForMode(window._getModalMode ? window._getModalMode() : "knowledge"));
  initIconButton("ntsIconBtn", ENTRY_ICON_DEFAULTS.teamspace);
  initIconButton("tsPageIconBtn", ENTRY_ICON_DEFAULTS.page);
  initIconButton("pageNameIconBtn", ENTRY_ICON_DEFAULTS.page);
}

function showToast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 3000);
}

function initPageFind() {
  const panel = document.createElement("div");
  panel.className = "page-find-panel hidden";
  panel.innerHTML = `
    <input id="pageFindInput" type="text" placeholder="buscar en página" />
    <button id="pageFindNext" class="btn-ghost">next</button>
    <input id="pageReplaceInput" type="text" placeholder="reemplazar" />
    <button id="pageReplaceAll" class="btn-ghost">replace all</button>
    <span id="pageFindCount"></span>
    <button id="pageFindClose" class="btn-ghost">×</button>
  `;
  document.body.appendChild(panel);
  const show = () => { panel.classList.remove("hidden"); $("pageFindInput").focus(); $("pageFindInput").select(); };
  const hide = () => panel.classList.add("hidden");
  const update = (res) => { $("pageFindCount").textContent = res.count ? `${res.index + 1}/${res.count}` : "0"; };
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && currentEntryId) {
      e.preventDefault();
      show();
    }
    if (e.key === "Escape" && !panel.classList.contains("hidden")) hide();
  });
  $("pageFindInput").addEventListener("input", e => update(_inlineEditor.findText(e.target.value)));
  $("pageFindInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); update(_inlineEditor.findNext()); }
  });
  $("pageFindNext").addEventListener("click", () => update(_inlineEditor.findNext()));
  $("pageReplaceAll").addEventListener("click", () => {
    const changed = _inlineEditor.replaceAllText($("pageFindInput").value, $("pageReplaceInput").value);
    showToast(`${changed} bloques actualizados`);
    update(_inlineEditor.findText($("pageFindInput").value));
  });
  $("pageFindClose").addEventListener("click", hide);
}

// ============================================================
// FEATURE 1 — FOCUS / READING MODE
// ============================================================
function initFocusMode() {
  $("focusBtn").addEventListener("click", enterFocusMode);
  $("focusExit").addEventListener("click", exitFocusMode);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.body.classList.contains("focus-mode")) exitFocusMode();
  });
}

function enterFocusMode() {
  document.body.classList.add("focus-mode");
  $("focusExit").classList.remove("hidden");
}

function exitFocusMode() {
  document.body.classList.remove("focus-mode");
  $("focusExit").classList.add("hidden");
}

// ============================================================
// FEATURE 2 — STARRED / FAVORITES
// ============================================================
function initStarFeature() {
  $("starBtn").addEventListener("click", toggleStar);
}

async function toggleStar() {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}/star`, { method: "POST" });
  if (!res.ok) return;
  const data = await res.json();
  starredMap[currentEntryId] = data.starred;
  updateStarBtn(data.starred);
  await loadTree();
}

function updateStarBtn(starred) {
  const btn = $("starBtn");
  if (starred) {
    btn.textContent = "★ starred";
    btn.classList.add("starred");
  } else {
    btn.textContent = "☆ star";
    btn.classList.remove("starred");
  }
  const ctx = $("ctxStar");
  if (ctx) { ctx.textContent = starred ? "★" : "☆"; ctx.classList.toggle("active", !!starred); }
}

function renderStarredSection(index) {
  const starred = Object.entries(index).filter(([, meta]) => meta.starred);
  const nav = $("tree");

  const existing = nav.querySelector(".tree-starred-section");
  if (existing) existing.remove();

  if (starred.length === 0) return;

  const section = document.createElement("div");
  section.className = "tree-starred-section";
  section.innerHTML = `<div class="tree-starred-header">★ Starred</div><div class="tree-starred-list" id="starredList"></div>`;
  nav.insertBefore(section, nav.firstChild);

  const list = section.querySelector(".tree-starred-list");
  starred.forEach(([id, meta]) => {
    const el = document.createElement("div");
    el.className = "tree-starred-entry" + (id === currentEntryId ? " active" : "");
    el.textContent = "★ " + (meta.title || id);
    el.title = meta.title || id;
    el.dataset.id = id;
    el.addEventListener("click", () => loadEntry(id));
    list.appendChild(el);
  });
}

// ============================================================
// FEATURE 4 — TABLE OF CONTENTS
// ============================================================
function initTOC() {
  $("tocBtn").addEventListener("click", toggleTOC);
}

function toggleTOC() {
  const panel = $("tocPanel");
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isHidden);
  $("tocBtn").classList.toggle("active", isHidden);
}

function buildTOC() {
  const body = $("entryBody");
  const headings = Array.from(body.querySelectorAll("h2, h3"));
  const tocItems = $("tocItems");
  const tocPanel = $("tocPanel");

  headings.forEach((h, i) => {
    if (!h.id) h.id = "toc-heading-" + i;
  });

  if (headings.length < 2) {
    tocPanel.classList.add("hidden");
    $("tocBtn").classList.remove("active");
    tocItems.innerHTML = "";
    return;
  }

  tocItems.innerHTML = headings.map(h => {
    const cls = h.tagName === "H3" ? "toc-item toc-h3" : "toc-item";
    return `<div class="${cls}" data-target="${h.id}">${escapeHtml(h.textContent.replace(/^[→#]\s*/, ""))}</div>`;
  }).join("");

  tocItems.querySelectorAll(".toc-item").forEach(item => {
    item.addEventListener("click", () => {
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ============================================================
// FEATURE 5 — QUICK NOTE / SCRATCHPAD
// ============================================================
function initScratchpad() {
  $("scratchpadTrigger").addEventListener("click", toggleScratchpad);
  $("scratchpadClose").addEventListener("click", () => {
    $("scratchpad").classList.add("hidden");
    $("scratchpadTitleRow").classList.add("hidden");
    $("scratchpadSave").textContent = "save";
  });
  $("scratchpadSave").addEventListener("click", saveScratchpad);
  $("scratchpadTitle").addEventListener("keydown", e => { if (e.key === "Enter") saveScratchpad(); });
  makeDraggable($("scratchpad"), $("scratchpadHeader"));
}

function toggleScratchpad() {
  $("scratchpad").classList.toggle("hidden");
  if (!$("scratchpad").classList.contains("hidden")) {
    $("scratchpadText").focus();
  }
}

async function saveScratchpad() {
  const content = $("scratchpadText").value.trim();
  if (!content) { showToast("Nada que guardar", "error"); return; }

  const titleRow = $("scratchpadTitleRow");
  const titleInput = $("scratchpadTitle");
  if (titleRow.classList.contains("hidden")) {
    titleRow.classList.remove("hidden");
    titleInput.value = "";
    titleInput.focus();
    $("scratchpadSave").textContent = "confirm";
    return;
  }

  const title = titleInput.value.trim() || ("Quick Note " + new Date().toLocaleTimeString());
  const tags  = ($("scratchpadTags").value || "").trim();
  $("scratchpadSave").textContent = "save";
  $("scratchpadTags").value = "";
  titleRow.classList.add("hidden");

  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "Quick Notes",
      topic: "Scratchpad",
      title: title,
      raw_text: content,
      tags: tags,
    }),
  });
  if (res.ok) {
    const data = await res.json();
    $("scratchpadText").value = "";
    $("scratchpad").classList.add("hidden");
    showToast("Nota guardada");
    await loadTree();
    loadCategorySuggestions();
    loadEntry(data.id);
  } else {
    showToast("Error al guardar nota", "error");
  }
}

function makeDraggable(el, handle) {
  let dx = 0, dy = 0, startX = 0, startY = 0;
  handle.addEventListener("mousedown", e => {
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    dx = rect.left;
    dy = rect.top;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.left = dx + "px";
    el.style.top = dy + "px";

    function onMove(e2) {
      el.style.left = (dx + e2.clientX - startX) + "px";
      el.style.top = (dy + e2.clientY - startY) + "px";
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ============================================================
// FEATURE 6 — STATS PAGE
// ============================================================
function initStats() {
  const reindexBtn = $("reindexBtn");
  if (reindexBtn) reindexBtn.addEventListener("click", async () => {
    showToast("Reindexando archivos…");
    const res = await fetch("/api/reindex", { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      await loadTree();
      showToast(`Reindex completo — ${d.added} nuevas, ${d.total} total`);
    } else {
      showToast("Error al reindexar", "error");
    }
  });
  const statsBtn = $("statsBtn");
  if (statsBtn) statsBtn.addEventListener("click", openStats);
  $("statsClose").addEventListener("click", () => $("statsOverlay").classList.add("hidden"));
}

async function openStats() {
  $("statsOverlay").classList.remove("hidden");
  $("statsBody").innerHTML = '<div class="stats-loading">loading stats…</div>';
  const res = await fetch("/api/stats");
  if (!res.ok) { $("statsBody").innerHTML = '<div class="stats-loading">error loading stats</div>'; return; }
  const s = await res.json();

  const maxCount = s.chart.reduce((m, c) => Math.max(m, c.count), 0) || 1;
  const BAR_MAX = 30;

  const chartRows = s.chart.map(c => {
    const barLen = Math.round((c.count / maxCount) * BAR_MAX);
    const bar = "█".repeat(barLen) || "▏";
    return `<div class="chart-row">
      <span class="chart-label">${escapeHtml(c.label)}</span>
      <span class="chart-bar">${bar}</span>
      <span class="chart-count">${c.count}</span>
    </div>`;
  }).join("");

  $("statsBody").innerHTML = `
    <div class="stats-grid">
      <div class="stats-card">
        <div class="stats-card-label">Total Entries</div>
        <div class="stats-card-value">${s.total_entries}</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-label">Categories</div>
        <div class="stats-card-value">${s.total_categories}</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-label">Topics</div>
        <div class="stats-card-value">${s.total_topics}</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-label">Total Words</div>
        <div class="stats-card-value">${s.total_words.toLocaleString()}</div>
      </div>
      ${s.most_active ? `<div class="stats-card">
        <div class="stats-card-label">Most Active</div>
        <div class="stats-card-value" style="font-size:1rem">${escapeHtml(s.most_active.label)}</div>
        <div class="stats-card-sub">${s.most_active.count} entries</div>
      </div>` : ""}
      ${s.last_entry ? `<div class="stats-card">
        <div class="stats-card-label">Last Created</div>
        <div class="stats-card-value" style="font-size:0.9rem">${escapeHtml(s.last_entry.title)}</div>
        <div class="stats-card-sub">${s.last_entry.date}</div>
      </div>` : ""}
    </div>
    <div class="stats-chart">
      <div class="stats-section-title">entries per category</div>
      ${chartRows}
    </div>
  `;
}

// ============================================================
// FEATURE 7 — CATEGORY CONTEXT MENU (right-click export)
// ============================================================
let _ctxCategory = null;

function initContextMenu() {
  document.addEventListener("contextmenu", e => {
    const header = e.target.closest(".tree-category-header");
    if (!header) {
      hideContextMenu();
      return;
    }
    e.preventDefault();
    const catEl = header.closest(".tree-category");
    _ctxCategory = catEl ? catEl.dataset.cat : null;
    if (!_ctxCategory) return;
    const menu = $("contextMenu");
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.classList.remove("hidden");
  });
  document.addEventListener("click", () => hideContextMenu());
  $("ctxExportMd").addEventListener("click", () => {
    if (_ctxCategory) window.open(`/api/export/category/${encodeURIComponent(_ctxCategory)}/md`, "_blank");
    hideContextMenu();
  });
  $("ctxExportPdf").addEventListener("click", () => {
    if (_ctxCategory) window.open(`/api/export/category/${encodeURIComponent(_ctxCategory)}/pdf`, "_blank");
    hideContextMenu();
  });
}

function hideContextMenu() {
  $("contextMenu").classList.add("hidden");
  _ctxCategory = null;
}


// ============================================================
// NEW FEATURE: INTERACTIVE CHECKBOXES
// ============================================================
function attachCheckboxHandlers() {
  const body = $("entryBody");
  if (!body) return;
  body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", async (e) => {
      e.preventDefault();
      if (!currentEntryId) return;
      const lineIndex = parseInt(cb.dataset.lineIndex, 10);
      if (isNaN(lineIndex)) return;
      const checked = cb.checked;
      const res = await fetch(`/api/entry/${currentEntryId}/checkbox`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_index: lineIndex, checked }),
      });
      if (!res.ok) {
        showToast("Error al guardar checkbox", "error");
        cb.checked = !checked;
      }
    });
  });
}

function postProcessCheckboxes(markdown, htmlElement) {
  const lines = markdown.split("\n");
  const checkboxes = Array.from(htmlElement.querySelectorAll('input[type="checkbox"]'));
  let cbIndex = 0;
  for (let i = 0; i < lines.length && cbIndex < checkboxes.length; i++) {
    const line = lines[i];
    if (/- \[[ x]\]/i.test(line)) {
      checkboxes[cbIndex].dataset.lineIndex = i;
      const li = checkboxes[cbIndex].closest("li");
      if (li) li.classList.add("task-list-item");
      cbIndex++;
    }
  }
}

// ============================================================
// NEW FEATURE: ENTRY TEMPLATES
// ============================================================
const TEMPLATES = {
  blank: "",
  concepto: "# Concepto\n\n## ¿Qué es?\n\n## ¿Para qué sirve?\n\n## Ejemplo\n```bash\n\n```\n\n## Notas importantes\n",
  comando: "# comando\n\n## Descripción\n\n## Sintaxis\n```bash\ncomando [opciones] [argumentos]\n```\n\n## Opciones útiles\n\n* `-flag` — descripción\n\n## Ejemplos prácticos\n```bash\n\n```\n\n## Errores comunes\n",
  tutorial: "# Título del tutorial\n\n## Objetivo\n\n## Requisitos previos\n\n## Pasos\n\n### Paso 1\n\n### Paso 2\n\n### Paso 3\n\n## Resultado esperado\n\n## Problemas frecuentes\n",
  resumen: "# Título\n\n## Ideas principales\n\n* \n* \n* \n\n## Conceptos clave\n\n## Conclusión\n\n## Referencias\n",
};

function initTemplates() {
  document.querySelectorAll(".template-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const tpl = chip.dataset.tpl;
      if (tpl in TEMPLATES) {
        BlockEditor.loadMarkdown(TEMPLATES[tpl]);
        document.querySelectorAll(".template-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        BlockEditor.focusFirst();
        autoExtractTitle();
      }
    });
  });
}

// ============================================================
// NEW FEATURE: VERSION HISTORY
// ============================================================
// ============================================================
// SUB-PAGES
// ============================================================
let _pendingPageBlockId = null;

function initPageNameModal() {
  $("pageNameClose").addEventListener("click", closePageNameModal);
  $("pageNameCancel").addEventListener("click", closePageNameModal);
  $("pageNameConfirm").addEventListener("click", confirmPageCreate);
  $("pageNameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") confirmPageCreate();
    if (e.key === "Escape") closePageNameModal();
  });

  window._promptPageName = (blockId) => {
    _pendingPageBlockId = blockId;
    $("pageNameInput").value = "";
    setIconButtonValue($("pageNameIconBtn"), ENTRY_ICON_DEFAULTS.page, ENTRY_ICON_DEFAULTS.page);
    $("pageNameOverlay").classList.remove("hidden");
    setTimeout(() => $("pageNameInput").focus(), 50);
  };
}

function closePageNameModal() {
  $("pageNameOverlay").classList.add("hidden");
  _pendingPageBlockId = null;
}

async function confirmPageCreate() {
  const name = $("pageNameInput").value.trim();
  if (!name) return;
  const icon = getIconButtonValue("pageNameIconBtn");
  closePageNameModal();

  // Create a new entry as sub-page of current
  const parentId = currentEntryId;
  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: name,
      category: "pages",
      topic: "subpages",
      raw_text: "# " + name + "\n\n",
      parent_id: parentId || null,
      icon,
      already_markdown: true,
    }),
  });
  if (res.ok) {
    const d = await res.json();
    // Insert page link block in current entry (stays in place, no scroll)
    const targetEditor = window._activeEditorForPageCreate || _inlineEditor;
    window._activeEditorForPageCreate = null;
    targetEditor.addPageBlock(_pendingPageBlockId, name, d.id);
    await loadTree();
    showToast(`⬡ "${name}" creada — haz clic en el enlace para abrirla`);
  } else {
    showToast("Error al crear sub-página", "error");
  }
}

async function loadEntryChildren(entryId) {
  // Remove previous children section
  const existing = $("entryView").querySelector(".entry-children");
  if (existing) existing.remove();

  const res = await fetch(`/api/entry/${entryId}/children`);
  if (!res.ok) return;
  const children = await res.json();
  if (!children.length) return;

  const div = document.createElement("div");
  div.className = "entry-children";
  div.innerHTML = `<div class="entry-children-label">⬡ Sub-páginas</div>` +
    children.map(c => `
      <div class="entry-child-link" data-id="${c.id}">
        <span class="entry-child-icon">${renderIconMarkup(c.icon, "entry-child-icon-glyph", ENTRY_ICON_DEFAULTS.page)}</span>
        <span>${escapeHtml(c.title)}</span>
      </div>`).join("");
  div.querySelectorAll(".entry-child-link").forEach(el => {
    el.addEventListener("click", () => loadEntry(el.dataset.id));
  });
  // Append after entryBody, inside entryView
  $("entryBody").after(div);
}

let _historyCurrentTimestamp = null;
let _historyCurrentMarkdown = null;

function formatHistoryTimestamp(timestamp) {
  return timestamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\d+)?$/, '$1-$2-$3 $4:$5:$6');
}

function initHistory() {
  $("historyBtn").addEventListener("click", toggleHistoryPanel);
  $("versionModalClose").addEventListener("click", closeVersionModal);
  $("versionModalCancel").addEventListener("click", closeVersionModal);
  $("versionRestoreBtn").addEventListener("click", restoreVersion);
  $("versionModalOverlay").addEventListener("click", e => {
    if (e.target === $("versionModalOverlay")) closeVersionModal();
  });
}

function toggleHistoryPanel() {
  const panel = $("historyPanel");
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isHidden);
  $("historyBtn").classList.toggle("active", isHidden);
  if (isHidden && currentEntryId) {
    loadHistoryPanel(currentEntryId);
  }
}

async function loadHistoryPanel(id) {
  const items = $("historyItems");
  items.innerHTML = '<div style="padding:10px;color:var(--text-faint);font-size:0.72rem;">loading…</div>';
  const res = await fetch(`/api/entry/${id}/history`);
  if (!res.ok) { items.innerHTML = '<div style="padding:10px;color:var(--danger);font-size:0.72rem;">error</div>'; return; }
  const snapshots = await res.json();
  if (snapshots.length === 0) {
    items.innerHTML = '<div style="padding:10px;color:var(--text-faint);font-size:0.72rem;">no versions yet</div>';
    return;
  }
  items.innerHTML = snapshots.map(s => {
    const ts = formatHistoryTimestamp(s.timestamp);
    const kb = (s.size / 1024).toFixed(1);
    return `<div class="history-item" data-ts="${escapeHtml(s.timestamp)}">
      <span class="history-item-ts">${escapeHtml(ts)}</span>
      <span class="history-item-size">${kb} KB</span>
    </div>`;
  }).join("");
  items.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", () => openVersionPreview(currentEntryId, item.dataset.ts));
  });
}

async function openVersionPreview(entryId, timestamp) {
  const res = await fetch(`/api/entry/${entryId}/history/${timestamp}`);
  if (!res.ok) { showToast("Error al cargar snapshot", "error"); return; }
  const data = await res.json();
  const current = _inlineEditor ? _inlineEditor.getMarkdown() : "";
  const currentLines = current.split("\n").length;
  const snapshotLines = (data.markdown || "").split("\n").length;
  const delta = snapshotLines - currentLines;
  _historyCurrentTimestamp = timestamp;
  _historyCurrentMarkdown = data.markdown;
  const ts = formatHistoryTimestamp(timestamp);
  $("versionModalTitle").textContent = `snapshot — ${ts}`;
  $("versionModalBody").innerHTML = `
    <div class="version-diff-summary">
      actual: ${currentLines} líneas · snapshot: ${snapshotLines} líneas · delta: ${delta >= 0 ? "+" : ""}${delta}
    </div>
    ${data.html}
  `;
  $("versionModalOverlay").classList.remove("hidden");
}

function closeVersionModal() {
  $("versionModalOverlay").classList.add("hidden");
  _historyCurrentTimestamp = null;
  _historyCurrentMarkdown = null;
}

async function restoreVersion() {
  if (!currentEntryId || !_historyCurrentTimestamp) return;
  const restoredEntryId = currentEntryId;
  // Cancel any pending auto-save that could overwrite the restored content
  _restoreInProgress = true;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
  try {
    const putRes = await fetch(`/api/entry/${restoredEntryId}/history/${_historyCurrentTimestamp}/restore`, {
      method: "POST",
      cache: "no-store",
    });
    if (putRes.ok) {
      const data = await putRes.json();
      const verifyRes = await fetch(`/api/entry/${restoredEntryId}?_=${Date.now()}`, { cache: "no-store" });
      if (!verifyRes.ok) {
        showToast("Restaurado, pero no se pudo verificar", "error");
        return;
      }
      const fresh = await verifyRes.json();
      const restored = data.markdown || "";
      if ((fresh.markdown || "") !== restored) {
        showToast("Restore no coincidió con el snapshot", "error");
        return;
      }
      closeVersionModal();
      $("historyPanel").classList.add("hidden");
      $("historyBtn").classList.remove("active");
      _inlineEditor.load(fresh.markdown || "");
      showToast("Versión restaurada");
      await loadEntry(restoredEntryId, { force: true });
      // Scroll entry body to top after restore
      const area = $("contentArea");
      if (area) area.scrollTop = 0;
    } else {
      showToast("Error al restaurar", "error");
    }
  } catch (_) {
    showToast("Error al restaurar", "error");
  } finally {
    _restoreInProgress = false;
  }
}

// ============================================================
// NEW FEATURE: BACKLINKS
// ============================================================
async function loadBacklinks(id) {
  const res = await fetch(`/api/entry/${id}/backlinks`);
  if (!res.ok) return;
  const backlinks = await res.json();
  if (backlinks.length === 0) return;
  const section = document.createElement("div");
  section.className = "backlinks-section";
  section.innerHTML = `<div class="backlinks-header">← backlinks (${backlinks.length})</div>` +
    backlinks.map(bl => `
      <div class="backlink-item" data-id="${escapeHtml(bl.id)}">
        <div class="backlink-title">${escapeHtml(bl.title)}</div>
        <div class="backlink-path">${escapeHtml(bl.category_label)} › ${escapeHtml(bl.topic_label)}</div>
        <div class="backlink-snippet">${escapeHtml(bl.snippet)}</div>
      </div>
    `).join("");
  section.querySelectorAll(".backlink-item").forEach(item => {
    item.addEventListener("click", () => loadEntry(item.dataset.id));
  });
  $("entryBody").appendChild(section);
}

// ============================================================
// NEW FEATURE: WORD COUNT + READING TIME
// ============================================================
function getWordCount(htmlElement) {
  const text = htmlElement.textContent || htmlElement.innerText || "";
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ============================================================
// NEW FEATURE: DUPLICATE ENTRY
// ============================================================
function initDuplicate() {
  $("dupBtn").addEventListener("click", duplicateEntry);
}

async function duplicateEntry() {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}/duplicate`, { method: "POST" });
  if (!res.ok) { showToast("Error al duplicar", "error"); return; }
  const data = await res.json();
  showToast("Entrada duplicada");
  await loadTree();
  loadEntry(data.id);
}

// ============================================================
// NEW FEATURE: MOVE ENTRY
// ============================================================
function initMove() {
  $("moveBtn").addEventListener("click", toggleMovePanel);
  $("moveCancelBtn").addEventListener("click", closeMovePanel);
  $("moveApplyBtn").addEventListener("click", applyMove);
  loadMoveCatSuggestions();
}

async function loadMoveCatSuggestions() {
  const res = await fetch("/api/categories");
  const cats = await res.json();
  const dl = $("moveCatSuggestions");
  dl.innerHTML = Object.values(cats).map(c => `<option value="${escapeHtml(c)}">`).join("");
}

function toggleMovePanel() {
  const panel = $("movePanel");
  if (panel.classList.contains("hidden")) {
    fetch(`/api/entry/${currentEntryId}`).then(r => r.json()).then(data => {
      const m = data.meta;
      $("moveCat").value = m.category_label || m.category;
      $("moveTopic").value = m.topic_label || m.topic;
    });
    panel.classList.remove("hidden");
    loadMoveCatSuggestions();
  } else {
    closeMovePanel();
  }
}

function closeMovePanel() {
  $("movePanel").classList.add("hidden");
}

async function applyMove() {
  if (!currentEntryId) return;
  const cat = $("moveCat").value.trim();
  const topic = $("moveTopic").value.trim();
  if (!cat || !topic) { showToast("Completa categoría y tema", "error"); return; }

  const entryRes = await fetch(`/api/entry/${currentEntryId}`);
  const entryData = await entryRes.json();
  const m = entryData.meta;

  const res = await fetch(`/api/entry/${currentEntryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw_text: entryData.markdown,
      title: m.title,
      category: cat,
      topic: topic,
      already_markdown: true,
    }),
  });
  if (res.ok) {
    closeMovePanel();
    showToast("Entrada movida");
    await loadTree();
    loadEntry(currentEntryId);
  } else {
    showToast("Error al mover", "error");
  }
}

// ============================================================
// NEW FEATURE: PIN ENTRIES
// ============================================================
function initPin() {
  $("pinBtn").addEventListener("click", togglePin);
  $("fmtBtn").addEventListener("click", beautifyEntry);
}

async function beautifyEntry() {
  if (!currentEntryId) return;
  const btn = $("fmtBtn");
  btn.textContent = "⬚ …";
  btn.disabled = true;
  try {
    const res = await fetch(`/api/entry/${currentEntryId}/beautify`, { method: "POST" });
    const data = await res.json();
    if (data.changed) {
      showToast("Espaciado aplicado");
      await loadEntry(currentEntryId);
    } else {
      showToast("El contenido ya tiene espaciado correcto");
    }
  } catch (e) {
    showToast("Error al formatear");
  } finally {
    btn.textContent = "⬚ fmt";
    btn.disabled = false;
  }
}

async function togglePin() {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}/pin`, { method: "POST" });
  if (!res.ok) return;
  const data = await res.json();
  pinnedMap[currentEntryId] = data.pinned;
  localStorage.setItem("kb_pinned", JSON.stringify(pinnedMap));
  updatePinBtn(data.pinned);
  await loadTree();
}

function updatePinBtn(pinned) {
  const btn = $("pinBtn");
  if (pinned) {
    btn.textContent = "⊟ unpin";
    btn.classList.add("pinned");
  } else {
    btn.textContent = "⊞ pin";
    btn.classList.remove("pinned");
  }
  const ctx = $("ctxPin");
  if (ctx) { ctx.textContent = pinned ? "⊟" : "⊞"; ctx.classList.toggle("active", !!pinned); }
}

function renderPinnedSection() {
  const nav = $("tree");
  const existing = nav.querySelector(".tree-pinned-section");
  if (existing) existing.remove();

  const pinnedEntries = Object.entries(pinnedMap).filter(([, v]) => v);
  if (pinnedEntries.length === 0) return;

  const section = document.createElement("div");
  section.className = "tree-pinned-section";
  section.innerHTML = `<div class="tree-pinned-header">⊞ pinned</div><div class="tree-pinned-list"></div>`;

  // Insert before starred section (or at top)
  const starredSec = nav.querySelector(".tree-starred-section");
  if (starredSec) {
    nav.insertBefore(section, starredSec);
  } else {
    nav.insertBefore(section, nav.firstChild);
  }

  const list = section.querySelector(".tree-pinned-list");
  for (const [eid] of pinnedEntries) {
    const el = document.createElement("div");
    el.className = "tree-pinned-entry" + (eid === currentEntryId ? " active" : "");
    el.dataset.id = eid;
    const treeEntry = document.querySelector(`.tree-entry[data-id="${eid}"]`);
    el.textContent = "⊞ " + (treeEntry ? treeEntry.textContent.replace(/^·\s*/, "") : eid);
    el.addEventListener("click", () => loadEntry(eid));
    list.appendChild(el);
  }
}

// ============================================================
// FEATURE: STUDY STATUS
// ============================================================
function initStatus() {
  $("statusBtn").addEventListener("click", () => cycleStatus(currentEntryId, $("statusBtn"), true));
}

const STATUS_CYCLE = ["pendiente", "progreso", "dominado"];
const STATUS_LABELS = { pendiente: "● pend", progreso: "◐ prog", dominado: "✓ done" };

function updateStatusBtn(btn, status) {
  btn.textContent = STATUS_LABELS[status] || "● pend";
  btn.className = `btn-ghost status-${status}`;
  const ctx = $("ctxStatus");
  if (ctx) { ctx.textContent = STATUS_LABELS[status] || "● pend"; ctx.className = `ctx-btn status-${status}`; }
}

async function cycleStatus(id, btn, refreshSidebar) {
  if (!id) return;
  const current = statusMap[id] || "pendiente";
  const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
  const next = STATUS_CYCLE[nextIdx];
  const res = await fetch(`/api/entry/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
  if (!res.ok) return;
  statusMap[id] = next;
  updateStatusBtn(btn, next);
  if (refreshSidebar) {
    // Update the dot in the sidebar without full re-render
    const dot = document.querySelector(`.tree-entry[data-id="${id}"] .status-dot`);
    if (dot) {
      dot.className = `status-dot status-${next}`;
    }
  }
}

// ============================================================
// FEATURE: WIKI-LINKS
// ============================================================
async function processWikilinks(container) {
  const wikilinks = container.querySelectorAll(".wikilink");
  for (const el of wikilinks) {
    const title = el.dataset.title;
    if (!title) continue;
    const res = await fetch(`/api/resolve-wikilink?title=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.id) {
      el.classList.add("wikilink-found");
      el.addEventListener("click", () => loadEntry(data.id));
    } else {
      el.classList.add("wikilink-missing");
    }
  }
}

// ============================================================
// FEATURE: REVIEW / STUDY MODE
// ============================================================
function initReview() {
  $("reviewExit").addEventListener("click", exitReview);
  $("reviewPrev").addEventListener("click", () => navigateReview(-1));
  $("reviewNext").addEventListener("click", () => navigateReview(1));
  $("reviewStatusBtn").addEventListener("click", () => {
    const entry = _reviewEntries[_reviewIndex];
    if (entry) cycleStatus(entry.id, $("reviewStatusBtn"), true);
  });
  document.addEventListener("keydown", e => {
    if ($("reviewOverlay").classList.contains("hidden")) return;
    if (e.key === "ArrowLeft")  navigateReview(-1);
    if (e.key === "ArrowRight") navigateReview(1);
    if (e.key === "Escape")     exitReview();
  });
}

async function startReview(entries) {
  if (!entries || entries.length === 0) return;
  _reviewEntries = entries;
  _reviewIndex = 0;
  $("reviewOverlay").classList.remove("hidden");
  await loadReviewEntry();
}

async function loadReviewEntry() {
  const entry = _reviewEntries[_reviewIndex];
  if (!entry) return;
  $("reviewCounter").textContent = `${_reviewIndex + 1} / ${_reviewEntries.length}`;
  $("reviewTitle").textContent = entry.title;
  const body = $("reviewBody");
  body.classList.add("fading");
  const res = await fetch(`/api/entry/${entry.id}`);
  const data = await res.json();
  body.innerHTML = data.html;
  body.classList.remove("fading");
  const status = data.meta.status || "pendiente";
  statusMap[entry.id] = status;
  updateStatusBtn($("reviewStatusBtn"), status);
  processWikilinks(body);
}

function navigateReview(delta) {
  const next = _reviewIndex + delta;
  if (next < 0 || next >= _reviewEntries.length) return;
  _reviewIndex = next;
  loadReviewEntry();
}

function exitReview() {
  $("reviewOverlay").classList.add("hidden");
  _reviewEntries = [];
  _reviewIndex = 0;
}

// ============================================================
// NEW FEATURE: BREADCRUMB
// ============================================================
function buildBreadcrumb(meta) {
  if (!$("breadcrumb")) return;

  const isCourse    = meta.type === "course"    || !!meta.course;
  const isTeamspace = meta.type === "teamspace" || !!meta.teamspace;

  // Space root label
  let spaceLabel = "KB";
  let spaceSpace = "knowledge";
  if (isCourse)    { spaceLabel = "Cursos";   spaceSpace = "courses"; }
  if (isTeamspace) { spaceLabel = "Team";     spaceSpace = "teamspace"; }

  const catLabel   = escapeHtml(isCourse ? (meta.course_label || meta.course)    : isTeamspace ? "Teamspace" : (meta.category_label || meta.category)) || "";
  const topicLabel = escapeHtml(isCourse ? (meta.module_label || meta.module)    : isTeamspace ? (meta.teamspace_label || meta.teamspace) : (meta.topic_label || meta.topic)) || "";
  const entryTitle = escapeHtml(meta.title || "Sin título");

  const segs = [
    `<span class="breadcrumb-seg breadcrumb-space" data-space="${spaceSpace}">${spaceLabel}</span>`,
    catLabel   ? `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg" data-cat="${escapeHtml(meta.category || meta.course || "")}">${catLabel}</span>` : "",
    topicLabel ? `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg">${topicLabel}</span>` : "",
    `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg breadcrumb-current">${entryTitle}</span>`,
  ];
  $("breadcrumb").innerHTML = segs.join("");

  // Space click → switch sidebar space
  $("breadcrumb").querySelector(".breadcrumb-space")?.addEventListener("click", () => {
    if (typeof switchSpace === "function") switchSpace(spaceSpace);
  });

  // Category click → expand + scroll to category in sidebar
  $("breadcrumb").querySelectorAll(".breadcrumb-seg[data-cat]").forEach(seg => {
    seg.addEventListener("click", () => {
      const cat = seg.dataset.cat;
      const catEl = document.querySelector(`.tree-category[data-cat="${cat}"]`);
      if (catEl && !catEl.classList.contains("open")) catEl.querySelector(".tree-category-header").click();
      if (catEl) catEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  // Wire ctx-toolbar buttons to their existing action buttons
  _wireCtxBtn("ctxStar",     "starBtn");
  _wireCtxBtn("ctxPin",      "pinBtn");
  _wireCtxBtn("ctxToc",      "tocBtn");
  _wireCtxBtn("ctxHistory",  "historyBtn");
  _wireCtxBtn("ctxFocus",    "focusBtn");
  _wireCtxBtn("ctxExportMd", "exportMdBtn");
  _wireCtxBtn("ctxDelete",   "deleteBtn");

  // ctxStatus proxies statusBtn (keep label in sync)
  const ctxStatus = $("ctxStatus");
  const statusBtn = $("statusBtn");
  if (ctxStatus && statusBtn) {
    ctxStatus.textContent = statusBtn.textContent;
    ctxStatus.className = statusBtn.className.replace("btn-ghost", "ctx-btn");
    ctxStatus.onclick = () => statusBtn.click();
  }
}

function _wireCtxBtn(ctxId, sourceId) {
  const ctxBtn = $(ctxId);
  const src    = $(sourceId);
  if (!ctxBtn || !src) return;
  // Clone click handler by proxy
  ctxBtn.onclick = () => src.click();
}

// ============================================================
// COMMAND PALETTE  (Cmd+K / Ctrl+K)
// ============================================================
(function () {
  'use strict';

  // ── Static actions shown when query is empty ──────────────
  const ACTIONS = [
    { id: 'act:new-entry',    label: 'Nueva entrada',      icon: '✦', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('newEntryBtn')?.click(); } },
    { id: 'act:new-board',    label: 'Nuevo tablero Kanban', icon: '⊞', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('newKanbanBoardBtn')?.click(); } },
    { id: 'act:home',         label: 'Ir al Inicio',        icon: '⌂', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('wsHome')?.click(); } },
    { id: 'act:starred',      label: 'Ver Favoritos',       icon: '☆', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('wsStarred')?.click(); } },
    { id: 'act:reindex',      label: 'Reindexar archivos',  icon: '⟳', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('reindexBtn')?.click(); } },
    { id: 'act:theme',        label: 'Cambiar tema',         icon: '◐', group: 'Acciones', shortcut: null,
      run: () => { document.getElementById('themeToggle')?.click(); } },
  ];

  // ── State ─────────────────────────────────────────────────
  let _open   = false;
  let _items  = [];     // current result list
  let _active = -1;     // keyboard cursor index
  let _debounce = null;

  // ── DOM refs (built once on first open) ───────────────────
  let _overlay, _modal, _input, _list, _built = false;

  function _build() {
    if (_built) return;
    _built = true;

    _overlay = document.createElement('div');
    _overlay.id = 'cmdOverlay';
    _overlay.className = 'cmd-overlay';
    _overlay.addEventListener('click', close);

    _modal = document.createElement('div');
    _modal.className = 'cmd-modal';
    _modal.addEventListener('click', e => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'cmd-header';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'cmd-search-icon';
    searchIcon.textContent = '⌕';

    _input = document.createElement('input');
    _input.type = 'text';
    _input.className = 'cmd-input';
    _input.placeholder = 'Buscar entradas, cards, acciones…';
    _input.setAttribute('autocomplete', 'off');
    _input.setAttribute('spellcheck', 'false');
    _input.addEventListener('input', _onInput);
    _input.addEventListener('keydown', _onKey);

    const kbdHint = document.createElement('kbd');
    kbdHint.className = 'cmd-kbd-hint';
    kbdHint.textContent = 'ESC';
    kbdHint.addEventListener('click', close);

    header.appendChild(searchIcon);
    header.appendChild(_input);
    header.appendChild(kbdHint);

    _list = document.createElement('div');
    _list.className = 'cmd-list';

    _modal.appendChild(header);
    _modal.appendChild(_list);
    _overlay.appendChild(_modal);
    document.body.appendChild(_overlay);
  }

  // ── Open / Close ──────────────────────────────────────────
  function open() {
    _build();
    _open = true;
    _overlay.classList.add('cmd-overlay--open');
    _input.value = '';
    _active = -1;
    _renderItems(ACTIONS);
    setTimeout(() => _input.focus(), 40);
  }

  function close() {
    if (!_open) return;
    _open = false;
    _overlay.classList.remove('cmd-overlay--open');
    _input.value = '';
    _list.innerHTML = '';
    _items = [];
  }

  // ── Input / debounce ─────────────────────────────────────
  function _onInput() {
    clearTimeout(_debounce);
    const q = _input.value.trim();
    if (!q) { _active = -1; _renderItems(ACTIONS); return; }
    _debounce = setTimeout(() => _search(q), 140);
  }

  async function _search(q) {
    const ql = q.toLowerCase();
    const results = [];

    // 1. KB entries via existing API
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      data.forEach(r => results.push({
        id:    'kb:' + r.id,
        label: r.title,
        sub:   [r.category_label, r.topic_label].filter(Boolean).join(' › '),
        icon:  '◈',
        group: 'Páginas',
        run:   () => { if (window._loadEntryById) window._loadEntryById(r.id); },
      }));
    } catch (_) {}

    // 2. Kanban cards via _build_card_index equivalent — we scan live boards from KanbanApp
    try {
      const boards = await fetch('/api/kanban/boards').then(r => r.json());
      for (const b of boards) {
        if (!b.id) continue;
        const board = await fetch(`/api/kanban/boards/${b.id}`).then(r => r.json());
        for (const col of (board.columns || [])) {
          for (const card of (col.cards || [])) {
            if (!card.title) continue;
            if (!card.title.toLowerCase().includes(ql)) continue;
            results.push({
              id:    'card:' + card.id,
              label: card.title,
              sub:   b.name + ' › ' + col.name,
              icon:  '⊞',
              group: 'Tarjetas',
              run:   () => {
                if (window.KanbanApp) window.KanbanApp.showBoard(b.id);
              },
            });
          }
        }
      }
    } catch (_) {}

    // 3. Matching actions
    ACTIONS.forEach(a => {
      if (a.label.toLowerCase().includes(ql)) results.push(a);
    });

    _active = -1;
    _renderItems(results.length ? results : [{
      id: '_empty', label: `Sin resultados para "${q}"`,
      icon: '·', group: null, sub: null, run: null,
    }]);
  }

  // ── Keyboard navigation ───────────────────────────────────
  function _onKey(e) {
    const active = _list.querySelectorAll('.cmd-item[data-idx]');
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _active = Math.min(_active + 1, active.length - 1);
      _highlight(active);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _active = Math.max(_active - 1, 0);
      _highlight(active);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = active[_active];
      if (sel) sel.click();
    }
  }

  function _highlight(active) {
    active.forEach((el, i) => {
      el.classList.toggle('cmd-item--active', i === _active);
      if (i === _active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── Render ────────────────────────────────────────────────
  function _renderItems(items) {
    _items = items;
    _list.innerHTML = '';
    let lastGroup = null;
    let itemIdx = 0;

    items.forEach((item) => {
      if (item.group && item.group !== lastGroup) {
        lastGroup = item.group;
        const sep = document.createElement('div');
        sep.className = 'cmd-group-label';
        sep.textContent = item.group;
        _list.appendChild(sep);
      }

      const el = document.createElement('div');
      el.className = 'cmd-item';
      el.dataset.idx = itemIdx++;

      const iconEl = document.createElement('span');
      iconEl.className = 'cmd-item-icon';
      iconEl.textContent = item.icon || '·';

      const textEl = document.createElement('div');
      textEl.className = 'cmd-item-text';

      const labelEl = document.createElement('span');
      labelEl.className = 'cmd-item-label';
      labelEl.textContent = item.label;

      textEl.appendChild(labelEl);
      if (item.sub) {
        const subEl = document.createElement('span');
        subEl.className = 'cmd-item-sub';
        subEl.textContent = item.sub;
        textEl.appendChild(subEl);
      }

      el.appendChild(iconEl);
      el.appendChild(textEl);

      if (item.shortcut) {
        const sc = document.createElement('kbd');
        sc.className = 'cmd-item-shortcut';
        sc.textContent = item.shortcut;
        el.appendChild(sc);
      }

      if (item.run) {
        el.addEventListener('click', () => { close(); item.run(); });
        el.addEventListener('mouseenter', () => {
          _active = parseInt(el.dataset.idx);
          _highlight(_list.querySelectorAll('.cmd-item[data-idx]'));
        });
      } else {
        el.classList.add('cmd-item--empty');
      }

      _list.appendChild(el);
    });
  }

  // ── Global keyboard shortcut ─────────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      _open ? close() : open();
    }
    if (e.key === 'Escape' && _open) close();
  });

  // Expose for programmatic use
  window.CommandPalette = { open, close };
})();

/* =============================================
   PHASE B — Activity Bar + Space Switcher
   ============================================= */
(function() {
  const SPACES = ['knowledge', 'courses', 'boards', 'teamspace', 'graph'];

  function switchSpace(space) {
    // Show/hide sidebar panels
    SPACES.forEach(s => {
      const panel = document.getElementById('space' + s.charAt(0).toUpperCase() + s.slice(1));
      if (panel) panel.style.display = s === space ? '' : 'none';
    });

    // Always hide ALL main panels first, then selectively show the right one
    const graphView  = document.getElementById('graphView');
    const courseView = document.getElementById('courseView');
    const kanbanArea = document.getElementById('kanbanArea');
    const entryView  = document.getElementById('entryView');
    const entryCover = document.getElementById('entryCover');
    const entryAddCover = document.getElementById('entryAddCover');
    const welcome    = document.getElementById('welcome');

    if (graphView)     graphView.classList.add('hidden');
    if (courseView)    courseView.classList.add('hidden');
    if (kanbanArea)    kanbanArea.classList.add('hidden');
    if (entryView)     entryView.classList.add('hidden');
    if (entryCover)    entryCover.classList.add('hidden');
    if (entryAddCover) entryAddCover.classList.add('hidden');
    if (welcome)       welcome.style.display = 'none';

    if (space === 'graph') {
      if (graphView) graphView.classList.remove('hidden');
      if (typeof renderGraph === 'function') renderGraph();
    } else if (space === 'courses' && _activeCourseSlug) {
      // Active course — course view is shown by loadCourseView, welcome stays hidden
      if (courseView) courseView.classList.remove('hidden');
    } else {
      // knowledge, teamspace, boards, courses-without-active — show welcome unless entry open
      if (!currentEntryId && welcome) welcome.style.display = '';
      if (currentEntryId && entryView) entryView.classList.remove('hidden');
    }

    // Update active state on activity bar buttons
    document.querySelectorAll('.ab-item[data-space]').forEach(btn => {
      btn.classList.toggle('ab-item--active', btn.dataset.space === space);
    });

    // Store current space
    try { sessionStorage.setItem('activeSpace', space); } catch(e) {}
  }

  function init() {
    // Wire space buttons
    document.querySelectorAll('.ab-item[data-space]').forEach(btn => {
      btn.addEventListener('click', () => switchSpace(btn.dataset.space));
    });

    // Brand → navigate home
    const abBrand = document.getElementById('abBrand');
    if (abBrand) {
      abBrand.addEventListener('click', () => {
        const wsHome = document.getElementById('wsHome');
        if (wsHome) wsHome.click();
      });
    }

    // Search icon → Command Palette
    const abSearch = document.getElementById('abSearch');
    if (abSearch) {
      abSearch.addEventListener('click', () => {
        if (window.CommandPalette) window.CommandPalette.open();
      });
    }

    // Theme toggle in sidebar
    const themeSidebar = document.getElementById('themeToggleSidebar');
    const themeMain = document.getElementById('themeToggle');
    if (themeSidebar && themeMain) {
      themeSidebar.addEventListener('click', () => themeMain.click());
    }

    // Courses space
    initCoursesSpace();
    initLessonModal();
    initEditCourseModal();
    initMoveLessonModal();

    // Always start at knowledge on load — restoring graph/courses/etc. causes
    // sidebar+main mismatch because the main panel always starts at Home.
    switchSpace('knowledge');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for use in buildBreadcrumb
  window.switchSpace = switchSpace;
})();

// ── Accent color picker ────────────────────────────────────────────────────
(function initAccentPicker() {
  const ACCENTS = {
    indigo: '#6366f1', orange: '#f97316', yellow: '#eab308',
    cyan: '#06b6d4', pink: '#ec4899', green: '#22c55e', red: '#ef4444',
    'deep-blue': '#1e3a8a', 'deep-purple': '#4c1d95', 'deep-teal': '#134e4a',
    'deep-rose': '#881337', slate: '#334155',
  };

  function applyAccent(name, dot, panel) {
    document.body.dataset.accent = name;
    if (dot) dot.style.background = ACCENTS[name] || ACCENTS.indigo;
    if (panel) panel.querySelectorAll('.ap-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.accent === name);
    });
    try { localStorage.setItem('accentColor', name); } catch(e) {}
  }

  function init() {
    const btn = document.getElementById('accentPickerBtn');
    const panel = document.getElementById('accentPanel');
    const dot = document.getElementById('accentDot');
    if (!btn || !panel) return;

    let current = 'indigo';
    try { current = localStorage.getItem('accentColor') || 'indigo'; } catch(e) {}
    applyAccent(current, dot, panel);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });

    panel.querySelectorAll('.ap-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        applyAccent(swatch.dataset.accent, dot, panel);
        panel.classList.add('hidden');
      });
    });

    document.addEventListener('click', () => panel.classList.add('hidden'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── FASE E: Relations Panel ──────────────────────────────────────────────
const REL_LABELS = {
  related: 'relacionado con', references: 'referencia a',
  implements: 'implementa', belongs_to: 'pertenece a',
  blocks: 'bloquea', derived_from: 'derivado de'
};

async function loadRelations(entryUid) {
  const panel = document.getElementById('relationsPanel');
  const list  = document.getElementById('relList');
  if (!panel || !list) return;
  if (!entryUid) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  let data;
  try { data = await fetch(`/api/relations?uid=${encodeURIComponent(entryUid)}`).then(r => r.json()); }
  catch { list.innerHTML = ''; return; }

  // Merge outgoing + incoming, deduplicate by id
  const seen = new Set();
  const all = [];
  for (const r of [...(data.outgoing||[]), ...(data.incoming||[])]) {
    if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
  }

  if (!all.length) { list.innerHTML = '<span class="rel-empty">Sin relaciones aún.</span>'; return; }

  // Group by rel_type
  const groups = {};
  for (const r of all) {
    (groups[r.rel_type] = groups[r.rel_type] || []).push(r);
  }

  list.innerHTML = '';
  for (const [type, rels] of Object.entries(groups)) {
    const grp = document.createElement('div');
    grp.className = 'rel-group';
    const label = document.createElement('span');
    label.className = 'rel-group-label';
    label.textContent = REL_LABELS[type] || type;
    grp.appendChild(label);
    const chips = document.createElement('div');
    chips.className = 'rel-chips';
    for (const r of rels) {
      const other = r.from_uid === entryUid ? r.to_entity : r.from_entity;
      const chip = document.createElement('div');
      chip.className = 'rel-chip';
      chip.innerHTML = `<span class="rel-chip-title">${escapeHtml(other.title || other.id || '?')}</span><button class="rel-chip-del" data-rel-id="${r.id}" title="Quitar">×</button>`;
      chip.querySelector('.rel-chip-title').addEventListener('click', () => {
        if (other.id) loadEntry(other.id);
      });
      chip.querySelector('.rel-chip-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`/api/relations/${r.id}`, { method: 'DELETE' });
        loadRelations(entryUid);
      });
      chips.appendChild(chip);
    }
    grp.appendChild(chips);
    list.appendChild(grp);
  }
}

function initRelationsPanel() {
  const addBtn     = document.getElementById('relAddBtn');
  const form       = document.getElementById('relAddForm');
  const cancelBtn  = document.getElementById('relCancelBtn');
  const confirmBtn = document.getElementById('relConfirmBtn');
  const input      = document.getElementById('relSearchInput');
  const sugg       = document.getElementById('relSuggestions');
  const typeSel    = document.getElementById('relTypeSel');
  if (!addBtn) return;

  let selectedToUid = null;

  addBtn.addEventListener('click', () => form.classList.toggle('hidden'));
  cancelBtn.addEventListener('click', () => {
    form.classList.add('hidden');
    input.value = ''; selectedToUid = null; sugg.classList.add('hidden');
  });

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    selectedToUid = null;
    if (!q) { sugg.classList.add('hidden'); return; }
    const matches = (_index || []).filter(e => (e.title||'').toLowerCase().includes(q) && e.id !== currentEntryId).slice(0, 8);
    if (!matches.length) { sugg.classList.add('hidden'); return; }
    sugg.innerHTML = matches.map(e => `<div class="rel-sugg-item" data-id="${e.id}">${escapeHtml(e.title||e.id)}<span class="rel-sugg-meta">${escapeHtml((e.category||'')+(e.topic?' / '+e.topic:''))}</span></div>`).join('');
    sugg.classList.remove('hidden');
    sugg.querySelectorAll('.rel-sugg-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = matches.find(e => e.id === item.dataset.id)?.title || '';
        selectedToUid = item.dataset.id;
        sugg.classList.add('hidden');
      });
    });
  });

  document.addEventListener('click', e => {
    if (!sugg.contains(e.target) && e.target !== input) sugg.classList.add('hidden');
  });

  confirmBtn.addEventListener('click', async () => {
    if (!selectedToUid || !currentEntryId) return;
    const rel_type = typeSel.value;
    const res = await fetch('/api/relations', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ from_uid: currentEntryId, to_uid: selectedToUid, rel_type })
    });
    if (res.ok || res.status === 409) {
      form.classList.add('hidden');
      input.value = ''; selectedToUid = null;
      loadRelations(currentEntryId);
    } else {
      showToast('Error al añadir relación', 'error');
    }
  });
}

// ── FASE G: Graph View ────────────────────────────────────────────────────
const GRAPH_REL_COLORS = {
  related: '#6366f1', references: '#06b6d4', implements: '#22c55e',
  belongs_to: '#f97316', blocks: '#ef4444', derived_from: '#a855f7'
};

let _graphRendered = false;

async function renderGraph() {
  const svg       = document.getElementById('graphSvg');
  const linksG    = document.getElementById('graphLinks');
  const nodesG    = document.getElementById('graphNodes');
  const tooltip   = document.getElementById('graphTooltip');
  if (!svg || !linksG || !nodesG) return;

  // Fetch all relations
  let relData;
  try { relData = await fetch('/api/relations').then(r => r.json()); }
  catch { return; }
  const relations = relData.relations || [];

  // Build node + edge sets from _index and relations
  const nodeMap = {};
  for (const e of (_index || [])) {
    nodeMap[e.uid || e.id] = { id: e.uid || e.id, entryId: e.id, title: e.title || e.id, category: e.category || '' };
  }
  // Also add nodes from relations that might not be in _index
  for (const r of relations) {
    if (!nodeMap[r.from_uid] && r.from_entity) nodeMap[r.from_uid] = { id: r.from_uid, entryId: r.from_entity.id, title: r.from_entity.title || r.from_uid, category: '' };
    if (!nodeMap[r.to_uid]   && r.to_entity)   nodeMap[r.to_uid]   = { id: r.to_uid,   entryId: r.to_entity.id,   title: r.to_entity.title   || r.to_uid,   category: '' };
  }

  const nodes = Object.values(nodeMap);
  const edges = relations.map(r => ({ source: r.from_uid, target: r.to_uid, type: r.rel_type, id: r.id }));

  if (!nodes.length) {
    linksG.innerHTML = '';
    nodesG.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="var(--text-faint)" font-size="14">Sin entradas aún</text>';
    return;
  }

  // Simple force layout (no external lib)
  const W = svg.clientWidth || 900;
  const H = svg.clientHeight || 600;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.38;

  // Initialize positions in a circle, cluster by category
  const cats = [...new Set(nodes.map(n => n.category))];
  nodes.forEach((n, i) => {
    const catIdx = cats.indexOf(n.category);
    const angleOffset = (catIdx / cats.length) * Math.PI * 2;
    const angleStep   = (Math.PI * 2) / nodes.length;
    n.x = cx + R * Math.cos(angleOffset + angleStep * i) + (Math.random() - 0.5) * 40;
    n.y = cy + R * Math.sin(angleOffset + angleStep * i) + (Math.random() - 0.5) * 40;
    n.vx = 0; n.vy = 0;
  });

  const idToNode = {};
  nodes.forEach(n => { idToNode[n.id] = n; });

  // Run force simulation
  const ITERS = 120, K = Math.sqrt((W * H) / (nodes.length || 1));
  for (let iter = 0; iter < ITERS; iter++) {
    const cooling = 1 - iter / ITERS;
    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].fx = 0; nodes[i].fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x || 0.01;
        const dy = nodes[i].y - nodes[j].y || 0.01;
        const d2 = dx*dx + dy*dy;
        const d  = Math.sqrt(d2) || 0.1;
        const f  = (K * K) / d;
        nodes[i].fx += (dx / d) * f;
        nodes[i].fy += (dy / d) * f;
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const s = idToNode[e.source], t = idToNode[e.target];
      if (!s || !t) continue;
      const dx = t.x - s.x, dy = t.y - s.y;
      const d  = Math.sqrt(dx*dx + dy*dy) || 0.1;
      const f  = (d * d) / K;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      s.fx += fx;  s.fy += fy;
      t.fx -= fx;  t.fy -= fy;
    }
    // Gravity toward center
    for (const n of nodes) {
      n.fx += (cx - n.x) * 0.01;
      n.fy += (cy - n.y) * 0.01;
    }
    // Apply with cooling
    const speed = Math.min(10, K * 0.15) * cooling;
    for (const n of nodes) {
      const mag = Math.sqrt(n.fx*n.fx + n.fy*n.fy) || 1;
      n.x = Math.max(32, Math.min(W - 32, n.x + (n.fx / mag) * speed));
      n.y = Math.max(32, Math.min(H - 32, n.y + (n.fy / mag) * speed));
    }
  }

  // Render edges
  linksG.innerHTML = '';
  for (const e of edges) {
    const s = idToNode[e.source], t = idToNode[e.target];
    if (!s || !t) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
    line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
    line.setAttribute('stroke', GRAPH_REL_COLORS[e.type] || '#6366f1');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-opacity', '0.6');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    linksG.appendChild(line);
  }

  // Render nodes
  nodesG.innerHTML = '';
  const connectedIds = new Set(edges.flatMap(e => [e.source, e.target]));
  for (const n of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'graph-node');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    g.style.cursor = 'pointer';

    const isConnected = connectedIds.has(n.id);
    const r = isConnected ? 8 : 5;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', isConnected ? 'var(--accent)' : 'var(--text-faint)');
    circle.setAttribute('stroke', 'var(--bg-elevated)');
    circle.setAttribute('stroke-width', '2');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', r + 4);
    label.setAttribute('y', 4);
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', 'var(--text)');
    label.setAttribute('font-family', 'var(--font-ui)');
    label.textContent = n.title.length > 22 ? n.title.slice(0, 20) + '…' : n.title;

    g.appendChild(circle);
    g.appendChild(label);

    // Tooltip + click
    g.addEventListener('mouseenter', (e) => {
      tooltip.textContent = n.title + (n.category ? ` · ${n.category}` : '');
      tooltip.classList.remove('hidden');
      tooltip.style.left = (e.offsetX + 12) + 'px';
      tooltip.style.top  = (e.offsetY - 8) + 'px';
    });
    g.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.offsetX + 12) + 'px';
      tooltip.style.top  = (e.offsetY - 8) + 'px';
    });
    g.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
    g.addEventListener('click', () => {
      if (n.entryId) {
        const saved = sessionStorage.getItem('activeSpace');
        switchSpace('knowledge');
        loadEntry(n.entryId);
      }
    });

    // Drag
    let dragging = false, ox = 0, oy = 0;
    g.addEventListener('mousedown', (ev) => {
      dragging = true; ox = ev.clientX - n.x; oy = ev.clientY - n.y;
      ev.preventDefault();
    });
    svg.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      n.x = ev.clientX - ox; n.y = ev.clientY - oy;
      g.setAttribute('transform', `translate(${n.x},${n.y})`);
      // Update connected edges
      linksG.querySelectorAll('line').forEach((line, i) => {
        const e = edges[i];
        if (!e) return;
        const s2 = idToNode[e.source], t2 = idToNode[e.target];
        if (s2 && t2) {
          line.setAttribute('x1', s2.x); line.setAttribute('y1', s2.y);
          line.setAttribute('x2', t2.x); line.setAttribute('y2', t2.y);
        }
      });
    });
    svg.addEventListener('mouseup', () => { dragging = false; });

    nodesG.appendChild(g);
  }

  _graphRendered = true;
}

// ══════════════════════════════════════════════════════════════════════════
// COURSES SPACE — entities, cards, detail view, course view
// ══════════════════════════════════════════════════════════════════════════

const LEVEL_LABELS = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };

// ── Sidebar: course cards list ────────────────────────────────────────────
async function renderCourseList() {
  const list = $('courseList');
  if (!list) return;
  let allCourses;
  try { allCourses = await fetch('/api/courses?archived=1').then(r => r.json()); }
  catch { return; }

  const active   = allCourses.filter(c => !c.archived);
  const archived = allCourses.filter(c => c.archived);

  // Render active courses
  list.innerHTML = '';
  if (!active.length) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'No hay cursos aún. Pulsa + para crear uno.';
    list.appendChild(empty);
  } else {
    active.forEach(c => {
      const pct = c.entry_count ? Math.round((c.done_count / c.entry_count) * 100) : 0;
      const isActive = c.id === _activeCourseSlug;
      const item = document.createElement('div');
      item.className = 'course-list-item' + (isActive ? ' active' : '');
      item.dataset.courseId = c.id;
      item.innerHTML = `
        <div class="course-list-row">
          <span class="course-list-name">${escapeHtml(c.label)}</span>
          ${isActive ? `<button class="course-list-gear" title="Acciones">⚙</button>` : ''}
        </div>
        <div class="course-list-bar"><div class="course-list-bar-fill" style="width:${pct}%"></div></div>`;
      item.addEventListener('click', e => {
        if (e.target.closest('.course-list-gear')) return;
        setActiveCourse(c.id);
      });
      if (isActive) {
        item.querySelector('.course-list-gear').addEventListener('click', async e => {
          e.stopPropagation();
          const anchor = e.currentTarget; // save before any await
          let courses2;
          try { courses2 = await fetch('/api/courses').then(r => r.json()); } catch { courses2 = []; }
          const entity = courses2.find(x => x.id === c.id) || c;
          _openCourseGearMenu(anchor, c.id, entity);
        });
      }
      list.appendChild(item);
    });
  }

  // Render archived section (outside main scroll)
  const archivedSection = $('courseArchivedSection');
  const archivedList    = $('courseArchivedList');
  const archivedToggle  = $('courseArchivedToggle');
  if (!archivedSection) return;

  if (!archived.length) {
    archivedSection.style.display = 'none';
    return;
  }
  archivedSection.style.display = '';
  archivedToggle.textContent = `▸ Archivados (${archived.length})`;

  // Rebuild archived list when visible
  const rebuildArchived = () => {
    archivedList.innerHTML = '';
    archived.forEach(c => {
      const item = document.createElement('div');
      item.className = 'course-list-item archived' + (c.id === _activeCourseSlug ? ' active' : '');
      item.dataset.courseId = c.id;
      item.innerHTML = `<span class="course-list-name">${escapeHtml(c.label)}</span>`;
      item.addEventListener('click', () => setActiveCourse(c.id));
      archivedList.appendChild(item);
    });
  };

  // Wire toggle only once
  if (!archivedToggle.dataset.wired) {
    archivedToggle.dataset.wired = '1';
    archivedToggle.addEventListener('click', () => {
      const open = archivedList.style.display !== 'none';
      archivedList.style.display = open ? 'none' : '';
      archivedToggle.textContent = `${open ? '▸' : '▾'} Archivados (${archived.length})`;
      if (!open) rebuildArchived();
    });
  }
}

// ── Open course detail in sidebar + load course view in main ─────────────
async function openCourseDetail(courseSlug) {
  _activeCourseSlug = courseSlug;

  const detailPanel = $('courseDetail');
  if (detailPanel) detailPanel.style.display = '';

  let courses;
  try { courses = await fetch('/api/courses').then(r => r.json()); }
  catch { courses = []; }
  const course = courses.find(c => c.id === courseSlug) || { label: courseSlug };

  // Re-render course list so the active item gets the ⚙ gear
  await renderCourseList();

  renderCoursesTree(_coursesTreeData, courseSlug);
  loadCourseView(courseSlug, course);
}

// ── Gear menu for active course (shown inside courseList item) ────────────
let _courseGearMenuEl = null;
function _openCourseGearMenu(anchor, courseSlug, course) {
  _courseGearMenuEl?.remove();
  const menu = document.createElement('div');
  menu.className = 'course-actions-menu';
  menu.innerHTML = `
    <button data-action="edit">Editar curso</button>
    <button data-action="archive">${course.archived ? 'Desarchivar' : 'Archivar'}</button>
    <button data-action="duplicate">Duplicar</button>
    <button data-action="delete" class="danger">Eliminar curso</button>`;
  const rect = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left - 130}px;width:168px;z-index:9999`;
  document.body.appendChild(menu);
  _courseGearMenuEl = menu;
  menu.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.remove(); _courseGearMenuEl = null;
      handleCourseAction(btn.dataset.action, courseSlug, course);
    });
  });
  const onOutside = e => {
    if (!menu.contains(e.target)) { menu.remove(); _courseGearMenuEl = null; document.removeEventListener('mousedown', onOutside); }
  };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

// ── Deactivate course detail ──────────────────────────────────────────────
function closeCourseDetail() {
  _activeCourseSlug = null;
  const detailPanel = $('courseDetail');
  if (detailPanel) detailPanel.style.display = 'none';

  // Remove active marker from course list
  document.querySelectorAll('.course-list-item').forEach(el => el.classList.remove('active'));

  const cv = $('courseView');
  const welcome = $('welcome');
  if (cv) cv.classList.add('hidden');
  if (welcome) welcome.style.display = '';
}

// ── Main: Course View ─────────────────────────────────────────────────────
async function loadCourseView(courseSlug, courseEntity) {
  const cv = $('courseView');
  const welcome = $('welcome');
  const entryView = $('entryView');
  const entryCover = $('entryCover');
  if (!cv) return;

  // Hide other main panels
  if (welcome) welcome.style.display = 'none';
  if (entryView) entryView.classList.add('hidden');
  if (entryCover) entryCover.classList.add('hidden');
  cv.classList.remove('hidden');

  // Populate header
  $('cvTitle').textContent = courseEntity.label || courseSlug;
  $('cvDesc').textContent  = courseEntity.description || '';

  // Cover
  const cover = $('cvCover');
  if (courseEntity.cover) {
    cover.style.backgroundImage = `url(${courseEntity.cover})`;
    cover.style.display = '';
  } else {
    cover.style.display = 'none';
  }

  // Badges
  const badges = $('cvBadges');
  badges.innerHTML = '';
  if (courseEntity.level) {
    const b = document.createElement('span');
    b.className = 'cv-badge';
    b.textContent = LEVEL_LABELS[courseEntity.level] || courseEntity.level;
    badges.appendChild(b);
  }
  const countB = document.createElement('span');
  countB.className = 'cv-badge cv-badge--muted';
  countB.textContent = `${courseEntity.entry_count || 0} lecciones`;
  badges.appendChild(countB);

  // Load stats for progress bar
  let stats;
  try { stats = await fetch(`/api/courses/${courseSlug}/stats`).then(r => r.json()); }
  catch { stats = { pct: 0, done: 0, total: 0 }; }

  $('cvProgressBar').style.width = stats.pct + '%';
  $('cvProgressLabel').textContent = `${stats.done} / ${stats.total} completadas · ${stats.pct}%`;

  // Wire tabs
  const tabs = cv.querySelectorAll('.cv-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('cv-tab--active'));
      tab.classList.add('cv-tab--active');
      renderCourseTab(tab.dataset.tab, courseSlug, stats);
    });
  });

  // Wire "+ Lección" button in course view header
  const cvNewLessonBtn = $('cvNewLessonBtn');
  if (cvNewLessonBtn) {
    cvNewLessonBtn.onclick = () => openNewLessonModal(courseSlug);
  }

  // Default tab
  renderCourseTab('roadmap', courseSlug, stats);
}

function _statusIcon(s) {
  return s === 'completado' ? '✓' : s === 'en_progreso' ? '→' : '○';
}
function _nextStatus(s) {
  return s === 'completado' ? 'pendiente' : s === 'en_progreso' ? 'completado' : 'en_progreso';
}

function renderCourseTab(tab, courseSlug, stats) {
  const body = $('cvBody');

  if (tab === 'roadmap') {
    const tree    = _coursesTreeData[courseSlug];
    const modEntries = Object.entries(tree?.modules || {});
    if (!modEntries.length) {
      body.innerHTML = `
        <div class="cv-empty-state">
          <p class="cv-empty">No hay lecciones todavía.</p>
          <button class="btn-primary" id="cvEmptyNewLesson">+ Crear primera lección</button>
        </div>`;
      $('cvEmptyNewLesson')?.addEventListener('click', () => openNewLessonModal(courseSlug));
      return;
    }
    body.innerHTML = '';
    modEntries.forEach(([modSlug, mod], mi) => {
      const section = document.createElement('div');
      section.className = 'cv-roadmap-section';
      section.dataset.modSlug = modSlug;
      section.innerHTML = `<div class="cv-roadmap-module">
        <span class="cv-roadmap-mod-num">M${mi + 1}</span>
        <span class="cv-roadmap-mod-label">${escapeHtml(mod.label)}</span>
        <span class="cv-roadmap-mod-count">${mod.entries.length} lecciones</span>
        <button class="cv-roadmap-add-lesson" data-module="${escapeHtml(mod.label)}" title="Nueva lección">+</button>
      </div>`;
      const entries = document.createElement('div');
      entries.className = 'cv-roadmap-entries';
      (mod.entries || []).forEach((e, ei) => {
        const row = document.createElement('div');
        row.className = `cv-roadmap-entry cv-roadmap-entry--${e.status || 'pendiente'}`;
        row.dataset.entryId = e.id;
        row.innerHTML = `
          <button class="cv-status-btn" title="Cambiar estado">${_statusIcon(e.status)}</button>
          <span class="cv-roadmap-entry-title">${escapeHtml(e.title)}</span>
          <div class="cv-lesson-actions">
            <button class="cv-lesson-up" title="Subir" ${ei === 0 ? 'disabled' : ''}>↑</button>
            <button class="cv-lesson-down" title="Bajar" ${ei === (mod.entries.length - 1) ? 'disabled' : ''}>↓</button>
            <button class="cv-lesson-menu-btn" title="Más acciones">…</button>
          </div>`;
        // Open entry on title click
        row.querySelector('.cv-roadmap-entry-title').addEventListener('click', () => { switchSpace('knowledge'); loadEntry(e.id); });
        // Cycle status without opening entry
        row.querySelector('.cv-status-btn').addEventListener('click', async ev => {
          ev.stopPropagation();
          const next = _nextStatus(e.status || 'pendiente');
          const r = await fetch(`/api/entry/${e.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next }),
          });
          if (r.ok) {
            e.status = next;
            row.className = `cv-roadmap-entry cv-roadmap-entry--${next}`;
            row.querySelector('.cv-status-btn').textContent = _statusIcon(next);
            _refreshProgressBar(courseSlug);
          }
        });
        // Reorder up
        row.querySelector('.cv-lesson-up').addEventListener('click', async ev => {
          ev.stopPropagation();
          await _reorderLesson(courseSlug, mod, ei, -1);
          const activeTab = $('courseView')?.querySelector('.cv-tab--active')?.dataset.tab || 'roadmap';
          await _reloadCourseView(courseSlug, activeTab);
        });
        // Reorder down
        row.querySelector('.cv-lesson-down').addEventListener('click', async ev => {
          ev.stopPropagation();
          await _reorderLesson(courseSlug, mod, ei, +1);
          const activeTab = $('courseView')?.querySelector('.cv-tab--active')?.dataset.tab || 'roadmap';
          await _reloadCourseView(courseSlug, activeTab);
        });
        // … menu
        row.querySelector('.cv-lesson-menu-btn').addEventListener('click', ev => {
          ev.stopPropagation();
          _showLessonMenu(ev.currentTarget, e, courseSlug, mod.label);
        });
        entries.appendChild(row);
      });
      section.appendChild(entries);
      body.appendChild(section);
    });
    body.querySelectorAll('.cv-roadmap-add-lesson').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        openNewLessonModal(courseSlug, btn.dataset.module);
      });
    });

  } else if (tab === 'modules') {
    const tree = _coursesTreeData[courseSlug];
    const modEntries = Object.entries(tree?.modules || {});
    if (!modEntries.length) {
      body.innerHTML = `
        <div class="cv-empty-state">
          <p class="cv-empty">Sin módulos todavía.</p>
          <button class="btn-primary" id="cvModsNewLesson">+ Crear primera lección</button>
        </div>`;
      $('cvModsNewLesson')?.addEventListener('click', () => openNewLessonModal(courseSlug));
      return;
    }
    body.innerHTML = '';
    modEntries.forEach(([modSlug, mod]) => {
      const total = mod.entries.length;
      const done  = mod.entries.filter(e => e.status === 'completado').length;
      const pct   = total ? Math.round(done / total * 100) : 0;
      const card  = document.createElement('div');
      card.className = 'cv-module-card';
      card.innerHTML = `
        <div class="cv-module-card-header">
          <span class="cv-module-card-name">${escapeHtml(mod.label)}</span>
          <div class="cv-module-card-actions">
            <button class="cv-mod-add-btn" data-module="${escapeHtml(mod.label)}" title="Nueva lección">+ lección</button>
            <button class="cv-mod-rename-btn" data-slug="${escapeHtml(modSlug)}" data-label="${escapeHtml(mod.label)}" title="Renombrar módulo">✎</button>
            <button class="cv-mod-delete-btn danger" data-slug="${escapeHtml(modSlug)}" data-label="${escapeHtml(mod.label)}" title="Eliminar módulo">🗑</button>
          </div>
        </div>
        <div class="cv-module-card-bar-wrap">
          <div class="cv-module-card-bar"><div class="cv-module-card-bar-fill" style="width:${pct}%"></div></div>
          <span class="cv-module-card-pct">${done}/${total} · ${pct}%</span>
        </div>`;
      // New lesson
      card.querySelector('.cv-mod-add-btn').addEventListener('click', () => {
        openNewLessonModal(courseSlug, mod.label);
      });
      // Rename module — custom modal
      card.querySelector('.cv-mod-rename-btn').addEventListener('click', () => {
        openRenameModuleModal(mod.label, async newName => {
          const r = await fetch(`/api/courses/${courseSlug}/module/${modSlug}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newName }),
          });
          if (r.ok) {
            showToast(`Módulo renombrado a "${newName}"`);
            await _reloadCourseView(courseSlug, 'modules');
          } else {
            showToast('Error al renombrar', 'error');
          }
        });
      });
      // Delete module
      card.querySelector('.cv-mod-delete-btn').addEventListener('click', async () => {
        const ok = await showConfirm(
          `Eliminar módulo "${mod.label}"`,
          `¿Eliminar este módulo y todas sus ${total} lecciones? No se puede deshacer.`
        );
        if (!ok) return;
        const r = await fetch(`/api/courses/${courseSlug}/module/${modSlug}`, { method: 'DELETE' });
        if (r.ok) {
          showToast(`Módulo "${mod.label}" eliminado`);
          await _reloadCourseView(courseSlug, 'modules');
        } else {
          showToast('Error al eliminar', 'error');
        }
      });
      body.appendChild(card);
    });

  } else if (tab === 'stats') {
    body.innerHTML = `
      <div class="cv-stats-grid">
        <div class="cv-stat-card"><div class="cv-stat-num">${stats.total}</div><div class="cv-stat-lbl">Lecciones</div></div>
        <div class="cv-stat-card"><div class="cv-stat-num">${stats.done}</div><div class="cv-stat-lbl">Completadas</div></div>
        <div class="cv-stat-card"><div class="cv-stat-num">${stats.pending}</div><div class="cv-stat-lbl">Pendientes</div></div>
        <div class="cv-stat-card"><div class="cv-stat-num">${stats.pct}%</div><div class="cv-stat-lbl">Progreso</div></div>
      </div>
      <div class="cv-stats-modules">
        ${(stats.modules || []).map(m => `
          <div class="cv-stats-mod-row">
            <span class="cv-stats-mod-label">${escapeHtml(m.label)}</span>
            <div class="cv-stats-mod-bar">
              <div class="cv-stats-mod-fill" style="width:${m.total ? Math.round(m.done/m.total*100) : 0}%"></div>
            </div>
            <span class="cv-stats-mod-pct">${m.done}/${m.total}</span>
          </div>`).join('')}
      </div>`;
  }
}

// ── Course view helpers ───────────────────────────────────────────────────
async function _refreshProgressBar(courseSlug) {
  try {
    const stats = await fetch(`/api/courses/${courseSlug}/stats`).then(r => r.json());
    const bar   = $('cvProgressBar');
    const lbl   = $('cvProgressLabel');
    if (bar) bar.style.width = stats.pct + '%';
    if (lbl) lbl.textContent = `${stats.done} / ${stats.total} completadas · ${stats.pct}%`;
    return stats;
  } catch { return null; }
}

async function _reloadCourseView(courseSlug, tab) {
  await loadTree();
  renderCoursesTree(_coursesTreeData, courseSlug);
  const stats = await _refreshProgressBar(courseSlug) || { pct: 0, done: 0, total: 0, modules: [] };
  // Update active tab indicator
  const cv = $('courseView');
  if (cv) {
    cv.querySelectorAll('.cv-tab').forEach(t => t.classList.toggle('cv-tab--active', t.dataset.tab === tab));
  }
  renderCourseTab(tab, courseSlug, stats);
}

async function _reorderLesson(courseSlug, mod, index, direction) {
  const entries = mod.entries;
  const swapIdx = index + direction;
  if (swapIdx < 0 || swapIdx >= entries.length) return;
  // Normalize all entries to sequential order values first.
  // Entries may all be 0 (default), so swapping raw values would be a no-op.
  const orders = entries.map((_, i) => i);
  // Swap positions
  [orders[index], orders[swapIdx]] = [orders[swapIdx], orders[index]];
  await Promise.all([
    fetch(`/api/entry/${entries[index].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: orders[index] }),
    }),
    fetch(`/api/entry/${entries[swapIdx].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: orders[swapIdx] }),
    }),
  ]);
}

let _lessonMenuCleanup = null;
function _showLessonMenu(anchor, entry, courseSlug, modLabel) {
  // Remove any existing menu
  document.querySelector('.cv-lesson-dropdown')?.remove();
  if (_lessonMenuCleanup) { _lessonMenuCleanup(); _lessonMenuCleanup = null; }

  const menu = document.createElement('div');
  menu.className = 'cv-lesson-dropdown';
  menu.innerHTML = `
    <button data-a="edit">Editar</button>
    <button data-a="status-p">Marcar pendiente</button>
    <button data-a="status-i">Marcar en progreso</button>
    <button data-a="status-c">Marcar completado</button>
    <button data-a="move">Mover a…</button>
    <button data-a="delete" class="danger">Eliminar</button>`;

  // Position relative to anchor
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top  = rect.bottom + 4 + 'px';
  menu.style.left = rect.left - 100 + 'px';
  document.body.appendChild(menu);

  const close = () => { menu.remove(); _lessonMenuCleanup = null; };
  _lessonMenuCleanup = close;

  menu.querySelectorAll('button[data-a]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      close();
      const action = btn.dataset.a;
      if (action === 'edit') {
        switchSpace('knowledge');
        loadEntry(entry.id);
      } else if (action.startsWith('status-')) {
        const map = { 'status-p': 'pendiente', 'status-i': 'en_progreso', 'status-c': 'completado' };
        const newStatus = map[action];
        await fetch(`/api/entry/${entry.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        entry.status = newStatus;
        await _reloadCourseView(courseSlug, 'roadmap');
      } else if (action === 'move') {
        openMoveLessonModal(entry.id, entry.title);
      } else if (action === 'delete') {
        const ok = await showConfirm(`Eliminar "${entry.title}"`, '¿Eliminar esta lección? No se puede deshacer.');
        if (!ok) return;
        await fetch(`/api/entry/${entry.id}`, { method: 'DELETE' });
        showToast(`"${entry.title}" eliminada`);
        await _reloadCourseView(courseSlug, 'roadmap');
      }
    });
  });

  // Close on outside click — use mousedown so it fires before the button's click
  const onOutside = e => {
    if (!menu.contains(e.target)) { close(); document.removeEventListener('mousedown', onOutside); }
  };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

// ── Course actions (⚙ menu) ───────────────────────────────────────────────
async function handleCourseAction(action, courseSlug, courseEntity) {
  if (action === 'edit') {
    openEditCourseModal(courseSlug, courseEntity);
  } else if (action === 'archive') {
    const archived = !courseEntity.archived;
    await fetch(`/api/courses/${courseSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    showToast(archived ? `"${courseEntity.label}" archivado` : `"${courseEntity.label}" desarchivado`);
    if (archived) { setActiveCourse(null); }
    await renderCourseList();
  } else if (action === 'duplicate') {
    const res = await fetch(`/api/courses/${courseSlug}/duplicate`, { method: 'POST' });
    if (res.ok) {
      const newC = await res.json();
      showToast(`Curso duplicado: "${newC.label}"`);
      await renderCourseList();
    } else {
      showToast('Error al duplicar', 'error');
    }
  } else if (action === 'delete') {
    const ok = await showConfirm(
      `Eliminar "${courseEntity.label}"`,
      `¿Eliminar este curso y TODAS sus lecciones? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    const res = await fetch(`/api/courses/${courseSlug}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Curso "${courseEntity.label}" eliminado`);
      setActiveCourse(null);
      await loadTree();
      await renderCourseList();
    } else {
      showToast('Error al eliminar', 'error');
    }
  }
}

function openRenameModuleModal(currentLabel, onConfirm) {
  const overlay = $('renameModuleOverlay');
  const input   = $('renameModuleInput');
  if (!overlay || !input) return;
  input.value = currentLabel;
  overlay.classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const close = () => overlay.classList.add('hidden');
  const confirm = async () => {
    const val = input.value.trim();
    if (!val || val === currentLabel) { close(); return; }
    close();
    await onConfirm(val);
  };
  $('renameModuleClose').onclick   = close;
  $('renameModuleCancel').onclick  = close;
  $('renameModuleConfirm').onclick = confirm;
  input.onkeydown = e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); };
}

let _editingCourseSlug = null;
function openEditCourseModal(courseSlug, courseEntity) {
  _editingCourseSlug = courseSlug;
  const overlay = $('editCourseOverlay');
  if (!overlay) return;
  $('editCourseLabel').value = courseEntity.label || '';
  $('editCourseDesc').value  = courseEntity.description || '';
  $('editCourseLevel').value = courseEntity.level || '';
  overlay.classList.remove('hidden');
  setTimeout(() => $('editCourseLabel').focus(), 60);
}

function initEditCourseModal() {
  const overlay   = $('editCourseOverlay');
  const closeBtn  = $('editCourseClose');
  const cancelBtn = $('editCourseCancelBtn');
  const saveBtn   = $('editCourseSaveBtn');
  if (!overlay) return;
  const _close = () => { overlay.classList.add('hidden'); _editingCourseSlug = null; };
  if (closeBtn)  closeBtn.addEventListener('click', _close);
  if (cancelBtn) cancelBtn.addEventListener('click', _close);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!_editingCourseSlug) return;
      const label = $('editCourseLabel').value.trim();
      if (!label) { showToast('El nombre es obligatorio', 'error'); return; }
      const res = await fetch(`/api/courses/${_editingCourseSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          description: $('editCourseDesc').value.trim(),
          level: $('editCourseLevel').value,
        }),
      });
      if (res.ok) {
        _close();
        showToast('Curso actualizado');
        await loadTree();
        await renderCourseList();
        // Refresh course view if open
        if (_activeCourseSlug === _editingCourseSlug || _activeCourseSlug) {
          const slug = _activeCourseSlug;
          const updated = await res.json().catch(() => ({ label }));
          $('cvTitle').textContent = updated.label || label;
          $('cvDesc').textContent  = updated.description || '';
          // Re-render sidebar header
          await openCourseDetail(slug);
        }
      } else {
        showToast('Error al guardar', 'error');
      }
    });
  }
}

// ── Move lesson modal ─────────────────────────────────────────────────────
let _movingEntryId = null;
async function openMoveLessonModal(entryId, entryTitle) {
  _movingEntryId = entryId;
  const overlay = $('moveLessonOverlay');
  if (!overlay) return;
  $('moveLessonTitle').value  = entryTitle;
  $('moveLessonModule').value = '';
  // Populate course selector
  const sel = $('moveLessonCourse');
  sel.innerHTML = '';
  try {
    const courses = await fetch('/api/courses').then(r => r.json());
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.label; opt.textContent = c.label;
      sel.appendChild(opt);
    });
  } catch {}
  overlay.classList.remove('hidden');
}

function initMoveLessonModal() {
  const overlay   = $('moveLessonOverlay');
  const closeBtn  = $('moveLessonClose');
  const cancelBtn = $('moveLessonCancelBtn');
  const confirmBtn = $('moveLessonConfirmBtn');
  if (!overlay) return;
  const _close = () => { overlay.classList.add('hidden'); _movingEntryId = null; };
  if (closeBtn)   closeBtn.addEventListener('click', _close);
  if (cancelBtn)  cancelBtn.addEventListener('click', _close);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!_movingEntryId) return;
      const course = $('moveLessonCourse').value.trim();
      const module = $('moveLessonModule').value.trim();
      if (!course || !module) { showToast('Completa todos los campos', 'error'); return; }
      const res = await fetch(`/api/entry/${_movingEntryId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course, module }),
      });
      if (res.ok) {
        _close();
        showToast('Lección movida');
        await loadTree();
        if (_activeCourseSlug) renderCoursesTree(_coursesTreeData, _activeCourseSlug);
        if (_activeCourseSlug) {
          const cv = $('courseView');
          if (cv && !cv.classList.contains('hidden')) {
            const activeTab = cv.querySelector('.cv-tab--active')?.dataset.tab || 'roadmap';
            let stats = { pct: 0, done: 0, total: 0, modules: [] };
            try { stats = await fetch(`/api/courses/${_activeCourseSlug}/stats`).then(r => r.json()); } catch {}
            $('cvProgressBar').style.width = stats.pct + '%';
            $('cvProgressLabel').textContent = `${stats.done} / ${stats.total} completadas · ${stats.pct}%`;
            renderCourseTab(activeTab, _activeCourseSlug, stats);
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Error al mover', 'error');
      }
    });
  }
}

// ── Contextual "+" topbar button ─────────────────────────────────────────
function handleNewEntryTopbar() {
  const space = sessionStorage.getItem('activeSpace') || 'knowledge';
  if (space === 'courses') {
    const overlay = $('newCourseOverlay');
    if (overlay) overlay.classList.remove('hidden');
  } else if (space === 'boards') {
    if (window.KanbanApp && KanbanApp.showCreateBoard) KanbanApp.showCreateBoard();
  } else if (space === 'teamspace') {
    if (window.openNewTeamspaceModal) openNewTeamspaceModal();
  } else {
    openNewModal();
  }
}

// ── Single source of truth for active course ─────────────────────────────
function setActiveCourse(slug) {
  _activeCourseSlug = slug;
  if (slug) {
    openCourseDetail(slug);
  } else {
    closeCourseDetail();
  }
}

// ── Lesson modal ──────────────────────────────────────────────────────────
function openNewLessonModal(courseSlug, prefillModule) {
  const overlay = $('newLessonOverlay');
  if (!overlay) return;

  // Context bar — show course label (not an input)
  const ctx = $('lessonCourseCtx');
  if (ctx) {
    // Try to get label from cached tree, fallback to slug
    const courseData = _coursesTreeData[courseSlug];
    ctx.textContent = courseData?.label || courseSlug;
    ctx.dataset.courseSlug = courseSlug;
  }

  const moduleInput = $('lessonModuleField');
  const moduleDropdown = $('lessonModuleDropdown');

  if (moduleInput) {
    // Clear previous oninput handler
    moduleInput.oninput = null;
    moduleInput.removeAttribute('readonly');
    moduleInput.classList.remove('locked');

    if (prefillModule) {
      // Context B: module is fixed — lock the field
      moduleInput.value = prefillModule;
      moduleInput.setAttribute('readonly', '');
      moduleInput.classList.add('locked');
      if (moduleDropdown) moduleDropdown.classList.add('hidden');
    } else {
      // Context A: module is free — dropdown only on explicit user interaction
      moduleInput.value = '';
      if (moduleDropdown) moduleDropdown.classList.add('hidden');
      moduleInput.oninput = () => _populateLessonModuleDropdown(courseSlug, moduleInput.value);
    }
  }

  if ($('lessonTitleField')) $('lessonTitleField').value = '';
  if ($('lessonContentField')) $('lessonContentField').value = '';
  overlay.classList.remove('hidden');
  // Title always gets initial focus — regardless of context
  setTimeout(() => $('lessonTitleField')?.focus(), 60);
}

function _populateLessonModuleDropdown(courseSlug, filter) {
  const dropdown = $('lessonModuleDropdown');
  const moduleInput = $('lessonModuleField');
  if (!dropdown || moduleInput?.hasAttribute('readonly')) return;

  const courseTree = _coursesTreeData[courseSlug];
  const modMap = courseTree?.modules || {};
  const f = filter.trim().toLowerCase();
  const matches = Object.entries(modMap)
    .map(([, mod]) => mod.label || '')
    .filter(label => label && (!f || label.toLowerCase().includes(f)));

  dropdown.innerHTML = '';

  if (matches.length) {
    matches.forEach(label => {
      const opt = document.createElement('div');
      opt.className = 'smart-select-option';
      opt.textContent = label;
      opt.addEventListener('click', () => {
        if (moduleInput) moduleInput.value = label;
        dropdown.classList.add('hidden');
      });
      dropdown.appendChild(opt);
    });
  }

  // "Crear módulo X" option when typed text doesn't match exactly
  const trimmed = filter.trim();
  const exactMatch = matches.some(l => l.toLowerCase() === trimmed.toLowerCase());
  if (trimmed && !exactMatch) {
    const newOpt = document.createElement('div');
    newOpt.className = 'smart-select-option smart-select-option--create';
    newOpt.textContent = `+ Crear módulo "${trimmed}"`;
    newOpt.addEventListener('click', () => {
      if (moduleInput) moduleInput.value = trimmed;
      dropdown.classList.add('hidden');
    });
    dropdown.appendChild(newOpt);
  }

  if (dropdown.children.length) {
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }

  // Close dropdown on outside click
  const closeOnOutside = e => {
    if (!dropdown.contains(e.target) && e.target !== moduleInput) {
      dropdown.classList.add('hidden');
      document.removeEventListener('click', closeOnOutside);
    }
  };
  document.addEventListener('click', closeOnOutside);
}

function initLessonModal() {
  const overlay   = $('newLessonOverlay');
  const closeBtn  = $('newLessonClose');
  const cancelBtn = $('newLessonCancelBtn');
  const createBtn = $('newLessonCreateBtn');
  if (!overlay) return;

  const _close = () => overlay.classList.add('hidden');
  if (closeBtn)  closeBtn.addEventListener('click', _close);
  if (cancelBtn) cancelBtn.addEventListener('click', _close);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const courseSlug  = $('lessonCourseCtx')?.dataset.courseSlug?.trim();
      const courseLabel = $('lessonCourseCtx')?.textContent?.trim() || courseSlug;
      const module      = ($('lessonModuleField') || {}).value?.trim();
      const title       = ($('lessonTitleField') || {}).value?.trim();
      const content     = ($('lessonContentField') || {}).value?.trim() || '---';
      if (!courseSlug || !module || !title) {
        showToast('Completa los campos obligatorios', 'error'); return;
      }
      const res = await fetch('/api/courses/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: courseLabel, module, title, raw_text: content }),
      });
      if (res.ok) {
        _close();
        showToast(`Lección "${title}" creada`);
        await loadTree();
        renderCoursesTree(_coursesTreeData, courseSlug);
        // Refresh course view if currently open
        if (_activeCourseSlug === courseSlug) {
          const cv = $('courseView');
          if (cv && !cv.classList.contains('hidden')) {
            const activeTab = cv.querySelector('.cv-tab--active')?.dataset.tab || 'roadmap';
            let stats = { pct: 0, done: 0, total: 0, modules: [] };
            try { stats = await fetch(`/api/courses/${courseSlug}/stats`).then(r => r.json()); } catch {}
            $('cvProgressBar').style.width = stats.pct + '%';
            $('cvProgressLabel').textContent = `${stats.done} / ${stats.total} completadas · ${stats.pct}%`;
            renderCourseTab(activeTab, courseSlug, stats);
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Error al crear la lección', 'error');
      }
    });
  }
}

// ── New course modal ──────────────────────────────────────────────────────
function initCoursesSpace() {
  const newBtn    = $('newCourseBtn');
  const overlay   = $('newCourseOverlay');
  const closeBtn  = $('newCourseClose');
  const cancelBtn = $('newCourseCancelBtn');
  const createBtn = $('newCourseCreateBtn');
  if (newBtn)    newBtn.addEventListener('click', () => {
    overlay && overlay.classList.remove('hidden');
  });
  if (closeBtn)  closeBtn.addEventListener('click', () => overlay && overlay.classList.add('hidden'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => overlay && overlay.classList.add('hidden'));

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const label = ($('newCourseLabel') || {}).value?.trim();
      if (!label) { showToast('El nombre es obligatorio', 'error'); return; }
      const body = {
        label,
        description: ($('newCourseDesc') || {}).value?.trim() || '',
        level:       ($('newCourseLevel') || {}).value || '',
      };
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        overlay.classList.add('hidden');
        if ($('newCourseLabel')) $('newCourseLabel').value = '';
        if ($('newCourseDesc'))  $('newCourseDesc').value  = '';
        await renderCourseList();
        showToast(`Curso "${label}" creado`);
      } else if (res.status === 409) {
        showToast('Ya existe un curso con ese nombre', 'error');
      } else {
        showToast('Error al crear el curso', 'error');
      }
    });
  }
}

// ── Sidebar expand/collapse toggle ───────────────────────────────────────
(function initSidebarToggle() {
  function init() {
    const btn = document.getElementById('abSidebarToggle');
    if (!btn) return;
    // Restore saved state
    try {
      if (localStorage.getItem('sidebarExpanded') === '1') {
        document.body.classList.add('sidebar-expanded');
        const icon = btn.querySelector('.ab-toggle-icon');
        if (icon) icon.textContent = '‹';
      }
    } catch(e) {}
    btn.addEventListener('click', () => {
      const expanded = document.body.classList.toggle('sidebar-expanded');
      const icon = btn.querySelector('.ab-toggle-icon');
      if (icon) icon.textContent = expanded ? '‹' : '›';
      try { localStorage.setItem('sidebarExpanded', expanded ? '1' : '0'); } catch(e) {}
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
