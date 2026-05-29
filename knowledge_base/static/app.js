/* =============================================
   KNOWLEDGE BASE — Frontend Logic
   ============================================= */

const $ = id => document.getElementById(id);

// ---- State ----
let currentEntryId = null;
let treeState = {}; // { cat: { open: bool, topics: { topic: { open: bool } } } }

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  loadTree();
  loadCategorySuggestions();
  bindEvents();
  applyTheme();
});

function bindEvents() {
  $("newEntryBtn").addEventListener("click", openNewModal);
  $("welcomeNewBtn").addEventListener("click", openNewModal);
  $("themeToggle").addEventListener("click", toggleTheme);
  $("sidebarToggle").addEventListener("click", toggleSidebar);
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
  // Only auto-fill if the title field is empty (don't overwrite what user typed)
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
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kb_theme", next);
  $("themeToggle").textContent = next === "dark" ? "[light]" : "[dark]";
}

// ---- SIDEBAR ----
function toggleSidebar() {
  $("sidebar").classList.toggle("collapsed");
}

// ---- TREE ----
async function loadTree() {
  const res = await fetch("/api/tree");
  const tree = await res.json();
  renderTree(tree);
}

function renderTree(tree) {
  const nav = $("tree");
  if (Object.keys(tree).length === 0) {
    nav.innerHTML = '<div class="tree-empty">No hay entradas aún.<br>Crea la primera con el botón +</div>';
    return;
  }

  nav.innerHTML = "";
  for (const [cat, topics] of Object.entries(tree)) {
    if (!treeState[cat]) treeState[cat] = { open: true, topics: {} };
    const catEl = document.createElement("div");
    catEl.className = "tree-category" + (treeState[cat].open ? " open" : "");
    catEl.dataset.cat = cat;

    const catLabel = Object.values(topics)[0] ? getFirstEntry(topics).category_label || cat : cat;

    catEl.innerHTML = `
      <div class="tree-category-header">
        <span class="arrow">▶</span>
        <span>${escapeHtml(catLabel || cat)}</span>
      </div>
      <div class="tree-topics"></div>
    `;
    catEl.querySelector(".tree-category-header").addEventListener("click", () => {
      treeState[cat].open = !treeState[cat].open;
      catEl.classList.toggle("open");
    });

    const topicsEl = catEl.querySelector(".tree-topics");
    for (const [topic, entries] of Object.entries(topics)) {
      if (!treeState[cat].topics[topic]) treeState[cat].topics[topic] = { open: true };
      const topicEl = document.createElement("div");
      topicEl.className = "tree-topic" + (treeState[cat].topics[topic].open ? " open" : "");

      const topicLabel = entries[0]?.topic_label || topic;
      topicEl.innerHTML = `
        <div class="tree-topic-header">
          <span class="arrow">▶</span>
          <span>${escapeHtml(topicLabel || topic)}</span>
        </div>
        <div class="tree-entries"></div>
      `;
      topicEl.querySelector(".tree-topic-header").addEventListener("click", () => {
        treeState[cat].topics[topic].open = !treeState[cat].topics[topic].open;
        topicEl.classList.toggle("open");
      });

      const entriesEl = topicEl.querySelector(".tree-entries");
      entries.forEach(entry => {
        const entryEl = document.createElement("div");
        entryEl.className = "tree-entry" + (entry.id === currentEntryId ? " active" : "");
        entryEl.textContent = entry.title;
        entryEl.title = entry.title;
        entryEl.dataset.id = entry.id;
        entryEl.addEventListener("click", () => loadEntry(entry.id));
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

// ---- ENTRY VIEW ----
async function loadEntry(id) {
  currentEntryId = id;
  document.querySelectorAll(".tree-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  const res = await fetch(`/api/entry/${id}`);
  if (!res.ok) { showToast("Error al cargar la entrada", "error"); return; }
  const data = await res.json();

  $("welcome").classList.add("hidden");
  $("entryView").classList.remove("hidden");

  const m = data.meta;
  const date = m.created_at ? m.created_at.slice(0, 10) : "—";
  $("entryMeta").innerHTML = `
    <span class="meta-seg meta-seg-cat">
      <span class="meta-seg-icon">󰣇</span>
      ${escapeHtml(m.category_label || m.category)}
    </span>
    <span class="meta-seg meta-seg-topic">
      <span class="meta-seg-icon"> </span>
      ${escapeHtml(m.topic_label || m.topic)}
    </span>
    <span class="meta-seg meta-seg-date">
      <span class="meta-seg-icon"> </span>
      ${date}
    </span>
  `;
  $("entryBody").innerHTML = data.html;
  $("contentArea").scrollTo(0, 0);
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
  setTimeout(() => $("fieldCategory").focus(), 60);
}

async function openEditModal() {
  if (!currentEntryId) return;
  const res = await fetch(`/api/entry/${currentEntryId}`);
  const data = await res.json();
  const m = data.meta;

  $("modalTitle").textContent = "Editar entrada";
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
  $("fieldTitle").value = m.title;
  $("fieldContent").value = data.markdown;
  switchTab("write");
  $("saveBtn").dataset.mode = "edit";
  $("saveBtn").dataset.id = currentEntryId;
  $("saveBtn").textContent = "Actualizar entrada";
  $("modalOverlay").classList.remove("hidden");
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
  const category = $("fieldCategory").value.trim();
  const topic = getTopicValue();
  const title = $("fieldTitle").value.trim();
  const raw_text = $("fieldContent").value.trim();

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
  if (!confirm("¿Eliminar esta entrada? Esta acción no se puede deshacer.")) return;
  const res = await fetch(`/api/entry/${currentEntryId}`, { method: "DELETE" });
  if (res.ok) {
    currentEntryId = null;
    $("entryView").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    showToast("Entrada eliminada");
    await loadTree();
  }
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
      <div class="sr-title">${escapeHtml(r.title)}</div>
      <div class="sr-path">${escapeHtml(r.category_label)} › ${escapeHtml(r.topic_label)}</div>
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
let starredMap = {}; // entry_id -> bool

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

  // Remove existing starred section
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
    el.textContent = "★ " + meta.title;
    el.title = meta.title;
    el.dataset.id = id;
    el.addEventListener("click", () => loadEntry(id));
    list.appendChild(el);
  });
}

// Extend loadTree to also fetch index for starred
const _origLoadTree = loadTree;
async function loadTreeWithStarred() {
  const [treeRes, indexRes] = await Promise.all([
    fetch("/api/tree"),
    fetch("/api/stats").then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const tree = await treeRes.json();
  renderTree(tree);

  // Fetch starred state from per-entry meta via a quick index poll
  // We re-use /api/tree but need starred field — fetch from search index
  fetchStarredEntries().then(idx => renderStarredSection(idx));
}

async function fetchStarredEntries() {
  // get all entries via search with empty query filtered
  const res = await fetch("/api/search/filtered?q=");
  if (!res.ok) return {};
  const entries = await res.json();
  // build map, but we need starred field — store it separately
  return starredMap;
}

// Override loadTree
async function loadTree() {
  const res = await fetch("/api/tree");
  const tree = await res.json();
  renderTree(tree);
  // Refresh starred section using cached starredMap
  renderStarredSection(
    Object.fromEntries(
      Object.entries(starredMap).filter(([, v]) => v).map(([id, starred]) => [id, { starred, title: "" }])
    )
  );
  // Also load the full index to get titles for starred entries
  loadStarredFromServer();
}

async function loadStarredFromServer() {
  const res = await fetch("/api/search/filtered?q=");
  if (!res.ok) return;
  // We can't get starred from this endpoint; instead build from a dedicated call
  // Fallback: call /api/tree which doesn't have starred info.
  // Best approach: call a new /api/starred or loop entries — instead we store in localStorage
  // Restore from localStorage
  const saved = localStorage.getItem("kb_starred");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Merge with server state (server is source of truth on reload)
    } catch (e) {}
  }
}

// When loading an entry, update star button
const _origLoadEntry = loadEntry;
async function loadEntry(id) {
  currentEntryId = id;
  document.querySelectorAll(".tree-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
  document.querySelectorAll(".tree-starred-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  const res = await fetch(`/api/entry/${id}`);
  if (!res.ok) { showToast("Error al cargar la entrada", "error"); return; }
  const data = await res.json();

  $("welcome").classList.add("hidden");
  $("entryView").classList.remove("hidden");

  const m = data.meta;
  const date = m.created_at ? m.created_at.slice(0, 10) : "—";
  $("entryMeta").innerHTML = `
    <span class="meta-seg meta-seg-cat">
      <span class="meta-seg-icon">󰣇</span>
      ${escapeHtml(m.category_label || m.category)}
    </span>
    <span class="meta-seg meta-seg-topic">
      <span class="meta-seg-icon"> </span>
      ${escapeHtml(m.topic_label || m.topic)}
    </span>
    <span class="meta-seg meta-seg-date">
      <span class="meta-seg-icon"> </span>
      ${date}
    </span>
  `;
  $("entryBody").innerHTML = data.html;
  $("contentArea").scrollTo(0, 0);

  // Update star button
  const starred = m.starred || false;
  starredMap[id] = starred;
  updateStarBtn(starred);

  // Build TOC
  buildTOC();
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

  // Add IDs to headings
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

  // Show inline title row instead of browser prompt
  const titleRow = $("scratchpadTitleRow");
  const titleInput = $("scratchpadTitle");
  if (titleRow.classList.contains("hidden")) {
    titleRow.classList.remove("hidden");
    titleInput.value = "";
    titleInput.focus();
    // Change save button to confirm
    $("scratchpadSave").textContent = "confirm";
    return;
  }

  const title = titleInput.value.trim() || ("Quick Note " + new Date().toLocaleTimeString());
  $("scratchpadSave").textContent = "save";
  titleRow.classList.add("hidden");

  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "Quick Notes",
      topic: "Scratchpad",
      title: title,
      raw_text: content,
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
// FEATURE 8 — SEARCH FILTERS
// ============================================================
function initSearchFilters() {
  const input = $("searchInput");
  const filters = $("searchFilters");

  input.addEventListener("focus", () => filters.classList.remove("hidden"));
  input.addEventListener("input", () => {
    if (input.value.trim()) filters.classList.remove("hidden");
  });
  document.addEventListener("click", e => {
    if (!filters.contains(e.target) && e.target !== input) {
      if (!input.value.trim()) filters.classList.add("hidden");
    }
  });

  // Override search to include filters
  const filterCat = $("filterCategory");
  const filterFrom = $("filterFrom");
  const filterTo = $("filterTo");

  function runFilteredSearch() {
    const q = input.value.trim();
    const cat = filterCat.value;
    const from = filterFrom.value;
    const to = filterTo.value;
    if (!q && !cat && !from && !to) {
      $("searchResults").innerHTML = "";
      $("searchResults").classList.add("hidden");
      return;
    }
    clearTimeout(input._searchTimer);
    input._searchTimer = setTimeout(() => runSearchWithFilters(q, cat, from, to), 280);
  }

  filterCat.addEventListener("change", runFilteredSearch);
  filterFrom.addEventListener("change", runFilteredSearch);
  filterTo.addEventListener("change", runFilteredSearch);

  // Populate category filter
  loadFilterCategories();
}

async function loadFilterCategories() {
  const res = await fetch("/api/categories");
  const cats = await res.json();
  const sel = $("filterCategory");
  // Clear existing options except first
  while (sel.options.length > 1) sel.remove(1);
  for (const [slug, label] of Object.entries(cats)) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

async function runSearchWithFilters(q, category, from, to) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const res = await fetch(`/api/search/filtered?${params}`);
  const results = await res.json();
  const container = $("searchResults");
  container.classList.remove("hidden");

  if (results.length === 0) {
    container.innerHTML = '<div class="search-result-item"><span class="sr-snippet">Sin resultados</span></div>';
    return;
  }

  container.innerHTML = results.map(r => `
    <div class="search-result-item" data-id="${r.id}">
      <div class="sr-title">${escapeHtml(r.title)}</div>
      <div class="sr-path">${escapeHtml(r.category_label)} › ${escapeHtml(r.topic_label)}</div>
      ${r.snippet ? `<div class="sr-snippet">${escapeHtml(r.snippet)}</div>` : ""}
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

// Override the base runSearch to also respect filters
const _origRunSearch = runSearch;
async function runSearch(q) {
  const cat = $("filterCategory").value;
  const from = $("filterFrom").value;
  const to = $("filterTo").value;
  if (cat || from || to) {
    return runSearchWithFilters(q, cat, from, to);
  }
  return _origRunSearch(q);
}

// ============================================================
// INIT ALL NEW FEATURES
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initFocusMode();
  initStarFeature();
  initTOC();
  initScratchpad();
  initStats();
  initContextMenu();
  initSearchFilters();
});
