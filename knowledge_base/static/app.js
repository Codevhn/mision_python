/* =============================================
   KNOWLEDGE BASE — Frontend Logic
   ============================================= */

// Clean up any stored accent from the removed tone system
try { localStorage.removeItem('accentColor'); } catch(e) {}

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
let _codeExecResizeHandler = null;

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
    onPageCreate: null,
  });

  // Inline entry editor (for viewing/editing entries)
  _inlineEditor = BlockEditor.create({
    container:    document.getElementById("entryBody"),
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

  loadTree().then(() => {
    // Re-render Home now that _index is populated with real stats
    const activeSpace = (() => { try { return sessionStorage.getItem('activeSpace'); } catch(e) { return null; } })();
    if (!activeSpace || activeSpace === 'home') renderHome();
  });
  Promise.all([loadCategorySuggestions(), loadTopicSuggestions()]).then(initSmartSelects);
  loadCourseSuggestions();
  bindEvents();
  loadKanbanSidebar();
  loadMindmapSidebar();
  applyTheme();
  initFocusMode();
  initStarFeature();
  initTOC();
  initScratchpad();
  initStats();
  initContextMenu();
  initReorgModal();
  initTemplates();
  initHistory();
  initDuplicate();
  initMove();
  initSaveKnowledge();
  initPin();
  initStatus();
  initReview();
  initPageFind();
  initRelationsPanel();
  initAIPanel();
  initPasteMarkdown();
  initPagePeek();
  // Deep link: ?open=<entryId> — the target of "Copiar enlace" (database
  // row menu, customBlocks.jsx). No other feature reads location.search
  // yet, so this is the app's first/only URL-driven navigation.
  const _openParam = new URLSearchParams(window.location.search).get('open');
  if (_openParam) loadEntry(_openParam);
  _refreshReminderBadges();
  initBlockTypeIndicator();
  // Back navigation button
  const _navBackBtn = $('navBackBtn');
  if (_navBackBtn) _navBackBtn.addEventListener('click', _navBack);
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
  // #abPractice / #msnPractice open via their data-space="practice" attribute
  // now (generic space-switch wiring below), like every other space icon.

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
    closeTOC();
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
  $("moreExport").addEventListener("click", openExportModal);
  $("moreToc").addEventListener("click",       () => $("tocBtn").click());
  $("moreHistory").addEventListener("click",   () => $("historyBtn").click());
  $("moreStar").addEventListener("click",      () => $("starBtn").click());
  $("morePin").addEventListener("click",       () => $("pinBtn").click());
  $("moreDup").addEventListener("click",       () => $("dupBtn").click());
  $("moreMove").addEventListener("click",      () => $("moveBtn").click());
  $("moreSaveKnowledge")?.addEventListener("click", openSaveKnowledgePanel);
  $("moreMindmap")?.addEventListener("click", () => _generateMindmapForCurrentLesson());
  $("moreFocus").addEventListener("click",     () => $("focusBtn").click());
  $("moreAI").addEventListener("click",        () => $("aiBtn").click());
  $("morePasteMd").addEventListener("click",   () => $("pasteMarkdownBtn").click());
  $("modalClose").addEventListener("click", closeModal);
  $("cancelBtn").addEventListener("click", closeModal);
  $("saveBtn").addEventListener("click", saveEntry);
  $("editBtn").addEventListener("click", openEditModal);
  $("deleteBtn").addEventListener("click", deleteEntry);
  $("exportBtn").addEventListener("click", openExportModal);
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

  // Suggest an existing category/tema while creating a new entry
  $("fieldTitle").addEventListener("input", scheduleCategorySuggest);
  $("fieldContent").addEventListener("input", scheduleCategorySuggest);

  // Topic custom input toggle

  // Kanban sidebar button
  $("newKanbanBoardBtn").addEventListener("click", () => {
    showKanbanArea();
    if (window.KanbanApp) window.KanbanApp.showBoards();
  });

  // Mindmap sidebar button
  $("newMindmapBtn")?.addEventListener("click", () => {
    if (window.MindmapApp) window.MindmapApp.showList();
  });
}

// ---- KANBAN ----
function showKanbanArea() {
  $("entryView").classList.add("hidden");
  $("entryCover").classList.add("hidden"); $("entryAddCover").classList.add("hidden");
  $("welcome").classList.add("hidden");
  _setHomeAmbient(false);
  if ($("ctxBar")) $("ctxBar").classList.add("hidden");
  $("kanbanArea").classList.remove("hidden");
  closeTOC();
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
        if (isMobile()) closeSidebarMobile();
      });
    });
  } catch (e) {
    // silently ignore
  }
}

// Expose for kanban.js to call after mutations
window._loadKanbanSidebar = loadKanbanSidebar;

// ---- MINDMAPS ----
function showMindmapArea() {
  $("entryView").classList.add("hidden");
  $("entryCover").classList.add("hidden"); $("entryAddCover").classList.add("hidden");
  $("welcome").classList.add("hidden");
  _setHomeAmbient(false);
  if ($("ctxBar")) $("ctxBar").classList.add("hidden");
  $("mindmapArea").classList.remove("hidden");
  closeTOC();
}
window.showMindmapArea = showMindmapArea;

async function loadMindmapSidebar() {
  const tree = $("mindmapTree");
  if (!tree) return;
  try {
    const res = await fetch("/api/mindmaps");
    if (!res.ok) return;
    const maps = await res.json();
    if (!maps.length) {
      tree.innerHTML = '<div class="tree-empty">No hay mapas aún.</div>';
      return;
    }
    tree.innerHTML = maps.map(m => `
      <div class="mindmap-item" data-id="${m.id}">
        <span class="mindmap-item-dot">✺</span>
        <span>${escapeHtml(m.title)}</span>
      </div>`).join('');
    tree.querySelectorAll('.mindmap-item').forEach(el => {
      el.addEventListener('click', () => {
        tree.querySelectorAll('.mindmap-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        showMindmapArea();
        if (window.MindmapApp) window.MindmapApp.showMap(el.dataset.id);
        if (isMobile()) closeSidebarMobile();
      });
    });
  } catch (e) {
    // silently ignore
  }
}

// Expose for mindmap.js to call after mutations
window._loadMindmapSidebar = loadMindmapSidebar;

function autoExtractTitle() {
  if ($("fieldTitle").value.trim()) return;
  const content = $("fieldContent").value;
  const firstLine = content.trimStart().split("\n")[0];
  const match = firstLine.match(/^#{1,3}\s+(.+)/);
  if (match) {
    $("fieldTitle").value = match[1].trim();
  }
}

// ---- CATEGORY/TEMA SUGGESTION (new knowledge entries only) ----
let _catSuggestTimer = null;

function scheduleCategorySuggest() {
  clearTimeout(_catSuggestTimer);
  _catSuggestTimer = setTimeout(fetchCategorySuggestion, 600);
}

async function fetchCategorySuggestion() {
  const box = $("catSuggestBox");
  if (!box) return;

  // Only for brand-new knowledge entries — editing hides the content field
  // anyway, and an existing entry already has a category.
  const activeTab = document.querySelector(".type-tab.active");
  if ($("saveBtn").dataset.mode !== "new" || (activeTab && activeTab.dataset.mode !== "knowledge")) {
    box.classList.add("hidden");
    return;
  }
  // Don't nag once category and tema are both already filled in
  if ($("fieldCategory").value.trim() && $("fieldTopic").value.trim()) {
    box.classList.add("hidden");
    return;
  }

  const title = $("fieldTitle").value.trim();
  const content = $("fieldContent").value.trim();
  if (!title && !content) { box.classList.add("hidden"); return; }

  let data;
  try {
    const res = await fetch("/api/suggest-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) { box.classList.add("hidden"); return; }
    data = await res.json();
  } catch {
    box.classList.add("hidden");
    return;
  }

  const suggestions = data.suggestions || [];
  if (!suggestions.length) { box.classList.add("hidden"); return; }

  box.innerHTML = '<span class="cat-suggest-label">💡 se parece a:</span>' + suggestions.map(s => `
    <button type="button" class="cat-suggest-chip" data-cat="${escapeHtml(s.category)}" data-topic="${escapeHtml(s.topic)}">
      ${escapeHtml(s.category)} › ${escapeHtml(s.topic)}
      <span class="cat-suggest-why">— por "${escapeHtml(s.example_title)}"</span>
    </button>`).join('');
  box.querySelectorAll(".cat-suggest-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $("fieldCategory").value = chip.dataset.cat;
      $("fieldTopic").value = chip.dataset.topic;
      box.classList.add("hidden");
    });
  });
  box.classList.remove("hidden");
}

// ---- THEME ----
function applyTheme() {
  const saved = localStorage.getItem("kb_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kb_theme", next);
}

// ---- SIDEBAR ----
function isMobile()  { return window.innerWidth <= 768; }
function isCompact() { return window.innerWidth > 768 && window.innerWidth <= 1024; }

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
  if (isMobile() || isCompact()) {
    const open = $("sidebar").classList.toggle("mobile-open");
    $("sidebarOverlay").classList.toggle("active", open);
    document.body.classList.toggle("sidebar-open", open);
  } else {
    $("sidebar").classList.toggle("collapsed");
  }
}

function closeSidebarMobile() {
  $("sidebar").classList.remove("mobile-open");
  $("sidebarOverlay").classList.remove("active");
  document.body.classList.remove("sidebar-open");
}

// ---- TREE ----
let _index = [];

// ---- Navigation stack ----
let _navStack = [];  // [{ type, id, label, space }]
let _navPos   = -1;  // current position in stack

async function loadTree() {
  const [r1, r2, r3, r4, r5, r6] = await Promise.all([fetch("/api/tree"), fetch("/api/courses/tree"), fetch("/api/teamspace/tree"), fetch("/api/entries"), fetch("/api/courses"), fetch("/api/pages/tree")]);
  const knowledgeTree  = await r1.json();
  const coursesTree    = await r2.json();
  const teamspaceTree  = await r3.json();
  const entries        = await r4.json();
  const coursesFlat    = await r5.json();
  const pagesTree      = await r6.json();
  // Merge course root entities into _index so they appear in relation searcher
  const courseIndexEntries = (Array.isArray(coursesFlat) ? coursesFlat : []).map(c => ({
    id:       c.id,
    uid:      c.uid,
    title:    c.label || c.id,
    type:     "course_root",
    category: "Curso",
    topic:    "",
    icon:     c.icon || "",
    cover:    c.cover || "",
  }));
  _index = [...entries, ...courseIndexEntries];
  _coursesTreeData = coursesTree; // cache for course detail view
  renderTree(knowledgeTree);
  renderTeamspaceTree(teamspaceTree);
  renderPagesTree(pagesTree);
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
    catEl.dataset.catLabel = catLabel;

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
      topicEl.dataset.topic = topic;
      topicEl.dataset.topicLabel = topicLabel || topic;
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
function renderCoursesTree(tree, filterSlug, _container = null) {
  const nav = _container
    || document.querySelector(`.course-inline-tree[data-for-course="${filterSlug}"]`);
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
      if (!state.modules[moduleSlug]) state.modules[moduleSlug] = { open: false };
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
        entryEl.title = entry.title;
        const dot = document.createElement("span");
        dot.className = `status-dot status-${entry.status || "pendiente"}`;
        const nameSpan = document.createElement("span");
        nameSpan.className = "tree-entry-label";
        nameSpan.innerHTML = renderTreeEntryLabel(entry.icon, entry.title, ENTRY_ICON_DEFAULTS.course);
        entryEl.appendChild(dot);
        entryEl.appendChild(nameSpan);
        if (entry.id === currentEntryId) entryEl.classList.add("active");
        entryEl.addEventListener("click", () => openCourseLesson(entry.id));
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

// ---- PAGES TREE (recursive, type: "page") ----
function renderPagesTree(tree) {
  const nav = $("pagesTree");
  nav.innerHTML = "";
  if (!tree || !tree.length) {
    nav.innerHTML = '<div class="tree-empty">No hay páginas aún.</div>';
    return;
  }

  function buildNodeEl(node) {
    const item = document.createElement("div");
    item.className = "tree-page-node";
    item.dataset.id = node.id;

    const row = document.createElement("div");
    row.className = "tree-entry tree-page-row" + (node.id === currentEntryId ? " active" : "");
    row.draggable = true;

    const hasChildren = node.children && node.children.length > 0;
    const toggle = document.createElement("span");
    toggle.className = "tree-page-toggle";
    toggle.textContent = hasChildren ? "▾" : "";
    // Leaf pages (the vast majority) don't need the toggle's reserved width —
    // dropping it from the flex flow entirely (not just emptying its text)
    // keeps their icon flush instead of leaving a blank arrow-sized gap.
    if (!hasChildren) toggle.style.display = "none";
    row.appendChild(toggle);

    const label = document.createElement("span");
    label.className = "tree-entry-label";
    label.innerHTML = renderTreeEntryLabel(node.icon, node.title, ENTRY_ICON_DEFAULTS.page);
    row.appendChild(label);

    const childrenEl = document.createElement("div");
    childrenEl.className = "tree-page-children";
    (node.children || []).forEach(child => childrenEl.appendChild(buildNodeEl(child)));

    if (hasChildren) {
      toggle.addEventListener("click", e => {
        e.stopPropagation();
        const open = childrenEl.style.display !== "none";
        childrenEl.style.display = open ? "none" : "";
        toggle.textContent = open ? "▸" : "▾";
      });
    }

    row.addEventListener("click", () => loadEntry(node.id));

    // Drag-and-drop reparenting: dropping a page onto another makes it a child
    row.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", node.id);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", e => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("drag-over");
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === node.id) return;
      const res = await fetch(`/api/entry/${draggedId}/parent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: node.id }),
      });
      if (res.ok) {
        await loadTree();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "No se pudo mover la página", "error");
      }
    });

    item.appendChild(row);
    item.appendChild(childrenEl);
    return item;
  }

  // Root drop zone: dropping on the tree background (not on a node) makes a page a root page
  nav.addEventListener("dragover", e => e.preventDefault());
  nav.addEventListener("drop", async e => {
    if (e.target !== nav) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const res = await fetch(`/api/entry/${draggedId}/parent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: null }),
    });
    if (res.ok) await loadTree();
  });

  tree.forEach(node => nav.appendChild(buildNodeEl(node)));
}

// ---- NEW ROOT PAGE MODAL ----
function openNewPageModal() {
  $("newPageTitle").value = "";
  setIconButtonValue($("newPageIconBtn"), ENTRY_ICON_DEFAULTS.page, ENTRY_ICON_DEFAULTS.page);
  $("newPageOverlay").classList.remove("hidden");
  setTimeout(() => $("newPageTitle").focus(), 50);
}

$("newPageBtn").addEventListener("click", openNewPageModal);
$("newPageClose").addEventListener("click", () => $("newPageOverlay").classList.add("hidden"));
$("newPageCancel").addEventListener("click", () => $("newPageOverlay").classList.add("hidden"));
$("newPageOverlay").addEventListener("click", e => { if (e.target === $("newPageOverlay")) $("newPageOverlay").classList.add("hidden"); });
$("newPageTitle").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("newPageCreate").click(); } });

$("newPageCreate").addEventListener("click", async () => {
  const title = $("newPageTitle").value.trim();
  if (!title) { $("newPageTitle").focus(); return; }
  const icon = getIconButtonValue("newPageIconBtn");
  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_type: "page",
      title,
      icon,
      raw_text: "# " + title + "\n\n",
      already_markdown: true,
    }),
  });
  if (res.ok) {
    const d = await res.json();
    $("newPageOverlay").classList.add("hidden");
    await loadTree();
    loadEntry(d.id);
  } else {
    showToast("Error al crear la página", "error");
  }
});

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

// ---- USER NAME ----
const KB_USER_NAME_KEY = 'kb_user_name';
function _getUserName() {
  try {
    const n = localStorage.getItem(KB_USER_NAME_KEY);
    if (!n) { localStorage.setItem(KB_USER_NAME_KEY, 'Frandev'); return 'Frandev'; }
    return n;
  } catch { return 'Frandev'; }
}

// ---- STUDYING TRACKER ----
const KB_STUDYING_KEY = 'kb_studying_v1';
const KB_STUDYING_MAX = 5;
function _trackStudying(id, title, courseSlug) {
  try {
    let items = JSON.parse(localStorage.getItem(KB_STUDYING_KEY) || '[]');
    items = items.filter(i => i.id !== id);
    items.unshift({ id, title, courseSlug: courseSlug || '', ts: Date.now() });
    if (items.length > KB_STUDYING_MAX) items = items.slice(0, KB_STUDYING_MAX);
    localStorage.setItem(KB_STUDYING_KEY, JSON.stringify(items));
  } catch {}
}
function _getStudying() {
  try { return JSON.parse(localStorage.getItem(KB_STUDYING_KEY) || '[]'); } catch { return []; }
}

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

// ── Weather helpers ────────────────────────────────────────────────────────────
function _weatherCondition(code, isDay) {
  const d = isDay ? 'day' : 'night';
  if (code === 0)                         return `clear-${d}`;
  if (code === 1 || code === 2)           return `partly-cloudy-${d}`;
  if (code === 3)                         return `overcast-${d}`;
  if (code >= 45 && code <= 48)           return `foggy-${d}`;
  if (code >= 71 && code <= 77)           return `snow-${d}`;
  if (code >= 51 && code <= 82)           return `rain-${d}`;
  if (code >= 95 && code <= 99)           return `thunderstorm-${d}`;
  return `overcast-${d}`;
}
function _weatherInfo(code, isDay) {
  const cond = _weatherCondition(code, isDay);
  const isNight = cond.endsWith('-night');
  const base = cond.replace(/-day$|-night$/, '');
  const map = {
    'clear':         isNight ? { icon: '🌙',  label: 'Noche despejada'       } : { icon: '☀️',  label: 'Despejado'            },
    'partly-cloudy': isNight ? { icon: '🌙',  label: 'Parcialmente nublado'  } : { icon: '🌤️', label: 'Parcialmente nublado'  },
    'overcast':      { icon: '☁️',  label: 'Nublado'  },
    'foggy':         { icon: '🌫️', label: 'Niebla'   },
    'rain':          { icon: '🌧️', label: 'Lluvia'   },
    'snow':          { icon: '❄️',  label: 'Nieve'    },
    'thunderstorm':  { icon: '⛈️', label: 'Tormenta' },
  };
  return map[base] || { icon: '🌡️', label: '' };
}

// ── Animated weather canvas overlay ──────────────────────────────────────────
// No background image asset — the hero/ambient canvas draws particles directly
// over the theme's own CSS gradient (see .home-hero / [data-theme="light"] .home-hero).
// Conditions that need no animation skip requestAnimationFrame entirely.
let _heroCanvasStop = null;

const _WEATHER_OVERLAY_CONDS = new Set([
  'clear-night', 'partly-cloudy-night',
  'rain-day', 'rain-night',
  'snow-day', 'snow-night',
  'thunderstorm-day', 'thunderstorm-night',
  'foggy-day', 'foggy-night',
]);

function _defaultCondition() {
  const h = new Date().getHours();
  return (h >= 21 || h < 6) ? 'clear-night' : 'clear-day';
}

function _startWeatherOverlay(cond) {
  if (_heroCanvasStop) { _heroCanvasStop(); _heroCanvasStop = null; }
  const canvas = document.getElementById('homeHeroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // No animation needed — clear canvas and exit
  if (!_WEATHER_OVERLAY_CONDS.has(cond)) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  function resize() {
    canvas.width  = canvas.offsetWidth  || canvas.parentElement.offsetWidth;
    canvas.height = canvas.offsetHeight || canvas.parentElement.offsetHeight;
    initParticles();
  }

  let particles = [], t = 0, ltTimer = 0, ltAlpha = 0, ltX = 0;

  function initParticles() {
    particles = [];
    const W = canvas.width, H = canvas.height;
    if (cond === 'clear-night' || cond === 'partly-cloudy-night') {
      const count = cond === 'clear-night' ? 130 : 65;
      for (let i = 0; i < count; i++)
        particles.push({ x: Math.random()*W, y: Math.random()*H*0.85,
          r: Math.random()*1.4+0.3, ph: Math.random()*Math.PI*2, sp: Math.random()*0.018+0.004 });
    } else if (cond === 'rain-day' || cond === 'rain-night' ||
               cond === 'thunderstorm-day' || cond === 'thunderstorm-night') {
      for (let i = 0; i < 180; i++)
        particles.push({ x: Math.random()*W, y: Math.random()*H,
          len: Math.random()*12+7, sp: Math.random()*1.2+1.0, a: Math.random()*0.30+0.12 });
    } else if (cond === 'snow-day' || cond === 'snow-night') {
      for (let i = 0; i < 90; i++)
        particles.push({ x: Math.random()*W, y: Math.random()*H,
          r: Math.random()*3+0.8, sp: Math.random()*0.9+0.3,
          dr: (Math.random()-0.5)*0.4, a: Math.random()*0.6+0.3 });
    } else if (cond === 'foggy-day' || cond === 'foggy-night') {
      for (let i = 0; i < 6; i++)
        particles.push({ x: Math.random()*W*1.6-W*0.3, y: H*0.25+(i/6)*H*0.5,
          w: Math.random()*W*0.6+W*0.3, sp: (Math.random()*0.08+0.02)*(i%2?1:-1),
          a: Math.random()*0.08+0.03 });
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const W = canvas.width, H = canvas.height;
    t++;
    ctx.clearRect(0, 0, W, H);

    if (cond === 'clear-night' || cond === 'partly-cloudy-night') {
      particles.forEach(p => {
        p.ph += p.sp;
        const a = Math.max(0, 0.35 + Math.sin(p.ph)*0.55);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
      });

    } else if (cond === 'rain-day' || cond === 'rain-night') {
      particles.forEach(p => {
        p.y += p.sp; if (p.y > H+10) { p.y=-10; p.x=Math.random()*W; }
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-1.2,p.y+p.len);
        ctx.strokeStyle=`rgba(160,205,245,${p.a})`; ctx.lineWidth=0.8; ctx.stroke();
      });

    } else if (cond === 'snow-day' || cond === 'snow-night') {
      particles.forEach(p => {
        p.y+=p.sp; p.x+=p.dr+Math.sin(t*0.015+p.r)*0.3;
        if(p.y>H+6){p.y=-6;p.x=Math.random()*W;}
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(220,235,255,${p.a})`; ctx.fill();
      });

    } else if (cond === 'thunderstorm-day' || cond === 'thunderstorm-night') {
      particles.forEach(p => {
        p.y+=p.sp*1.8; if(p.y>H+10){p.y=-10;p.x=Math.random()*W;}
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-1.8,p.y+p.len*1.3);
        ctx.strokeStyle=`rgba(140,185,225,${p.a*0.85})`; ctx.lineWidth=0.85; ctx.stroke();
      });
      ltTimer--;
      if (ltTimer <= 0) { ltTimer=Math.floor(Math.random()*220)+80; ltAlpha=0.75; ltX=W*0.25+Math.random()*W*0.5; }
      if (ltAlpha > 0) {
        ctx.fillStyle=`rgba(210,225,255,${ltAlpha*0.18})`; ctx.fillRect(0,0,W,H);
        ctx.beginPath();
        ctx.moveTo(ltX,0); ctx.lineTo(ltX-18,H*0.32); ctx.lineTo(ltX+12,H*0.46); ctx.lineTo(ltX-22,H*0.78);
        ctx.strokeStyle=`rgba(255,255,210,${ltAlpha})`; ctx.lineWidth=2.5; ctx.stroke();
        ctx.strokeStyle=`rgba(200,220,255,${ltAlpha*0.35})`; ctx.lineWidth=8; ctx.stroke();
        ltAlpha -= 0.045;
      }

    } else if (cond === 'foggy-day' || cond === 'foggy-night') {
      particles.forEach(p => {
        p.x += p.sp;
        if (p.x > W+p.w/2) p.x = -p.w/2;
        if (p.x < -p.w/2)  p.x =  W+p.w/2;
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w*0.5);
        fg.addColorStop(0, `rgba(190,205,215,${p.a})`);
        fg.addColorStop(1, `rgba(190,205,215,0)`);
        ctx.fillStyle = fg;
        ctx.fillRect(p.x-p.w*0.5, p.y-p.w*0.25, p.w, p.w*0.5);
      });
    }
  }

  let raf;
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  frame();

  _heroCanvasStop = () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

// ── Ambient full-viewport weather canvas (Home only) ─────────────────────────
let _ambientCanvasStop  = null;
let _ambientShootingTimer = null;

// Conditions that animate on the ambient canvas
const _AMBIENT_ANIM_CONDS = new Set([
  'clear-night', 'partly-cloudy-night',
  'rain-day', 'rain-night',
  'snow-day', 'snow-night',
  'thunderstorm-day', 'thunderstorm-night',
  'foggy-day', 'foggy-night',
]);

function _setHomeAmbient(active) {
  if (active) {
    document.body.classList.add('home-ambient');
    // Stop hero overlay and clear canvas pixels
    if (_heroCanvasStop) { _heroCanvasStop(); _heroCanvasStop = null; }
    const hc = document.getElementById('homeHeroCanvas');
    if (hc) { try { hc.getContext('2d').clearRect(0,0,hc.width,hc.height); } catch {} }
  } else {
    document.body.classList.remove('home-ambient');
    if (_ambientCanvasStop)  { _ambientCanvasStop(); _ambientCanvasStop = null; }
    if (_ambientShootingTimer) { clearTimeout(_ambientShootingTimer); _ambientShootingTimer = null; }
    const ac = document.getElementById('homeAmbientCanvas');
    if (ac) ac.getContext('2d').clearRect(0,0,ac.width,ac.height);
  }
}

function _startAmbientCanvas(cond) {
  if (_ambientCanvasStop)   { _ambientCanvasStop();  _ambientCanvasStop  = null; }
  if (_ambientShootingTimer){ clearTimeout(_ambientShootingTimer); _ambientShootingTimer = null; }

  const canvas = document.getElementById('homeAmbientCanvas');
  if (!canvas) return;

  // Static conditions get no particle overlay — just the theme's CSS gradient
  if (!_AMBIENT_ANIM_CONDS.has(cond) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const mobile = window.innerWidth < 768;
  const density = mobile ? 0.4 : 1.0;

  let particles = [], t = 0, ltTimer = 0, ltAlpha = 0, ltX = 0;

  function initParticles() {
    particles = [];
    const W = canvas.width, H = canvas.height;

    if (cond === 'clear-night') {
      const n = Math.floor(200 * density);
      for (let i = 0; i < n; i++)
        particles.push({ k:'star', x:Math.random()*W, y:Math.random()*H*0.82,
          r:Math.random()*1.5+0.3, ph:Math.random()*Math.PI*2, sp:Math.random()*0.014+0.003 });
    } else if (cond === 'partly-cloudy-night') {
      const n = Math.floor(100 * density);
      for (let i = 0; i < n; i++)
        particles.push({ k:'star', x:Math.random()*W, y:Math.random()*H*0.62,
          r:Math.random()*1.1+0.25, ph:Math.random()*Math.PI*2, sp:Math.random()*0.011+0.003 });
    } else if (cond==='rain-day'||cond==='rain-night'||cond==='thunderstorm-day'||cond==='thunderstorm-night') {
      const n = Math.floor(280 * density);
      for (let i = 0; i < n; i++)
        particles.push({ k:'rain', x:Math.random()*W, y:Math.random()*H,
          len:Math.random()*16+8, sp:Math.random()*1.6+1.2, a:Math.random()*0.38+0.22 });
    } else if (cond==='snow-day'||cond==='snow-night') {
      const n = Math.floor(160 * density);
      for (let i = 0; i < n; i++)
        particles.push({ k:'snow', x:Math.random()*W, y:Math.random()*H,
          r:Math.random()*3.5+0.9, sp:Math.random()*0.9+0.3,
          dr:(Math.random()-0.5)*0.4, a:Math.random()*0.55+0.35 });
    } else if (cond==='foggy-day'||cond==='foggy-night') {
      const n = Math.floor(10 * density);
      for (let i = 0; i < n; i++)
        particles.push({ k:'fog', x:Math.random()*W*1.6-W*0.3, y:H*0.12+(i/n)*H*0.72,
          w:Math.random()*W*0.5+W*0.25, sp:(Math.random()*0.06+0.02)*(i%2?1:-1),
          a:Math.random()*0.07+0.025 });
    }
  }

  function scheduleShooting() {
    const delay = 9000 + Math.random() * 18000;
    _ambientShootingTimer = setTimeout(() => {
      if (!document.body.classList.contains('home-ambient')) return;
      const W = canvas.width, H = canvas.height;
      const angle = -(0.28 + Math.random() * 0.32);
      particles.push({ k:'shooting',
        x: Math.random()*W*0.65, y: Math.random()*H*0.45,
        angle, speed: 14 + Math.random()*10,
        length: 90 + Math.random()*110, life: 1.0 });
      scheduleShooting();
    }, delay);
  }

  function drawMoon(W, H) {
    const mx = W*0.82, my = H*0.13;
    const halo = ctx.createRadialGradient(mx,my,0,mx,my,95);
    halo.addColorStop(0,'rgba(210,220,255,0.13)');
    halo.addColorStop(0.4,'rgba(210,220,255,0.05)');
    halo.addColorStop(1,'rgba(210,220,255,0)');
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(mx,my,95,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx,my,22,0,Math.PI*2);
    ctx.fillStyle='rgba(230,235,255,0.93)'; ctx.fill();
    ctx.beginPath(); ctx.arc(mx+7,my-2,19,0,Math.PI*2);
    ctx.fillStyle='rgba(8,12,38,0.52)'; ctx.fill();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const W = canvas.width, H = canvas.height;
    t++;
    ctx.clearRect(0,0,W,H);

    if (cond==='clear-night'||cond==='partly-cloudy-night') drawMoon(W,H);

    const alive = [];
    for (const p of particles) {
      if (p.k==='star') {
        p.ph+=p.sp;
        const a = Math.max(0, 0.28+Math.sin(p.ph)*0.58);
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(255,255,255,${a})`; ctx.fill();
        alive.push(p);

      } else if (p.k==='rain') {
        p.y+=p.sp; if(p.y>H+10){p.y=-10;p.x=Math.random()*W;}
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-1.6,p.y+p.len);
        ctx.strokeStyle=`rgba(180,218,255,${p.a})`; ctx.lineWidth=1.0; ctx.stroke();
        alive.push(p);

      } else if (p.k==='snow') {
        p.y+=p.sp; p.x+=p.dr+Math.sin(t*0.015+p.r)*0.3;
        if(p.y>H+6){p.y=-6;p.x=Math.random()*W;}
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(220,235,255,${p.a})`; ctx.fill();
        alive.push(p);

      } else if (p.k==='fog') {
        p.x+=p.sp;
        if(p.x>W+p.w*0.5)p.x=-p.w*0.5; if(p.x<-p.w*0.5)p.x=W+p.w*0.5;
        const fg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.w*0.5);
        fg.addColorStop(0,`rgba(190,205,215,${p.a})`);
        fg.addColorStop(1,'rgba(190,205,215,0)');
        ctx.fillStyle=fg; ctx.fillRect(p.x-p.w*0.5,p.y-p.w*0.25,p.w,p.w*0.5);
        alive.push(p);

      } else if (p.k==='shooting') {
        p.life-=0.055; if(p.life<=0) continue;
        p.x+=Math.cos(p.angle)*p.speed; p.y+=Math.sin(p.angle)*p.speed;
        ctx.save(); ctx.globalAlpha=p.life*0.88;
        const tail=ctx.createLinearGradient(
          p.x,p.y, p.x-Math.cos(p.angle)*p.length, p.y-Math.sin(p.angle)*p.length);
        tail.addColorStop(0,'rgba(255,255,255,0.9)');
        tail.addColorStop(1,'rgba(255,255,255,0)');
        ctx.strokeStyle=tail; ctx.lineWidth=1.8;
        ctx.beginPath(); ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-Math.cos(p.angle)*p.length, p.y-Math.sin(p.angle)*p.length);
        ctx.stroke(); ctx.restore();
        alive.push(p);
      }
    }
    particles = alive;

    if (cond==='thunderstorm-day'||cond==='thunderstorm-night') {
      ltTimer--;
      if(ltTimer<=0){ltTimer=Math.floor(Math.random()*200)+80;ltAlpha=0.70;ltX=W*0.2+Math.random()*W*0.6;}
      if(ltAlpha>0){
        ctx.fillStyle=`rgba(210,225,255,${ltAlpha*0.14})`; ctx.fillRect(0,0,W,H);
        ctx.beginPath();
        ctx.moveTo(ltX,0); ctx.lineTo(ltX-22,H*0.28); ctx.lineTo(ltX+14,H*0.44); ctx.lineTo(ltX-26,H*0.82);
        ctx.strokeStyle=`rgba(255,255,210,${ltAlpha})`; ctx.lineWidth=2.5; ctx.stroke();
        ctx.strokeStyle=`rgba(200,220,255,${ltAlpha*0.28})`; ctx.lineWidth=9; ctx.stroke();
        ltAlpha-=0.04;
      }
    }
  }

  function onResize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
  }

  let raf;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  initParticles();

  if (cond==='clear-night'||cond==='partly-cloudy-night') scheduleShooting();

  window.addEventListener('resize', onResize);
  frame();

  _ambientCanvasStop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    if (_ambientShootingTimer){ clearTimeout(_ambientShootingTimer); _ambientShootingTimer=null; }
  };
}

let _weatherData = null;
let _weatherFetched = false;

function _fetchWeather() {
  if (_weatherFetched) return;
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        _weatherFetched = true; // mark done regardless of result to prevent retries
        if (!data || data.error) return;
        _weatherData = data;
        _weatherFetched = true;
        const cond = _weatherCondition(data.weather_code, data.is_day);
        if (document.body.classList.contains('home-ambient')) {
          _startAmbientCanvas(cond);
        } else {
          _startWeatherOverlay(cond);
        }
        // Update chip
        const chip = document.getElementById('homeWeatherChip');
        if (chip) {
          const info = _weatherInfo(data.weather_code, data.is_day);
          const city = data.city ? `<span class="hw-sep">·</span><span class="hw-city">${escapeHtml(data.city)}</span>` : '';
          chip.innerHTML = `<span class="hw-icon">${info.icon}</span>
            <div class="hw-body">
              <div class="hw-top"><span class="hw-temp">${Math.round(data.temp)}°</span><span class="hw-unit">C</span></div>
              <div class="hw-bottom"><span class="hw-label">${info.label}</span>${city}</div>
            </div>`;
          chip.classList.remove('hw-hidden');
        }
      })
      .catch(() => {});
  }, () => { _weatherFetched = true; });
}

// ── Home helpers ─────────────────────────────────────────────────────────
function _relTimeAgo(ts) {
  if (!ts) return '';
  try {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}
function _unslugify(s) {
  return (s || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function _findEntryModule(courseSlug, entryId) {
  const tree = _coursesTreeData?.[courseSlug];
  if (!tree) return null;
  for (const mod of Object.values(tree.modules || {})) {
    if ((mod.entries || []).some(e => e.id === entryId)) return mod.label;
  }
  return null;
}

function renderHome() {
  const hour      = new Date().getHours();
  const greetWord = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const recent   = _getRecent();
  const studying = _getStudying();
  const pinned   = Object.entries(pinnedMap).filter(([,v]) => v).map(([id]) => _index.find(e => e.id === id)).filter(Boolean);
  const starred  = Object.entries(starredMap).filter(([,v]) => v).map(([id]) => _index.find(e => e.id === id)).filter(Boolean);

  const totalEntries = _index.length;
  const categories   = new Set(_index.map(e => e.category).filter(Boolean)).size;
  const coursesCount = _index.filter(e => e.type === 'course_root').length;
  const starredCount = starred.length;

  function _buildWeatherChip(data) {
    const i = _weatherInfo(data.weather_code, data.is_day);
    const city = data.city ? `<span class="hw-city">${escapeHtml(data.city)}</span>` : '';
    return `<div class="home-weather-chip" id="homeWeatherChip">
      <span class="hw-icon">${i.icon}</span>
      <div class="hw-body">
        <div class="hw-top"><span class="hw-temp">${Math.round(data.temp)}°</span><span class="hw-unit">C</span></div>
        <div class="hw-bottom"><span class="hw-label">${i.label}</span>${city ? `<span class="hw-sep">·</span>${city}` : ''}</div>
      </div>
    </div>`;
  }
  const chipHtml = _weatherData
    ? _buildWeatherChip(_weatherData)
    : `<div class="home-weather-chip hw-hidden" id="homeWeatherChip"></div>`;

  function cardHtml(r) {
    const coverStyle = r.cover
      ? (r.cover.startsWith('url(')
          ? `background-image:${r.cover};background-size:cover;background-position:center`
          : `background:${r.cover}`)
      : '';
    const entry    = _index.find(e => e.id === r.id);
    const isCourse = entry?.type === 'course';
    const typeLabel = isCourse ? '🎓 Curso' : '📄 Nota';
    const timeAgo  = _relTimeAgo(r.ts);
    return `<div class="home-card" data-id="${r.id}">
      <div class="home-card-cover" style="${coverStyle}"></div>
      <div class="home-card-body">
        <div class="home-card-icon">${renderIconMarkup(r.icon || ENTRY_ICON_DEFAULTS.knowledge, "home-card-icon-glyph")}</div>
        <div class="home-card-title">${escapeHtml(r.title || "Sin título")}</div>
        <div class="home-card-meta">
          <span class="hcm-type${isCourse ? ' hcm-type--course' : ''}">${typeLabel}</span>
          ${timeAgo ? `<span class="hcm-time">${timeAgo}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  function studyFeaturedHtml(r) {
    const courseLabel = _coursesTreeData?.[r.courseSlug]?.label || _unslugify(r.courseSlug);
    const moduleLabel = _findEntryModule(r.courseSlug, r.id);
    const timeAgo     = _relTimeAgo(r.ts);
    return `
      <div class="home-study-featured" data-id="${r.id}">
        <div class="hsf-header">
          <span class="hsf-course">🎓 ${escapeHtml(courseLabel)}</span>
          ${timeAgo ? `<span class="hsf-time">${timeAgo}</span>` : ''}
        </div>
        ${moduleLabel ? `<div class="hsf-module">${escapeHtml(moduleLabel)}</div>` : ''}
        <div class="hsf-title">${escapeHtml(r.title || 'Sin título')}</div>
        <span class="hsf-cta">Continuar →</span>
      </div>`;
  }

  function studyCompactHtml(r) {
    const courseLabel = _coursesTreeData?.[r.courseSlug]?.label || _unslugify(r.courseSlug);
    const timeAgo     = _relTimeAgo(r.ts);
    return `
      <div class="home-study-compact" data-id="${r.id}">
        ${courseLabel ? `<div class="hsc-course">${escapeHtml(courseLabel)}</div>` : ''}
        <div class="hsc-title">${escapeHtml(r.title || 'Sin título')}</div>
        ${timeAgo ? `<span class="hsc-time">${timeAgo}</span>` : ''}
      </div>`;
  }

  const welcome = $("welcome");
  welcome.innerHTML = `
    <div class="home-wrap">

      <div class="home-hero" id="homeHero">
        <canvas class="home-hero-canvas" id="homeHeroCanvas"></canvas>
        <div class="home-hero-content">
          <h1 class="home-greeting">${escapeHtml(greetWord)}</h1>
          <p class="home-date">${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}</p>
        </div>
        ${chipHtml}
      </div>

      <div class="home-stats-row">
        <div class="home-stat" data-stat="entries"    data-space="knowledge"><span class="home-stat-num">${totalEntries}</span><span class="home-stat-label">entradas</span></div>
        <div class="home-stat" data-stat="courses"    data-space="courses"><span class="home-stat-num">${coursesCount}</span><span class="home-stat-label">cursos</span></div>
        <div class="home-stat" data-stat="categories" data-space="knowledge"><span class="home-stat-num">${categories}</span><span class="home-stat-label">categorías</span></div>
        <div class="home-stat" data-stat="starred"    data-space="knowledge"><span class="home-stat-num">${starredCount}</span><span class="home-stat-label">destacadas</span></div>
      </div>

      ${studying.length ? `
      <section class="home-section home-section--studying">
        <div class="home-section-header">
          <div class="home-section-label">▶ Continuar estudiando</div>
          <button class="home-section-link" id="homeCoursesLink">Ver cursos →</button>
        </div>
        ${studyFeaturedHtml(studying[0])}
        ${studying.length > 1 ? `<div class="home-study-grid">${studying.slice(1, 4).map(studyCompactHtml).join('')}</div>` : ''}
      </section>` : ''}

      <section class="home-section home-section--domain" id="homeDomainSection"></section>

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
        <div class="home-recent-grid">${recent.slice(0, 6).map(cardHtml).join("")}</div>
      </section>` : `
      <div class="home-empty">
        <p>Selecciona una entrada del panel izquierdo o crea una nueva.</p>
        <button class="btn-primary large" id="welcomeNewBtn2">+ nueva entrada</button>
      </div>`}

      <div class="home-radar-teaser">
        <span class="hrt-icon">⦿</span>
        <span class="hrt-text">Consulta el <strong>Radar Tech</strong> para mantenerte al día con noticias de IA, Dev y Tech.</span>
        <button class="hrt-btn" id="homeRadarBtn">Abrir Radar →</button>
      </div>
    </div>
  `;

  welcome.querySelectorAll(".home-card").forEach(card => {
    card.addEventListener("click", () => loadEntry(card.dataset.id));
  });

  // Stats → navigate to space on click
  welcome.querySelectorAll(".home-stat[data-space]").forEach(stat => {
    stat.addEventListener("click", () => {
      const space = stat.dataset.space;
      if (space && window.switchSpace) window.switchSpace(space);
    });
  });

  // Study cards → restore course context + open lesson
  welcome.querySelectorAll(".home-study-featured, .home-study-compact").forEach(card => {
    card.addEventListener("click", () => {
      const entryId = card.dataset.id;
      const item = _getStudying().find(s => s.id === entryId);
      if (item?.courseSlug) _activeCourseSlug = item.courseSlug;
      if (window.switchSpace) window.switchSpace('courses');
      openCourseLesson(entryId);
    });
  });

  const newBtn2 = $("welcomeNewBtn2");
  if (newBtn2) newBtn2.addEventListener("click", openNewModal);

  const radarBtn = $("homeRadarBtn");
  if (radarBtn) radarBtn.addEventListener("click", () => { if (window.switchSpace) window.switchSpace('radar'); });

  const coursesLink = $("homeCoursesLink");
  if (coursesLink) coursesLink.addEventListener("click", () => window.switchSpace?.('courses'));

  // Activate ambient mode — full-viewport background replaces hero-only canvas.
  // Only do this when Home is actually the active space — renderHome() is also
  // called as a side-effect of unrelated actions (icon change, cover save) while
  // viewing another space, and must not re-enable the ambient background then.
  const _activeSpaceNow = (() => { try { return sessionStorage.getItem('activeSpace'); } catch (e) { return null; } })();
  if (!_activeSpaceNow || _activeSpaceNow === 'home') {
    const initCond = _weatherData
      ? _weatherCondition(_weatherData.weather_code, _weatherData.is_day)
      : _defaultCondition();
    _setHomeAmbient(true);             // class + stop hero canvas
    _startAmbientCanvas(initCond);     // full-viewport canvas
    _fetchWeather();
  }

  _renderHomeDomain();
}

// ── Domain tracking: mastery bars + spaced-repetition reminder (Fase 2) ──────
// Fetched separately from renderHome()'s synchronous local-storage data since
// this needs a round trip to /api/domain + /api/domain/reminder; the section
// starts empty and fills in once the response lands, instead of blocking Home.
async function _renderHomeDomain() {
  const container = $('homeDomainSection');
  if (!container) return;
  try {
    const [domainData, reminderData] = await Promise.all([
      fetch('/api/domain').then(r => r.json()),
      fetch('/api/domain/reminder').then(r => r.json()),
    ]);
    const reminder = reminderData.reminder;
    _refreshReminderBadges(reminder);

    const courses = Object.entries(domainData.courses || {});
    // A "start" reminder (a course with zero lessons ever opened) must show even
    // before any course has a concept map / domain bars — that's the whole point:
    // nudge before there's anything to measure, not only once data exists.
    if (!courses.length && !reminder) { container.innerHTML = ''; return; }

    let reminderHtml = '';
    if (reminder && reminder.kind === 'start') {
      reminderHtml = `
        <div class="home-reminder-card home-reminder-card--start">
          <span class="hrc-icon">📚</span>
          <div class="hrc-body">
            <div class="hrc-msg">${escapeHtml(reminder.message)}</div>
          </div>
          <button class="hrc-btn" id="homeReminderGoBtn">Ir a Cursos →</button>
        </div>`;
    } else if (reminder) {
      reminderHtml = `
        <div class="home-reminder-card${reminder.pareto ? ' home-reminder-card--pareto' : ''}">
          <span class="hrc-icon">${reminder.pareto ? '⚡' : '🔁'}</span>
          <div class="hrc-body">
            <div class="hrc-msg">${escapeHtml(reminder.message)}</div>
            <div class="hrc-course">${escapeHtml(reminder.course_label)}</div>
          </div>
          <button class="hrc-btn" id="homeReminderPracticeBtn">Practicar ahora →</button>
        </div>`;
    }

    const barsHtml = courses.length ? courses
      .sort((a, b) => a[1].domain - b[1].domain)
      .slice(0, 5)
      .map(([slug, c]) => `
        <div class="home-domain-row">
          <span class="hdr-label">${escapeHtml(c.label)}</span>
          <div class="hdr-bar"><div class="hdr-bar-fill" style="width:${c.domain}%"></div></div>
          <span class="hdr-pct">${c.domain}%</span>
        </div>`).join('') : '';

    container.innerHTML = `
      <div class="home-section-header">
        <div class="home-section-label">🎯 Tu dominio</div>
      </div>
      ${reminderHtml}
      ${barsHtml ? `<div class="home-domain-bars">${barsHtml}</div>` : ''}`;

    $('homeReminderGoBtn')?.addEventListener('click', () => window.switchSpace?.('courses'));
    $('homeReminderPracticeBtn')?.addEventListener('click', () => _openPracticeSpace(reminder.concept_name));
  } catch {
    container.innerHTML = '';
  }
}

async function _refreshReminderBadges(reminder) {
  if (reminder === undefined) {
    try { reminder = (await fetch('/api/domain/reminder').then(r => r.json())).reminder; } catch { reminder = null; }
  }
  const practiceBadge = $('abPracticeBadge');
  const coursesBadge = $('abCoursesBadge');
  practiceBadge?.classList.toggle('hidden', !(reminder && reminder.kind === 'review'));
  coursesBadge?.classList.toggle('hidden', !(reminder && reminder.kind === 'start'));
}

// The block editor's "code" mark is exclusive — a text run can't carry both
// bold/italic and inline code marks at once. Markdown like "**`foo`**" or
// "**Listas (`list`):**" (a code span anywhere inside an emphasis run, not
// just wrapping it entirely) produces exactly that overlap and crashes the
// editor's markdown parser (RangeError: Invalid collection of marks for
// node text). Split the emphasis run around any inline code span(s) inside
// it so the emphasis closes before the code and reopens after, e.g.
// "**Listas (`list`):**" -> "**Listas (**`list`**):**".
//
// This must pair markers correctly (1st with 2nd, 3rd with 4th, ...) rather
// than just regex-matching "any two markers with a backtick between them" —
// that naive approach treats the *gap* between two unrelated emphasis runs
// (e.g. "**A** plain `code` plain **B**") as if it were itself emphasized,
// corrupting content that had no overlap problem at all.
function _wrapSplitCode(content, marker) {
  if (!content.includes("`")) return marker + content + marker;
  const codeRe = /`[^`\n]+`/g;
  let out = "";
  let emphasisOpen = false;
  let last = 0;
  let m;
  while ((m = codeRe.exec(content)) !== null) {
    const before = content.slice(last, m.index);
    if (before) {
      if (!emphasisOpen) { out += marker; emphasisOpen = true; }
      out += before;
    }
    if (emphasisOpen) { out += marker; emphasisOpen = false; }
    out += m[0];
    last = m.index + m[0].length;
  }
  const tail = content.slice(last);
  if (tail) {
    if (!emphasisOpen) { out += marker; emphasisOpen = true; }
    out += tail;
  }
  if (emphasisOpen) out += marker;
  return out;
}

function _reconstructMarkerPairs(parts, marker) {
  let out = parts[0];
  for (let k = 1; k < parts.length; k += 2) {
    out += _wrapSplitCode(parts[k], marker) + (parts[k + 1] ?? "");
  }
  return out;
}

// Splits on a literal (non-overlapping) marker string, e.g. "**" or "__".
function _splitMarkerPairs(line, marker) {
  if (!line.includes(marker)) return line;
  const parts = line.split(marker);
  if (parts.length < 3 || parts.length % 2 === 0) return line; // unbalanced, leave alone
  return _reconstructMarkerPairs(parts, marker);
}

// Splits on a single-char marker using lookarounds so a "**" pair's stars
// aren't mistaken for two single "*" markers.
function _splitMarkerPairsRegex(line, re, marker) {
  if (!re.test(line)) return line;
  const parts = line.split(re);
  if (parts.length < 3 || parts.length % 2 === 0) return line;
  return _reconstructMarkerPairs(parts, marker);
}

const _SINGLE_STAR_RE = /(?<!\*)\*(?!\*)/;
const _SINGLE_UNDERSCORE_RE = /(?<!_)_(?!_)/;

// Strip the first heading from markdown if it matches the entry title (Notion-style:
// the title lives in metadata, the body should not repeat it as an H1/H2).
function _stripDuplicateHeading(md, title) {
  if (!md || !title) return md;
  const _clean = s => s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/^[\s#\-*>]+/, '')
    .trim()
    .toLowerCase();
  const cleanTitle = _clean(title);
  if (!cleanTitle) return md;
  const lines = md.split('\n');
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^#{1,3}\s+(.*)/);
    if (m && _clean(m[1]) === cleanTitle) {
      lines.splice(i, 1);
      // Remove the blank line that immediately follows, if any
      if (lines[i] !== undefined && !lines[i].trim()) lines.splice(i, 1);
      return lines.join('\n');
    }
    break; // only inspect the very first non-empty line
  }
  return md;
}

function _sanitizeMarkdownForEditor(md) {
  if (!md) return md;
  return md.split("\n").map(line => {
    // Collapse ***...*** / ___...___ (bold+italic) → **...** / __...__ FIRST.
    // If processed as separate ** and * passes, the intermediate result is
    // malformed and the single-star pass can't recover it, leaving italic+code
    // overlap that crashes BlockNote (RangeError: Invalid collection of marks).
    line = line.replace(/\*\*\*((?:[^*]|\*(?!\*))+)\*\*\*/g, '**$1**');
    line = line.replace(/___((?:[^_]|_(?!_))+)___/g,           '__$1__');
    line = _splitMarkerPairs(line, "**");
    line = _splitMarkerPairs(line, "__");
    line = _splitMarkerPairsRegex(line, _SINGLE_STAR_RE, "*");
    line = _splitMarkerPairsRegex(line, _SINGLE_UNDERSCORE_RE, "_");
    return line;
  }).join("\n");
}

// ---- ENTRY VIEW ----
async function loadEntry(id, opts = {}) {
  // CRITICAL: cancel any pending auto-save from the previous entry before switching
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
  currentEntryId = id;
  window._currentEntryId = id; // read by the database block to know whose children to list
  if (isMobile() || isCompact()) closeSidebarMobile();
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
  _setHomeAmbient(false);
  $("kanbanArea").classList.add("hidden");
  $("entryView").classList.remove("hidden");
  if ($("ctxBar")) $("ctxBar").classList.remove("hidden");

  // Close floating panels on new entry load
  $("movePanel").classList.add("hidden");
  $("saveKnowledgePanel")?.classList.add("hidden");
  closeHistoryPanel();
  closeTOC();
  window._closeCtxMenu?.();

  const m = data.meta;
  currentEntryMeta = m;
  const date = m.created_at ? m.created_at.slice(0, 10) : "—";

  // Track in recently visited
  _trackRecent(id, m.title, m.category_label || m.category, m.topic_label || m.topic, m.cover || "", m.icon || "");
  // Track studying if opened from courses space
  try {
    if (sessionStorage.getItem('activeSpace') === 'courses') {
      _trackStudying(id, m.title, typeof _activeCourseSlug !== 'undefined' ? _activeCourseSlug : '');
    }
  } catch {}

  // "Mover" (category/topic move) only applies to knowledge entries
  const moveBtnEl = $("moveBtn");
  if (moveBtnEl) moveBtnEl.style.display = (m.type === "teamspace" || m.type === "page") ? "none" : "";

  // "Guardar en Conocimiento" / "Generar mapa mental" only apply to course lessons
  const isCourseLesson = m.type === "course";
  $("cmSaveKnowledge")?.classList.toggle("hidden", !isCourseLesson);
  $("moreSaveKnowledge")?.classList.toggle("hidden", !isCourseLesson);
  $("cmMindmap")?.classList.toggle("hidden", !isCourseLesson);
  $("moreMindmap")?.classList.toggle("hidden", !isCourseLesson);

  // Set inline title (before editor render, so a content-load failure can't leave it blank)
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

  // Render inline editor with entry markdown
  const isNote = (m.category || "").toLowerCase() === "quick notes" || (m.category || "").toLowerCase() === "quick-notes";
  $("entryBody").classList.toggle("note-entry", isNote);
  if (_inlineEditor.setPersistenceKey) _inlineEditor.setPersistenceKey(id);
  // Loading can trigger the editor's onChange (e.g. while it clears old blocks before
  // inserting new ones) — guard against that being mistaken for a real edit and
  // auto-saved, which would overwrite the entry's real content with blank/partial data.
  _restoreInProgress = true;
  const _sanitizedMd = _sanitizeMarkdownForEditor(_stripDuplicateHeading(data.markdown, m.title));
  try {
    _inlineEditor.load(_sanitizedMd);
  } catch (err) {
    console.warn("Sanitized markdown still caused render error:", err.message);
    // Fallback: strip ALL inline code backticks so any remaining italic+code
    // overlaps can't crash the editor. Heading/list structure is preserved.
    try {
      _inlineEditor.load(_sanitizedMd.replace(/`([^`\n]*)`/g, '$1'));
      showToast("Formato de código ajustado por compatibilidad", "warning");
    } catch (err2) {
      console.error("Error al renderizar el contenido de la entrada:", err2);
      showToast("No se pudo renderizar el contenido de esta entrada", "error");
    }
  } finally {
    _restoreInProgress = false;
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = null;
  }
  $("contentArea").scrollTo(0, 0);

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

  // Build TOC after BlockNote (React) finishes rendering
  setTimeout(buildTOC, 300);

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

  // Prev/next navigation for course lessons
  _updateCourseNav(id, m);

  // Post-process entry: code execution buttons, Mermaid, KaTeX
  setTimeout(postProcessEntry, 250);
}

// ── Course lesson prev/next navigation ───────────────────────────────────
function _updateCourseNav(id, meta) {
  const old = document.getElementById('courseNavBar');
  if (old) old.remove();

  const inCourses = sessionStorage.getItem('activeSpace') === 'courses';
  const isCourse  = meta?.type === 'course' || !!meta?.course;
  if (!inCourses || !isCourse || !_activeCourseSlug) return;

  const tree = _coursesTreeData?.[_activeCourseSlug];
  if (!tree) return;

  // Flatten all lessons in module order
  const allEntries = [];
  for (const moduleData of Object.values(tree.modules || {})) {
    for (const entry of (moduleData.entries || [])) allEntries.push(entry);
  }

  const idx = allEntries.findIndex(e => e.id === id);
  if (idx === -1) return;

  const prev = idx > 0 ? allEntries[idx - 1] : null;
  const next = idx < allEntries.length - 1 ? allEntries[idx + 1] : null;

  const nav = document.createElement('div');
  nav.id = 'courseNavBar';
  nav.className = 'course-nav-bar';
  nav.innerHTML = `
    ${prev
      ? `<button class="course-nav-btn course-nav-prev" data-id="${escapeHtml(prev.id)}">
           <span class="cnb-arrow">←</span>
           <span class="cnb-label">${escapeHtml(prev.title)}</span>
         </button>`
      : '<span class="course-nav-spacer"></span>'}
    ${next
      ? `<button class="course-nav-btn course-nav-next" data-id="${escapeHtml(next.id)}">
           <span class="cnb-label">${escapeHtml(next.title)}</span>
           <span class="cnb-arrow">→</span>
         </button>`
      : '<span class="course-nav-spacer"></span>'}
  `;

  nav.querySelectorAll('.course-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => openCourseLesson(btn.dataset.id));
  });

  const ev = $('entryView');
  if (ev) ev.appendChild(nav);
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

function openCoverPicker(saveFn) {
  const _save = saveFn || saveCover;
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
        <div class="cover-photo-search-row">
          <input type="text" class="cover-photo-search-input" id="coverPhotoSearch" placeholder="Buscar imagen (ej: Python, espacio, ciudad…)" autocomplete="off" />
          <button class="cover-photo-search-btn" id="coverPhotoSearchBtn" title="Buscar"><iconify-icon icon="lucide:search" width="16"></iconify-icon></button>
        </div>
        <div class="cover-picker-grid cover-photo-grid" id="coverPhotoGrid"></div>
        <div class="cover-photo-status" id="coverPhotoStatus"></div>
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
      await _save(preset);
      overlay.remove();
    });
    grid.appendChild(swatch);
  });

  // Photo presets + Unsplash search
  const photoGrid = overlay.querySelector("#coverPhotoGrid");
  const photoStatus = overlay.querySelector("#coverPhotoStatus");
  const photoSearch = overlay.querySelector("#coverPhotoSearch");
  const photoSearchBtn = overlay.querySelector("#coverPhotoSearchBtn");
  let _photoSearchTimer = null;

  function _addPhotoSwatch(url, label, saveUrl) {
    const swatch = document.createElement("div");
    swatch.className = "cover-preset-swatch cover-photo-swatch";
    swatch.style.cssText = `background-image:url(${url});background-size:cover;background-position:center`;
    swatch.title = label || "";
    if (label) {
      const lbl = document.createElement("span");
      lbl.className = "cover-photo-label";
      lbl.textContent = label;
      swatch.appendChild(lbl);
    }
    swatch.addEventListener("click", async () => {
      await _save(`url(${saveUrl || url})`);
      overlay.remove();
    });
    photoGrid.appendChild(swatch);
  }

  function showPhotoPresets() {
    photoGrid.innerHTML = "";
    photoStatus.textContent = "";
    COVER_IMAGE_PRESETS.forEach(photo => _addPhotoSwatch(photo.url, photo.label, photo.url));
  }

  async function searchUnsplash(query) {
    photoGrid.innerHTML = "";
    photoStatus.innerHTML = '<span class="cover-photo-loading">Buscando imágenes…</span>';
    try {
      const res = await fetch(`/api/photos/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      const photos = data.photos || [];
      if (!photos.length) {
        photoStatus.innerHTML = `<span class="cover-photo-hint">Sin resultados para "${escapeHtml(query)}".</span>`;
        return;
      }
      photos.forEach(p => _addPhotoSwatch(p.thumb, null, p.full));
      const sourceLabel = data.source === "unsplash"
        ? `Imágenes de <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a>`
        : `Imágenes de <a href="https://www.flickr.com" target="_blank" rel="noopener">Flickr</a>`;
      photoStatus.innerHTML = `<span class="cover-photo-hint">${sourceLabel}</span>`;
    } catch (_) {
      photoGrid.innerHTML = "";
      photoStatus.innerHTML = '<span class="cover-photo-hint">Error al buscar imágenes.</span>';
    }
  }

  function triggerPhotoSearch() {
    const q = photoSearch.value.trim();
    if (!q) { showPhotoPresets(); return; }
    searchUnsplash(q);
  }

  showPhotoPresets();

  photoSearch.addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(_photoSearchTimer); triggerPhotoSearch(); } });
  photoSearch.addEventListener("input", () => {
    clearTimeout(_photoSearchTimer);
    const q = photoSearch.value.trim();
    if (!q) { showPhotoPresets(); return; }
    if (q.length >= 2) _photoSearchTimer = setTimeout(triggerPhotoSearch, 600);
  });
  photoSearchBtn.addEventListener("click", () => { clearTimeout(_photoSearchTimer); triggerPhotoSearch(); });

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
    await _save(`url(${val})`);
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
    await _save(`url(${url})`);
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
    if (addBtn)    addBtn.addEventListener("click", () => openCoverPicker());
    if (changeBtn) changeBtn.addEventListener("click", () => openCoverPicker());
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
  } else if (m.type === "page") {
    // Pages have no category/topic/teamspace — title and icon only
    if (window._setModalMode) window._setModalMode("page");
    $("knowledgeFields").classList.add("hidden");
    $("courseFields").classList.add("hidden");
    $("teamspaceFields")?.classList.add("hidden");
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
    if (currentModalMode === "page") {
      if (!title) { showToast("Ingresa un título", "error"); return; }
      const res = await fetch(`/api/entry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, icon }),
      });
      if (res.ok) {
        closeModal();
        showToast("Información actualizada");
        await loadTree();
        const titleEl = $("inlineTitle");
        if (titleEl) titleEl.textContent = title;
        if (currentEntryMeta) {
          currentEntryMeta.title = title;
          currentEntryMeta.icon = icon;
        }
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

// In-app replacement for window.prompt() — same visual language as showConfirm().
// Resolves to the trimmed input value, or null if cancelled / left empty.
function showPrompt(title, placeholder, defaultValue) {
  return new Promise(resolve => {
    $("promptTitle").textContent = title;
    const input = $("promptInput");
    input.placeholder = placeholder || "";
    input.value = defaultValue || "";
    $("promptOverlay").classList.remove("hidden");
    setTimeout(() => input.focus(), 50);

    const cleanup = (result) => {
      $("promptOverlay").classList.add("hidden");
      $("promptOk").removeEventListener("click", onOk);
      $("promptCancel").removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onOk = () => cleanup(input.value.trim() || null);
    const onCancel = () => cleanup(null);
    const onKeydown = e => {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    };
    $("promptOk").addEventListener("click", onOk);
    $("promptCancel").addEventListener("click", onCancel);
    input.addEventListener("keydown", onKeydown);
  });
}

// ---- EXPORT ----
function exportEntry(format) {
  if (!currentEntryId) return;
  window.open(`/api/export/${currentEntryId}/${format}`, "_blank");
}

function closeExportModal() {
  $('exportModalOverlay')?.classList.add('hidden');
}

function openExportModal() {
  if (!currentEntryId) return;
  const overlay = $('exportModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  const close = () => overlay.classList.add('hidden');

  $('exportModalClose').onclick   = close;
  $('exportModalCancel').onclick  = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };

  // Wire format buttons (idempotent — replace onclick each open)
  const group = $('exportFormatGroup');
  if (group) {
    group.querySelectorAll('.export-fmt-btn').forEach(btn => {
      btn.onclick = () => {
        group.querySelectorAll('.export-fmt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        group.dataset.selected = btn.dataset.fmt;
      };
    });
  }

  $('exportModalConfirm').onclick = () => {
    const fmt = group?.dataset.selected || 'md';
    exportEntry(fmt);
    close();
  };
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
  _wireCategoryTopicSmartSelects(catInput, catDrop, topicInput, topicDrop);
}

// Shared by the "Nueva entrada" modal and any other place (e.g. "Guardar en
// Conocimiento") that needs the same category/tema autocomplete + "+ Nueva:"
// create-on-the-fly behavior, backed by the same _allCategories/_treeCache data.
function _wireCategoryTopicSmartSelects(catInput, catDrop, topicInput, topicDrop) {
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
      // Category changed — clear the topic pick so it isn't stale
      topicInput.value = "";
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

let _coursesTree = {};
let _coursesTreeData = {}; // full courses tree from /api/courses/tree
let _activeCourseSlug = null;
let expandedCourses = {}; // tracks which courses have their inline tree visible

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
      <input class="icon-picker-search" type="text" placeholder="Buscar en 200,000+ iconos…" autocomplete="off" />
    </div>
    <div class="icon-picker-body"></div>
  `;

  const body = pop.querySelector(".icon-picker-body");
  const search = pop.querySelector(".icon-picker-search");
  let _debounceTimer = null;

  function _bindItems() {
    body.querySelectorAll(".icon-picker-item[data-color]").forEach(btn => {
      const glyph = btn.querySelector(".icon-picker-item-glyph, iconify-icon");
      if (glyph) glyph.style.color = btn.dataset.color;
    });
    body.querySelectorAll(".icon-picker-item").forEach(btn => {
      btn.addEventListener("click", () => { onPick(btn.dataset.icon); pop.remove(); });
    });
  }

  function _itemHtml(icon, label, color, selected) {
    return `<button type="button" class="icon-picker-item${selected ? " selected" : ""}" data-icon="${escapeHtml(icon)}" title="${escapeHtml(label)}"${color ? ` data-color="${escapeHtml(color)}"` : ''}>
      ${renderIconMarkup(icon, "icon-picker-item-glyph", icon)}
      <span>${escapeHtml(label)}</span>
    </button>`;
  }

  function showSuggested() {
    const q = search.value.trim().toLowerCase();
    const items = q
      ? ICON_CATALOG.filter(item =>
          item.label.toLowerCase().includes(q) ||
          item.icon.toLowerCase().includes(q) ||
          item.tags.some(t => t.includes(q)))
      : ICON_CATALOG;

    const groupMap = {};
    items.forEach(item => {
      (groupMap[item.group] = groupMap[item.group] || []).push(item);
    });

    body.innerHTML = Object.entries(groupMap).map(([gname, gitems]) => `
      <section class="icon-picker-group">
        <div class="icon-picker-group-title">${escapeHtml(gname)}</div>
        <div class="icon-picker-grid">
          ${gitems.map(it => _itemHtml(it.icon, it.label, it.color, it.icon === initialIcon)).join("")}
        </div>
      </section>
    `).join("") || '<div class="icon-picker-empty">Sin coincidencias.</div>';
    _bindItems();
  }

  async function searchIconify(query) {
    body.innerHTML = '<div class="icon-picker-loading"><span class="icon-picker-spinner"></span>Buscando iconos…</div>';
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=60`);
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      const icons = data.icons || [];
      if (!icons.length) {
        body.innerHTML = `<div class="icon-picker-empty">Sin resultados para "${escapeHtml(query)}".</div>`;
        return;
      }
      body.innerHTML = `
        <section class="icon-picker-group">
          <div class="icon-picker-group-title">Resultados <span class="icon-picker-count">${data.total > 60 ? `60 de ${data.total}` : icons.length}</span></div>
          <div class="icon-picker-grid">
            ${icons.map(iconId => {
              const label = iconId.split(":")[1]?.replace(/-/g, " ") || iconId;
              return _itemHtml(iconId, label, null, iconId === initialIcon);
            }).join("")}
          </div>
        </section>`;
      _bindItems();
    } catch (_) {
      showSuggested();
    }
  }

  showSuggested();

  search.addEventListener("input", () => {
    clearTimeout(_debounceTimer);
    const q = search.value.trim();
    if (q.length < 2) { showSuggested(); return; }
    _debounceTimer = setTimeout(() => searchIconify(q), 350);
  });

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
  initIconButton("newPageIconBtn", ENTRY_ICON_DEFAULTS.page);
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
  const cm = $("cmStar");
  if (cm) cm.textContent = starred ? "Quitar de destacados" : "Destacar";
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
let _tocScrollSpy = null;

function initTOC() {
  let _hideTimer = null;
  const trigger = $("tocTrigger");
  const panel   = $("tocPanel");

  function _showTOC() {
    if (!panel || panel.classList.contains("hidden")) return;
    // Only show when an entry is being viewed, not on home/course/kanban pages
    const ev = $("entryView");
    if (!ev || ev.classList.contains("hidden")) return;
    clearTimeout(_hideTimer);
    panel.classList.add("toc-visible");
    $("tocBtn")?.classList.add("active");
    _startScrollSpy();
  }

  function _scheduleHide() {
    _hideTimer = setTimeout(() => closeTOC(), 320);
  }

  trigger?.addEventListener("mouseenter", _showTOC);
  trigger?.addEventListener("mouseleave", _scheduleHide);
  panel?.addEventListener("mouseenter",   () => clearTimeout(_hideTimer));
  panel?.addEventListener("mouseleave",   _scheduleHide);

  // Button click as fallback (command palette, moreToc, etc.)
  $("tocBtn")?.addEventListener("click", toggleTOC);

  document.addEventListener("mousedown", e => {
    if (!panel || !panel.classList.contains("toc-visible")) return;
    if (!panel.contains(e.target) && e.target !== trigger && e.target !== $("tocBtn")) closeTOC();
  });
}

function toggleTOC() {
  const panel = $("tocPanel");
  if (!panel || panel.classList.contains("hidden")) return;
  const isVisible = panel.classList.contains("toc-visible");
  panel.classList.toggle("toc-visible", !isVisible);
  $("tocBtn")?.classList.toggle("active", !isVisible);
  if (!isVisible) _startScrollSpy();
  else _stopScrollSpy();
}

function closeTOC() {
  $("tocPanel")?.classList.remove("toc-visible");
  $("tocBtn")?.classList.remove("active");
  _stopScrollSpy();
}

function _startScrollSpy() {
  _stopScrollSpy();
  const items = document.querySelectorAll("#tocItems .toc-item");
  if (!items.length) return;

  function _updateActive() {
    const headingEls = _tocHeadings();
    if (!headingEls.length) return;
    let activeIdx = 0;
    for (let i = 0; i < headingEls.length; i++) {
      if (headingEls[i].getBoundingClientRect().top <= 80) activeIdx = i;
    }
    items.forEach(item => {
      item.classList.toggle("toc-item--active", parseInt(item.dataset.idx, 10) === activeIdx);
    });
  }

  const contentEl = $("contentArea") || window;
  contentEl.addEventListener("scroll", _updateActive, { passive: true });
  window.addEventListener("scroll", _updateActive, { passive: true });
  _tocScrollSpy = () => {
    contentEl.removeEventListener("scroll", _updateActive);
    window.removeEventListener("scroll", _updateActive);
  };
  _updateActive();
}

function _stopScrollSpy() {
  if (_tocScrollSpy) { _tocScrollSpy(); _tocScrollSpy = null; }
}

function _tocHeadings() {
  return Array.from($("entryBody")?.querySelectorAll("h1, h2, h3, h4") ?? []);
}

// Scrolls `target` to just below the sticky ctx-bar (breadcrumb toolbar) —
// it lives inside #contentArea and overlays whatever scrolls to the top of
// that container, so a plain "scroll to top + 16px" leaves headings partially
// hidden underneath it. Shared by the TOC panel and the course subtopic jump.
function _scrollHeadingIntoView(target) {
  if (!target) return;
  const container = $("contentArea");
  if (!container) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const ctxBar = $("ctxBar");
  const ctxBarH = (ctxBar && !ctxBar.classList.contains("hidden"))
    ? ctxBar.getBoundingClientRect().height : 0;
  const top = container.scrollTop + target.getBoundingClientRect().top
              - container.getBoundingClientRect().top - ctxBarH - 16;
  container.scrollTo({ top, behavior: "smooth" });
}

function buildTOC() {
  const body     = $("entryBody");
  const tocItems = $("tocItems");
  const tocPanel = $("tocPanel");
  if (!body || !tocItems || !tocPanel) return;

  const headings = _tocHeadings();

  if (headings.length < 1) {
    tocPanel.classList.add("hidden");
    tocPanel.classList.remove("toc-visible");
    $("tocBtn")?.classList.remove("active");
    tocItems.innerHTML = '<div class="toc-empty">Sin secciones</div>';
    _stopScrollSpy();
    return;
  }

  tocPanel.classList.remove("hidden");

  const clsMap = { H1: "toc-item", H2: "toc-item", H3: "toc-item toc-h3", H4: "toc-item toc-h4" };
  tocItems.innerHTML = headings.map((h, i) => {
    const cls  = clsMap[h.tagName] || "toc-item";
    const text = h.textContent
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/^[→#✦•\-\s]+/, '')
      .trim();
    return `<div class="${cls}" data-idx="${i}">${escapeHtml(text)}</div>`;
  }).join("");

  tocItems.querySelectorAll(".toc-item").forEach(item => {
    item.addEventListener("click", () => {
      // Re-query at click time — avoids stale refs from React re-renders
      const idx    = parseInt(item.dataset.idx, 10);
      const target = _tocHeadings()[idx];
      _scrollHeadingIntoView(target);
    });
  });

  if (tocPanel.classList.contains("toc-visible")) _startScrollSpy();
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
// FEATURE 7 — CATEGORY/TEMA CONTEXT MENU (right-click: export, rename/merge)
// ============================================================
let _ctxCategory = null;
let _ctxCategoryLabel = null;
let _ctxTopic = null;
let _ctxTopicLabel = null;

function initContextMenu() {
  document.addEventListener("contextmenu", e => {
    const topicHeader = e.target.closest(".tree-topic-header");
    const catHeader    = e.target.closest(".tree-category-header");

    if (topicHeader) {
      e.preventDefault();
      const topicEl = topicHeader.closest(".tree-topic");
      const catEl   = topicHeader.closest(".tree-category");
      _ctxCategory      = catEl ? catEl.dataset.cat : null;
      _ctxCategoryLabel = catEl ? catEl.dataset.catLabel : null;
      _ctxTopic         = topicEl ? topicEl.dataset.topic : null;
      _ctxTopicLabel    = topicEl ? topicEl.dataset.topicLabel : null;
      if (!_ctxCategory || !_ctxTopic) return;
      $("ctxExportMd").classList.add("hidden");
      $("ctxExportPdf").classList.add("hidden");
      _showContextMenu(e);
      return;
    }

    if (catHeader) {
      e.preventDefault();
      const catEl = catHeader.closest(".tree-category");
      _ctxCategory      = catEl ? catEl.dataset.cat : null;
      _ctxCategoryLabel = catEl ? catEl.dataset.catLabel : null;
      _ctxTopic = null;
      _ctxTopicLabel = null;
      if (!_ctxCategory) return;
      $("ctxExportMd").classList.remove("hidden");
      $("ctxExportPdf").classList.remove("hidden");
      _showContextMenu(e);
      return;
    }

    hideContextMenu();
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
  $("ctxReorg").addEventListener("click", () => {
    if (_ctxTopic) {
      openReorgModal({
        scope: "topic",
        category: _ctxCategory, categoryLabel: _ctxCategoryLabel,
        topic: _ctxTopic, topicLabel: _ctxTopicLabel,
      });
    } else if (_ctxCategory) {
      openReorgModal({
        scope: "category",
        category: _ctxCategory, categoryLabel: _ctxCategoryLabel,
      });
    }
    hideContextMenu();
  });
}

function _showContextMenu(e) {
  const menu = $("contextMenu");
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.classList.remove("hidden");
}

function hideContextMenu() {
  $("contextMenu").classList.add("hidden");
  _ctxCategory = null;
  _ctxCategoryLabel = null;
  _ctxTopic = null;
  _ctxTopicLabel = null;
}

// ── Reorganizar categoría/tema modal ─────────────────────────────────────────
let _reorgScope = null;
let _reorgSource = null;

function initReorgModal() {
  const catInput   = $("reorgCategory");
  const catDrop    = $("reorgCatDropdown");
  const topicInput = $("reorgTopic");
  const topicDrop  = $("reorgTopicDropdown");
  if (catInput && catDrop && topicInput && topicDrop) {
    _wireCategoryTopicSmartSelects(catInput, catDrop, topicInput, topicDrop);
  }
  $("reorgModalClose")?.addEventListener("click", closeReorgModal);
  $("reorgCancelBtn")?.addEventListener("click", closeReorgModal);
  $("reorgModalOverlay")?.addEventListener("click", e => {
    if (e.target === $("reorgModalOverlay")) closeReorgModal();
  });
  $("reorgApplyBtn")?.addEventListener("click", applyReorg);
}

function openReorgModal({ scope, category, categoryLabel, topic, topicLabel }) {
  _reorgScope = scope;
  _reorgSource = { category, categoryLabel, topic, topicLabel };

  const topicGroup = $("reorgTopicGroup");
  if (scope === "category") {
    $("reorgModalTitle").textContent = "Renombrar / fusionar categoría";
    $("reorgCurrent").textContent = `Actualmente: ${categoryLabel}`;
    $("reorgCategory").value = categoryLabel;
    $("reorgTopic").value = "";
    topicGroup.classList.add("hidden");
  } else {
    $("reorgModalTitle").textContent = "Renombrar / fusionar tema";
    $("reorgCurrent").textContent = `Actualmente: ${categoryLabel} › ${topicLabel}`;
    $("reorgCategory").value = categoryLabel;
    $("reorgTopic").value = topicLabel;
    topicGroup.classList.remove("hidden");
  }
  $("reorgModalOverlay").classList.remove("hidden");
  setTimeout(() => $("reorgCategory").focus(), 60);
}

function closeReorgModal() {
  $("reorgModalOverlay").classList.add("hidden");
  _reorgScope = null;
  _reorgSource = null;
}

async function applyReorg() {
  if (!_reorgScope || !_reorgSource) return;
  const newCategoryLabel = $("reorgCategory").value.trim();
  const newTopicLabel = _reorgScope === "topic" ? $("reorgTopic").value.trim() : "";
  if (!newCategoryLabel || (_reorgScope === "topic" && !newTopicLabel)) {
    showToast("Completa los campos requeridos", "error");
    return;
  }

  const body = {
    match_category: _reorgSource.category,
    match_topic: _reorgScope === "topic" ? _reorgSource.topic : null,
    new_category_label: newCategoryLabel,
    new_topic_label: _reorgScope === "topic" ? newTopicLabel : null,
  };

  const res = await fetch("/api/reorganize-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    showToast("Error al reorganizar", "error");
    return;
  }
  const data = await res.json();
  closeReorgModal();
  showToast(`${data.moved} entrada(s) reorganizadas`);
  await loadTree();
  Promise.all([loadCategorySuggestions(), loadTopicSuggestions()]).then(initSmartSelects);
  if (currentEntryId) loadEntry(currentEntryId, { force: true });
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
  // Save blockId before closeModal clears it
  const savedBlockId = _pendingPageBlockId;
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
    const targetEditor = window._activeEditorForPageCreate || _inlineEditor;
    window._activeEditorForPageCreate = null;
    // If we have the placeholder block's ID, update it in place; otherwise append
    if (savedBlockId && targetEditor.updatePageBlock) {
      targetEditor.updatePageBlock(savedBlockId, name, d.id);
    } else {
      targetEditor.addPageBlock(name, d.id);
    }
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

function closeHistoryPanel() {
  $("historyPanel")?.classList.add("hidden");
  $("historyBtn")?.classList.remove("active");
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
      _inlineEditor.load(_sanitizeMarkdownForEditor(_stripDuplicateHeading(fresh.markdown || "", currentEntryMeta?.title || "")));
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
  // Remove previous backlinks section before adding the new one
  $("entryView").querySelector(".backlinks-section")?.remove();

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
  // Insert as a sibling after entryBody (the BlockNote root), never as a child of it
  $("entryBody").after(section);
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
  try {
    const res = await fetch("/api/categories");
    if (!res.ok) return;
    const cats = await res.json();
    const dl = $("moveCatSuggestions");
    if (dl) dl.innerHTML = Object.values(cats).map(c => `<option value="${escapeHtml(c)}">`).join("");
  } catch { /* categories endpoint unavailable — non-critical */ }
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
// NEW FEATURE: SAVE COURSE LESSON AS KNOWLEDGE ENTRY
// ============================================================
function initSaveKnowledge() {
  const catInput   = $("skCategory");
  const catDrop    = $("skCatDropdown");
  const topicInput = $("skTopic");
  const topicDrop  = $("skTopicDropdown");
  if (catInput && catDrop && topicInput && topicDrop) {
    _wireCategoryTopicSmartSelects(catInput, catDrop, topicInput, topicDrop);
  }
  $("skCancelBtn")?.addEventListener("click", closeSaveKnowledgePanel);
  $("skApplyBtn")?.addEventListener("click", applySaveKnowledge);
}

function openSaveKnowledgePanel() {
  if (!currentEntryId || !currentEntryMeta || currentEntryMeta.type !== "course") return;
  closeMovePanel();
  $("skTitle").value = currentEntryMeta.title || "";
  $("skCategory").value = "";
  $("skTopic").value = "";
  $("saveKnowledgePanel")?.classList.remove("hidden");
  $("skTitle").focus();
}

function closeSaveKnowledgePanel() {
  $("saveKnowledgePanel")?.classList.add("hidden");
}

async function applySaveKnowledge() {
  if (!currentEntryId || !currentEntryMeta) return;
  const title    = $("skTitle").value.trim();
  const category = $("skCategory").value.trim();
  const topic    = $("skTopic").value.trim();
  if (!title || !category || !topic) {
    showToast("Completa título, categoría y tema", "error");
    return;
  }

  const md = _inlineEditor ? _inlineEditor.getMarkdown() : "";
  const sourceUid = currentEntryMeta.uid;

  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_type: "knowledge",
      title,
      category,
      topic,
      raw_text: md,
      already_markdown: true,
      icon: currentEntryMeta.icon || "",
    }),
  });

  if (!res.ok) {
    showToast("Error al guardar en Conocimiento", "error");
    return;
  }
  const data = await res.json();

  // Link the new knowledge entry back to the lesson it came from — best-effort,
  // the save itself already succeeded either way.
  if (data.uid && sourceUid) {
    fetch("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_uid: data.uid, to_uid: sourceUid, rel_type: "derived_from" }),
    }).catch(() => {});
  }

  closeSaveKnowledgePanel();
  showToast("★ Guardada en Conocimiento");
  await loadTree();
  Promise.all([loadCategorySuggestions(), loadTopicSuggestions()]).then(initSmartSelects);
}

// "Generar mapa mental" on a course lesson — jumps to the Mapas Mentales
// space and immediately triggers AI generation using the lesson's own title
// (stripped of a leading "0.2 " style numbering) AND its actual content, in
// "summarize" mode — a study map of what this specific lesson says, not a
// fresh generic plan invented from the title alone (mode "explore", used by
// the standalone prompt field, has no lesson text to ground itself in).
function _generateMindmapForCurrentLesson() {
  if (!currentEntryMeta || currentEntryMeta.type !== "course") return;
  const topic = (currentEntryMeta.title || "").replace(/^\s*\d+(\.\d+)*\s+/, "").trim();
  if (!topic) return;
  const content = _inlineEditor ? _inlineEditor.getMarkdown() : "";
  document.querySelector('.ab-item[data-space="mindmaps"]')?.click();
  if (window.MindmapApp) window.MindmapApp.generateFromPrompt(topic, { content, mode: "summarize" });
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
  const cm = $("cmPin");
  if (cm) cm.textContent = pinned ? "Desfijar de inicio" : "Fijar en inicio";
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

const STATUS_CYCLE  = ["pendiente", "progreso", "dominado"];
const STATUS_LABELS = { pendiente: "● pend", progreso: "◐ prog", dominado: "✓ done" };

// Course lessons use a separate status vocabulary
const COURSE_STATUS_CYCLE  = ["pendiente", "en_progreso", "completado"];
const COURSE_STATUS_LABELS = { pendiente: "○ pend", en_progreso: "→ prog", completado: "✓ hecho" };

function _isCourseEntry() {
  return sessionStorage.getItem('activeSpace') === 'courses' && !!(currentEntryMeta?.course || currentEntryMeta?.type === 'course');
}

function updateStatusBtn(btn, status) {
  const label = STATUS_LABELS[status] || COURSE_STATUS_LABELS[status] || "● pend";
  btn.textContent = label;
  btn.className = `btn-ghost status-${status}`;
  const ctx = $("ctxStatus");
  if (ctx) { ctx.textContent = label; ctx.className = `ctx-btn ctx-btn--status status-${status}`; }
}

function _syncCourseEntryStatus(id, status) {
  if (!_coursesTreeData || !_activeCourseSlug) return;
  const tree = _coursesTreeData[_activeCourseSlug];
  if (!tree) return;
  for (const mod of Object.values(tree.modules || {})) {
    const entry = (mod.entries || []).find(e => e.id === id);
    if (entry) { entry.status = status; break; }
  }
  // Sync roadmap row if visible
  const row = document.querySelector(`.cv-roadmap-entry[data-entry-id="${id}"]`);
  if (row) {
    row.className = `cv-roadmap-entry cv-roadmap-entry--${status}`;
    const btn = row.querySelector('.cv-status-btn');
    if (btn) btn.textContent = _statusIcon(status);
  }
}

async function cycleStatus(id, btn, refreshSidebar) {
  if (!id) return;
  const isCourse = _isCourseEntry();
  const cycle = isCourse ? COURSE_STATUS_CYCLE : STATUS_CYCLE;
  const current = statusMap[id] || "pendiente";
  const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
  const next = cycle[nextIdx];
  const res = await fetch(`/api/entry/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
  if (!res.ok) return;
  statusMap[id] = next;
  updateStatusBtn(btn, next);
  if (refreshSidebar) {
    const dot = document.querySelector(`.tree-entry[data-id="${id}"] .status-dot`);
    if (dot) dot.className = `status-dot status-${next}`;
  }
  // Refresh course progress and roadmap sync
  if (isCourse && _activeCourseSlug) {
    _syncCourseEntryStatus(id, next);
    _refreshProgressBar(_activeCourseSlug);
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
  const isPage      = meta.type === "page";

  // Space root label
  let spaceLabel = "Conocimiento";
  let spaceSpace = "knowledge";
  if (isCourse)    { spaceLabel = "Cursos";   spaceSpace = "courses"; }
  if (isTeamspace) { spaceLabel = "Team";     spaceSpace = "teamspace"; }
  if (isPage)      { spaceLabel = "Páginas";  spaceSpace = "pages"; }

  const catLabelRaw   = isCourse ? (_coursesTreeData[meta.course]?.label || meta.course_label || meta.course) : isTeamspace ? "Teamspace" : isPage ? "" : (meta.category_label || meta.category);
  const topicLabelRaw = isCourse ? (meta.module_label || meta.module)    : isTeamspace ? (meta.teamspace_label || meta.teamspace) : isPage ? "" : (meta.topic_label || meta.topic);
  const catLabel   = catLabelRaw   ? escapeHtml(catLabelRaw)   : "";
  const topicLabel = topicLabelRaw ? escapeHtml(topicLabelRaw) : "";
  const entryTitle = escapeHtml(meta.title || "Sin título");

  const hasIntermediates = !!(catLabel || topicLabel);
  let breadcrumbHTML;
  if ((isMobile() || isCompact()) && hasIntermediates) {
    const fullPath = [spaceLabel, catLabel, topicLabel].filter(Boolean).join(" › ");
    breadcrumbHTML =
      `<span class="breadcrumb-collapse" data-space="${spaceSpace}" title="${fullPath}">···</span>` +
      `<span class="breadcrumb-sep">›</span>` +
      `<span class="breadcrumb-seg breadcrumb-current">${entryTitle}</span>`;
  } else {
    const segs = [
      `<span class="breadcrumb-seg breadcrumb-space" data-space="${spaceSpace}">${spaceLabel}</span>`,
      catLabel   ? `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg" data-cat="${escapeHtml(meta.category || meta.course || "")}">${catLabel}</span>` : "",
      topicLabel ? `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg">${topicLabel}</span>` : "",
      `<span class="breadcrumb-sep">›</span><span class="breadcrumb-seg breadcrumb-current">${entryTitle}</span>`,
    ];
    breadcrumbHTML = segs.join("");
  }
  $("breadcrumb").innerHTML = breadcrumbHTML;

  // Space / collapse click → switch sidebar space
  $("breadcrumb").querySelector(".breadcrumb-space, .breadcrumb-collapse")?.addEventListener("click", () => {
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

  // ctxStatus proxies statusBtn (keep label in sync)
  const ctxStatus = $("ctxStatus");
  const statusBtn = $("statusBtn");
  if (ctxStatus && statusBtn) {
    ctxStatus.textContent = statusBtn.textContent;
    ctxStatus.className = statusBtn.className.replace("btn-ghost", "ctx-btn ctx-btn--status");
    ctxStatus.onclick = () => statusBtn.click();
  }
}

// ── ⋯ overflow menu — initialized ONCE at startup ────────────────────────────
(function initCtxMoreMenu() {
  const ctxMore     = $("ctxMore");
  const ctxMoreMenu = $("ctxMoreMenu");
  if (!ctxMore || !ctxMoreMenu) return;

  function _closeCtxMenu() {
    ctxMoreMenu.classList.add("hidden");
    ctxMore.classList.remove("active");
  }
  window._closeCtxMenu = _closeCtxMenu;

  ctxMore.addEventListener("click", e => {
    e.stopPropagation();
    const opening = ctxMoreMenu.classList.contains("hidden");
    ctxMoreMenu.classList.toggle("hidden", !opening);
    ctxMore.classList.toggle("active", opening);
    if (opening && currentEntryId) {
      const cmStar = $("cmStar");
      const cmPin  = $("cmPin");
      if (cmStar) cmStar.textContent = starredMap[currentEntryId] ? "Quitar de destacados" : "Destacar";
      if (cmPin)  cmPin.textContent  = pinnedMap[currentEntryId]  ? "Desfijar de inicio"   : "Fijar en inicio";
    }
  });

  document.addEventListener("click", e => {
    if (!ctxMoreMenu.contains(e.target) && e.target !== ctxMore) _closeCtxMenu();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") _closeCtxMenu();
  });

  $("cmEdit")?.addEventListener("click",      () => { $("editBtn")?.click();         _closeCtxMenu(); });
  $("cmHistory")?.addEventListener("click",   () => { $("historyBtn")?.click();      _closeCtxMenu(); });
  $("cmDuplicate")?.addEventListener("click", () => { $("dupBtn")?.click();          _closeCtxMenu(); });
  $("cmMove")?.addEventListener("click",      () => { $("moveBtn")?.click();         _closeCtxMenu(); });
  $("cmSaveKnowledge")?.addEventListener("click", () => { openSaveKnowledgePanel();   _closeCtxMenu(); });
  $("cmMindmap")?.addEventListener("click",   () => { _generateMindmapForCurrentLesson(); _closeCtxMenu(); });
  $("cmAI")?.addEventListener("click",        () => { $("aiBtn")?.click();           _closeCtxMenu(); });
  $("cmPasteMd")?.addEventListener("click",   () => { $("pasteMarkdownBtn")?.click(); _closeCtxMenu(); });
  $("cmToc")?.addEventListener("click",       () => { $("tocBtn")?.click();          _closeCtxMenu(); });
  $("cmFocus")?.addEventListener("click",     () => { $("focusBtn")?.click();        _closeCtxMenu(); });
  $("cmExport")?.addEventListener("click",    () => { openExportModal();             _closeCtxMenu(); });
  $("cmStar")?.addEventListener("click",      () => { $("starBtn")?.click();         _closeCtxMenu(); });
  $("cmPin")?.addEventListener("click",       () => { $("pinBtn")?.click();          _closeCtxMenu(); });
  $("cmDelete")?.addEventListener("click",    () => { $("deleteBtn")?.click();       _closeCtxMenu(); });
})();

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
    // Crear
    { id: 'act:new-entry',   label: 'Nueva entrada',        icon: '✦', group: 'Crear', shortcut: null,
      run: () => { openNewModal(); } },
    { id: 'act:new-board',   label: 'Nuevo tablero Kanban', icon: '⊞', group: 'Crear', shortcut: null,
      run: () => { document.getElementById('newKanbanBoardBtn')?.click(); } },
    { id: 'act:new-mindmap', label: 'Nuevo mapa mental',   icon: '✺', group: 'Crear', shortcut: null,
      run: () => { document.getElementById('newMindmapBtn')?.click(); } },
    // Navegar
    { id: 'act:home',        label: 'Inicio',               icon: '⌂', group: 'Navegar', shortcut: null,
      run: () => { document.querySelector('.ab-item[data-space="home"]')?.click(); } },
    { id: 'act:knowledge',   label: 'Conocimiento',         icon: '◉', group: 'Navegar', shortcut: null,
      run: () => { document.querySelector('.ab-item[data-space="knowledge"]')?.click(); } },
    { id: 'act:courses',     label: 'Mis Cursos',           icon: '◎', group: 'Navegar', shortcut: null,
      run: () => { document.querySelector('.ab-item[data-space="courses"]')?.click(); } },
    { id: 'act:starred',     label: 'Ver Favoritos',        icon: '☆', group: 'Navegar', shortcut: null,
      run: () => { document.querySelector('.ab-item[data-space="knowledge"]')?.click(); document.getElementById('wsStarred')?.click(); } },
    { id: 'act:mindmaps',    label: 'Mapas Mentales',       icon: '✺', group: 'Navegar', shortcut: null,
      run: () => { document.querySelector('.ab-item[data-space="mindmaps"]')?.click(); } },
    // Herramientas (activas al tener una entrada abierta)
    { id: 'act:ask-ai',      label: 'Consultar IA',         icon: '✦', group: 'Herramientas', shortcut: null,
      run: () => { document.getElementById('cmAI')?.click(); } },
    { id: 'act:focus',       label: 'Modo Focus',           icon: '⊙', group: 'Herramientas', shortcut: null,
      run: () => { document.getElementById('cmFocus')?.click(); } },
    { id: 'act:toc',         label: 'Tabla de contenidos',  icon: '¶', group: 'Herramientas', shortcut: null,
      run: () => { document.getElementById('cmToc')?.click(); } },
    { id: 'act:paste-md',    label: 'Pegar Markdown',       icon: '↓', group: 'Herramientas', shortcut: null,
      run: () => { document.getElementById('cmPasteMd')?.click(); } },
    // Sistema
    { id: 'act:theme',       label: 'Cambiar tema',         icon: '◐', group: 'Sistema', shortcut: null,
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

function setSidebarVisible(visible) {
  const s = document.getElementById('sidebar');
  if (!s) return;
  const ov = document.getElementById('sidebarOverlay');
  if (isMobile() || isCompact()) {
    // Mobile + compact: sidebar is always in DOM, shown via drawer (transform).
    s.style.display = '';
    if (visible) {
      // Auto-open drawer when switching to a space that has a sidebar tree.
      s.classList.add('mobile-open');
      if (ov) ov.classList.add('active');
      document.body.classList.add('sidebar-open');
    } else {
      s.classList.remove('mobile-open');
      if (ov) ov.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    }
  } else {
    s.style.display = visible ? '' : 'none';
    document.body.classList.toggle('sidebar-open', visible);
  }
}

// Auto-manage sidebar when crossing the 1024px compact breakpoint
(function() {
  let _lastWasWide = window.innerWidth > 1024;
  let _sidebarWasOpen = false;
  window.addEventListener('resize', () => {
    const nowWide = window.innerWidth > 1024;
    if (_lastWasWide && !nowWide) {
      // Desktop → compact: remember open state, then close sidebar as drawer
      _sidebarWasOpen = document.body.classList.contains('sidebar-open');
      const s = document.getElementById('sidebar');
      if (s) { s.style.display = ''; s.classList.remove('mobile-open'); }
      const ov = document.getElementById('sidebarOverlay');
      if (ov) ov.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    } else if (!_lastWasWide && nowWide) {
      // Compact → desktop
      const s = document.getElementById('sidebar');
      if (s) s.classList.remove('mobile-open');
      const ov = document.getElementById('sidebarOverlay');
      if (ov) ov.classList.remove('active');
      if (s && !s.classList.contains('collapsed')) {
        // Only show sidebar + layout padding when a space panel has content.
        // Without this check, opening a note from the home screen (where all
        // sidebar panels are display:none) would create an empty panel on expand.
        const _PANEL_IDS = ['spaceKnowledge','spaceCourses','spaceBoards','spaceTeamspace','spacePages','spaceRadar','spaceGraph'];
        const _hasPanel = _PANEL_IDS.some(id => { const p = document.getElementById(id); return p && p.style.display !== 'none'; });
        s.style.display = _hasPanel ? '' : 'none';
        document.body.classList.toggle('sidebar-open', _hasPanel);
      } else {
        if (s) s.style.display = 'none';
        document.body.classList.remove('sidebar-open');
      }
    }
    _lastWasWide = nowWide;
  });
})();

(function() {
  const SPACES = ['knowledge', 'courses', 'boards', 'mindmaps', 'teamspace', 'pages', 'graph', 'radar', 'practice', 'quiz'];

  function switchSpace(space) {
    // Close floating panels that live outside #entryView
    closeHistoryPanel();
    closeTOC();
    closeExportModal();
    window._closeCtxMenu?.();

    // Stop hero canvas animation when leaving home
    if (space !== 'home' && typeof _heroCanvasStop === 'function') {
      _heroCanvasStop(); _heroCanvasStop = null;
    }

    // Sync mobile drawer nav active state (runs for all spaces including home)
    document.querySelectorAll('.msn-item[data-space]').forEach(btn => {
      btn.classList.toggle('msn-active', btn.dataset.space === space);
    });

    // Restore sidebar for all spaces except home (home hides it below)
    setSidebarVisible(true);

    // Show/hide sidebar panels
    SPACES.forEach(s => {
      const panel = document.getElementById('space' + s.charAt(0).toUpperCase() + s.slice(1));
      if (panel) panel.style.display = s === space ? '' : 'none';
    });

    // Always hide ALL main panels first, then selectively show the right one
    const graphView       = document.getElementById('graphView');
    const courseView      = document.getElementById('courseView');
    const courseEmptySt   = document.getElementById('courseEmptyState');
    const kanbanArea      = document.getElementById('kanbanArea');
    const mindmapArea     = document.getElementById('mindmapArea');
    const entryView       = document.getElementById('entryView');
    const entryCover      = document.getElementById('entryCover');
    const entryAddCover   = document.getElementById('entryAddCover');
    const welcome         = document.getElementById('welcome');

    const ctxBarEl = document.getElementById('ctxBar');

    const radarView    = document.getElementById('radarView');
    const practiceView = document.getElementById('practiceView');
    const quizView      = document.getElementById('quizView');

    if (graphView)      graphView.classList.add('hidden');
    if (radarView)      radarView.classList.add('hidden');
    if (practiceView)   practiceView.classList.add('hidden');
    if (quizView)       quizView.classList.add('hidden');
    if (courseView)     courseView.classList.add('hidden');
    if (courseEmptySt)  courseEmptySt.classList.add('hidden');
    if (kanbanArea)     kanbanArea.classList.add('hidden');
    if (mindmapArea)    mindmapArea.classList.add('hidden');
    if (entryView)      entryView.classList.add('hidden');
    if (entryCover)     entryCover.classList.add('hidden');
    if (entryAddCover)  entryAddCover.classList.add('hidden');
    if (welcome)        welcome.style.display = 'none';
    _setHomeAmbient(false);
    if (ctxBarEl)       ctxBarEl.classList.add('hidden');
    // Stray floating bits (custom-select dropdown portals) live outside this
    // view entirely (appended to document.body), so hiding #practiceView
    // alone wouldn't remove them if you navigate away mid-pick.
    document.querySelectorAll('.practice-cselect-portal').forEach(el => el.remove());

    if (space === 'home') {
      // Hide sidebar completely — only the activity rail stays visible
      setSidebarVisible(false);
      if (welcome) {
        welcome.classList.remove('hidden'); // clear hidden class set by loadEntry/showKanbanArea
        welcome.style.display = '';
        if (typeof renderHome === 'function') renderHome();
      }
      document.querySelectorAll('.ab-item[data-space]').forEach(btn => btn.classList.remove('ab-item--active'));
      try { sessionStorage.setItem('activeSpace', 'home'); } catch(e) {}
      return;
    }

    if (space === 'graph') {
      if (graphView) graphView.classList.remove('hidden');
      if (typeof renderGraph === 'function') renderGraph();
    } else if (space === 'radar') {
      if (radarView) radarView.classList.remove('hidden');
      if (typeof loadRadarFeed === 'function') loadRadarFeed();
    } else if (space === 'courses' && _activeCourseSlug) {
      // Active course — course view handles its own header; ctxBar stays hidden
      if (courseView) courseView.classList.remove('hidden');
      // Re-render active tab if cvBody was cleared (e.g. after navigating away)
      const cvBody = document.getElementById('cvBody');
      if (cvBody && !cvBody.hasChildNodes()) {
        const activeTab = courseView?.querySelector('.cv-tab--active')?.dataset.tab || 'roadmap';
        if (typeof renderCourseTab === 'function') renderCourseTab(activeTab, _activeCourseSlug, null);
      }
    } else if (space === 'courses') {
      // Courses space but no active course — show clean empty state, not the home screen
      if (courseEmptySt) courseEmptySt.classList.remove('hidden');
    } else if (space === 'mindmaps') {
      // Land directly on the prompt-first screen — no intermediate empty state
      if (window.MindmapApp) window.MindmapApp.showList();
    } else if (space === 'practice') {
      if (practiceView) practiceView.classList.remove('hidden');
      if (typeof _renderPracticeSpace === 'function') _renderPracticeSpace();
    } else if (space === 'quiz') {
      if (quizView) quizView.classList.remove('hidden');
      if (typeof _renderQuizSpace === 'function') _renderQuizSpace();
    } else {
      // knowledge, teamspace, boards, pages — show welcome unless entry open
      if (!currentEntryId && welcome) welcome.style.display = '';
      if (currentEntryId && entryView) entryView.classList.remove('hidden');
      if (currentEntryId && ctxBarEl) ctxBarEl.classList.remove('hidden');
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

    // Mobile drawer space nav — switch space, close only for spaces with no sidebar tree
    document.querySelectorAll('.msn-item[data-space]').forEach(btn => {
      btn.addEventListener('click', () => {
        const space = btn.dataset.space;
        switchSpace(space);
        const noTree = ['home', 'graph', 'radar', 'practice', 'quiz'];
        if (noTree.includes(space)) closeSidebarMobile();
      });
    });

    // Search icon → Command Palette
    const abSearch = document.getElementById('abSearch');
    if (abSearch) {
      abSearch.addEventListener('click', () => {
        if (window.CommandPalette) window.CommandPalette.open();
      });
    }

    // Courses space
    initCoursesSpace();
    initLessonModal();
    initEditCourseModal();
    initMoveLessonModal();

    // Start at Home — all spaces load on demand
    switchSpace('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for use in buildBreadcrumb
  window.switchSpace = switchSpace;
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
  catch { list.innerHTML = ''; _renderBacklinks([], entryUid); return; }

  // Merge outgoing + incoming, deduplicate by id
  const seen = new Set();
  const all = [];
  for (const r of [...(data.outgoing||[]), ...(data.incoming||[])]) {
    if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
  }

  if (!all.length) { list.innerHTML = '<span class="rel-empty">Sin relaciones aún.</span>'; }
  else {
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
        const chipBadge = other.orphaned ? '<span class="entity-type-badge etype-orphan">eliminada</span>' : _entityTypeBadgeHtml(other.type);
        chip.innerHTML = `${chipBadge}<span class="rel-chip-title">${escapeHtml(other.title || other.id || '?')}</span><button class="rel-chip-del" data-rel-id="${r.id}" title="Quitar">×</button>`;
        chip.querySelector('.rel-chip-title').addEventListener('click', () => {
          _navigateToEntity(other);
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

  // Populate backlinks panel from incoming relations
  _renderBacklinks(data.incoming || [], entryUid);
}

function _renderBacklinks(incoming, entryUid) {
  const panel = document.getElementById('backlinkPanel');
  const listEl = document.getElementById('backlinkList');
  const countEl = document.getElementById('backlinkCount');
  if (!panel || !listEl) return;

  if (!incoming.length) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  countEl.textContent = incoming.length;
  listEl.innerHTML = '';

  // Group by rel_type
  const groups = {};
  for (const r of incoming) {
    (groups[r.rel_type] = groups[r.rel_type] || []).push(r);
  }

  for (const [relType, rels] of Object.entries(groups)) {
    const grpLabel = document.createElement('span');
    grpLabel.className = 'backlinks-group-label';
    grpLabel.textContent = REL_LABELS[relType] || relType;
    listEl.appendChild(grpLabel);

    for (const r of rels) {
      const src = r.from_entity || {};
      const orphaned = !!src.orphaned;
      const row = document.createElement('div');
      row.className = 'backlink-row' + (orphaned ? ' backlink-orphaned' : '');
      row.title = (REL_LABELS[relType] || relType) + (orphaned ? ' — entrada eliminada' : '');

      const badge = orphaned
        ? '<span class="entity-type-badge etype-orphan">eliminada</span>'
        : _entityTypeBadgeHtml(src.type);

      row.innerHTML = `${badge}<span class="backlink-title">${escapeHtml(src.title || src.id || '?')}</span>`;
      if (!orphaned && src.id) {
        row.addEventListener('click', () => _navigateToEntity(src));
      }
      listEl.appendChild(row);
    }
  }
}

// ── Navigation stack helpers ──────────────────────────────────────────────

function _navCurrentNode() {
  return _navPos >= 0 ? _navStack[_navPos] : null;
}

function _navPush(node) {
  // No-op if same entity as current top
  const cur = _navCurrentNode();
  if (cur && cur.type === node.type && cur.id === node.id) return;
  // Truncate forward history when branching
  _navStack = _navStack.slice(0, _navPos + 1);
  _navStack.push(node);
  if (_navStack.length > 50) _navStack.shift();
  _navPos = _navStack.length - 1;
  _updateBackBtn();
}

function _updateBackBtn() {
  const bar   = $('navBackBar');
  const label = $('navBackLabel');
  if (!bar || !label) return;
  if (_navPos > 0) {
    const prev = _navStack[_navPos - 1];
    label.textContent = prev.label || 'Volver';
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function _navBack() {
  if (_navPos <= 0) return;
  _navPos--;
  const node = _navStack[_navPos];
  _updateBackBtn();
  _navigateToEntity({ type: node.type, id: node.id }, { push: false });
}

function _navigateToEntity(entity, opts = {}) {
  if (!entity || !entity.id) return;
  const push = opts.push !== false;  // default: push to stack
  if (entity.type === 'course_root') {
    if (push) _navPush({ type: 'course_root', id: entity.id, label: entity.title || entity.id });
    if (window.switchSpace) window.switchSpace('courses');
    setActiveCourse(entity.id);
  } else {
    if (push) _navPush({ type: 'entry', id: entity.id, label: entity.title || entity.id });
    if (window.switchSpace) window.switchSpace('knowledge');
    loadEntry(entity.id);
  }
}

function _relTypeIcon(type) {
  const icons = {
    references:   '🔗',
    implements:   '⚙',
    belongs_to:   '◎',
    blocks:       '⛔',
    related:      '≈',
    derived_from: '⤵',
  };
  return icons[type] || '·';
}

function _entityTypeMeta(type) {
  const map = {
    page:         { label: 'nota',     css: 'etype-page'        },
    course:       { label: 'lección',  css: 'etype-course'      },
    course_root:  { label: 'curso',    css: 'etype-course-root' },
    teamspace:    { label: 'teamspace',css: 'etype-teamspace'   },
    kanban_board: { label: 'board',    css: 'etype-board'       },
    kanban_card:  { label: 'tarjeta',  css: 'etype-card'        },
  };
  return map[type] || { label: type || '?', css: 'etype-unknown' };
}

function _entityTypeBadgeHtml(type) {
  const { label, css } = _entityTypeMeta(type);
  return `<span class="entity-type-badge ${css}">${escapeHtml(label)}</span>`;
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
    const currentUid = currentEntryMeta?.uid;
    const matches = (_index || []).filter(e => {
      if (e.id === currentEntryId || e.uid === currentUid) return false;
      const haystack = [(e.title||''), (e.category||''), (e.topic||'')].join(' ').toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);
    if (!matches.length) { sugg.classList.add('hidden'); return; }
    sugg.innerHTML = matches.map(e => {
      const badge = _entityTypeBadgeHtml(e.type);
      const meta  = [e.category, e.topic].filter(Boolean).join(' › ');
      return `<div class="rel-sugg-item" data-uid="${escapeHtml(e.uid||'')}" data-id="${escapeHtml(e.id)}">${badge}<span class="rel-sugg-title">${escapeHtml(e.title||e.id)}</span>${meta ? `<span class="rel-sugg-meta">${escapeHtml(meta)}</span>` : ''}</div>`;
    }).join('');
    sugg.classList.remove('hidden');
    sugg.querySelectorAll('.rel-sugg-item').forEach(item => {
      item.addEventListener('click', () => {
        const match = matches.find(e => e.id === item.dataset.id);
        input.value = match?.title || '';
        selectedToUid = item.dataset.uid || null;
        sugg.classList.add('hidden');
      });
    });
  });

  document.addEventListener('click', e => {
    if (!sugg.contains(e.target) && e.target !== input) sugg.classList.add('hidden');
  });

  confirmBtn.addEventListener('click', async () => {
    if (!selectedToUid) { showToast('Selecciona una entrada destino válida', 'error'); return; }
    const fromUid = currentEntryMeta?.uid;
    if (!fromUid) {
      showToast('Esta entrada no tiene UID; no se puede crear relación.', 'error');
      return;
    }
    const rel_type = typeSel.value;
    const res = await fetch('/api/relations', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ from_uid: fromUid, to_uid: selectedToUid, rel_type })
    });
    if (res.ok || res.status === 409) {
      form.classList.add('hidden');
      input.value = ''; selectedToUid = null;
      loadRelations(fromUid);
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
    nodeMap[e.uid || e.id] = { id: e.uid || e.id, entryId: e.id, title: e.title || e.id, category: e.category || '', type: e.type || 'page' };
  }
  // Also add nodes from relations that might not be in _index
  for (const r of relations) {
    if (!nodeMap[r.from_uid] && r.from_entity) nodeMap[r.from_uid] = { id: r.from_uid, entryId: r.from_entity.id, title: r.from_entity.title || r.from_uid, category: '', type: r.from_entity.type || 'page' };
    if (!nodeMap[r.to_uid]   && r.to_entity)   nodeMap[r.to_uid]   = { id: r.to_uid,   entryId: r.to_entity.id,   title: r.to_entity.title   || r.to_uid,   category: '', type: r.to_entity.type   || 'page' };
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
        _navigateToEntity({ type: n.type, id: n.entryId, title: n.title });
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
      const isActive   = c.id === _activeCourseSlug;
      const isExpanded = !!expandedCourses[c.id];
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
        if (e.target.closest('.course-inline-tree')) return;
        setActiveCourse(c.id);
      });
      if (isActive) {
        item.querySelector('.course-list-gear').addEventListener('click', async e => {
          e.stopPropagation();
          const anchor = e.currentTarget;
          let courses2;
          try { courses2 = await fetch('/api/courses').then(r => r.json()); } catch { courses2 = []; }
          const entity = courses2.find(x => x.id === c.id) || c;
          _openCourseGearMenu(anchor, c.id, entity);
        });
      }
      // Every course gets its own tree container; visible only when expanded
      const inlineTree = document.createElement('nav');
      inlineTree.className = 'tree course-inline-tree' + (isExpanded ? '' : ' tree-collapsed');
      inlineTree.dataset.forCourse = c.id;
      item.appendChild(inlineTree);
      list.appendChild(item);
    });
    // Populate trees for all currently expanded courses
    active.filter(c => expandedCourses[c.id]).forEach(c => {
      renderCoursesTree(_coursesTreeData, c.id);
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
  expandedCourses[courseSlug] = true;
  closeHistoryPanel();
  if (isMobile() || isCompact()) closeSidebarMobile();

  let courses;
  try { courses = await fetch('/api/courses').then(r => r.json()); }
  catch { courses = []; }
  const course = courses.find(c => c.id === courseSlug) || { label: courseSlug };

  // Re-render list — renderCourseList populates trees for all expanded courses
  await renderCourseList();

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

  // Remove active marker + inline tree from course list items
  document.querySelectorAll('.course-list-item.active').forEach(el => {
    el.classList.remove('active');
    el.querySelector('.course-inline-tree')?.remove();
    el.querySelector('.course-list-gear')?.remove();
  });

  setSidebarVisible(true);

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
  _setHomeAmbient(false);
  if (entryView) entryView.classList.add('hidden');
  if (entryCover) entryCover.classList.add('hidden');
  if ($('entryAddCover')) $('entryAddCover').classList.add('hidden');
  if ($('ctxBar')) $('ctxBar').classList.add('hidden');
  if ($('courseEmptyState')) $('courseEmptyState').classList.add('hidden');
  cv.classList.remove('hidden');
  // Compact/mobile: close the sidebar drawer so the course view is fully visible.
  // The user can reopen it via the hamburger button to navigate between courses.
  if (isMobile() || isCompact()) closeSidebarMobile();

  // Populate header
  $('cvTitle').textContent = courseEntity.label || courseSlug;
  $('cvDesc').textContent  = courseEntity.description || '';

  // Hero block (cover + title fused) — add/change/remove cover buttons
  const hero           = $('cvHero');
  const addCoverBtn    = $('cvAddCoverBtn');
  const changeCoverBtn = $('cvChangeCoverBtn');
  const rmCoverBtn     = $('cvRemoveCoverBtn');

  function _applyCvCover(coverValue) {
    if (coverValue) {
      if (coverValue.startsWith('url(')) {
        // Probe image before committing — avoid applying has-cover for broken URLs
        const urlMatch = coverValue.match(/^url\(['"]?(.+?)['"]?\)$/);
        const src = urlMatch ? urlMatch[1] : '';
        if (src) {
          const img = new Image();
          img.onload  = () => {
            hero.setAttribute('style',
              `background-image:${coverValue};background-size:cover;background-position:center`);
            hero.classList.add('has-cover');
          };
          img.onerror = () => {
            // Image not found — clear cover from model silently
            hero.removeAttribute('style');
            hero.classList.remove('has-cover');
          };
          img.src = src;
        }
      } else {
        hero.setAttribute('style', `background:${coverValue}`);
        hero.classList.add('has-cover');
      }
    } else {
      hero.removeAttribute('style');
      hero.classList.remove('has-cover');
    }
  }
  _applyCvCover(courseEntity.cover || '');

  function _openCourseCoverPicker() {
    openCoverPicker(async (coverValue) => {
      try {
        await fetch(`/api/courses/${courseSlug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cover: coverValue }),
        });
        courseEntity.cover = coverValue;
        _applyCvCover(coverValue);
      } catch { showToast('Error guardando portada', 'error'); }
    });
  }

  if (addCoverBtn)    addCoverBtn.onclick    = _openCourseCoverPicker;
  if (changeCoverBtn) changeCoverBtn.onclick = _openCourseCoverPicker;
  if (rmCoverBtn) {
    rmCoverBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await fetch(`/api/courses/${courseSlug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cover: '' }),
        });
        courseEntity.cover = '';
        _applyCvCover('');
      } catch { /* silent */ }
    };
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

  // Update modules tab label to reflect dominant section type (Módulos / Fases / Semanas…)
  _updateModulesTabLabel(courseSlug);

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
            <button class="cv-outline-btn" title="Ver subtemas">¶</button>
            <button class="cv-lesson-up" title="Subir" ${ei === 0 ? 'disabled' : ''}>↑</button>
            <button class="cv-lesson-down" title="Bajar" ${ei === (mod.entries.length - 1) ? 'disabled' : ''}>↓</button>
            <button class="cv-lesson-menu-btn" title="Más acciones">…</button>
          </div>`;
        // Open entry on title click
        row.querySelector('.cv-roadmap-entry-title').addEventListener('click', () => openCourseLesson(e.id));
        // Toggle inline lesson outline (subtopics preview)
        row.querySelector('.cv-outline-btn').addEventListener('click', async ev => {
          ev.stopPropagation();
          const btn = ev.currentTarget;
          const existing = row.nextElementSibling;
          if (existing?.classList.contains('cv-lesson-outline')) {
            existing.remove(); btn.classList.remove('active'); return;
          }
          btn.classList.add('active');
          const outline = document.createElement('div');
          outline.className = 'cv-lesson-outline';
          outline.innerHTML = '<span class="cv-outline-loading">Cargando…</span>';
          row.insertAdjacentElement('afterend', outline);
          try {
            const data = await fetch(`/api/entry/${e.id}`).then(r => r.json());
            const content = data.markdown || '';
            // Only the main numbered subtopics (##) — deeper headings (###/####) are
            // fine-grained detail within each one and just clutter this preview.
            const headings = content.split('\n')
              .filter(l => /^##\s/.test(l))
              .map(l => { const m = l.match(/^##\s+(.+)/); return m ? { level: 2, text: m[1].trim() } : null; })
              .filter(Boolean);
            if (!headings.length) {
              outline.innerHTML = '<span class="cv-outline-empty">Sin subtemas registrados</span>';
            } else {
              outline.innerHTML = headings.map(h =>
                `<div class="cv-outline-item cv-outline-h${h.level}">${escapeHtml(h.text)}</div>`
              ).join('');
              outline.querySelectorAll('.cv-outline-item').forEach((item, idx) => {
                item.addEventListener('click', async () => {
                  await openCourseLesson(e.id);
                  setTimeout(() => _scrollToHeadingText(headings[idx].text), 300);
                });
              });
            }
          } catch { outline.innerHTML = '<span class="cv-outline-empty">No disponible</span>'; }
        });
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
            statusMap[e.id] = next;
            // Sync sidebar dot
            const dot = document.querySelector(`.tree-entry[data-id="${e.id}"] .status-dot`);
            if (dot) dot.className = `status-dot status-${next}`;
            // Sync topbar statusBtn if this lesson is currently open
            if (currentEntryId === e.id) updateStatusBtn($('statusBtn'), next);
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
        openRenameModuleModal(mod, async result => {
          const r = await fetch(`/api/courses/${courseSlug}/module/${modSlug}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
          });
          if (r.ok) {
            showToast(`Sección renombrada a "${result.label}"`);
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
  _updateModulesTabLabel(courseSlug);
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

// modData: { label, module_type, module_type_custom, module_number, module_title }
// onConfirm(result): result = { label, module_type, ... }
function openRenameModuleModal(modData, onConfirm) {
  const overlay      = $('renameModuleOverlay');
  const legacyInput  = $('renameModuleInput');
  const confirmBtn   = $('renameModuleConfirm');
  if (!overlay) return;

  const currentLabel = typeof modData === 'string' ? modData : (modData?.label || '');
  const courseSlug   = _activeCourseSlug || '';
  // current module slug to exclude from duplicate check (renaming to same name is OK)
  const currentSlug  = Object.entries(_coursesTreeData[courseSlug]?.modules || {})
    .find(([, m]) => m.label === currentLabel)?.[0] || null;

  const hasStructure = modData && modData.module_type;

  // ── Duplicate detection for rename ──────────────────────────────────────
  const _setRenameBlocked = (label) => {
    const isDup = label && label.toLowerCase() !== currentLabel.toLowerCase()
      && _moduleLabelExists(courseSlug, label, currentSlug);
    if (confirmBtn) {
      confirmBtn.disabled = isDup;
      confirmBtn.style.opacity = isDup ? '0.45' : '';
      confirmBtn.title = isDup ? `Ya existe una sección con el nombre "${label}"` : '';
    }
    const rmPreview = $('rmSbPreview');
    if (rmPreview) rmPreview.classList.toggle('sb-preview--warn', !!isDup);
    return isDup;
  };

  // Init rename section builder
  const rmBuilder = _initSectionBuilder({
    typeId:       'rmSbType',
    customWrapId: 'rmSbCustomWrap',
    customId:     'rmSbCustom',
    numberId:     'rmSbNumber',
    titleId:      'rmSbTitle',
    previewId:    'rmSbPreview',
  }, label => _setRenameBlocked(label));

  // Determine initial mode
  let rmMode = hasStructure ? 'structured' : 'legacy';
  const setRmMode = mode => {
    rmMode = mode;
    $('rmStructuredWrap')?.classList.toggle('hidden', mode !== 'structured');
    $('rmLegacyWrap')?.classList.toggle('hidden', mode !== 'legacy');
    _setRenameBlocked(rmMode === 'legacy' ? legacyInput?.value.trim() : rmBuilder?.getLabel());
  };
  setRmMode(rmMode);

  // Prefill
  if (hasStructure && rmBuilder) {
    rmBuilder.prefill(modData);
  } else if (legacyInput) {
    legacyInput.value = currentLabel;
  }

  $('rmLegacyBtn')?.addEventListener('click', () => setRmMode('legacy'));
  $('rmStructuredBtn')?.addEventListener('click', () => setRmMode('structured'));

  // Legacy input duplicate check
  if (legacyInput) {
    legacyInput.oninput = () => _setRenameBlocked(legacyInput.value.trim());
  }

  overlay.classList.remove('hidden');
  setTimeout(() => {
    if (rmMode === 'structured') $('rmSbTitle')?.focus();
    else { legacyInput?.focus(); legacyInput?.select(); }
  }, 50);

  const close = () => {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.style.opacity = ''; confirmBtn.title = ''; }
    overlay.classList.add('hidden');
  };
  const confirm = async () => {
    let label, fields;
    if (rmMode === 'structured' && rmBuilder) {
      label  = rmBuilder.getLabel();
      fields = rmBuilder.getFields();
      if (!label) { showToast('Define el tipo de sección', 'error'); return; }
    } else {
      label  = legacyInput?.value.trim() || '';
      fields = {};
      if (!label) { close(); return; }
    }
    if (_moduleLabelExists(courseSlug, label, currentSlug)) {
      showToast(`Ya existe una sección "${label}" en este curso`, 'error'); return;
    }
    close();
    await onConfirm({ label, ...fields });
  };

  $('renameModuleClose').onclick   = close;
  $('renameModuleCancel').onclick  = close;
  if (confirmBtn) confirmBtn.onclick = confirm;
  if (legacyInput) {
    legacyInput.onkeydown = e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); };
  }
}

let _editingCourseSlug = null;
function openEditCourseModal(courseSlug, courseEntity) {
  _editingCourseSlug = courseSlug;
  const overlay = $('editCourseOverlay');
  if (!overlay) return;
  $('editCourseLabel').value  = courseEntity.label || '';
  $('editCourseDesc').value   = courseEntity.description || '';
  $('editCourseLevel').value  = courseEntity.level || '';
  $('editCourseDomain').value = courseEntity.domain || '';
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
          domain: $('editCourseDomain').value,
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
  } else if (space === 'mindmaps') {
    if (window.MindmapApp) window.MindmapApp.showList();
  } else if (space === 'teamspace') {
    if (window.openNewTeamspaceModal) openNewTeamspaceModal();
  } else {
    openNewModal();
  }
}

// ── Open a course lesson: hide roadmap, show entry, keep Courses context ─
function openCourseLesson(entryId) {
  const cv = $('courseView');
  if (cv) cv.classList.add('hidden');
  return loadEntry(entryId);
}

// Jump to a specific heading inside the lesson just opened — same lookup +
// scroll logic as the in-page TOC panel, matched by text since the roadmap's
// subtopic preview and the rendered content are built from the same markdown
// but not from the same DOM pass.
function _scrollToHeadingText(text) {
  const norm = s => (s || '')
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '').trim().toLowerCase();
  const target = _tocHeadings().find(h => norm(h.textContent) === norm(text));
  _scrollHeadingIntoView(target);
}

// ── Single source of truth for active course ─────────────────────────────
function setActiveCourse(slug) {
  if (slug && slug === _activeCourseSlug) {
    const cv = $('courseView');
    const courseViewHidden = !cv || cv.classList.contains('hidden');
    if (courseViewHidden) {
      // Course view was closed: reopen it, ensure tree is expanded
      expandedCourses[slug] = true;
      openCourseDetail(slug);
    } else {
      // Course view is open: toggle tree expansion only
      expandedCourses[slug] = !expandedCourses[slug];
      const tree = document.querySelector(`.course-inline-tree[data-for-course="${slug}"]`);
      if (tree) tree.classList.toggle('tree-collapsed', !expandedCourses[slug]);
    }
    return;
  }
  _activeCourseSlug = slug;
  if (slug) {
    expandedCourses[slug] = true;
    openCourseDetail(slug);
  } else {
    closeCourseDetail();
  }
}

// ── Lesson modal ──────────────────────────────────────────────────────────
// ── Duplicate detection helpers ──────────────────────────────────────────
function _moduleLabelExists(courseSlug, label, excludeSlug = null) {
  const mods = _coursesTreeData[courseSlug]?.modules || {};
  return Object.entries(mods).some(([slug, m]) =>
    slug !== excludeSlug && m.label.toLowerCase() === label.toLowerCase()
  );
}

function _lessonTitleExistsInModule(courseSlug, moduleLabel, title) {
  const mods = _coursesTreeData[courseSlug]?.modules || {};
  for (const mod of Object.values(mods)) {
    if (mod.label.toLowerCase() === moduleLabel.toLowerCase()) {
      return (mod.entries || []).some(e => e.title.toLowerCase() === title.toLowerCase());
    }
  }
  return false;
}

// ── Section builder helpers ───────────────────────────────────────────────
const _SECTION_TYPE_LABELS = {
  modulo: 'Módulo', fase: 'Fase', semana: 'Semana',
  unidad: 'Unidad', nivel: 'Nivel', bloque: 'Bloque',
  seccion: 'Sección', capitulo: 'Capítulo',
};

const _SECTION_TYPE_PLURAL = {
  modulo: 'Módulos', fase: 'Fases', semana: 'Semanas',
  unidad: 'Unidades', nivel: 'Niveles', bloque: 'Bloques',
  seccion: 'Secciones', capitulo: 'Capítulos',
};

const _SECTION_TYPE_LABEL_PREFIXES = [
  ['fase', 'fase'], ['semana', 'semana'], ['unidad', 'unidad'],
  ['nivel', 'nivel'], ['bloque', 'bloque'], ['sección', 'seccion'],
  ['seccion', 'seccion'], ['capítulo', 'capitulo'], ['capitulo', 'capitulo'],
  ['módulo', 'modulo'], ['modulo', 'modulo'],
];

function _inferTypeFromLabel(label) {
  const l = (label || '').toLowerCase();
  for (const [prefix, type] of _SECTION_TYPE_LABEL_PREFIXES) {
    if (l.startsWith(prefix)) return type;
  }
  return null;
}

function _getDominantSectionTypeLabel(courseSlug) {
  const mods = Object.values(_coursesTreeData[courseSlug]?.modules || {});
  if (!mods.length) return 'Módulos';
  const counts = {};
  for (const m of mods) {
    const t = m.module_type || _inferTypeFromLabel(m.label) || 'modulo';
    counts[t] = (counts[t] || 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return _SECTION_TYPE_PLURAL[dominant] || 'Módulos';
}

function _updateModulesTabLabel(courseSlug) {
  const tab = $('courseView')?.querySelector('.cv-tab[data-tab="modules"]');
  if (tab) tab.textContent = _getDominantSectionTypeLabel(courseSlug);
}

function _generateSectionLabel(type, custom, number, title) {
  if (!type) return '';
  const tl = type === 'personalizado'
    ? (custom || 'Personalizado')
    : (_SECTION_TYPE_LABELS[type] || type);
  if (number && title) return `${tl} ${number}: ${title}`;
  if (number)          return `${tl} ${number}`;
  if (title)           return `${tl}: ${title}`;
  return tl;
}

// Wires up a section builder DOM cluster and returns { getLabel, getFields, setDupCheck }
// onLabelChange(label) optional callback called on every label update
function _initSectionBuilder(ids, onLabelChange) {
  const { typeId, customWrapId, customId, numberId, titleId, previewId } = ids;
  const sbType    = $(typeId);
  const sbCWrap   = $(customWrapId);
  const sbCustom  = $(customId);
  const sbNumber  = $(numberId);
  const sbTitle   = $(titleId);
  const sbPreview = $(previewId);
  if (!sbType) return null;

  const update = () => {
    const type   = sbType.value;
    const custom = sbCustom?.value.trim() || '';
    const number = sbNumber?.value.trim() || '';
    const title  = sbTitle?.value.trim() || '';
    if (sbCWrap) sbCWrap.classList.toggle('hidden', type !== 'personalizado');
    const label = _generateSectionLabel(type, custom, number, title);
    if (sbPreview) sbPreview.textContent = label || '— Vista previa —';
    if (typeof onLabelChange === 'function') onLabelChange(label);
  };

  [sbType, sbCustom, sbNumber, sbTitle].forEach(el => el?.addEventListener('input', update));
  [sbType, sbCustom, sbNumber, sbTitle].forEach(el => el?.addEventListener('change', update));
  update();

  return {
    getLabel() {
      return _generateSectionLabel(
        sbType?.value || '',
        sbCustom?.value.trim() || '',
        sbNumber?.value.trim() || '',
        sbTitle?.value.trim() || '',
      );
    },
    getFields() {
      return {
        module_type:        sbType?.value || '',
        module_type_custom: sbCustom?.value.trim() || '',
        module_number:      sbNumber?.value.trim() || '',
        module_title:       sbTitle?.value.trim() || '',
      };
    },
    prefill(modData) {
      if (!modData) return;
      if (sbType && modData.module_type) sbType.value = modData.module_type;
      if (sbCustom) sbCustom.value = modData.module_type_custom || '';
      if (sbNumber) sbNumber.value = modData.module_number || '';
      if (sbTitle)  sbTitle.value  = modData.module_title || '';
      update();
    },
    reset() {
      if (sbType)   sbType.value   = 'modulo';
      if (sbCustom) sbCustom.value = '';
      if (sbNumber) sbNumber.value = '';
      if (sbTitle)  sbTitle.value  = '';
      update();
    },
  };
}

function _buildLessonScaffold(title, subtopicsRaw) {
  const h1 = `# ${title}`;
  if (!subtopicsRaw) return h1;
  const items = subtopicsRaw
    .split(/\n+/)
    .map(s => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  if (!items.length) return h1;
  return h1 + '\n\n' + items.map(s => `### ${s}`).join('\n\n') + '\n';
}

// Tracks which lesson modal mode is active: 'existing' or 'new'
let _lessonModuleMode = 'existing';

function _setLessonModuleMode(mode) {
  _lessonModuleMode = mode;
  $('lessonModuleExistingWrap')?.classList.toggle('hidden', mode !== 'existing');
  $('lessonModuleNewWrap')?.classList.toggle('hidden', mode !== 'new');
}

function openNewLessonModal(courseSlug, prefillModule) {
  const overlay = $('newLessonOverlay');
  if (!overlay) return;

  // Context bar — show course label (not an input)
  const ctx = $('lessonCourseCtx');
  if (ctx) {
    const courseData = _coursesTreeData[courseSlug];
    ctx.textContent = courseData?.label || _unslugify(courseSlug);
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
      // Context B: module is fixed — lock the field, stay in existing mode
      moduleInput.value = prefillModule;
      moduleInput.setAttribute('readonly', '');
      moduleInput.classList.add('locked');
      if (moduleDropdown) moduleDropdown.classList.add('hidden');
      _setLessonModuleMode('existing');
    } else {
      // Context A: module is free — dropdown on user input
      moduleInput.value = '';
      if (moduleDropdown) moduleDropdown.classList.add('hidden');
      moduleInput.oninput = () => _populateLessonModuleDropdown(courseSlug, moduleInput.value);
      _setLessonModuleMode('existing');
    }
  }

  // Reset section builder
  if (window._lessonSectionBuilder) window._lessonSectionBuilder.reset();

  if ($('lessonTitleField')) $('lessonTitleField').value = '';
  if ($('lessonContentField')) $('lessonContentField').value = '';
  const titleWarn = $('lessonTitleWarn');
  if (titleWarn) { titleWarn.textContent = ''; titleWarn.classList.add('hidden'); }
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

  // ── Duplicate detection ────────────────────────────────────────────────
  const _setCreateBlocked = blocked => {
    if (createBtn) {
      createBtn.disabled = blocked;
      createBtn.style.opacity = blocked ? '0.45' : '';
    }
  };

  const _getCurrentModuleLabel = () =>
    _lessonModuleMode === 'new'
      ? (window._lessonSectionBuilder?.getLabel() || '')
      : ($('lessonModuleField')?.value.trim() || '');

  const _checkDuplicates = () => {
    const courseSlug = $('lessonCourseCtx')?.dataset.courseSlug;
    if (!courseSlug) return;

    const moduleLabel = _getCurrentModuleLabel();
    const title       = $('lessonTitleField')?.value.trim() || '';
    const preview     = $('sbPreview');
    const titleWarn   = $('lessonTitleWarn');

    let blocked = false;

    // Module duplicate (only in "new" mode)
    if (_lessonModuleMode === 'new' && moduleLabel) {
      const modDup = _moduleLabelExists(courseSlug, moduleLabel);
      if (preview) preview.classList.toggle('sb-preview--warn', modDup);
      if (modDup && preview) preview.textContent = `⚠ "${moduleLabel}" ya existe — se añadirá al módulo existente`;
      // Not a hard block — adding to existing module is acceptable from "new" mode; just inform
    }

    // Lesson title duplicate
    if (title && moduleLabel) {
      const lessonDup = _lessonTitleExistsInModule(courseSlug, moduleLabel, title);
      if (titleWarn) {
        titleWarn.textContent = lessonDup ? `Ya existe una lección con ese título en este módulo.` : '';
        titleWarn.classList.toggle('hidden', !lessonDup);
      }
      if (lessonDup) blocked = true;
    } else {
      if (titleWarn) titleWarn.classList.add('hidden');
    }

    _setCreateBlocked(blocked);
  };

  // Init section builder with duplicate callback
  window._lessonSectionBuilder = _initSectionBuilder({
    typeId:       'sbType',
    customWrapId: 'sbCustomWrap',
    customId:     'sbCustom',
    numberId:     'sbNumber',
    titleId:      'sbTitle',
    previewId:    'sbPreview',
  }, () => _checkDuplicates());

  // Mode toggle buttons
  $('lessonModuleNewBtn')?.addEventListener('click', () => {
    _setLessonModuleMode('new');
    window._lessonSectionBuilder?.reset();
    _checkDuplicates();
  });
  $('lessonModuleExistingBtn')?.addEventListener('click', () => {
    _setLessonModuleMode('existing');
    _checkDuplicates();
  });

  // Re-check when module field changes (existing mode)
  $('lessonModuleField')?.addEventListener('input', _checkDuplicates);
  $('lessonModuleField')?.addEventListener('change', _checkDuplicates);

  // Re-check when title changes
  $('lessonTitleField')?.addEventListener('input', _checkDuplicates);

  const _close = () => {
    _setCreateBlocked(false);
    overlay.classList.add('hidden');
  };
  if (closeBtn)  closeBtn.addEventListener('click', _close);
  if (cancelBtn) cancelBtn.addEventListener('click', _close);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const courseSlug  = $('lessonCourseCtx')?.dataset.courseSlug?.trim();
      const title       = ($('lessonTitleField') || {}).value?.trim();
      const subtopics   = ($('lessonContentField') || {}).value?.trim() || '';
      const content     = _buildLessonScaffold(title || '', subtopics);

      let module = '';
      let extraFields = {};
      if (_lessonModuleMode === 'new') {
        const builder = window._lessonSectionBuilder;
        module = builder ? builder.getLabel() : '';
        extraFields = builder ? builder.getFields() : {};
        if (!module) { showToast('Define el tipo de sección', 'error'); return; }
      } else {
        module = ($('lessonModuleField') || {}).value?.trim();
      }

      if (!courseSlug || !module || !title) {
        showToast('Completa los campos obligatorios', 'error'); return;
      }
      const res = await fetch('/api/courses/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: courseSlug, module, title, raw_text: content, ...extraFields }),
      });
      if (res.ok) {
        _close();
        showToast(`Lección "${title}" creada`);
        await loadTree();
        renderCoursesTree(_coursesTreeData, courseSlug);
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
        domain:      ($('newCourseDomain') || {}).value || '',
      };
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        overlay.classList.add('hidden');
        if ($('newCourseLabel'))  $('newCourseLabel').value  = '';
        if ($('newCourseDesc'))   $('newCourseDesc').value   = '';
        if ($('newCourseDomain')) $('newCourseDomain').value = '';
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

// ── Sidebar auto-expand on hover ─────────────────────────────────────────
(function initSidebarToggle() {
  function init() {
    const bar = document.getElementById('activityBar');
    if (!bar) return;
    let leaveTimer = null;
    bar.addEventListener('mouseenter', () => {
      clearTimeout(leaveTimer);
      document.body.classList.add('sidebar-expanded');
    });
    bar.addEventListener('mouseleave', () => {
      leaveTimer = setTimeout(() => {
        document.body.classList.remove('sidebar-expanded');
      }, 120);
    });

    // ⌂ Brand: go to home (show welcome, switch to knowledge space)
    const abBrand = document.getElementById('abBrand');
    if (abBrand) {
      abBrand.addEventListener('click', () => {
        if (window.switchSpace) window.switchSpace('home');
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── Radar Tech ────────────────────────────────────────────────────────────────
(function initRadar() {
  let _allItems = [];
  let _activeCat = 'all';
  let _loading = false;
  let _lastFetch = 0;

  function _getEnabledSources() {
    const boxes = document.querySelectorAll('#radarSources input[type=checkbox]');
    const enabled = new Set();
    boxes.forEach(cb => { if (cb.checked) enabled.add(cb.dataset.src); });
    return enabled;
  }

  function _relTime(pub) {
    if (!pub) return '';
    try {
      const d = new Date(pub);
      if (isNaN(d)) return '';
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `hace ${mins}m`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `hace ${hrs}h`;
      return `hace ${Math.floor(hrs / 24)}d`;
    } catch { return ''; }
  }

  const _CAT_COLORS = {
    ai:       '#8b5cf6',
    dev:      '#3b82f6',
    tech:     '#06b6d4',
    research: '#f59e0b',
  };

  const _SRC_DOMAIN = {
    'OpenAI':       'openai.com',
    'GitHub':       'github.com',
    'Ars Technica': 'arstechnica.com',
    'MIT Tech':     'technologyreview.com',
    'arXiv AI':     'arxiv.org',
    'Hacker News':  'news.ycombinator.com',
  };

  function _catLabel(cat) {
    return { ai: 'IA', dev: 'Dev', tech: 'Tech', research: 'Research' }[cat] || cat;
  }

  function _favicon(source) {
    const domain = _SRC_DOMAIN[source] || 'google.com';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  }

  function _renderFeed() {
    const feed = document.getElementById('radarFeed');
    if (!feed) return;
    const enabled = _getEnabledSources();
    const items = _allItems.filter(it => {
      const catOk = _activeCat === 'all' || it.category === _activeCat;
      const srcOk = enabled.has(it.source);
      return catOk && srcOk;
    });

    if (!items.length) {
      feed.innerHTML = '<div class="radar-empty">No hay artículos con los filtros seleccionados.</div>';
      return;
    }

    const [hero, ...rest] = items;
    const heroColor = _CAT_COLORS[hero.category] || 'var(--accent)';

    let html = `
      <a class="radar-hero" href="${escapeHtml(hero.url)}" target="_blank" rel="noopener noreferrer"
         style="--cat-color:${heroColor}" translate="yes">
        <div class="radar-hero-cat">${escapeHtml(_catLabel(hero.category))}</div>
        <div class="radar-hero-title">${escapeHtml(hero.title)}</div>
        <div class="radar-hero-meta">
          <img class="radar-favicon" src="${_favicon(hero.source)}" alt="" loading="lazy">
          <span>${escapeHtml(hero.source)}</span>
          ${hero.score ? `<span class="radar-score">▲ ${hero.score}</span>` : ''}
          <span class="radar-time">${_relTime(hero.pub)}</span>
        </div>
      </a>
      <div class="radar-grid">`;

    html += rest.map((it, i) => {
      const color = _CAT_COLORS[it.category] || 'var(--accent)';
      return `
        <a class="radar-card" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer"
           style="--cat-color:${color}; animation-delay:${(i + 1) * 45}ms" translate="yes">
          <div class="radar-card-label" style="color:${color}">${escapeHtml(_catLabel(it.category))}</div>
          <div class="radar-card-title">${escapeHtml(it.title)}</div>
          <div class="radar-card-meta">
            <img class="radar-favicon" src="${_favicon(it.source)}" alt="" loading="lazy">
            <span>${escapeHtml(it.source)}</span>
            ${it.score ? `<span class="radar-score">▲ ${it.score}</span>` : ''}
            <span class="radar-time">${_relTime(it.pub)}</span>
          </div>
        </a>`;
    }).join('');

    html += '</div>';
    feed.innerHTML = html;
  }

  window.loadRadarFeed = function(force) {
    const now = Date.now();
    if (!force && _allItems.length && now - _lastFetch < 30 * 60 * 1000) {
      _renderFeed();
      return;
    }
    if (_loading) return;
    _loading = true;
    const feed = document.getElementById('radarFeed');
    if (feed) feed.innerHTML = '<div class="radar-loading">Cargando feeds…</div>';

    const url = force ? `/api/radar/feed?_=${now}` : '/api/radar/feed';
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        _allItems = data.items || [];
        _lastFetch = now;
        _renderFeed();
      })
      .catch(() => {
        if (feed) feed.innerHTML = '<div class="radar-empty">Error al cargar feeds. Comprueba la conexión.</div>';
      })
      .finally(() => { _loading = false; });
  };

  function init() {
    // Filter buttons
    document.querySelectorAll('#radarFilters .radar-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#radarFilters .radar-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeCat = btn.dataset.cat;
        _renderFeed();
      });
    });

    // Source checkboxes
    document.querySelectorAll('#radarSources input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => _renderFeed());
    });

    // Refresh button
    const refreshBtn = document.getElementById('radarRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.textContent = '↺ Actualizando…';
        refreshBtn.disabled = true;
        const done = () => { refreshBtn.textContent = '↺ Actualizar'; refreshBtn.disabled = false; };
        window.loadRadarFeed(true);
        setTimeout(done, 2000);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ── Paste Markdown modal ──────────────────────────────────────────────────────
function initPasteMarkdown() {
  const btn     = $('pasteMarkdownBtn');
  const overlay = $('pasteMarkdownOverlay');
  const closeBtn = $('pasteMarkdownClose');
  const cancelBtn = $('pasteMarkdownCancel');
  const confirmBtn = $('pasteMarkdownConfirm');
  const textarea = $('pasteMarkdownInput');
  const appendChk = $('pasteMarkdownAppend');
  if (!btn || !overlay) return;

  function open() {
    textarea.value = '';
    appendChk.checked = false;
    overlay.classList.remove('hidden');
    setTimeout(() => textarea.focus(), 80);
  }
  function close() { overlay.classList.add('hidden'); }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', () => {
    const md = textarea.value.trim();
    if (!md) return;
    if (appendChk.checked) {
      const current = _inlineEditor.getMarkdown().trimEnd();
      _inlineEditor.load(current + '\n\n' + md);
    } else {
      _inlineEditor.load(md);
    }
    close();
    showToast('Contenido cargado en el editor', 'success');
  });
}

// ── Block type indicator in BlockNote "Turn into" submenu ────────────────────
function initBlockTypeIndicator() {
  // Map data-content-type (+ optional data-level) → label text in the Turn into menu
  const TYPE_LABELS = {
    'paragraph':        'Paragraph',
    'heading:1':        'Heading 1',
    'heading:2':        'Heading 2',
    'heading:3':        'Heading 3',
    'bulletListItem':   'Bullet List',
    'numberedListItem': 'Numbered List',
    'checkListItem':    'To-do',
    'quote':            'Quote',
    'codeBlock':        'Code Block',
  };

  function _getHoveredBlockType() {
    // BlockNote shows a drag handle on hover; the handle's parent chain leads
    // back to .bn-block-outer which contains [data-content-type].
    const handle = document.querySelector('.bn-drag-handle-menu, [data-radix-popper-content-wrapper]');
    // Fall back: find the block whose drag handle is currently shown
    // BlockNote adds a class or shows the handle element near the hovered block.
    // We detect the focused/selected block instead.
    const sel = window.getSelection();
    let node = sel && sel.anchorNode;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.contentType) {
        const t = node.dataset.contentType;
        const lvl = node.dataset.level;
        return lvl ? `${t}:${lvl}` : t;
      }
      node = node.parentElement;
    }
    // Also check nearest .bn-block-outer with [data-content-type] child
    const blocks = document.querySelectorAll('#entryBody [data-content-type]');
    for (const b of blocks) {
      if (b.closest('[data-selected]') || b.closest('.bn-block--selected')) {
        const t = b.dataset.contentType;
        const lvl = b.dataset.level;
        return lvl ? `${t}:${lvl}` : t;
      }
    }
    return null;
  }

  function _markCurrentType(submenu, blockType) {
    if (!blockType || !submenu) return;
    const label = TYPE_LABELS[blockType];
    if (!label) return;
    submenu.querySelectorAll('[role="menuitem"], button, [data-mantine-component]').forEach(item => {
      const text = item.textContent.trim();
      item.removeAttribute('data-bn-current');
      if (text === label || text.startsWith(label)) {
        item.setAttribute('data-bn-current', 'true');
      }
    });
  }

  // Watch for BlockNote's menu/submenu to appear in the DOM
  const _obs = new MutationObserver(() => {
    // BlockNote renders menus inside a Radix portal at the end of body
    const submenus = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    submenus.forEach(sm => {
      if (sm.dataset.bnProcessed) return;
      sm.dataset.bnProcessed = 'true';
      const blockType = _getHoveredBlockType();
      _markCurrentType(sm, blockType);
    });
  });

  _obs.observe(document.body, { childList: true, subtree: true });
}

// ── Minimal Markdown → HTML for AI responses ─────────────────────────────────
function _mdToHtml(md) {
  let html = md
    // Escape HTML first to prevent XSS
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Fenced code blocks (```lang\n...\n```)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`)
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Unordered lists
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, m => `<ul>${m}</ul>`)
    // Paragraphs: double newline → <p>
    .replace(/\n{2,}/g, '</p><p>')
    // Single newlines inside paragraphs → <br>
    .replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ── Ask AI panel ─────────────────────────────────────────────────────────────
function initAIPanel() {
  const panel      = $('aiPanel');
  const btn        = $('aiBtn');
  const closeBtn   = $('aiPanelClose');
  const input      = $('aiInput');
  const sendBtn    = $('aiSendBtn');
  const responseEl   = $('aiResponse');
  const responseBody = $('aiResponseBody');
  const loadingEl    = $('aiLoading');
  const errorEl      = $('aiError');
  const copyBtn      = $('aiCopyBtn');
  const insertBtn    = $('aiInsertBtn');
  const selBubble    = null; // replaced by #aiInlineBar
  const selCtx       = $('aiSelCtx');
  const selCtxText   = $('aiSelCtxText');
  const selCtxClear  = $('aiSelCtxClear');
  if (!panel || !btn) return;

  let lastResult   = '';
  let _selContext  = '';  // text pinned from a selection
  let aiModelChoice = null;
  // Mounted once (this panel is static in the DOM, not rebuilt like
  // Práctica's body) — shared "ask" context with the inline selection
  // popover below, so picking a model here also applies there.
  _mountModelSelector($('aiModelCSelect'), {
    context: 'ask',
    value: null,
    onChange: choice => { aiModelChoice = choice; },
  });

  // ── Open / close ──────────────────────────────────────────
  function openPanel(selText) {
    if (selText) {
      _selContext = selText;
      selCtxText.textContent = selText.length > 200 ? selText.slice(0, 200) + '…' : selText;
      selCtx.classList.remove('hidden');
      input.placeholder = 'Pregunta sobre la selección…';
    } else {
      _selContext = '';
      selCtx.classList.add('hidden');
      input.placeholder = 'Pregunta algo sobre este contenido…';
    }
    panel.classList.remove('hidden');
    btn.classList.add('active');
    responseEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    setTimeout(() => input.focus(), 50);
  }

  function closePanel() {
    panel.classList.add('hidden');
    btn.classList.remove('active');
    _selContext = '';
    selCtx.classList.add('hidden');
  }

  function togglePanel() {
    if (panel.classList.contains('hidden')) openPanel(null);
    else closePanel();
  }

  btn.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', closePanel);
  selCtxClear.addEventListener('click', () => {
    _selContext = '';
    selCtx.classList.add('hidden');
    input.placeholder = 'Pregunta algo sobre este contenido…';
    input.focus();
  });

  document.querySelectorAll('.ai-action-btn').forEach(b => {
    b.addEventListener('click', () => sendAI(b.dataset.action, ''));
  });

  function sendAI(action, prompt) {
    // Use pinned selection as context when available, otherwise full entry
    const ctx = _selContext || (currentEntryId ? (_inlineEditor.getMarkdown() || '') : '');
    const userPrompt = (prompt || input.value || '').trim();

    responseEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');

    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, prompt: userPrompt, context: ctx, provider: aiModelChoice?.provider, model: aiModelChoice?.model }),
    })
      .then(r => r.json())
      .then(data => {
        loadingEl.classList.add('hidden');
        if (data.error) {
          errorEl.textContent = data.error;
          errorEl.classList.remove('hidden');
          return;
        }
        lastResult = data.result || '';
        responseBody.innerHTML = data.html || _mdToHtml(lastResult);
        responseEl.classList.remove('hidden');
      })
      .catch(err => {
        loadingEl.classList.add('hidden');
        errorEl.textContent = 'Error de red: ' + err.message;
        errorEl.classList.remove('hidden');
      });
  }

  sendBtn.addEventListener('click', () => {
    const q = input.value.trim();
    if (!q) return;
    sendAI('ask', q);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(lastResult).then(() => {
      copyBtn.textContent = '✓ copiado';
      setTimeout(() => { copyBtn.textContent = '⎘ copiar'; }, 1500);
    });
  });

  insertBtn.addEventListener('click', () => {
    if (!lastResult || !currentEntryId) return;
    if (_selContext) {
      // Insert after the paragraph containing the selection (not at the bottom)
      _inlineInsert('explain', _selContext, lastResult);
    } else {
      const md = _inlineEditor.getMarkdown();
      _inlineEditor.load(md + '\n\n' + lastResult);
    }
    closePanel();
    showToast('Respuesta insertada', 'success');
  });

  // Decide AFTER seeing the result, not before generating it: a free-form
  // ask (e.g. "genérame un roadmap completo de JS") doesn't always belong
  // inside whatever entry happened to be open — this saves it as its own
  // new page instead, same shape "＋ Nueva página" already uses.
  const savePageBtn = $('aiSavePageBtn');
  savePageBtn?.addEventListener('click', async () => {
    if (!lastResult) return;
    const title = (input.value || '').trim()
      || (lastResult.split('\n')[0] || '').replace(/^#+\s*/, '').trim().slice(0, 80)
      || 'Respuesta de IA';
    savePageBtn.disabled = true;
    savePageBtn.textContent = 'Guardando…';
    try {
      const res = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_type: 'page', title, raw_text: lastResult, already_markdown: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast(data.error || 'No se pudo guardar la página', 'error');
        savePageBtn.disabled = false;
        savePageBtn.textContent = '＋ guardar como página nueva';
        return;
      }
      showToast(`Guardado como "${title}"`, 'success');
      closePanel();
      await loadTree();
      loadEntry(data.id);
    } catch (err) {
      showToast('Error de red: ' + err.message, 'error');
      savePageBtn.disabled = false;
      savePageBtn.textContent = '＋ guardar como página nueva';
    }
  });

  // ── Inline AI toolbar ────────────────────────────────────
  const inlineBar     = document.getElementById('aiInlineBar');
  const inlineLoading = document.getElementById('aiInlineLoading');
  let _barTimer   = null;
  let _barSelText = '';
  let _barSelRect = null; // viewport rect of the selection (for popover positioning)

  function _hideBar() {
    if (inlineBar) inlineBar.classList.add('hidden');
    if (inlineLoading) inlineLoading.classList.add('hidden');
    inlineBar?.querySelectorAll('.ai-inline-btn').forEach(b => b.classList.remove('loading'));
  }

  function _showBar(rect) {
    if (!inlineBar) return;
    const BAR_W = 192;
    const BAR_H = 260;
    const GAP   = 8;

    // Prefer right of the selection to avoid BlockNote's formatting toolbar
    // dropdowns (which open downward from above the selection).
    let left = rect.right + GAP;
    let top  = rect.top;

    // Not enough room to the right → try left of selection
    if (left + BAR_W > window.innerWidth - GAP) {
      left = rect.left - BAR_W - GAP;
    }
    // Still off-screen left → pin to right edge
    if (left < GAP) {
      left = window.innerWidth - BAR_W - GAP;
    }

    // Vertical: keep within viewport
    if (top + BAR_H > window.innerHeight - GAP) top = window.innerHeight - BAR_H - GAP;
    if (top < GAP) top = GAP;

    inlineBar.style.left      = left + 'px';
    inlineBar.style.top       = top  + 'px';
    inlineBar.style.transform = 'none';
    inlineLoading.classList.add('hidden');
    inlineBar.querySelectorAll('.ai-inline-btn').forEach(b => { b.classList.remove('loading'); b.style.display = ''; });
    inlineBar.classList.remove('hidden');
  }

  // Capture selection — works on desktop (mouseup) AND mobile (selectionchange + touchend)
  function _captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { _hideBar(); return; }
    const text = sel.toString().trim();
    if (!text) { _hideBar(); return; }

    const editorEl = $('entryBody');
    if (!editorEl) { _hideBar(); return; }
    // Verify selection is inside the editor
    let node = sel.anchorNode;
    while (node) { if (node === editorEl) break; node = node.parentNode; }
    if (!node) { _hideBar(); return; }

    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    if (!rect.width && !rect.height) { _hideBar(); return; }

    _barSelText = text;
    _barSelRect = rect;
    _showBar(rect);
  }

  // Desktop: mouseup
  document.addEventListener('mouseup', () => {
    clearTimeout(_barTimer);
    _barTimer = setTimeout(_captureSelection, 120);
  });

  // Mobile: selectionchange fires as the user drags selection handles
  // Debounce 450ms so we capture the final selection, not intermediate states
  document.addEventListener('selectionchange', () => {
    clearTimeout(_barTimer);
    _barTimer = setTimeout(_captureSelection, 450);
  });

  // Mobile: also trigger on touchend (catches tap-to-select and handle release)
  document.addEventListener('touchend', () => {
    clearTimeout(_barTimer);
    _barTimer = setTimeout(_captureSelection, 300);
  });

  document.addEventListener('mousedown', e => {
    if (inlineBar && !inlineBar.contains(e.target)) _hideBar();
  });
  document.addEventListener('touchstart', e => {
    if (inlineBar && !inlineBar.contains(e.target)) {
      // Don't hide if the user might be starting a new selection drag
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) _hideBar();
    }
  }, { passive: true });

  if (inlineBar) {
    inlineBar.addEventListener('mousedown', e => e.preventDefault());
    inlineBar.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

    inlineBar.querySelectorAll('.ai-inline-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action  = btn.dataset.action;
        const selText = _barSelText;
        const selRect = _barSelRect;

        if (action === 'panel') {
          _hideBar();
          openPanel(selText || null);
          return;
        }

        if (action === 'quiz') {
          _hideBar();
          _openQuizSpace(selText);
          return;
        }

        _hideBar();
        // Show Notion-style inline result popover below the selection
        _showAiResultPopover(selText, selRect, action);
      });
    });
  }
}

// Notion-style inline AI result popover ─────────────────────────────────────
function _showAiResultPopover(selText, selRect, action) {
  document.querySelectorAll('.ai-result-pop').forEach(e => e.remove());

  const pop = document.createElement('div');
  pop.className = 'ai-result-pop';
  pop.innerHTML = `
    <div class="arp-header">
      <span class="arp-icon">✦</span>
      <span class="arp-label">IA · ${escapeHtml(selText.length > 60 ? selText.slice(0, 60) + '…' : selText)}</span>
    </div>
    <div class="arp-body ai-response-body arp-loading">
      <span class="arp-spinner"></span><span>Analizando…</span>
    </div>
    <div class="arp-actions hidden">
      <button class="arp-insert btn-primary">↓ Insertar abajo</button>
      <button class="arp-copy btn-ghost">Copiar</button>
      <button class="arp-discard btn-ghost">Descartar</button>
    </div>`;
  document.body.appendChild(pop);

  // Position below selection (fixed, viewport-relative)
  const POP_W = Math.min(520, window.innerWidth - 24);
  let left = (selRect ? selRect.left : window.innerWidth / 2 - POP_W / 2);
  let top  = (selRect ? selRect.bottom + 8 : window.innerHeight / 2);
  if (left + POP_W > window.innerWidth - 12) left = window.innerWidth - POP_W - 12;
  if (left < 12) left = 12;
  pop.style.width = POP_W + 'px';
  pop.style.left  = left + 'px';
  pop.style.top   = top + 'px';

  const bodyEl   = pop.querySelector('.arp-body');
  const actionsEl = pop.querySelector('.arp-actions');
  let _result = '';

  // Shares the "ask" context's saved model choice with the main Ask AI
  // panel (mounted there) rather than showing its own picker in this
  // compact popover — change the model via the panel's selector and it
  // applies here too.
  const popModelChoice = _getRawSavedModelChoice('ask');
  fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, prompt: '', context: selText, provider: popModelChoice?.provider, model: popModelChoice?.model }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      bodyEl.innerHTML = `<span class="arp-error">${escapeHtml(data.error)}</span>`;
      actionsEl.classList.remove('hidden');
      actionsEl.querySelector('.arp-insert').style.display = 'none';
      return;
    }
    _result = data.result || '';
    bodyEl.classList.remove('arp-loading');
    bodyEl.innerHTML = data.html || _mdToHtml(_result);

    // Reposition if popover flows off-screen after content loads
    requestAnimationFrame(() => {
      const popRect = pop.getBoundingClientRect();
      if (popRect.bottom > window.innerHeight - 12 && selRect) {
        pop.style.top = Math.max(12, selRect.top - popRect.height - 8) + 'px';
      }
    });

    actionsEl.classList.remove('hidden');
  })
  .catch(err => {
    bodyEl.innerHTML = `<span class="arp-error">Error: ${escapeHtml(err.message)}</span>`;
    actionsEl.classList.remove('hidden');
    actionsEl.querySelector('.arp-insert').style.display = 'none';
  });

  pop.querySelector('.arp-insert').addEventListener('click', () => {
    if (!_result) return;
    _inlineInsert(action, selText, _result);
    pop.remove();
    showToast('Respuesta insertada', 'success');
  });
  pop.querySelector('.arp-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(_result).then(() => showToast('Copiado', 'success'));
  });
  pop.querySelector('.arp-discard').addEventListener('click', () => pop.remove());

  // Close on outside click/tap
  setTimeout(() => {
    const dismiss = e => {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', dismiss); document.removeEventListener('touchstart', dismiss); }
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('touchstart', dismiss, { passive: true });
  }, 50);
}

// Insert AI result into the editor ──────────────────────────────────────────
function _inlineInsert(action, selText, result) {
  if (!currentEntryId || !_inlineEditor) return;
  const md = _inlineEditor.getMarkdown();

  // Actions that REPLACE the selected text
  if (action === 'fix' || action === 'improve') {
    const snippet = selText.slice(0, 80);
    const idx = md.indexOf(snippet);
    if (idx !== -1) {
      // Find full paragraph boundaries around the selection
      const start = md.lastIndexOf('\n\n', idx);
      const end   = md.indexOf('\n\n', idx + selText.length);
      const s = start !== -1 ? start + 2 : 0;
      const e = end   !== -1 ? end       : md.length;
      _inlineEditor.load(md.slice(0, s) + result + md.slice(e));
      return;
    }
  }

  // All other actions INSERT after the paragraph containing the selection
  const snippet = selText.slice(0, 80);
  const idx = md.indexOf(snippet);
  let insertAt = md.length;
  if (idx !== -1) {
    const afterSel = idx + selText.length;
    const nextPara = md.indexOf('\n\n', afterSel);
    insertAt = nextPara !== -1 ? nextPara : md.length;
  }

  _inlineEditor.load(md.slice(0, insertAt) + '\n\n' + result + md.slice(insertAt));
}

// ── FEATURE: Quiz — docked dashboard space (switchSpace('quiz')), same
// pattern as Práctica: a persistent rail (modo, dificultad, modelo,
// navegación a Historial) plus a main area that dispatches on state
// (vacío / cargando / pregunta activa / resultados / historial). Replaces
// the old floating .modal-overlay so state survives navigating away and
// back, and so every quiz generated is saved server-side as it happens
// (quizzes.json), never lost by closing a modal mid-way. ─────────────────
let _quizState = null;
let _quizPresetContext = null; // { text, title, course } — from inline-selection "Quiz" action

// Entry point for anything outside this feature that wants to jump straight
// into a quiz over some selected text (the inline AI toolbar's "Quiz"
// action) — mirrors _openPracticeSpace's preset-topic handoff.
function _openQuizSpace(selText) {
  if (selText) {
    _quizPresetContext = {
      text: selText,
      title: currentEntryMeta?.title || 'esta lección',
      course: currentEntryMeta?.type === 'course' ? (currentEntryMeta.course || '') : '',
    };
  }
  window.switchSpace?.('quiz');
}

function _renderQuizSpace() {
  if (!_quizState) {
    _quizState = {
      screen: 'empty', viewingHistory: false, mode: 'topic', difficulty: 'medio',
      topic: '', entryId: '', reviewCourse: '', contextText: '', course: '',
    };
  }
  if (_quizPresetContext && !_quizState.viewingHistory && _quizState.screen === 'empty') {
    const preset = _quizPresetContext;
    _quizPresetContext = null;
    _quizState.mode = 'review';
    _renderQuizRail();
    _startQuizGeneration({ topic: preset.title, context: preset.text, course: preset.course });
    return;
  }
  _quizPresetContext = null;
  _renderQuizRail();
  _renderQuizMain();
}

// ── Rail — persistent config + navigation, visible regardless of what the
// main area is currently showing. ─────────────────────────────────────────
function _renderQuizRail() {
  const st = _quizState;
  if (!st) return;
  document.querySelectorAll('.practice-cselect-portal').forEach(el => el.remove());

  $('quizRail').innerHTML = `
    <div class="practice-rail-nav">
      <button class="practice-rail-nav-btn ${!st.viewingHistory ? 'active' : ''}" id="quizNavNew">✏️ Nuevo quiz</button>
      <button class="practice-rail-nav-btn ${st.viewingHistory ? 'active' : ''}" id="quizNavHistory">🕘 Historial</button>
    </div>
    <div class="practice-mode-tabs">
      <button class="practice-mode-tab ${st.mode === 'topic' ? 'active' : ''}" data-mode="topic">✏️ Tema libre</button>
      <button class="practice-mode-tab ${st.mode === 'review' ? 'active' : ''}" data-mode="review">📖 Repasar lección</button>
    </div>
    <div id="quizModeBody"></div>
    <div class="practice-diff-row practice-diff-row--col">
      <span class="practice-diff-label">Dificultad</span>
      <div class="practice-diff-options">
        <button class="practice-diff-btn ${st.difficulty === 'facil' ? 'active' : ''}" data-diff="facil">Fácil</button>
        <button class="practice-diff-btn ${st.difficulty === 'medio' ? 'active' : ''}" data-diff="medio">Medio</button>
        <button class="practice-diff-btn ${st.difficulty === 'dificil' ? 'active' : ''}" data-diff="dificil">Difícil</button>
      </div>
    </div>
    <div class="practice-diff-row practice-diff-row--col">
      <span class="practice-diff-label">Modelo</span>
      <div class="practice-cselect" id="quizModelCSelect"></div>
    </div>
    <button class="btn-primary practice-generate-btn" id="quizGenerateBtn">✦ Generar quiz</button>`;

  $('quizNavNew').addEventListener('click', () => {
    if (!st.viewingHistory) return;
    st.viewingHistory = false;
    _renderQuizRail();
    _renderQuizMain();
  });
  $('quizNavHistory').addEventListener('click', () => {
    if (st.viewingHistory) return;
    st.viewingHistory = true;
    _renderQuizRail();
    _renderQuizMain();
  });

  document.querySelectorAll('#quizRail .practice-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      st.mode = btn.dataset.mode;
      _renderQuizRail();
    });
  });
  document.querySelectorAll('#quizRail .practice-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => { st.difficulty = btn.dataset.diff; _renderQuizRail(); });
  });
  $('quizGenerateBtn').addEventListener('click', () => _startQuizGeneration());

  _mountModelSelector($('quizModelCSelect'), {
    context: 'quiz',
    value: (st.provider && st.model) ? { provider: st.provider, model: st.model } : null,
    onChange: choice => { st.provider = choice?.provider; st.model = choice?.model; },
  });

  _renderQuizModeBody();
}

async function _renderQuizModeBody() {
  const st = _quizState;
  const container = $('quizModeBody');
  if (!container) return;
  document.querySelectorAll('.practice-cselect-portal').forEach(el => el.remove());

  if (st.mode === 'topic') {
    container.innerHTML = `
      <input type="text" id="quizTopicInput" class="practice-text-input"
             placeholder="Ej: manejo de excepciones en Python, subconsultas en SQL…"
             value="${escapeHtml(st.topic)}">`;
    $('quizTopicInput').addEventListener('input', e => { st.topic = e.target.value; });
    return;
  }

  // review
  container.innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando cursos…</div>`;
  const tree = await _getPracticeTree();
  if (_quizState !== st || st.mode !== 'review') return;
  const courseSlugs = Object.keys(tree);
  if (!courseSlugs.length) {
    container.innerHTML = `<div class="practice-empty-note">Todavía no tienes lecciones de cursos guardadas.</div>`;
    return;
  }
  const lessons = st.reviewCourse ? _courseModuleEntries(tree, st.reviewCourse) : [];
  container.innerHTML = `
    <div class="practice-cselect" id="quizCourseCSelect"></div>
    <div class="practice-cselect" id="quizEntryCSelect" style="margin-top:8px"></div>`;

  _mountPracticeCustomSelect($('quizCourseCSelect'), {
    options: courseSlugs.map(slug => ({ value: slug, label: tree[slug].label })),
    value: st.reviewCourse,
    placeholder: 'Elige un curso…',
    onChange: value => { st.reviewCourse = value; st.entryId = ''; _renderQuizModeBody(); },
  });
  _mountPracticeCustomSelect($('quizEntryCSelect'), {
    options: lessons.map(l => ({ value: l.id, label: l.label })),
    value: st.entryId,
    placeholder: st.reviewCourse ? 'Elige una lección…' : 'Primero elige un curso',
    disabled: !st.reviewCourse,
    onChange: value => { st.entryId = value; },
  });
}

// ── Main area — dispatches on state. ──────────────────────────────────────
function _renderQuizMain() {
  const st = _quizState;
  if (!st) return;
  if (st.viewingHistory) { _renderQuizHistoryMain(); return; }
  if (st.screen === 'empty') { _renderQuizEmptyMain(); return; }
  if (st.screen === 'loading') {
    $('quizMain').innerHTML = `
      <div class="quiz-loading">
        <span class="arp-spinner"></span>
        <span>Generando un quiz a partir del contenido…</span>
      </div>`;
    return;
  }
  if (st.screen === 'question') { _renderQuizQuestion(st.current); return; }
  if (st.screen === 'results') { _renderQuizResults(); return; }
}

function _renderQuizEmptyMain() {
  $('quizMain').innerHTML = `
    <div class="practice-empty-main">
      <span class="practice-empty-main-icon">✦</span>
      <p class="practice-empty-main-title">Configura tu quiz</p>
      <p class="practice-empty-main-sub">Elegí un modo, la dificultad y el modelo que quieras que lo genere — después tocá "Generar quiz".</p>
    </div>`;
}

function _renderQuizError(msg) {
  const safeMsg = (msg || '').length > 400 ? msg.slice(0, 400) + '…' : msg;
  $('quizMain').innerHTML = `
    <div class="quiz-error">${escapeHtml(safeMsg)}</div>
    <button class="btn-ghost" id="quizRetryErrBtn" style="margin-top:14px">← Volver</button>`;
  $('quizRetryErrBtn').addEventListener('click', () => { _quizState.screen = 'empty'; _renderQuizMain(); });
}

async function _startQuizGeneration(override) {
  const st = _quizState;
  if (st.viewingHistory) { st.viewingHistory = false; _renderQuizRail(); }
  let topic = '', context = '', entryId = '', course = '';

  if (override) {
    topic = override.topic || '';
    context = override.context || '';
    course = override.course || '';
  } else if (st.mode === 'topic') {
    topic = (st.topic || '').trim();
    if (!topic) { showToast('Escribe un tema para el quiz', 'error'); return; }
  } else {
    if (!st.entryId) { showToast('Elige una lección para repasar', 'error'); return; }
    const res = await fetch(`/api/entry/${st.entryId}`);
    if (!res.ok) { showToast('No se pudo cargar la lección', 'error'); return; }
    const data = await res.json();
    topic = data.meta.title;
    context = (data.markdown || '').slice(0, 6000);
    entryId = st.entryId;
    course = data.meta.type === 'course' ? (data.meta.course || '') : '';
  }

  st.topic = topic;
  st.entryId = entryId;
  st.contextText = context;
  st.course = course;
  st.screen = 'loading';
  _renderQuizMain();

  try {
    const res = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: st.mode, topic, context, title: topic, course, entry_id: entryId,
        difficulty: st.difficulty, provider: st.provider, model: st.model,
      }),
    });
    const data = await res.json();
    if (_quizState !== st) return;
    if (!res.ok || data.error) {
      st.screen = 'empty';
      _renderQuizError(data.error || 'No se pudo generar el quiz.');
      return;
    }
    st.quiz = data;
    st.current = 0;
    st.screen = 'question';
    _renderQuizQuestion(0);
  } catch (err) {
    if (_quizState !== st) return;
    st.screen = 'empty';
    _renderQuizError('Error de red: ' + err.message);
  }
}

function _saveQuizProgress(st) {
  if (!st || !st.quiz || !st.quiz.id) return;
  fetch(`/api/quiz/${st.quiz.id}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_step: st.current, answers: st.quiz.answers }),
  }).catch(() => {});
}

function _renderQuizQuestion(i) {
  const st = _quizState;
  if (!st || !st.quiz) return;
  st.current = i;
  const quiz = st.quiz;
  const q = quiz.questions[i];
  const total = quiz.questions.length;
  const answered = quiz.answers[i];

  const dots = quiz.questions.map((_, idx) => {
    const cls = idx === i ? 'current' : (quiz.answers[idx] != null ? 'done' : '');
    return `<span class="quiz-dot ${cls}"></span>`;
  }).join('');

  $('quizMain').innerHTML = `
    <div class="quiz-progress">
      <div class="quiz-dots">${dots}</div>
      <span class="quiz-progress-label">Pregunta ${i + 1} de ${total}</span>
    </div>
    <div class="quiz-question">${escapeHtml(q.question)}</div>
    <div class="quiz-options" id="quizOptions"></div>
    <div class="quiz-explanation hidden" id="quizExplanation"></div>
    <div class="practice-main-actions" id="quizMainActions"></div>`;

  const optsEl = $('quizOptions');
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `<span class="quiz-option-letter">${String.fromCharCode(65 + idx)}</span><span>${escapeHtml(opt)}</span>`;
    if (answered != null) {
      btn.disabled = true;
      if (idx === q.correct) btn.classList.add('correct');
      else if (idx === answered) btn.classList.add('incorrect');
    }
    btn.addEventListener('click', () => _answerQuiz(idx));
    optsEl.appendChild(btn);
  });

  if (answered != null) {
    const el = $('quizExplanation');
    const ok = answered === q.correct;
    el.classList.remove('hidden');
    el.classList.toggle('quiz-explanation--ok', ok);
    el.classList.toggle('quiz-explanation--bad', !ok);
    el.innerHTML = `
      <span class="quiz-explanation-badge">${ok ? '✓ Correcto' : '✕ Incorrecto'}</span>
      ${q.explanation ? `<span>${escapeHtml(q.explanation)}</span>` : ''}`;
  }

  const actions = $('quizMainActions');
  if (i > 0) {
    const prev = document.createElement('button');
    prev.className = 'btn-ghost';
    prev.textContent = '← Anterior';
    prev.addEventListener('click', () => _renderQuizQuestion(i - 1));
    actions.appendChild(prev);
  }
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  actions.appendChild(spacer);

  const isLast = i === total - 1;
  const next = document.createElement('button');
  next.className = 'btn-primary';
  next.disabled = answered == null;
  next.textContent = isLast ? 'Ver resultados →' : 'Siguiente →';
  next.addEventListener('click', () => {
    if (isLast) { st.screen = 'results'; _renderQuizResults(); }
    else _renderQuizQuestion(i + 1);
  });
  actions.appendChild(next);
}

function _answerQuiz(idx) {
  const st = _quizState;
  if (!st || !st.quiz || st.quiz.answers[st.current] != null) return;
  st.quiz.answers[st.current] = idx;
  _renderQuizQuestion(st.current);
  _saveQuizProgress(st);

  // Feed the spaced-repetition tracker per question, not just the final score
  const q = st.quiz.questions[st.current];
  if (q.concept_id) {
    fetch('/api/concepts/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept_id: q.concept_id, course: st.course, correct: idx === q.correct, modality: 'quiz' }),
    }).catch(() => {});
  }
}

function _renderQuizResults() {
  const st = _quizState;
  if (!st || !st.quiz) return;
  const quiz = st.quiz;
  const total   = quiz.questions.length;
  const correct = quiz.answers.filter((a, i) => a === quiz.questions[i].correct).length;
  const pct     = Math.round((correct / total) * 100);
  const grade   = pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'low';
  const gradeMsg = pct >= 80 ? '¡Excelente dominio del tema!'
                 : pct >= 50 ? 'Vas bien, pero repasa lo que fallaste.'
                 : 'Conviene repasar la lección antes de seguir.';

  $('quizMain').innerHTML = `
    <h3 class="practice-challenge-title">${escapeHtml(quiz.title)} — Resultados</h3>
    <div class="quiz-results">
      <div class="quiz-score quiz-score--${grade}">
        <span class="quiz-score-pct">${pct}%</span>
        <span class="quiz-score-frac">${correct}/${total} correctas</span>
      </div>
      <div class="quiz-score-msg">${gradeMsg}</div>
      <div class="quiz-review" id="quizReview"></div>
    </div>
    <div class="practice-main-actions" id="quizMainActions"></div>`;

  // Persist: mark this quiz finished + feed the legacy attempts tracker
  if (quiz.id) {
    fetch(`/api/quiz/${quiz.id}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', answers: quiz.answers }),
    }).catch(() => {});
  }
  const attemptEntryId = st.entryId || currentEntryId;
  if (attemptEntryId) {
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: attemptEntryId, type: 'quiz', score: correct, total }),
    }).catch(() => {});
  }

  const review = $('quizReview');
  quiz.questions.forEach((q, i) => {
    const userAns = quiz.answers[i];
    const ok = userAns === q.correct;
    const row = document.createElement('div');
    row.className = 'quiz-review-item' + (ok ? ' ok' : ' bad');
    row.innerHTML = `
      <div class="quiz-review-head">
        <span class="quiz-review-icon">${ok ? '✓' : '✕'}</span>
        <span class="quiz-review-q">${i + 1}. ${escapeHtml(q.question)}</span>
      </div>
      <div class="quiz-review-detail">
        ${!ok ? `<div class="quiz-review-wrong">Tu respuesta: ${escapeHtml(q.options[userAns])}</div>` : ''}
        <div class="quiz-review-correct">Correcta: ${escapeHtml(q.options[q.correct])}</div>
        ${q.explanation ? `<div class="quiz-review-exp">${escapeHtml(q.explanation)}</div>` : ''}
      </div>`;
    review.appendChild(row);
  });

  const actions = $('quizMainActions');

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-ghost';
  retryBtn.textContent = '↻ Nuevo quiz';
  retryBtn.addEventListener('click', () => { st.screen = 'empty'; st.quiz = null; _renderQuizMain(); });
  actions.appendChild(retryBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-ghost';
  copyBtn.textContent = '⎘ Copiar resultado';
  copyBtn.addEventListener('click', () => {
    const lines = [`Quiz — ${quiz.title || ''} — ${correct}/${total} (${pct}%)`, ''];
    quiz.questions.forEach((q, i) => {
      const ok = quiz.answers[i] === q.correct;
      lines.push(`${i + 1}. [${ok ? 'OK' : 'X'}] ${q.question}`);
      lines.push(`   Correcta: ${q.options[q.correct]}`);
      if (q.explanation) lines.push(`   ${q.explanation}`);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Resultado copiado', 'success'));
  });
  actions.appendChild(copyBtn);

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  actions.appendChild(spacer);

  // Only meaningful inside an open course lesson — offer to mark it complete
  if (currentEntryMeta?.type === 'course' && currentEntryId) {
    const markBtn = document.createElement('button');
    markBtn.className = 'btn-primary';
    markBtn.textContent = pct >= 80 ? '✓ Marcar lección completada' : '✓ Marcar en progreso';
    markBtn.addEventListener('click', async () => {
      const status = pct >= 80 ? 'completado' : 'en_progreso';
      await fetch(`/api/entry/${currentEntryId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      updateStatusBtn($('statusBtn'), status);
      showToast(status === 'completado' ? 'Lección marcada como completada' : 'Lección marcada en progreso', 'success');
    });
    actions.appendChild(markBtn);
  }
}

// ── Historial — every generated quiz is saved server-side the moment it's
// generated, whether finished, abandoned, or left mid-way; resuming picks
// it back up exactly where it was left. ───────────────────────────────────
const _QUIZ_STATUS_LABEL = { in_progress: '● en progreso', completed: '✓ completado', abandoned: '⊘ abandonado' };

async function _renderQuizHistoryMain() {
  const st = _quizState;
  if (!st) return;
  $('quizMain').innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando historial…</div>`;

  let quizzes = [];
  try {
    const res = await fetch('/api/quiz/history?limit=50');
    const data = await res.json();
    quizzes = data.quizzes || [];
  } catch { /* keep empty — shows the empty state below */ }
  if (_quizState !== st || !st.viewingHistory) return;

  if (!quizzes.length) {
    $('quizMain').innerHTML = `<div class="practice-history-empty">Todavía no has generado ningún quiz.<br>Los que generes se guardan aquí automáticamente.</div>`;
    return;
  }

  $('quizMain').innerHTML = `<div class="practice-history-list">${quizzes.map(q => `
    <div class="practice-history-item" data-id="${q.id}">
      <div class="practice-history-main">
        <div class="practice-history-title">${escapeHtml(q.title)}</div>
        <div class="practice-history-meta">
          <span class="practice-history-status practice-history-status--${q.status}">${_QUIZ_STATUS_LABEL[q.status] || q.status}</span>
          <span>${escapeHtml(q.difficulty || '')}</span>
          <span>${Math.min(q.current_step + 1, q.question_count)}/${q.question_count} preguntas</span>
          <span>${_relTimeAgo(new Date(q.updated_at).getTime())}</span>
        </div>
      </div>
      <button class="practice-history-del" data-id="${q.id}" title="Eliminar del historial">🗑</button>
    </div>`).join('')}</div>`;

  document.querySelectorAll('#quizMain .practice-history-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('¿Eliminar este quiz del historial? No se puede deshacer.')) return;
      try { await fetch(`/api/quiz/${btn.dataset.id}`, { method: 'DELETE' }); } catch { /* best-effort */ }
      if (_quizState === st && st.viewingHistory) _renderQuizHistoryMain();
    });
  });
  document.querySelectorAll('#quizMain .practice-history-item').forEach(item => {
    item.addEventListener('click', () => _resumeQuizFromHistory(item.dataset.id));
  });
}

async function _resumeQuizFromHistory(quizId) {
  const st = _quizState;
  if (!st) return;
  $('quizMain').innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando quiz…</div>`;

  let data;
  try {
    const res = await fetch(`/api/quiz/${quizId}`);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'No se pudo cargar el quiz');
  } catch (err) {
    showToast(err.message, 'error');
    if (_quizState === st) _renderQuizHistoryMain();
    return;
  }
  if (_quizState !== st) return;

  st.quiz = data;
  if (!data.answers || data.answers.length !== data.questions.length) {
    data.answers = new Array(data.questions.length).fill(null);
  }
  st.current = Math.min(data.current_step || 0, data.questions.length - 1);
  st.topic = data.title;
  st.course = data.course || '';
  st.entryId = data.entry_id || '';
  st.viewingHistory = false;

  if (data.status === 'in_progress') {
    st.screen = 'question';
    _renderQuizQuestion(st.current);
  } else {
    st.screen = 'results';
    _renderQuizResults();
  }
  _renderQuizRail();
}

// ── Práctica: retos generados por IA, sin sandbox real ────────────────────────
// Python steps run for real via /api/execute-style checking (/api/practice/check-python);
// git/shell/text steps are evaluated by the AI as text (/api/practice/check-text) — never
// executed. See handoff Fase 1: no real terminal/sandbox by explicit user decision.
// ── FEATURE: Práctica — retos generados por IA, ambiente propio ────────────
// Not a floating panel: a real dashboard space (switchSpace('practice')),
// same weight as Cursos/Radar. A persistent rail on the left holds every
// control (modo, dificultad, modelo, navegación a Historial); the main
// area on the right shows whatever's active (vacío / cargando / el reto /
// resultados / el historial). State lives in _practiceState and survives
// switching away to another space and back — nothing is ever lost by
// navigating, only by explicitly starting a new reto.
//
// git/shell/text steps are evaluated by the AI as text (/api/practice/check-text) —
// never executed. See handoff Fase 1: no real terminal/sandbox by explicit user decision.
let _practiceState = null;
let _practiceTreeCache = null;
let _practicePresetTopic = null;

// Entry point for anything outside this feature that wants to jump into
// Práctica (sidebar icon's data-space wiring handles the plain case on its
// own) — used where a preset topic needs to travel along, e.g. the Home
// domain-reminder card's "Practicar ahora" button.
function _openPracticeSpace(presetTopic) {
  if (typeof presetTopic === 'string' && presetTopic) _practicePresetTopic = presetTopic;
  window.switchSpace?.('practice');
}

function _renderPracticeSpace() {
  if (!_practiceState) {
    const st = {
      screen: 'empty', viewingHistory: false, mode: 'topic', difficulty: 'medio',
      topic: _practicePresetTopic || '', entryId: '', reviewCourse: '',
      contextText: '', startNudge: null,
    };
    _practicePresetTopic = null;
    _practiceState = st;

    // Soft nudge: Práctica leans on Cursos, so if there's an unstarted course we
    // say so — without blocking anything, per the user's explicit "soft, not
    // hard gate" call. Fetched async so it never delays showing the space.
    fetch('/api/domain/reminder').then(r => r.json()).then(data => {
      if (_practiceState !== st) return;
      if (data.reminder && data.reminder.kind === 'start') {
        st.startNudge = data.reminder;
        _renderPracticeRail();
      }
    }).catch(() => {});
  } else if (_practicePresetTopic && !_practiceState.viewingHistory && _practiceState.screen === 'empty') {
    // Came back via a "Practicar ahora" shortcut while idle — only honor
    // the preset if there's nothing already going on to preserve.
    _practiceState.mode = 'topic';
    _practiceState.topic = _practicePresetTopic;
    _practicePresetTopic = null;
  } else {
    _practicePresetTopic = null;
  }
  _renderPracticeRail();
  _renderPracticeMain();
}

function _practiceSlug(text) {
  return (text || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tema';
}

async function _getPracticeTree() {
  if (_practiceTreeCache) return _practiceTreeCache;
  try {
    const res = await fetch('/api/courses/tree');
    _practiceTreeCache = await res.json();
  } catch { _practiceTreeCache = {}; }
  return _practiceTreeCache;
}

function _flattenPracticeEntries(tree) {
  const out = [];
  for (const courseSlug in tree) {
    const course = tree[courseSlug];
    for (const modSlug in course.modules) {
      const mod = course.modules[modSlug];
      for (const entry of mod.entries) {
        out.push({ id: entry.id, title: entry.title, course: courseSlug, label: `${course.label} › ${mod.label} › ${entry.title}` });
      }
    }
  }
  return out;
}

// Same shape, scoped to a single course and without repeating its name in the
// label — used once the "Repasar lección" picker has already filtered by course.
function _courseModuleEntries(tree, courseSlug) {
  const course = tree[courseSlug];
  if (!course) return [];
  const out = [];
  for (const modSlug in course.modules) {
    const mod = course.modules[modSlug];
    for (const entry of mod.entries) {
      out.push({ id: entry.id, title: entry.title, label: `${mod.label} › ${entry.title}` });
    }
  }
  return out;
}

// ── Rail — persistent configuration + navigation, always visible regardless
// of what the main area is currently showing (an empty state, a reto in
// progress, results, or the historial list). ─────────────────────────────
function _renderPracticeRail() {
  const st = _practiceState;
  if (!st) return;
  // Rebuilding this rail below detaches any custom-select containers
  // without running their own cleanup, so sweep their body-level portals here.
  document.querySelectorAll('.practice-cselect-portal').forEach(el => el.remove());

  const nudgeHtml = st.startNudge ? `
    <div class="practice-nudge">
      <span class="practice-nudge-icon">📚</span>
      <div class="practice-nudge-msg">${escapeHtml(st.startNudge.message)}</div>
      <button class="practice-nudge-btn" id="practiceNudgeGoBtn">Ir a Cursos →</button>
    </div>` : '';

  $('practiceRail').innerHTML = `
    <div class="practice-rail-nav">
      <button class="practice-rail-nav-btn ${!st.viewingHistory ? 'active' : ''}" id="practiceNavNew">✏️ Nuevo reto</button>
      <button class="practice-rail-nav-btn ${st.viewingHistory ? 'active' : ''}" id="practiceNavHistory">🕘 Historial</button>
    </div>
    ${nudgeHtml}
    <div class="practice-mode-tabs">
      <button class="practice-mode-tab ${st.mode === 'topic' ? 'active' : ''}" data-mode="topic">✏️ Tema libre</button>
      <button class="practice-mode-tab ${st.mode === 'review' ? 'active' : ''}" data-mode="review">📖 Repasar lección</button>
      <button class="practice-mode-tab ${st.mode === 'surprise' ? 'active' : ''}" data-mode="surprise">🎲 Reto sorpresa</button>
      <button class="practice-mode-tab ${st.mode === 'concept' ? 'active' : ''}" data-mode="concept">🧭 Por tema</button>
    </div>
    <div id="practiceModeBody"></div>
    <div class="practice-diff-row practice-diff-row--col">
      <span class="practice-diff-label">Dificultad</span>
      <div class="practice-diff-options">
        <button class="practice-diff-btn ${st.difficulty === 'facil' ? 'active' : ''}" data-diff="facil">Fácil</button>
        <button class="practice-diff-btn ${st.difficulty === 'medio' ? 'active' : ''}" data-diff="medio">Medio</button>
        <button class="practice-diff-btn ${st.difficulty === 'dificil' ? 'active' : ''}" data-diff="dificil">Difícil</button>
      </div>
    </div>
    <div class="practice-diff-row practice-diff-row--col">
      <span class="practice-diff-label">Modelo</span>
      <div class="practice-cselect" id="practiceModelCSelect"></div>
    </div>
    <button class="btn-primary practice-generate-btn" id="practiceGenerateBtn">✦ Generar reto</button>`;

  $('practiceNudgeGoBtn')?.addEventListener('click', () => window.switchSpace?.('courses'));

  $('practiceNavNew').addEventListener('click', () => {
    if (!st.viewingHistory) return;
    st.viewingHistory = false;
    _renderPracticeRail();
    _renderPracticeMain();
  });
  $('practiceNavHistory').addEventListener('click', () => {
    if (st.viewingHistory) return;
    st.viewingHistory = true;
    _renderPracticeRail();
    _renderPracticeMain();
  });

  document.querySelectorAll('.practice-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      st.mode = btn.dataset.mode;
      _renderPracticeRail();
      // "Por tema" drives what main shows (the concept hub) once a concept is
      // picked — but never clobber an active reto/results just because the
      // mode tab was flipped while one was already open.
      if (st.screen === 'empty' && !st.viewingHistory) _renderPracticeMain();
    });
  });
  document.querySelectorAll('.practice-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => { st.difficulty = btn.dataset.diff; _renderPracticeRail(); });
  });
  $('practiceGenerateBtn').addEventListener('click', _startPracticeGeneration);

  // Freedom to pick which LLM answers THIS specific request, every time —
  // not a single app-wide default. Remembers the last model chosen for
  // Práctica specifically (context "practice"), independent of whatever was
  // last picked in Ask AI or anywhere else, since different work calls for
  // different models (fast for a quick check, deep for a hard problem).
  _mountModelSelector($('practiceModelCSelect'), {
    context: 'practice',
    value: (st.provider && st.model) ? { provider: st.provider, model: st.model } : null,
    onChange: choice => { st.provider = choice?.provider; st.model = choice?.model; },
  });

  _renderPracticeModeBody();
}

// Native <select> popups are painted by the OS/browser chrome and can't be
// themed — they'd show up as a stark light-mode list inside this otherwise
// dark rail. This renders a themed stand-in instead: a button plus a
// floating panel *portaled onto document.body* (position: fixed, coordinates
// from the button's own bounding rect) — appended outside the rail so the
// rail's own overflow/height never clips it, the same way a native select's
// popup escapes its container. The portal is tracked on the container element
// so a re-mount (or leaving the Práctica space) can find and remove the old one.
function _mountPracticeCustomSelect(container, { options, value, placeholder, disabled, onChange }) {
  if (!container) return;
  container._cselectPortal?.remove();
  const selected = options.find(o => o.value === value);

  container.innerHTML = `
    <button type="button" class="practice-cselect-btn" ${disabled ? 'disabled' : ''}>
      <span class="practice-cselect-value${selected ? '' : ' placeholder'}">${escapeHtml(selected ? selected.label : placeholder)}</span>
      <span class="practice-cselect-chevron">▾</span>
    </button>`;

  const btn = container.querySelector('.practice-cselect-btn');
  const dropdown = document.createElement('div');
  dropdown.className = 'smart-select-dropdown practice-cselect-portal hidden';
  document.body.appendChild(dropdown);
  container._cselectPortal = dropdown;

  const reposition = () => {
    const r = btn.getBoundingClientRect();
    dropdown.style.left = `${r.left}px`;
    dropdown.style.top = `${r.bottom + 4}px`;
    dropdown.style.width = `${r.width}px`;
  };
  const close = () => {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEscape);
    window.removeEventListener('resize', reposition);
  };
  const onOutsideClick = e => { if (!container.contains(e.target) && !dropdown.contains(e.target)) close(); };
  const onEscape = e => { if (e.key === 'Escape') close(); };

  if (!disabled) {
    btn.addEventListener('click', () => {
      const isOpen = !dropdown.classList.contains('hidden');
      if (isOpen) { close(); return; }
      dropdown.innerHTML = options.length
        ? options.map(o => `<div class="ss-item" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</div>`).join('')
        : `<div class="ss-item" style="color:var(--text-faint);cursor:default">Sin opciones</div>`;
      const valueEl = btn.querySelector('.practice-cselect-value');
      dropdown.querySelectorAll('.ss-item[data-value]').forEach(item => {
        item.addEventListener('click', () => {
          close();
          if (valueEl) {
            valueEl.textContent = item.textContent;
            valueEl.classList.remove('placeholder');
          }
          onChange(item.dataset.value);
        });
      });
      reposition();
      dropdown.classList.remove('hidden');
      document.addEventListener('click', onOutsideClick);
      document.addEventListener('keydown', onEscape);
      window.addEventListener('resize', reposition);
    });
  }
}

// ── Shared AI model selector — used anywhere the app calls out to an LLM
// (Práctica, Ask AI, Quiz, mapa mental…), not just one place. The user
// wants genuine freedom to pick which model answers each specific request
// (a fast one for a quick check, a deeper one for a hard problem), so this
// is never a single app-wide default — it's mounted fresh per feature and
// remembers the last choice PER CONTEXT (localStorage key scoped to the
// caller's own context string), since "practice" and "ask" are different
// kinds of work with their own sensible defaults.
let _aiProvidersPromise = null;
function _getAvailableProviders() {
  if (!_aiProvidersPromise) {
    _aiProvidersPromise = fetch('/api/ai/providers').then(r => r.json())
      .catch(() => ({ providers: [], default: { provider: 'deepseek', model: 'deepseek-chat' } }));
  }
  return _aiProvidersPromise;
}

function _modelChoiceStorageKey(context) { return `kb_ai_model:${context}`; }

// Synchronous, unvalidated read of a context's last-saved model choice —
// for spots (like the inline selection popover below) that fire an AI
// request immediately and shouldn't wait on an /api/ai/providers round
// trip just to know which model to ask for. If the saved choice turns out
// stale (key since removed), the backend's own _call_ai() falls back to
// its default the same way an unset provider/model always has.
function _getRawSavedModelChoice(context) {
  try {
    const raw = localStorage.getItem(_modelChoiceStorageKey(context));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _getSavedModelChoice(context, data) {
  try {
    const raw = localStorage.getItem(_modelChoiceStorageKey(context));
    if (raw) {
      const parsed = JSON.parse(raw);
      const prov = data.providers.find(p => p.id === parsed.provider);
      if (prov && prov.models.some(m => m.id === parsed.model)) return parsed;
    }
  } catch (_) { /* ignore malformed/blocked localStorage */ }
  if (data.providers.length) {
    const def = data.providers.find(p => p.id === data.default.provider) || data.providers[0];
    const model = def.models.find(m => m.id === data.default.model) || def.models[0];
    return { provider: def.id, model: model.id };
  }
  return null;
}

function _saveModelChoice(context, choice) {
  try { localStorage.setItem(_modelChoiceStorageKey(context), JSON.stringify(choice)); } catch (_) { /* ignore */ }
}

// Mounts a themed model picker into `container` (reuses the same custom-
// select widget as everywhere else in Práctica). `value` pre-selects a
// specific {provider, model} (e.g. to survive a parent re-render); leave it
// unset to fall back to this context's last-saved choice, or this app's
// overall default if there's no saved choice yet. `onChange({provider,
// model} | null)` fires once immediately with the resolved starting choice,
// and again on every pick — null means no provider has an API key
// configured at all, so the caller should let the request fall through to
// the backend's own default (which will surface the real "no configurada"
// error same as today).
function _mountModelSelector(container, { context, value, onChange }) {
  if (!container) return;
  container.innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> modelos…</div>`;
  _getAvailableProviders().then(data => {
    if (!container.isConnected) return; // panel/parent was closed or re-rendered while this was in flight
    if (!data.providers || !data.providers.length) {
      container.innerHTML = `<div class="practice-empty-note">Sin proveedores de IA configurados.</div>`;
      onChange(null);
      return;
    }
    const options = [];
    data.providers.forEach(p => {
      p.models.forEach(m => options.push({ value: `${p.id}:${m.id}`, label: `${m.label} (${p.label}) — ${m.hint}` }));
    });
    const initial = value || _getSavedModelChoice(context, data);
    onChange(initial);
    const wrap = document.createElement('div');
    container.innerHTML = '';
    container.appendChild(wrap);
    _mountPracticeCustomSelect(wrap, {
      options,
      value: initial ? `${initial.provider}:${initial.model}` : '',
      placeholder: 'Elegir modelo…',
      onChange: raw => {
        const [provider, model] = raw.split(':');
        const choice = { provider, model };
        _saveModelChoice(context, choice);
        onChange(choice);
      },
    });
  });
}

async function _renderPracticeModeBody() {
  const st = _practiceState;
  const container = $('practiceModeBody');
  if (!container) return;
  // Rebuilding this container's contents (below) detaches any custom-select
  // wrapper divs without running their own cleanup, orphaning their
  // body-level portals — sweep them here too, not just in _renderPracticeRail.
  document.querySelectorAll('.practice-cselect-portal').forEach(el => el.remove());

  if (st.mode === 'topic') {
    container.innerHTML = `
      <input type="text" id="practiceTopicInput" class="practice-text-input"
             placeholder="Ej: manejo de excepciones en Python, subconsultas en SQL…"
             value="${escapeHtml(st.topic)}">`;
    $('practiceTopicInput').addEventListener('input', e => { st.topic = e.target.value; });
    return;
  }

  if (st.mode === 'review') {
    container.innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando cursos…</div>`;
    const tree = await _getPracticeTree();
    if (_practiceState !== st || st.mode !== 'review') return;
    const courseSlugs = Object.keys(tree);
    if (!courseSlugs.length) {
      container.innerHTML = `<div class="practice-empty-note">Todavía no tienes lecciones de cursos guardadas.</div>`;
      return;
    }
    const lessons = st.reviewCourse ? _courseModuleEntries(tree, st.reviewCourse) : [];
    container.innerHTML = `
      <div class="practice-cselect" id="practiceCourseCSelect"></div>
      <div class="practice-cselect" id="practiceEntryCSelect" style="margin-top:8px"></div>`;

    _mountPracticeCustomSelect($('practiceCourseCSelect'), {
      options: courseSlugs.map(slug => ({ value: slug, label: tree[slug].label })),
      value: st.reviewCourse,
      placeholder: 'Elige un curso…',
      onChange: value => { st.reviewCourse = value; st.entryId = ''; _renderPracticeModeBody(); },
    });
    _mountPracticeCustomSelect($('practiceEntryCSelect'), {
      options: lessons.map(l => ({ value: l.id, label: l.label })),
      value: st.entryId,
      placeholder: st.reviewCourse ? 'Elige una lección…' : 'Primero elige un curso',
      disabled: !st.reviewCourse,
      onChange: value => { st.entryId = value; },
    });
    return;
  }

  if (st.mode === 'concept') {
    // "Centro de mando": Curso ▸ Categoría ▸ Concepto en cascada — cada
    // select filtra al siguiente. Elegir un concepto no solo prepara la
    // generación del reto (via concept_id forzado, igual que "Reto
    // sorpresa"), también dispara el hub en el área principal (teoría +
    // tu dominio en ESE concepto puntual).
    container.innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando temas…</div>`;
    const domainData = await _getDomainData();
    if (_practiceState !== st || st.mode !== 'concept') return;

    const courseSlugs = Object.keys(domainData.courses || {});
    if (!courseSlugs.length) {
      container.innerHTML = `<div class="practice-empty-note">Todavía no hay cursos con mapa de temas — agregá lecciones a un curso y volvé, se genera solo.</div>`;
      return;
    }

    const courseInfo = st.conceptCourse ? domainData.courses[st.conceptCourse] : null;
    const categories = courseInfo ? [...new Set(courseInfo.concepts.map(c => c.category || 'General'))] : [];
    const conceptsInCategory = (courseInfo && st.conceptCategory)
      ? courseInfo.concepts.filter(c => (c.category || 'General') === st.conceptCategory)
      : [];

    container.innerHTML = `
      <div class="practice-cselect" id="practiceConceptCourseCSelect"></div>
      <div class="practice-cselect" id="practiceConceptCategoryCSelect" style="margin-top:8px"></div>
      <div class="practice-cselect" id="practiceConceptCSelect" style="margin-top:8px"></div>
      <button class="practice-refresh-topics-btn" id="practiceRefreshTopicsBtn" type="button" ${!st.conceptCourse ? 'disabled' : ''}>🔄 Actualizar temas de este curso</button>`;

    _mountPracticeCustomSelect($('practiceConceptCourseCSelect'), {
      options: courseSlugs.map(slug => ({ value: slug, label: domainData.courses[slug].label })),
      value: st.conceptCourse,
      placeholder: 'Elige un curso…',
      onChange: value => { st.conceptCourse = value; st.conceptCategory = ''; st.conceptId = ''; _renderPracticeModeBody(); _renderPracticeMain(); },
    });
    _mountPracticeCustomSelect($('practiceConceptCategoryCSelect'), {
      options: categories.map(cat => ({ value: cat, label: cat })),
      value: st.conceptCategory,
      placeholder: st.conceptCourse ? 'Elige una categoría…' : 'Primero elige un curso',
      disabled: !st.conceptCourse,
      onChange: value => { st.conceptCategory = value; st.conceptId = ''; _renderPracticeModeBody(); _renderPracticeMain(); },
    });
    _mountPracticeCustomSelect($('practiceConceptCSelect'), {
      options: conceptsInCategory.map(c => ({ value: c.id, label: `${c.name} (${c.mastery}%)` })),
      value: st.conceptId,
      placeholder: st.conceptCategory ? 'Elige un concepto…' : 'Primero elige una categoría',
      disabled: !st.conceptCategory,
      onChange: value => {
        st.conceptId = value;
        const picked = conceptsInCategory.find(c => c.id === value);
        st.conceptName = picked ? picked.name : '';
        _renderPracticeMain();
      },
    });
    $('practiceRefreshTopicsBtn')?.addEventListener('click', () => _regenerateConceptMap(st));
    return;
  }

  // surprise
  container.innerHTML = `<div class="practice-empty-note">Elegiremos una lección al azar de tus cursos para retarte.</div>`;
}

let _domainDataCache = null;
async function _getDomainData(force) {
  if (_domainDataCache && !force) return _domainDataCache;
  try {
    const res = await fetch('/api/domain');
    _domainDataCache = await res.json();
  } catch { _domainDataCache = { courses: {} }; }
  return _domainDataCache;
}

async function _regenerateConceptMap(st) {
  if (!st.conceptCourse) return;
  const btn = $('practiceRefreshTopicsBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  try {
    const res = await fetch(`/api/courses/${st.conceptCourse}/concepts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: st.provider, model: st.model }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'No se pudo actualizar', 'error'); return; }
    st.conceptCategory = '';
    st.conceptId = '';
    await _getDomainData(true);
    showToast('Temas actualizados', 'success');
  } catch (err) {
    showToast('Error de red: ' + err.message, 'error');
  } finally {
    if (_practiceState === st) { _renderPracticeModeBody(); _renderPracticeMain(); }
  }
}

async function _renderConceptHubMain() {
  const st = _practiceState;
  const domainData = await _getDomainData();
  if (_practiceState !== st) return;
  const courseInfo = domainData.courses[st.conceptCourse];
  const concept = courseInfo?.concepts.find(c => c.id === st.conceptId);
  if (!concept) { _renderPracticeEmptyMain(); return; }

  $('practiceMain').innerHTML = `
    <div class="practice-concept-hub">
      <span class="practice-concept-hub-category">${escapeHtml(concept.category || 'General')}</span>
      <h3 class="practice-challenge-title" style="margin:4px 0 8px">${escapeHtml(concept.name)}</h3>
      <p class="practice-concept-hub-desc">${escapeHtml(concept.description || '')}</p>
      <div class="practice-concept-mastery">
        <div class="practice-concept-mastery-bar"><div class="practice-concept-mastery-fill" style="width:${concept.mastery}%"></div></div>
        <span class="practice-concept-mastery-label">${concept.mastery}% dominado</span>
      </div>
      <div class="practice-concept-hub-theory practice-md" id="practiceConceptTheory">
        <div class="practice-loading-inline"><span class="arp-spinner"></span> Preparando la teoría…</div>
      </div>
      <div class="practice-main-actions">
        <button class="btn-ghost" id="practiceConceptViewLessonsBtn">📚 Ver lecciones del curso</button>
        <button class="btn-primary" id="practiceConceptGenerateBtn">✦ Generar reto de este concepto</button>
      </div>
      <div class="practice-concept-explain">
        <h4 class="practice-concept-explain-title">🗣️ Explícamelo (técnica Feynman)</h4>
        <p class="practice-concept-explain-hint">Explica este concepto con tus propias palabras, como si se lo enseñaras a alguien más — si tu explicación queda superficial, te repregunto antes de dar veredicto.</p>
        <div id="practiceConceptExplainBody"></div>
      </div>
    </div>`;

  $('practiceConceptViewLessonsBtn').addEventListener('click', () => {
    window.switchSpace?.('courses');
    if (typeof setActiveCourse === 'function') setActiveCourse(st.conceptCourse);
  });
  $('practiceConceptGenerateBtn').addEventListener('click', _startPracticeGeneration);
  _mountConceptExplain(st, concept);

  const theoryEl = $('practiceConceptTheory');
  const conceptIdAtRequest = concept.id;
  try {
    const qs = new URLSearchParams();
    if (st.provider) qs.set('provider', st.provider);
    if (st.model) qs.set('model', st.model);
    const res = await fetch(`/api/courses/${st.conceptCourse}/concepts/${concept.id}/theory?${qs.toString()}`);
    const data = await res.json();
    if (_practiceState !== st || st.conceptId !== conceptIdAtRequest) return; // moved on while this was in flight
    if (data.error) { theoryEl.innerHTML = `<div class="quiz-error">${escapeHtml(data.error)}</div>`; return; }
    theoryEl.innerHTML = data.theory_html || escapeHtml(data.theory || '');
  } catch (err) {
    if (_practiceState !== st || st.conceptId !== conceptIdAtRequest) return;
    theoryEl.innerHTML = `<div class="quiz-error">Error de red: ${escapeHtml(err.message)}</div>`;
  }
}

// Feynman "explícamelo": a third evaluation modality alongside quiz/práctica.
// Not a single "write something, get judged" pass — a short conversation:
// if an explanation reads shallow, the tutor asks ONE targeted follow-up
// question before giving a verdict, up to _explainMaxRounds student turns
// (the backend enforces the cap either way). Judged with the same
// correctness/depth/clarity dimension scoring as check-text, but on a
// free-form explanation with no rubric — only the concept's name is given,
// so parroting the theory above doesn't score well by itself.
function _mountConceptExplain(st, concept) {
  if (!st.explain || st.explain.conceptId !== concept.id) {
    st.explain = { conceptId: concept.id, turns: [], done: false, correct: false, scores: null, feedback: '', feedbackHtml: '', maxRounds: 3 };
  }
  _renderConceptExplainBody(st, concept);
}

function _renderConceptExplainBody(st, concept) {
  const container = $('practiceConceptExplainBody');
  if (!container) return;
  const ex = st.explain;

  const threadHtml = ex.turns.map(t => t.role === 'student'
    ? `<div class="practice-explain-msg practice-explain-msg--student">${escapeHtml(t.text)}</div>`
    : `<div class="practice-explain-msg practice-explain-msg--tutor">${t.html || escapeHtml(t.text)}</div>`
  ).join('');

  if (ex.done) {
    const axisLabels = { correctness: 'Corrección', depth: 'Profundidad', clarity: 'Claridad' };
    const scoresHtml = (ex.scores && Object.keys(ex.scores).length)
      ? `<div class="practice-quality-scores">${Object.entries(ex.scores).map(([axis, val]) => `
          <div class="practice-quality-row">
            <span class="practice-quality-label">${escapeHtml(axisLabels[axis] || axis)}</span>
            <div class="practice-quality-bar"><div class="practice-quality-fill" style="width:${val}%"></div></div>
            <span class="practice-quality-val">${val}%</span>
          </div>`).join('')}</div>`
      : '';
    container.innerHTML = `
      <div class="practice-explain-thread">${threadHtml}</div>
      <div class="practice-feedback practice-md ${ex.correct ? 'practice-feedback--ok' : 'practice-feedback--bad'}">
        ${ex.feedbackHtml || escapeHtml(ex.feedback || '')}
      </div>
      ${scoresHtml}
      <div class="practice-main-actions">
        <button class="btn-ghost" id="practiceConceptExplainResetBtn">↻ Intentar de nuevo</button>
      </div>`;
    $('practiceConceptExplainResetBtn').addEventListener('click', () => {
      st.explain = { conceptId: concept.id, turns: [], done: false, correct: false, scores: null, feedback: '', feedbackHtml: '', maxRounds: ex.maxRounds };
      _renderConceptExplainBody(st, concept);
    });
    return;
  }

  const studentTurnCount = ex.turns.filter(t => t.role === 'student').length;
  const roundLabel = studentTurnCount > 0
    ? `<div class="practice-concept-explain-round">Ronda ${studentTurnCount + 1} de ${ex.maxRounds}</div>`
    : '';
  container.innerHTML = `
    <div class="practice-explain-thread">${threadHtml}</div>
    ${roundLabel}
    <textarea id="practiceConceptExplainInput" class="practice-text-input practice-concept-explain-textarea" rows="4"
      placeholder="${studentTurnCount ? 'Escribe tu respuesta…' : 'Escribe tu explicación aquí…'}"></textarea>
    <div class="practice-main-actions">
      <button class="btn-primary" id="practiceConceptExplainBtn">${studentTurnCount ? 'Responder' : 'Evaluar mi explicación'}</button>
    </div>`;
  $('practiceConceptExplainBtn').addEventListener('click', () => _submitConceptExplanation(st, concept));
}

async function _submitConceptExplanation(st, concept) {
  const input = $('practiceConceptExplainInput');
  const text = (input.value || '').trim();
  if (!text) { showToast('Escribe tu explicación primero', 'error'); return; }

  const ex = st.explain;
  ex.turns.push({ role: 'student', text });

  const btn = $('practiceConceptExplainBtn');
  btn.disabled = true;
  btn.textContent = 'Evaluando…';

  try {
    const res = await fetch(`/api/courses/${st.conceptCourse}/concepts/${concept.id}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: ex.turns.map(t => ({ role: t.role, text: t.text })),
        provider: st.provider, model: st.model,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(data.error || 'No se pudo evaluar la explicación', 'error');
      ex.turns.pop();
      return;
    }
    if (data.max_rounds) ex.maxRounds = data.max_rounds;

    if (!data.done) {
      ex.turns.push({ role: 'tutor', text: data.follow_up, html: data.follow_up_html });
      return;
    }

    ex.done = true;
    ex.correct = !!data.correct;
    ex.scores = data.scores || null;
    ex.feedback = data.feedback || '';
    ex.feedbackHtml = data.feedback_html || '';

    if (concept.id) {
      fetch('/api/concepts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: concept.id, course: st.conceptCourse, correct: ex.correct, modality: 'explain',
          ...(typeof data.quality === 'number' ? { quality: data.quality } : {}),
        }),
      }).then(() => _getDomainData(true)).then(domainData => {
        if (_practiceState !== st) return;
        const updated = domainData.courses[st.conceptCourse]?.concepts.find(c => c.id === concept.id);
        if (!updated) return;
        const fill = document.querySelector('.practice-concept-mastery-fill');
        const label = document.querySelector('.practice-concept-mastery-label');
        if (fill) fill.style.width = `${updated.mastery}%`;
        if (label) label.textContent = `${updated.mastery}% dominado`;
      }).catch(() => {});
    }
  } catch (err) {
    showToast('Error de red: ' + err.message, 'error');
    ex.turns.pop();
  } finally {
    _renderConceptExplainBody(st, concept);
  }
}

// ── Main area — dispatches on the current state to whatever should occupy
// the working area: the idle placeholder, a loading spinner, the active
// reto, its results, or the historial list. ──────────────────────────────
function _renderPracticeMain() {
  const st = _practiceState;
  if (!st) return;
  if (st.viewingHistory) { _renderPracticeHistoryMain(); return; }
  if (st.screen === 'empty') {
    if (st.mode === 'concept' && st.conceptId) { _renderConceptHubMain(); return; }
    _renderPracticeEmptyMain();
    return;
  }
  if (st.screen === 'loading') { _renderPracticeLoadingMain(); return; }
  if (st.screen === 'challenge') { _renderPracticeChallenge(); return; }
  if (st.screen === 'results') { _renderPracticeResultsScreen(st); return; }
}

function _renderPracticeEmptyMain() {
  $('practiceMain').innerHTML = `
    <div class="practice-empty-main">
      <span class="practice-empty-main-icon">🎯</span>
      <p class="practice-empty-main-title">Configura tu reto</p>
      <p class="practice-empty-main-sub">Elegí un modo, la dificultad y el modelo que quieras que lo genere — después tocá "Generar reto".</p>
    </div>`;
}

function _renderPracticeLoadingMain() {
  $('practiceMain').innerHTML = `
    <div class="quiz-loading">
      <span class="arp-spinner"></span>
      <span>Generando un reto realista…</span>
    </div>`;
}

// Frontend-side safety net: even with the backend now returning clean,
// human messages (see _call_ai's HTTPError handling), never let an
// unexpectedly long string blow up this view the way a raw provider error
// dump once did.
function _renderPracticeError(msg) {
  const safeMsg = (msg || '').length > 400 ? msg.slice(0, 400) + '…' : msg;
  $('practiceMain').innerHTML = `
    <div class="quiz-error">${escapeHtml(safeMsg)}</div>
    <button class="btn-ghost" id="practiceRetryErrBtn" style="margin-top:14px">← Volver</button>`;
  $('practiceRetryErrBtn').addEventListener('click', () => { _practiceState.screen = 'empty'; _renderPracticeMain(); });
}

function _renderPracticeChallenge() {
  const st = _practiceState;
  const ch = st.challenge;
  const idx = st.current;
  const step = ch.steps[idx];
  const stepState = st.stepResults[idx];

  const pills = ch.steps.map((s, i) => {
    const res = st.stepResults[i];
    let cls = 'practice-pill';
    if (i === idx) cls += ' current';
    else if (res.passed) cls += ' passed';
    else if (res.revealed) cls += ' revealed';
    return `<span class="${cls}">${i + 1}</span>`;
  }).join('');

  let stepBodyHtml;
  if (step.type === 'python') {
    stepBodyHtml = `
      <textarea id="practiceCodeInput" class="practice-code-input" spellcheck="false"
                placeholder="Escribe tu código aquí…">${escapeHtml(stepState.userCode ?? step.starter_code ?? '')}</textarea>
      <div class="practice-step-actions"><button class="btn-primary" id="practiceCheckBtn">▶ Ejecutar y verificar</button></div>
      <div class="code-exec-output" id="practiceOutput" style="${stepState.lastOutput !== undefined ? '' : 'display:none'}">
        <pre class="code-exec-stdout" id="practiceStdout"></pre>
        <pre class="code-exec-stderr hidden" id="practiceStderr"></pre>
      </div>`;
  } else if (step.type === 'css') {
    // Verified live in the browser (a sandboxed, script-less iframe reading
    // getComputedStyle) — no server round-trip, and the student SEES the
    // result render as they type, not just a pass/fail after the fact.
    stepBodyHtml = `
      <div class="practice-css-lab">
        <div class="practice-css-editor-col">
          <textarea id="practiceCssInput" class="practice-code-input" spellcheck="false"
                    placeholder="Escribe tu CSS aquí…">${escapeHtml(stepState.userCss ?? step.starter_css ?? '')}</textarea>
          <div class="practice-step-actions"><button class="btn-primary" id="practiceCheckBtn">▶ Ejecutar y verificar</button></div>
        </div>
        <div class="practice-css-preview-col">
          <div class="practice-css-preview-label">Vista previa en vivo</div>
          <iframe id="practiceCssPreview" class="practice-css-preview" sandbox="allow-same-origin" title="Vista previa CSS"></iframe>
        </div>
      </div>
      <div class="code-exec-output" id="practiceOutput" style="${stepState.cssResults ? '' : 'display:none'}">
        <div id="practiceCssResults"></div>
      </div>`;
  } else {
    stepBodyHtml = `
      <textarea id="practiceTextInput" class="practice-text-answer" spellcheck="false"
                placeholder="Escribe tu comando o respuesta…">${escapeHtml(stepState.userAnswer ?? '')}</textarea>
      <div class="practice-step-actions"><button class="btn-primary" id="practiceCheckBtn">✓ Verificar</button></div>
      <div class="practice-feedback hidden" id="practiceFeedback"></div>
      <div class="practice-quality-scores hidden" id="practiceQualityScores"></div>`;
  }

  const hintsShown = stepState.hintsShown || 0;
  // *_html fields are pre-rendered server-side by render_markdown() (same
  // pipeline the "Ask AI" panel uses) so a scenario/instruction/hint reads
  // like real formatted text instead of a raw text dump; fall back to
  // escaped plain text for older cached challenges or test fixtures that
  // predate this field.
  const hintsHtml = step.hints.slice(0, hintsShown)
    .map((h, i) => `<div class="practice-hint practice-md">💡 Pista ${i + 1}: ${(step.hints_html && step.hints_html[i]) || escapeHtml(h)}</div>`).join('');

  $('practiceMain').innerHTML = `
    <h3 class="practice-challenge-title">${escapeHtml(ch.title)}</h3>
    <div class="practice-pills">${pills}</div>
    <div class="practice-scenario practice-md">${ch.scenario_html || escapeHtml(ch.scenario)}</div>
    <div class="practice-step">
      <div class="practice-step-instruction practice-md">${step.instruction_html || escapeHtml(step.instruction)}</div>
      ${stepBodyHtml}
      ${hintsHtml}
      ${stepState.explanationHtml ? `<div class="practice-explain practice-md"><strong>🤔 Explicación:</strong>${stepState.explanationHtml}</div>` : ''}
      ${stepState.revealed ? `<div class="practice-solution"><strong>Solución:</strong><pre>${escapeHtml(step.solution)}</pre></div>` : ''}
    </div>
    <div class="practice-main-actions" id="practiceMainActions"></div>`;

  if (step.type === 'python' && stepState.lastOutput !== undefined) {
    $('practiceStdout').textContent = stepState.lastOutput || '';
    const stderrEl = $('practiceStderr');
    stderrEl.textContent = stepState.lastStderr || '';
    stderrEl.classList.toggle('hidden', !stepState.lastStderr);
  }
  if (step.type === 'text' && stepState.lastFeedback) {
    const fb = $('practiceFeedback');
    // Server-rendered markdown (same render_markdown() pipeline as the
    // scenario/instruction) so code/comandos citados en el feedback salen
    // como bloque de código real, no como texto plano corrido.
    fb.innerHTML = stepState.lastFeedbackHtml || escapeHtml(stepState.lastFeedback);
    fb.classList.add('practice-md');
    fb.classList.remove('hidden');
    fb.classList.toggle('practice-feedback--ok', stepState.passed);
    fb.classList.toggle('practice-feedback--bad', !stepState.passed);
  }
  if (step.type === 'text' && stepState.scores && Object.keys(stepState.scores).length) {
    // Not just pass/fail — shows WHAT to improve, not only whether you
    // cleared the bar. Also what quietly drives the mastery number now:
    // a technically-correct-but-shallow answer grows "dominio" slower than
    // a strong one (see review_concept's quality-weighted interval growth).
    const qsEl = $('practiceQualityScores');
    const axisLabels = { correctness: 'Corrección', depth: 'Profundidad', clarity: 'Claridad' };
    qsEl.innerHTML = Object.entries(stepState.scores).map(([axis, val]) => `
      <div class="practice-quality-row">
        <span class="practice-quality-label">${escapeHtml(axisLabels[axis] || axis)}</span>
        <div class="practice-quality-bar"><div class="practice-quality-fill" style="width:${val}%"></div></div>
        <span class="practice-quality-val">${val}%</span>
      </div>`).join('');
    qsEl.classList.remove('hidden');
  }
  if (step.type === 'css') {
    const cssInput = $('practiceCssInput');
    const updatePreview = () => _updateCssPreview(step, cssInput.value);
    updatePreview();
    cssInput.addEventListener('input', updatePreview);
    if (stepState.cssResults) _renderCssAssertResults(stepState.cssResults);
  }

  $('practiceCheckBtn').addEventListener('click', _checkPracticeStep);

  const actions = $('practiceMainActions');

  // "Repasar la lección" — only for retos generados desde una lección real
  // (modos "Repasar lección"/"Reto sorpresa" traen st.entryId; "Tema libre"
  // no, porque no hay una lección puntual a la que mandar a nadie).
  // Disponible desde el inicio del paso, no solo cuando ya te trabaste —
  // es material de referencia, no una rendición.
  if (st.entryId) {
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-ghost';
    reviewBtn.textContent = '📖 Repasar la lección';
    reviewBtn.title = 'Tu progreso en este reto queda guardado — volvés a Práctica y seguís donde estabas';
    reviewBtn.addEventListener('click', () => {
      window.switchSpace?.('courses');
      if (st.course && typeof setActiveCourse === 'function') setActiveCourse(st.course);
      if (typeof openCourseLesson === 'function') openCourseLesson(st.entryId);
    });
    actions.appendChild(reviewBtn);
  }

  if (hintsShown < step.hints.length) {
    const hintBtn = document.createElement('button');
    hintBtn.className = 'btn-ghost';
    hintBtn.textContent = `💡 Pista (${hintsShown}/${step.hints.length})`;
    hintBtn.addEventListener('click', () => { stepState.hintsShown = hintsShown + 1; _savePracticeProgress(st); _renderPracticeChallenge(); });
    actions.appendChild(hintBtn);
  } else if (!stepState.revealed && !stepState.passed) {
    // Después de agotar las 3 pistas y seguir trabado, la solución directa
    // no es la única salida — "Explícamelo" enseña el concepto general
    // primero (sin regalar la respuesta puntual); "Ver solución" sigue
    // ahí para quien solo quiere avanzar.
    if (!stepState.explanationHtml) {
      const explainBtn = document.createElement('button');
      explainBtn.className = 'btn-ghost';
      explainBtn.textContent = '🤔 Explícamelo';
      explainBtn.addEventListener('click', () => _explainPracticeStep(st, stepState, explainBtn));
      actions.appendChild(explainBtn);
    }
    const solBtn = document.createElement('button');
    solBtn.className = 'btn-ghost';
    solBtn.textContent = '🔓 Ver solución';
    solBtn.addEventListener('click', () => {
      if (confirm('Ver la solución marca este paso como no resuelto. ¿Continuar?')) {
        stepState.revealed = true;
        _savePracticeProgress(st);
        _renderPracticeChallenge();
      }
    });
    actions.appendChild(solBtn);
  }

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  actions.appendChild(spacer);

  if (stepState.passed || stepState.revealed) {
    const isLast = idx === ch.steps.length - 1;
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary';
    nextBtn.textContent = isLast ? 'Ver resultados →' : 'Siguiente paso →';
    nextBtn.addEventListener('click', () => {
      if (isLast) { _finishPractice(); } else { st.current++; _savePracticeProgress(st); _renderPracticeChallenge(); }
    });
    actions.appendChild(nextBtn);
  }

  const newBtn = document.createElement('button');
  newBtn.className = 'btn-ghost';
  newBtn.textContent = '← Nuevo reto';
  newBtn.title = 'Tu progreso en este reto ya está guardado — podés retomarlo desde Historial';
  newBtn.addEventListener('click', () => { st.screen = 'empty'; st.challenge = null; _renderPracticeMain(); });
  actions.appendChild(newBtn);
}

// ── CSS steps — verified live in the browser, not by the AI's opinion or a
// server round-trip: a sandboxed, script-less iframe (sandbox="allow-same-
// origin" only, no "allow-scripts") renders the student's CSS against the
// step's fixed html_snippet, and each assertion reads the real computed
// style off the actual element. Safe because nothing in that iframe can
// ever execute — CSS text has no code-execution surface on its own.
function _updateCssPreview(step, css) {
  const iframe = $('practiceCssPreview');
  if (!iframe) return;
  iframe.srcdoc = `<!doctype html><html><head><style>${css}</style></head><body>${step.html_snippet}</body></html>`;
}

function _runCssAsserts(step, css) {
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
    iframe.addEventListener('load', () => {
      const results = step.css_asserts.map(a => {
        let actual = '';
        let ok = false;
        try {
          const doc = iframe.contentDocument;
          const el = doc.querySelector(a.selector);
          if (el) {
            actual = doc.defaultView.getComputedStyle(el)[a.property] || '';
            ok = actual.trim().toLowerCase() === a.expected.trim().toLowerCase();
          }
        } catch (_) { /* malformed selector from the AI — counts as failed, not a crash */ }
        return { selector: a.selector, property: a.property, expected: a.expected, actual, ok };
      });
      iframe.remove();
      resolve(results);
    });
    iframe.srcdoc = `<!doctype html><html><head><style>${css}</style></head><body>${step.html_snippet}</body></html>`;
    document.body.appendChild(iframe);
  });
}

function _renderCssAssertResults(results) {
  const wrap = $('practiceCssResults');
  if (!wrap) return;
  wrap.innerHTML = results.map(r => `
    <div class="practice-css-assert ${r.ok ? 'ok' : 'bad'}">
      <span class="practice-css-assert-icon">${r.ok ? '✓' : '✗'}</span>
      <code>${escapeHtml(r.selector)} { ${escapeHtml(r.property)}: ${escapeHtml(r.expected)}; }</code>
      ${!r.ok ? `<span class="practice-css-assert-actual">obtuvo: ${escapeHtml(r.actual || '(sin valor — ¿existe ese selector?)')}</span>` : ''}
    </div>`).join('');
}

async function _checkPracticeStep() {
  const st = _practiceState;
  const step = st.challenge.steps[st.current];
  const stepState = st.stepResults[st.current];
  const btn = $('practiceCheckBtn');
  btn.disabled = true;
  btn.textContent = 'Verificando…';

  try {
    if (step.type === 'python') {
      const code = $('practiceCodeInput').value;
      stepState.userCode = code;
      const res = await fetch('/api/practice/check-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, asserts: step.asserts }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      stepState.passed = !!data.passed;
      stepState.lastOutput = data.output || '';
      stepState.lastStderr = data.stderr || '';
    } else if (step.type === 'css') {
      const css = $('practiceCssInput').value;
      stepState.userCss = css;
      const results = await _runCssAsserts(step, css);
      stepState.cssResults = results;
      stepState.passed = results.length > 0 && results.every(r => r.ok);
    } else {
      const answer = $('practiceTextInput').value;
      stepState.userAnswer = answer;
      const res = await fetch('/api/practice/check-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Reuses the same model this challenge was generated with (saved on
        // st.challenge server-side in the generate response) rather than
        // whatever's currently picked in the rail's selector right now — the
        // two can differ if you tweak the rail between steps.
        body: JSON.stringify({ instruction: step.instruction, rubric: step.rubric, answer, provider: st.challenge.provider, model: st.challenge.model }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      stepState.passed = !!data.passed;
      stepState.lastFeedback = data.feedback || '';
      stepState.lastFeedbackHtml = data.feedback_html || '';
      stepState.scores = data.scores || null;
      stepState.quality = (typeof data.quality === 'number') ? data.quality : null;
    }

    if (step.concept_id) {
      fetch('/api/concepts/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // quality (0-100, only present for AI-judged "text" steps) tells the
        // mastery calc how deep the answer actually was, not just pass/fail —
        // a shallow-but-correct answer grows dominio slower than a strong one.
        body: JSON.stringify({
          concept_id: step.concept_id, course: st.course, correct: stepState.passed, modality: 'practice',
          ...(stepState.quality != null ? { quality: stepState.quality } : {}),
        }),
      }).catch(() => {});
    }
  } catch (err) {
    showToast('Error de red: ' + err.message, 'error');
  } finally {
    _savePracticeProgress(st);
    _renderPracticeChallenge();
  }
}

async function _explainPracticeStep(st, stepState, btn) {
  btn.disabled = true;
  btn.textContent = 'Pensando…';
  try {
    const step = st.challenge.steps[st.current];
    const res = await fetch('/api/practice/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Mismo modelo con el que se generó el reto — igual que check-text,
      // no lo que esté elegido ahora mismo en el rail.
      body: JSON.stringify({ instruction: step.instruction, rubric: step.rubric || '', provider: st.challenge.provider, model: st.challenge.model }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'No se pudo generar la explicación', 'error'); btn.disabled = false; btn.textContent = '🤔 Explícamelo'; return; }
    stepState.explanation = data.explanation || '';
    stepState.explanationHtml = data.explanation_html || '';
    _savePracticeProgress(st);
    _renderPracticeChallenge();
  } catch (err) {
    showToast('Error de red: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '🤔 Explícamelo';
  }
}

// Fire-and-forget autosave — every step-solving action (check a step, use a
// hint, reveal a solution) calls this so a saved challenge always resumes
// exactly where it was left, not just where it was last "finished".
function _savePracticeProgress(st) {
  if (!st || !st.challenge || !st.challenge.id) return;
  fetch(`/api/practice/${st.challenge.id}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_step: st.current, step_results: st.stepResults }),
  }).catch(() => {});
}

async function _startPracticeGeneration() {
  const st = _practiceState;
  if (st.viewingHistory) { st.viewingHistory = false; _renderPracticeRail(); }
  let topic = '', context = '', entryId = '', course = '', forceConceptId = '', weakestPick = null;

  if (st.mode === 'topic') {
    topic = (st.topic || '').trim();
    if (!topic) { showToast('Escribe un tema para el reto', 'error'); return; }
  } else if (st.mode === 'review') {
    if (!st.entryId) { showToast('Elige una lección para repasar', 'error'); return; }
    const res = await fetch(`/api/entry/${st.entryId}`);
    if (!res.ok) { showToast('No se pudo cargar la lección', 'error'); return; }
    const data = await res.json();
    topic = data.meta.title;
    context = (data.markdown || '').slice(0, 6000);
    entryId = st.entryId;
    course = data.meta.type === 'course' ? (data.meta.course || '') : '';
  } else if (st.mode === 'concept') {
    // "Por tema" (centro de mando): the concept picked in the cascading
    // Curso ▸ Categoría ▸ Concepto selector, forced by concept_id like
    // "Reto sorpresa" already does for the weakest one — same mechanism,
    // just user-chosen instead of auto-picked.
    if (!st.conceptId) { showToast('Elegí un concepto para practicar', 'error'); return; }
    const domainData = await _getDomainData();
    const courseInfo = domainData.courses[st.conceptCourse];
    const concept = courseInfo?.concepts.find(c => c.id === st.conceptId);
    topic = concept ? concept.name : (st.conceptName || 'concepto');
    context = concept ? concept.description : '';
    course = st.conceptCourse;
    forceConceptId = st.conceptId;
  } else {
    // "Reto sorpresa": target the real weakest high-leverage concept instead of a
    // random lesson, when domain data exists — falls back to random otherwise.
    const tree = await _getPracticeTree();
    const entries = _flattenPracticeEntries(tree);
    if (!entries.length) { showToast('Todavía no tienes lecciones de cursos guardadas', 'error'); return; }

    let weakest = null;
    try { weakest = (await fetch('/api/domain/weakest').then(r => r.json())).weakest; } catch {}

    const courseEntries = weakest ? entries.filter(e => e.course === weakest.course) : [];
    const pick = courseEntries.length
      ? courseEntries[Math.floor(Math.random() * courseEntries.length)]
      : entries[Math.floor(Math.random() * entries.length)];

    const res = await fetch(`/api/entry/${pick.id}`);
    if (!res.ok) { showToast('No se pudo cargar la lección', 'error'); return; }
    const data = await res.json();
    entryId = pick.id;
    context = (data.markdown || '').slice(0, 6000);
    course = data.meta.type === 'course' ? (data.meta.course || '') : '';

    if (weakest && courseEntries.length) {
      topic = weakest.concept_name;
      forceConceptId = weakest.concept_id;
      weakestPick = weakest;
    } else {
      topic = data.meta.title;
    }
  }

  st.topic = topic;
  st.entryId = entryId;
  st.contextText = context;
  st.course = course;
  st.screen = 'loading';
  _renderPracticeMain();

  try {
    const res = await fetch('/api/practice/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: st.mode, topic, context, course, entry_id: entryId, difficulty: st.difficulty, concept_id: forceConceptId, provider: st.provider, model: st.model }),
    });
    const data = await res.json();
    if (_practiceState !== st) return;
    if (!res.ok || data.error) {
      st.screen = 'empty';
      _renderPracticeError(data.error || 'No se pudo generar el reto.');
      return;
    }
    st.challenge = data;
    st.current = 0;
    st.stepResults = data.steps.map(() => ({ passed: false, revealed: false, hintsShown: 0 }));
    st.screen = 'challenge';
    _renderPracticeChallenge();
    if (weakestPick) {
      showToast(`Reto sobre tu punto más débil: "${weakestPick.concept_name}" (${weakestPick.course_label})`, 'success');
    }
  } catch (err) {
    if (_practiceState !== st) return;
    st.screen = 'empty';
    _renderPracticeError('Error de red: ' + err.message);
  }
}

function _finishPractice() {
  const st = _practiceState;
  const ch = st.challenge;
  if (ch.id) {
    fetch(`/api/practice/${ch.id}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', step_results: st.stepResults }),
    }).catch(() => {});
  }
  const passed = st.stepResults.filter(r => r.passed).length;
  const entryId = st.entryId || `practice-${_practiceSlug(st.topic)}`;
  fetch('/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry_id: entryId, type: 'practice', mode: st.mode, difficulty: st.difficulty,
      topic: st.topic, score: passed, total: ch.steps.length,
    }),
  }).catch(() => {});
  st.screen = 'results';
  _renderPracticeResultsScreen(st);
}

// Shared by both a just-finished challenge (_finishPractice, which POSTs the
// finish/attempt records first) and resuming an already-completed/abandoned
// one from the Historial list (which just re-renders what was saved,
// nothing to re-POST).
function _renderPracticeResultsScreen(st) {
  const ch = st.challenge;
  const total = ch.steps.length;
  const passed = st.stepResults.filter(r => r.passed).length;
  const pct = Math.round((passed / total) * 100);
  const grade = pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'low';
  const gradeMsg = pct >= 80 ? '¡Excelente! Dominas bien este reto.'
                 : pct >= 50 ? 'Vas bien, pero repasa los pasos que fallaste o revelaste.'
                 : 'Conviene practicar más este tema antes de seguir.';

  $('practiceMain').innerHTML = `
    <h3 class="practice-challenge-title">${escapeHtml(ch.title)} — Resultados</h3>
    <div class="quiz-results">
      <div class="quiz-score quiz-score--${grade}">
        <span class="quiz-score-pct">${pct}%</span>
        <span class="quiz-score-frac">${passed}/${total} pasos resueltos</span>
      </div>
      <div class="quiz-score-msg">${gradeMsg}</div>
      <div class="quiz-review" id="practiceReview"></div>
    </div>
    <div class="practice-main-actions" id="practiceMainActions"></div>`;

  const review = $('practiceReview');
  ch.steps.forEach((step, i) => {
    const ok = st.stepResults[i].passed;
    const row = document.createElement('div');
    row.className = 'quiz-review-item' + (ok ? ' ok' : ' bad');
    row.innerHTML = `
      <div class="quiz-review-head">
        <span class="quiz-review-icon">${ok ? '✓' : '✕'}</span>
        <span class="quiz-review-q">${i + 1}. ${escapeHtml(step.instruction)}</span>
      </div>
      <div class="quiz-review-detail">
        ${!ok ? `<div class="quiz-review-wrong">Solución de referencia:</div><pre class="practice-solution-pre">${escapeHtml(step.solution)}</pre>` : ''}
      </div>`;
    review.appendChild(row);
  });

  const actions = $('practiceMainActions');

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-ghost';
  retryBtn.textContent = '↻ Nuevo reto';
  retryBtn.addEventListener('click', () => { st.screen = 'empty'; st.challenge = null; _renderPracticeMain(); });
  actions.appendChild(retryBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-ghost';
  saveBtn.textContent = '💾 Guardar en Conocimiento';
  saveBtn.addEventListener('click', () => _savePracticeToKnowledge(st, saveBtn));
  actions.appendChild(saveBtn);
}

function _practiceKnowledgeTopic(st) {
  const label = st.course && _practiceTreeCache?.[st.course]?.label;
  return label || 'Temas libres';
}

function _buildPracticeMarkdown(st) {
  const ch = st.challenge;
  const lines = [`**Escenario:** ${ch.scenario}`, ''];
  ch.steps.forEach((step, i) => {
    const r = st.stepResults[i];
    const lang = step.type === 'python' ? 'python' : step.type === 'css' ? 'css' : '';
    lines.push(`## Paso ${i + 1}: ${step.instruction}`, '');
    const userAnswer = step.type === 'python' ? (r.userCode || '') : step.type === 'css' ? (r.userCss || '') : (r.userAnswer || '');
    if (userAnswer) {
      lines.push('**Tu respuesta:**', '```' + lang, userAnswer, '```', '');
    }
    lines.push(r.passed ? '✅ Resuelto correctamente' : (r.revealed ? '🔓 Solución revelada' : '❌ No resuelto'), '');
    lines.push('**Solución de referencia:**', '```' + lang, step.solution, '```', '');
  });
  return lines.join('\n');
}

async function _savePracticeToKnowledge(st, btn) {
  const ch = st.challenge;
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const res = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ch.title,
        entry_type: 'knowledge',
        category: 'Práctica',
        topic: _practiceKnowledgeTopic(st),
        raw_text: _buildPracticeMarkdown(st),
        already_markdown: true,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(data.error || 'No se pudo guardar el reto', 'error');
      btn.disabled = false;
      btn.textContent = '💾 Guardar en Conocimiento';
      return;
    }
    btn.textContent = '✓ Guardado';
    showToast('Reto guardado en Conocimiento', 'success');
  } catch (err) {
    showToast('Error de red: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '💾 Guardar en Conocimiento';
  }
}

// ── Historial — every generated challenge is saved server-side the moment
// it's generated (Fase 2), whether finished, abandoned, or just left
// mid-way; this lists them so nothing done here is ever silently lost, and
// an in-progress one can be picked back up exactly where it was left.
const _PRACTICE_STATUS_LABEL = { in_progress: '● en progreso', completed: '✓ completado', abandoned: '⊘ abandonado' };

async function _renderPracticeHistoryMain() {
  const st = _practiceState;
  if (!st) return;
  $('practiceMain').innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando historial…</div>`;

  let challenges = [];
  try {
    const res = await fetch('/api/practice/history?limit=50');
    const data = await res.json();
    challenges = data.challenges || [];
  } catch { /* keep empty — shows the empty state below */ }
  if (_practiceState !== st || !st.viewingHistory) return;

  if (!challenges.length) {
    $('practiceMain').innerHTML = `<div class="practice-history-empty">Todavía no has generado ningún reto.<br>Los que generes se guardan aquí automáticamente.</div>`;
    return;
  }

  $('practiceMain').innerHTML = `<div class="practice-history-list">${challenges.map(c => `
    <div class="practice-history-item" data-id="${c.id}">
      <div class="practice-history-main">
        <div class="practice-history-title">${escapeHtml(c.title)}</div>
        <div class="practice-history-meta">
          <span class="practice-history-status practice-history-status--${c.status}">${_PRACTICE_STATUS_LABEL[c.status] || c.status}</span>
          <span>${escapeHtml(c.difficulty || '')}</span>
          <span>${Math.min(c.current_step + 1, c.step_count)}/${c.step_count} pasos</span>
          <span>${_relTimeAgo(new Date(c.updated_at).getTime())}</span>
        </div>
      </div>
      <button class="practice-history-del" data-id="${c.id}" title="Eliminar del historial">🗑</button>
    </div>`).join('')}</div>`;

  document.querySelectorAll('.practice-history-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('¿Eliminar este reto del historial? No se puede deshacer.')) return;
      try { await fetch(`/api/practice/${btn.dataset.id}`, { method: 'DELETE' }); } catch { /* best-effort */ }
      if (_practiceState === st && st.viewingHistory) _renderPracticeHistoryMain();
    });
  });
  document.querySelectorAll('.practice-history-item').forEach(item => {
    item.addEventListener('click', () => _resumePracticeFromHistory(item.dataset.id));
  });
}

async function _resumePracticeFromHistory(challengeId) {
  const st = _practiceState;
  if (!st) return;
  $('practiceMain').innerHTML = `<div class="practice-loading-inline"><span class="arp-spinner"></span> Cargando reto…</div>`;

  let data;
  try {
    const res = await fetch(`/api/practice/${challengeId}`);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'No se pudo cargar el reto');
  } catch (err) {
    showToast(err.message, 'error');
    if (_practiceState === st) _renderPracticeHistoryMain();
    return;
  }
  if (_practiceState !== st) return;

  st.challenge = data;
  st.stepResults = (data.step_results && data.step_results.length === data.steps.length)
    ? data.step_results
    : data.steps.map(() => ({ passed: false, revealed: false, hintsShown: 0 }));
  st.current = Math.min(data.current_step || 0, data.steps.length - 1);
  st.topic = data.title;
  st.course = data.course || '';
  st.entryId = data.entry_id || '';
  st.viewingHistory = false;

  if (data.status === 'in_progress') {
    st.screen = 'challenge';
    _renderPracticeChallenge();
  } else {
    st.screen = 'results';
    _renderPracticeResultsScreen(st);
  }
  _renderPracticeRail();
}

// ── Page Peek — Notion-style floating page preview ────────────────────────
// Opened from a database-block row (window._openPagePeek). Runs a fully
// independent BlockEditor instance (see editor-src/src/main.jsx —
// BlockEditor.create() was already proven multi-instance-safe by the modal
// "new entry" editor + the main inline editor coexisting), so the page's
// properties AND body content are genuinely editable without leaving the
// table, not just a read-only preview.
let _peekEntryId = null;
let _peekEditor = null;
let _peekOnClose = null;
let _peekAutoSaveTimer = null;
let _peekPendingMd = null;

window._openPagePeek = async function (id, opts) {
  const overlay = $('pagePeekOverlay');
  if (!overlay || !id) return;

  // Reopening while already open (e.g. clicking a different row) — flush
  // any pending debounced saves for the row being left, THEN tear down,
  // same discipline as _closePagePeek (see the comment there for why).
  if (_peekEntryId) {
    await _flushPeekPendingSaves();
    _teardownPeekEditor();
  }

  _peekEntryId = id;
  _peekOnClose = (opts && opts.onClose) || null;
  window._currentEntryId = id; // so a database block *inside* this peeked page resolves correctly

  overlay.classList.remove('hidden');
  $('pagePeekTitle').value = '';
  $('pagePeekIcon').textContent = '📄';
  $('pagePeekProps').innerHTML = '';

  const res = await fetch(`/api/entry/${id}`);
  if (!res.ok || _peekEntryId !== id) return; // closed or swapped while loading
  const data = await res.json();
  const meta = data.meta || {};

  $('pagePeekTitle').value = meta.title || '';
  $('pagePeekIcon').textContent = meta.icon || '📄';

  if (window.Properties) {
    Properties.render(id, meta.properties || [], $('pagePeekProps'), false);
  }

  _peekEditor = BlockEditor.create({
    container: $('pagePeekEditor'),
    onChange: (md) => _peekScheduleAutoSave(md),
  });
  _peekEditor.load(data.markdown || '');
};

function _closePagePeek() {
  if (!_peekEntryId) return;
  const onClose = _peekOnClose;
  // Flush BEFORE tearing down (both flush fns need _peekEntryId / the
  // captured markdown, which teardown nulls out) — but hide the overlay
  // and reset state right away regardless, so closing still feels instant;
  // only onClose() (the database table's reload(), typically) waits for
  // the flush to actually land, so it doesn't race the debounce and
  // re-render the row with stale data (see _flushPeekPendingSaves).
  const flushed = _flushPeekPendingSaves();
  _teardownPeekEditor();
  $('pagePeekOverlay')?.classList.add('hidden');
  window._currentEntryId = currentEntryId; // restore the outer page's context
  flushed.finally(() => { if (onClose) onClose(); });
}

function _teardownPeekEditor() {
  clearTimeout(_peekAutoSaveTimer);
  _peekAutoSaveTimer = null;
  _peekPendingMd = null;
  if (_peekEditor && _peekEditor.destroy) _peekEditor.destroy();
  _peekEditor = null;
  _peekEntryId = null;
  _peekOnClose = null;
}

function _peekScheduleAutoSave(md) {
  clearTimeout(_peekAutoSaveTimer);
  _peekPendingMd = md;
  const savedId = _peekEntryId;
  _peekAutoSaveTimer = setTimeout(() => {
    _peekAutoSaveTimer = null;
    _peekPendingMd = null;
    if (!_peekEntryId || _peekEntryId !== savedId) return;
    fetch(`/api/entry/${savedId}/content`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: md, already_markdown: true }),
    }).catch(() => {});
  }, 1200);
}

// Runs the peek's own pending body-content autosave (if any) and
// properties.js's pending property save (if any) immediately instead of
// waiting out their debounce windows. Called whenever the peek is about to
// close or swap to a different row — without this, a quick
// edit-then-close could either lose the edit (content autosave) or leave
// the reopening table showing stale data for a beat (properties save
// racing the table's reload()). No-op (resolves immediately) when nothing
// is actually pending.
function _flushPeekAutoSave() {
  if (!_peekAutoSaveTimer || !_peekEntryId) return Promise.resolve();
  clearTimeout(_peekAutoSaveTimer);
  _peekAutoSaveTimer = null;
  const savedId = _peekEntryId;
  const md = _peekPendingMd;
  _peekPendingMd = null;
  if (md == null) return Promise.resolve();
  return fetch(`/api/entry/${savedId}/content`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: md, already_markdown: true }),
  }).catch(() => {});
}

function _flushPeekPendingSaves() {
  const flushes = [_flushPeekAutoSave()];
  if (window.Properties && typeof window.Properties.flush === 'function') flushes.push(window.Properties.flush());
  return Promise.all(flushes);
}

function initPagePeek() {
  const overlay = $('pagePeekOverlay');
  if (!overlay) return;
  $('pagePeekClose')?.addEventListener('click', _closePagePeek);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closePagePeek(); });

  const titleInput = $('pagePeekTitle');
  titleInput?.addEventListener('blur', () => {
    const newTitle = titleInput.value.trim();
    if (!_peekEntryId || !newTitle) return;
    fetch(`/api/entry/${_peekEntryId}/content`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    }).catch(() => {});
  });
  titleInput?.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur(); });

  $('pagePeekOpenFull')?.addEventListener('click', () => {
    const id = _peekEntryId;
    _closePagePeek();
    if (id && window._loadEntryById) window._loadEntryById(id);
  });
}

// ── Post-process entry: code execution, Mermaid, KaTeX ───────────────────────
// Callout color + emoji picker toolbar ───────────────────────────────────────
const CALLOUT_COLORS = [
  { id: 'yellow', hex: '#f5c518' },
  { id: 'blue',   hex: '#3b82f6' },
  { id: 'green',  hex: '#22c55e' },
  { id: 'red',    hex: '#ef4444' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'orange', hex: '#f97316' },
  { id: 'gray',   hex: '#6b7280' },
  { id: 'pink',   hex: '#ec4899' },
];

function _initCalloutToolbars(body) {
  body.querySelectorAll('[data-content-type="callout"]').forEach(contentEl => {
    if (contentEl.querySelector('.callout-toolbar')) return; // already added

    const calloutDiv = contentEl.querySelector('.bn-callout');
    if (!calloutDiv) return;

    const currentColor = calloutDiv.dataset.calloutColor || 'yellow';
    const currentEmoji = calloutDiv.dataset.calloutEmoji || '💡';

    // Build toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'callout-toolbar';

    CALLOUT_COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = 'callout-color-swatch' + (c.id === currentColor ? ' active' : '');
      swatch.style.background = c.hex;
      swatch.title = c.id;
      swatch.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        _setCalloutColor(contentEl, calloutDiv, c.id);
      });
      toolbar.appendChild(swatch);
    });

    // Emoji click → simple inline prompt
    const iconEl = calloutDiv.querySelector('.bn-callout-icon');
    if (iconEl) {
      iconEl.addEventListener('click', e => {
        e.stopPropagation();
        const next = prompt('Emoji para el callout:', currentEmoji);
        if (next && next.trim()) _setCalloutEmoji(calloutDiv, next.trim());
      });
    }

    contentEl.style.position = 'relative';
    contentEl.appendChild(toolbar);
  });
}

function _setCalloutColor(contentEl, calloutDiv, color) {
  const md = _inlineEditor.getMarkdown();
  const oldColor = calloutDiv.dataset.calloutColor || 'yellow';
  const emoji    = calloutDiv.dataset.calloutEmoji  || '💡';
  const re = new RegExp(`:::callout-${oldColor} ${_escRe(emoji)}`, 'g');
  const updated = md.replace(re, `:::callout-${color} ${emoji}`);
  if (updated !== md) _inlineEditor.load(updated);
}

function _setCalloutEmoji(calloutDiv, emoji) {
  const md = _inlineEditor.getMarkdown();
  const color    = calloutDiv.dataset.calloutColor || 'yellow';
  const oldEmoji = calloutDiv.dataset.calloutEmoji  || '💡';
  const re = new RegExp(`:::callout-${color} ${_escRe(oldEmoji)}`, 'g');
  const updated = md.replace(re, `:::callout-${color} ${emoji}`);
  if (updated !== md) _inlineEditor.load(updated);
}

function _escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function postProcessEntry() {
  const body = $('entryBody');
  if (!body) return;

  // Remove previous feature panels (Mermaid/KaTeX bottom panel)
  const old = document.getElementById('_entryFeaturePanels');
  if (old) old.remove();

  // Remove previous inline code execution panels
  const entryView = $('entryView');
  if (entryView) entryView.querySelectorAll('.code-exec-inline').forEach(p => p.remove());
  if (_codeExecResizeHandler) {
    window.removeEventListener('resize', _codeExecResizeHandler);
    _codeExecResizeHandler = null;
  }

  // Callout color-picker toolbar
  _initCalloutToolbars(body);

  const pyBlocks   = [...body.querySelectorAll('[data-content-type="codeBlock"][data-language="python"]')];
  const mmdBlocks  = [...body.querySelectorAll('[data-content-type="codeBlock"][data-language="mermaid"]')];
  const mathBlocks = [...body.querySelectorAll('[data-content-type="codeBlock"][data-language="math"]')];

  if (!pyBlocks.length && !mmdBlocks.length && !mathBlocks.length) return;

  // Mermaid & KaTeX still use the bottom container panel
  if (mmdBlocks.length || mathBlocks.length) {
    const panels = document.createElement('div');
    panels.id = '_entryFeaturePanels';
    body.after(panels);
    if (mmdBlocks.length)  _initMermaid(panels, mmdBlocks);
    if (mathBlocks.length) _initKaTeX(panels, mathBlocks);
  }

  // Python gets Jupyter-style inline panels below each code block
  if (pyBlocks.length) _initCodeExecution(pyBlocks);
}

// Read Python code from BlockNote's markdown (reliable, React-safe).
// Falls back to DOM extraction if editor not available.
function _pyCodeFromMd(idx) {
  try {
    const md = typeof _inlineEditor?.getMarkdown === 'function' ? _inlineEditor.getMarkdown() : '';
    if (!md) return null;
    const blocks = [];
    const re = /```(?:python3?|py|Python[^\n]*)\r?\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(md)) !== null) blocks.push(m[1].replace(/\r?\n$/, ''));
    return blocks[idx] ?? null;
  } catch { return null; }
}

function _codeText(block) {
  if (!block) return '';
  // BlockNote renders code inside a <pre> (from .bn-block-content > div > pre)
  const el = block.querySelector('pre') || block.querySelector('code')
          || block.querySelector('.bn-inline-content') || block;
  return el.textContent || '';
}

function _codePreview(code, maxLines = 3) {
  return code.split('\n').slice(0, maxLines).join('\n');
}

// Position all inline code execution panels below their respective code blocks.
// Always re-queries code blocks fresh (React may have re-rendered them).
function _positionCodePanels(panels) {
  const entryView = $('entryView');
  const entryBody = $('entryBody');
  if (!entryView || !entryBody) return;
  const freshBlocks = [...entryBody.querySelectorAll('[data-content-type="codeBlock"][data-language="python"]')];
  const evRect = entryView.getBoundingClientRect();
  panels.forEach((panel, i) => {
    const block = freshBlocks[i];
    if (!block) return;
    const blockRect = block.getBoundingClientRect();
    // top relative to #entryView content origin (scroll-invariant: scroll cancels out).
    // +8px gap so the run bar doesn't sit flush against the code block above it.
    panel.style.top = (blockRect.top - evRect.top + blockRect.height + 8) + 'px';
  });
}

function _initCodeExecution(blocks) {
  const entryView = $('entryView');
  if (!entryView) return;

  const panels = [];

  blocks.forEach((_, i) => {
    const panel = document.createElement('div');
    panel.className = 'code-exec-inline';

    // Run bar — always visible just below the code block
    const runBar = document.createElement('div');
    runBar.className = 'code-exec-runbar';

    const langTag = document.createElement('span');
    langTag.className = 'code-exec-lang';
    langTag.textContent = 'Python';

    const runBtn = document.createElement('button');
    runBtn.className = 'code-exec-btn';
    runBtn.textContent = '▶ Ejecutar';

    // Lives in the run bar (not inside the scrollable output below) so it stays
    // reachable no matter how far the user has scrolled through long output.
    const closeBtn = document.createElement('button');
    closeBtn.className = 'code-exec-close';
    closeBtn.title = 'Limpiar salida';
    closeBtn.textContent = '✕';

    const actions = document.createElement('div');
    actions.className = 'code-exec-actions';
    actions.append(runBtn, closeBtn);

    runBar.append(langTag, actions);

    // Output zone — always visible (Jupyter/W3Schools-style result box) so the
    // space it needs is never a mystery blank gap before it's ever been run.
    const outputZone = document.createElement('div');
    outputZone.className = 'code-exec-output';

    const stdout = document.createElement('pre');
    stdout.className = 'code-exec-stdout placeholder';
    stdout.textContent = '▷ ejecuta el código para ver el resultado aquí';
    const stderr = document.createElement('pre');
    stderr.className = 'code-exec-stderr hidden';
    const meta = document.createElement('div');
    meta.className = 'code-exec-meta';

    outputZone.append(stdout, stderr, meta);
    panel.append(runBar, outputZone);
    entryView.appendChild(panel);
    panels.push(panel);

    runBtn.addEventListener('click', () => {
      // Read code from editor markdown state (React-safe) or fall back to DOM
      const mdCode = _pyCodeFromMd(i);
      let currentCode = mdCode;
      if (currentCode === null) {
        const body = $('entryBody');
        const liveBlock = body
          ? [...body.querySelectorAll('[data-content-type="codeBlock"][data-language="python"]')][i]
          : null;
        currentCode = liveBlock ? _codeText(liveBlock) : '';
      }

      if (!currentCode || !currentCode.trim()) {
        stdout.classList.remove('placeholder');
        stdout.textContent = '⚠ No se pudo leer el código. Guarda la entrada e intenta de nuevo.';
        meta.textContent = '';
        _positionCodePanels(panels);
        return;
      }

      runBtn.disabled = true;
      runBtn.textContent = '⏳ Ejecutando…';
      stdout.classList.remove('placeholder');
      stdout.textContent = '';
      stderr.classList.add('hidden');
      stderr.textContent = '';
      meta.textContent = '';
      _positionCodePanels(panels);

      fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, language: 'python' }),
      })
        .then(r => r.json())
        .then(data => {
          runBtn.disabled = false;
          runBtn.textContent = '▶ Ejecutar';
          if (data.error) {
            stdout.textContent = '✗ ' + data.error;
            meta.textContent = '';
          } else {
            stdout.textContent = data.output || '(sin salida)';
            if (data.stderr) { stderr.textContent = data.stderr; stderr.classList.remove('hidden'); }
            const rc = data.returncode ?? '?';
            meta.textContent = rc === 0 ? '✓ salió con código 0' : `⚠ código de salida: ${rc}`;
          }
          _positionCodePanels(panels);
        })
        .catch(err => {
          runBtn.disabled = false;
          runBtn.textContent = '▶ Ejecutar';
          stdout.textContent = '✗ Error de red: ' + err.message;
          _positionCodePanels(panels);
        });
    });

    closeBtn.addEventListener('click', () => {
      stdout.classList.add('placeholder');
      stdout.textContent = '▷ ejecuta el código para ver el resultado aquí';
      stderr.textContent = '';
      stderr.classList.add('hidden');
      meta.textContent = '';
      _positionCodePanels(panels);
    });
  });

  // Position after next paint (layout must be settled), then once more after 350ms
  // to catch any late BlockNote re-render
  requestAnimationFrame(() => {
    _positionCodePanels(panels);
    setTimeout(() => _positionCodePanels(panels), 350);
  });

  // Reposition on window resize
  _codeExecResizeHandler = () => _positionCodePanels(panels);
  window.addEventListener('resize', _codeExecResizeHandler);
}

let _mermaidLoaded = false;
function _initMermaid(container, blocks) {
  const section = document.createElement('div');
  section.className = 'feature-panel mermaid-panel';
  section.innerHTML = '<div class="feature-panel-header">⬡ Diagramas Mermaid</div>';
  container.appendChild(section);

  function renderMermaid() {
    blocks.forEach((block, i) => {
      const code = _codeText(block).trim();
      if (!code) return;
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-wrap';
      section.appendChild(wrap);

      window.mermaid.render('mermaid-svg-' + Date.now() + '-' + i, code)
        .then(({ svg }) => { wrap.innerHTML = svg; })
        .catch(err => { wrap.innerHTML = '<div class="mermaid-error">Error: ' + escapeHtml(String(err?.message || err)) + '</div>'; });
    });
  }

  if (_mermaidLoaded) { renderMermaid(); return; }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  script.onload = () => {
    _mermaidLoaded = true;
    window.mermaid.initialize({ startOnLoad: false, theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark' });
    renderMermaid();
  };
  script.onerror = () => {
    section.innerHTML += '<div class="mermaid-error">No se pudo cargar Mermaid.js</div>';
  };
  document.head.appendChild(script);
}

let _katexLoaded = false;
function _initKaTeX(container, blocks) {
  const section = document.createElement('div');
  section.className = 'feature-panel math-panel';
  section.innerHTML = '<div class="feature-panel-header">∑ Fórmulas</div>';
  container.appendChild(section);

  function renderKaTeX() {
    blocks.forEach(block => {
      const code = _codeText(block).trim();
      if (!code) return;
      const wrap = document.createElement('div');
      wrap.className = 'math-wrap';
      section.appendChild(wrap);
      try {
        wrap.innerHTML = window.katex.renderToString(code, { displayMode: true, throwOnError: false });
      } catch (err) {
        wrap.innerHTML = '<div class="math-error">Error KaTeX: ' + escapeHtml(String(err?.message || err)) + '</div>';
      }
    });
  }

  if (_katexLoaded) { renderKaTeX(); return; }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css';
  document.head.appendChild(link);

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js';
  script.onload = () => { _katexLoaded = true; renderKaTeX(); };
  script.onerror = () => {
    section.innerHTML += '<div class="math-error">No se pudo cargar KaTeX</div>';
  };
  document.head.appendChild(script);
}
