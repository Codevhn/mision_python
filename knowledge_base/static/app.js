/* =============================================
   KNOWLEDGE BASE — Frontend Logic
   ============================================= */

const $ = id => document.getElementById(id);

// ---- State ----
let currentEntryId = null;
let currentEntryMeta = null;
let treeState = {}; // { cat: { open: bool, topics: { topic: { open: bool } } } }
let coursesTreeState = {};
let starredMap = {};  // entry_id -> bool
let pinnedMap = {};   // entry_id -> bool
let statusMap = {};   // entry_id -> status string
let _reviewEntries = [];
let _reviewIndex = 0;

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  loadTree();
  loadCategorySuggestions();
  loadCourseSuggestions();
  bindEvents();
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

  // Modal type toggle
  let currentModalMode = "knowledge";
  window._getModalMode = () => currentModalMode;
  window._setModalMode = (mode) => { currentModalMode = mode; };
  document.querySelectorAll(".type-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentModalMode = tab.dataset.mode;
      document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t === tab));
      $("knowledgeFields").classList.toggle("hidden", currentModalMode === "course");
      $("courseFields").classList.toggle("hidden", currentModalMode === "knowledge");
      $("templatePickerGroup").classList.toggle("hidden", currentModalMode === "course");
    });
  });
});

function bindEvents() {
  $("newEntryBtn").addEventListener("click", openNewModal);
  $("welcomeNewBtn").addEventListener("click", openNewModal);
  $("themeToggle").addEventListener("click", toggleTheme);
  $("themeToggleSidebar").addEventListener("click", toggleTheme);
  $("sidebarToggle").addEventListener("click", toggleSidebar);
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
  $("fieldTopic").addEventListener("change", () => {
    const custom = $("fieldTopicCustom");
    if ($("fieldTopic").value === "Otro") {
      custom.classList.remove("hidden");
      custom.focus();
    } else {
      custom.classList.add("hidden");
      custom.value = "";
    }
  });
}

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
  $("themeToggle").textContent = saved === "dark" ? "[light]" : "[dark]";
  $("themeToggleSidebar").textContent = saved === "dark" ? "[light]" : "[dark]";
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kb_theme", next);
  $("themeToggle").textContent = next === "dark" ? "[light]" : "[dark]";
  $("themeToggleSidebar").textContent = next === "dark" ? "[light]" : "[dark]";
}

// ---- SIDEBAR ----
function isMobile() { return window.innerWidth <= 768; }

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
async function loadTree() {
  const [r1, r2] = await Promise.all([fetch("/api/tree"), fetch("/api/courses/tree")]);
  const knowledgeTree = await r1.json();
  const coursesTree   = await r2.json();
  renderTree(knowledgeTree);
  renderCoursesTree(coursesTree);
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
        entryEl.appendChild(document.createTextNode(entry.title));

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

function renderCoursesTree(tree) {
  const nav = $("coursesTree");
  const label = $("coursesSectionLabel");
  if (Object.keys(tree).length === 0) {
    nav.innerHTML = '<div class="tree-empty">No hay cursos aún.</div>';
    label.style.display = "none";
    return;
  }
  label.style.display = "";
  nav.innerHTML = "";
  for (const [courseSlug, courseData] of Object.entries(tree)) {
    if (!coursesTreeState[courseSlug]) coursesTreeState[courseSlug] = { open: true, modules: {} };
    const state = coursesTreeState[courseSlug];

    const catDiv = document.createElement("div");
    catDiv.className = "tree-category";

    const catHeader = document.createElement("div");
    catHeader.className = "tree-cat-header tree-category-header";
    catHeader.innerHTML = `<span class="arrow">${state.open ? "▶" : "▶"}</span> <span>${escapeHtml(courseData.label)}</span>`;
    catDiv.appendChild(catHeader);

    const modulesDiv = document.createElement("div");
    modulesDiv.className = "tree-topics";
    if (!state.open) modulesDiv.style.display = "none";

    catHeader.addEventListener("click", () => {
      state.open = !state.open;
      modulesDiv.style.display = state.open ? "" : "none";
      catDiv.classList.toggle("open", state.open);
    });
    if (state.open) catDiv.classList.add("open");

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
        nameSpan.textContent = entry.title;
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

    catDiv.appendChild(modulesDiv);
    nav.appendChild(catDiv);
  }
}

// ---- ENTRY VIEW ----
async function loadEntry(id) {
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

  const res = await fetch(`/api/entry/${id}`);
  if (!res.ok) { showToast("Error al cargar la entrada", "error"); return; }
  const data = await res.json();

  $("welcome").classList.add("hidden");
  $("entryView").classList.remove("hidden");

  // Close move panel and history panel on new entry load
  $("movePanel").classList.add("hidden");
  $("historyPanel").classList.add("hidden");
  $("historyBtn").classList.remove("active");

  const m = data.meta;
  currentEntryMeta = m;
  const date = m.created_at ? m.created_at.slice(0, 10) : "—";

  // Render entry body first (so we can count words)
  const isNote = (m.category || "").toLowerCase() === "quick notes" || (m.category || "").toLowerCase() === "quick-notes";
  $("entryBody").innerHTML = data.html;
  $("entryBody").classList.toggle("note-entry", isNote);
  $("contentArea").scrollTo(0, 0);

  // Set status button from meta
  const entryStatus = m.status || "pendiente";
  statusMap[id] = entryStatus;
  updateStatusBtn($("statusBtn"), entryStatus);

  // Word count + reading time
  const wordCount = getWordCount($("entryBody"));
  const readMin = Math.max(1, Math.round(wordCount / 200));

  const catLabel   = m.type === "course" ? (m.course_label  || m.course)  : (m.category_label || m.category);
  const topicLabel = m.type === "course" ? (m.module_label  || m.module)  : (m.topic_label    || m.topic);
  $("entryMeta").innerHTML = `
    <span class="meta-seg meta-seg-cat">
      <span class="meta-seg-icon">󰣇</span>
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
      <span class="meta-seg-icon">⌨</span>
      ${wordCount} words
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

  // Build TOC
  buildTOC();

  // Post-process checkboxes with line indices
  postProcessCheckboxes(data.markdown, $("entryBody"));
  attachCheckboxHandlers();

  // Backlinks (async, non-blocking)
  loadBacklinks(id);

  // Wikilinks (async, non-blocking)
  processWikilinks($("entryBody"));
  // PrismJS syntax highlighting
  if (window.Prism) setTimeout(() => Prism.highlightAllUnder($("entryBody")), 200);
  // Render tags bar if entry has tags
  const existingTagBar = $("entryBody").querySelector(".entry-tags-bar");
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
    $("entryBody").prepend(bar);
  }
}

// ---- MODAL ----
function openNewModal() {
  $("modalTitle").textContent = "Nueva entrada";
  $("fieldCategory").value = "";
  $("fieldTopic").value = "";
  $("fieldTopicCustom").value = "";
  $("fieldTopicCustom").classList.add("hidden");
  $("fieldTitle").value = "";
  $("fieldContent").value = "";
  $("previewPane").innerHTML = "";
  switchTab("write");
  $("saveBtn").dataset.mode = "new";
  $("saveBtn").dataset.id = "";
  $("saveBtn").textContent = "Guardar entrada";
  $("modalOverlay").classList.remove("hidden");
  // Reset template chips
  document.querySelectorAll(".template-chip").forEach(c => c.classList.remove("active"));
  // Reset to knowledge mode
  if (window._setModalMode) window._setModalMode("knowledge");
  document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "knowledge"));
  $("knowledgeFields").classList.remove("hidden");
  $("courseFields").classList.add("hidden");
  $("templatePickerGroup").classList.remove("hidden");
  setTimeout(() => $("fieldCategory").focus(), 60);
}

async function openEditModal() {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}`);
  const data = await res.json();
  const m = data.meta;

  $("modalTitle").textContent = "Editar entrada";
  $("fieldTitle").value = m.title;
  $("fieldContent").value = data.markdown;
  switchTab("write");
  $("saveBtn").dataset.mode = "edit";
  $("saveBtn").dataset.id = currentEntryId;
  $("saveBtn").textContent = "Actualizar entrada";
  $("modalOverlay").classList.remove("hidden");
  // Reset template chips on edit
  document.querySelectorAll(".template-chip").forEach(c => c.classList.remove("active"));

  if (m.type === "course") {
    if (window._setModalMode) window._setModalMode("course");
    document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "course"));
    $("knowledgeFields").classList.add("hidden");
    $("courseFields").classList.remove("hidden");
    $("templatePickerGroup").classList.add("hidden");
    $("fieldCourse").value = m.course_label || m.course || "";
    $("fieldModule").value = m.module_label || m.module || "";
    updateModuleSuggestions();
  } else {
    if (window._setModalMode) window._setModalMode("knowledge");
    document.querySelectorAll(".type-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "knowledge"));
    $("knowledgeFields").classList.remove("hidden");
    $("courseFields").classList.add("hidden");
    $("templatePickerGroup").classList.remove("hidden");
    $("fieldCategory").value = m.category_label || m.category;
    const topicLabel = m.topic_label || m.topic;
    const selectEl = $("fieldTopic");
    const optionExists = Array.from(selectEl.options).some(o => o.value === topicLabel);
    if (optionExists) {
      selectEl.value = topicLabel;
      $("fieldTopicCustom").classList.add("hidden");
    } else {
      selectEl.value = "Otro";
      $("fieldTopicCustom").classList.remove("hidden");
      $("fieldTopicCustom").value = topicLabel;
    }
  }
}

function closeModal() {
  $("modalOverlay").classList.add("hidden");
}

function getTopicValue() {
  const sel = $("fieldTopic").value;
  if (sel === "Otro") return $("fieldTopicCustom").value.trim();
  return sel;
}

async function saveEntry() {
  const mode = $("saveBtn").dataset.mode;
  const title = $("fieldTitle").value.trim();
  const content = $("fieldContent").value.trim();
  const currentModalMode = window._getModalMode ? window._getModalMode() : "knowledge";

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
      body: JSON.stringify({ course, module, title, raw_text: content }),
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

  if (!category || !topic || !title || !raw_text) {
    showToast("Completa todos los campos", "error");
    return;
  }

  if (mode === "edit") {
    const id = $("saveBtn").dataset.id;
    const res = await fetch(`/api/entry/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text, title, category, topic }),
    });
    if (res.ok) {
      closeModal();
      showToast("Entrada actualizada");
      await loadTree();
      loadEntry(id);
    } else {
      showToast("Error al actualizar", "error");
    }
  } else {
    const res = await fetch("/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, topic, title, raw_text }),
    });
    if (res.ok) {
      const data = await res.json();
      closeModal();
      showToast("Entrada guardada");
      await loadTree();
      loadCategorySuggestions();
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
    $("welcome").classList.remove("hidden");
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
  const textarea = $("fieldContent");
  const preview = $("previewPane");

  if (tab === "preview") {
    const raw = textarea.value.trim();
    if (raw) {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw }),
      });
      const data = await res.json();
      preview.innerHTML = '<div class="entry-body">' + data.html + "</div>";
    } else {
      preview.innerHTML = '<span style="color:var(--text-faint)">Sin contenido aún.</span>';
    }
    textarea.classList.add("hidden");
    preview.classList.remove("hidden");
  } else {
    textarea.classList.remove("hidden");
    preview.classList.add("hidden");
  }
}

// ---- CATEGORY SUGGESTIONS ----
async function loadCategorySuggestions() {
  const res = await fetch("/api/categories");
  const cats = await res.json();
  const dl = $("categorySuggestions");
  dl.innerHTML = Object.values(cats).map(c => `<option value="${escapeHtml(c)}">`).join("");
}

let _coursesTree = {};

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

function showToast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 3000);
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
  $("reindexBtn").addEventListener("click", async () => {
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
  $("statsBtn").addEventListener("click", openStats);
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
        $("fieldContent").value = TEMPLATES[tpl];
        document.querySelectorAll(".template-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        $("fieldContent").focus();
        autoExtractTitle();
      }
    });
  });
}

// ============================================================
// NEW FEATURE: VERSION HISTORY
// ============================================================
let _historyCurrentTimestamp = null;
let _historyCurrentMarkdown = null;

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
    // Parse timestamp: YYYYMMDDTHHMMSS → YYYY-MM-DD HH:MM:SS
    const ts = s.timestamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5:$6');
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
  _historyCurrentTimestamp = timestamp;
  _historyCurrentMarkdown = data.markdown;
  const ts = timestamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5:$6');
  $("versionModalTitle").textContent = `snapshot — ${ts}`;
  $("versionModalBody").innerHTML = data.html;
  $("versionModalOverlay").classList.remove("hidden");
}

function closeVersionModal() {
  $("versionModalOverlay").classList.add("hidden");
  _historyCurrentTimestamp = null;
  _historyCurrentMarkdown = null;
}

async function restoreVersion() {
  if (!currentEntryId || !_historyCurrentMarkdown) return;
  const res = await fetch(`/api/entry/${currentEntryId}`);
  const data = await res.json();
  const m = data.meta;
  const putRes = await fetch(`/api/entry/${currentEntryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw_text: _historyCurrentMarkdown,
      title: m.title,
      category: m.category_label || m.category,
      topic: m.topic_label || m.topic,
    }),
  });
  if (putRes.ok) {
    closeVersionModal();
    $("historyPanel").classList.add("hidden");
    $("historyBtn").classList.remove("active");
    showToast("Versión restaurada");
    await loadTree();
    loadEntry(currentEntryId);
  } else {
    showToast("Error al restaurar", "error");
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
  const catLabel = escapeHtml(meta.type === "course" ? (meta.course_label || meta.course) : (meta.category_label || meta.category));
  const topicLabel = escapeHtml(meta.type === "course" ? (meta.module_label || meta.module) : (meta.topic_label || meta.topic));
  const entryTitle = escapeHtml(meta.title);
  $("breadcrumb").innerHTML = `
    <span class="breadcrumb-seg" data-cat="${escapeHtml(meta.category)}">${catLabel}</span>
    <span class="breadcrumb-sep">›</span>
    <span class="breadcrumb-seg" data-topic="${escapeHtml(meta.topic)}">${topicLabel}</span>
    <span class="breadcrumb-sep">›</span>
    <span class="breadcrumb-seg last">${entryTitle}</span>
  `;
  $("breadcrumb").querySelectorAll(".breadcrumb-seg[data-cat]").forEach(seg => {
    seg.addEventListener("click", () => {
      const cat = seg.dataset.cat;
      const catEl = document.querySelector(`.tree-category[data-cat="${cat}"]`);
      if (catEl && !catEl.classList.contains("open")) {
        catEl.querySelector(".tree-category-header").click();
      }
      if (catEl) catEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}
