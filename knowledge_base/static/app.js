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
  $("themeToggle").textContent = saved === "dark" ? "☀" : "☽";
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kb_theme", next);
  $("themeToggle").textContent = next === "dark" ? "☀" : "☽";
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
  $("entryMeta").innerHTML = `
    <strong>Categoría:</strong> ${escapeHtml(m.category_label || m.category)} &nbsp;·&nbsp;
    <strong>Tema:</strong> ${escapeHtml(m.topic_label || m.topic)} &nbsp;·&nbsp;
    <strong>Creado:</strong> ${m.created_at ? m.created_at.replace("T", " ") : "—"}
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
