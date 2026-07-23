/* =================================================================
   Properties — Notion-like per-entry custom properties
   ================================================================= */
window.Properties = (() => {

  const TYPES = [
    { id: "text",         icon: "T",  label: "Text" },
    { id: "number",       icon: "#",  label: "Number" },
    { id: "select",       icon: "○",  label: "Select" },
    { id: "multi_select", icon: "◎",  label: "Multi-select" },
    { id: "status",       icon: "●",  label: "Status" },
    { id: "date",         icon: "⬚",  label: "Date" },
    { id: "checkbox",     icon: "☑",  label: "Checkbox" },
    { id: "url",          icon: "⤤",  label: "URL" },
  ];

  const STATUS_GROUPS = [
    { group: "To-do",       options: [
      { label: "No iniciado", color: "#888888" },
    ]},
    { group: "In progress", options: [
      { label: "En proceso",  color: "#d4a843" },
      { label: "Revisión",    color: "#7c8cff" },
    ]},
    { group: "Done",        options: [
      { label: "Terminado",   color: "#4ec9b0" },
      { label: "Cancelado",   color: "#e05555" },
    ]},
  ];

  const ALL_STATUS = STATUS_GROUPS.flatMap(g => g.options);

  let _entryId   = null;
  let _props     = [];
  let _container = null;
  let _saveTimer = null;
  let _readonly  = false;

  // ── public API ─────────────────────────────────────────────────
  function render(entryId, props, container, readonly) {
    _entryId   = entryId;
    _props     = JSON.parse(JSON.stringify(props || []));
    _container = container;
    _readonly  = !!readonly;
    _draw();
  }

  // ── persistence ────────────────────────────────────────────────
  function _save() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      await fetch(`/api/entry/${_entryId}/properties`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ properties: _props }),
      });
    }, 500);
  }

  function _uid() {
    return "p_" + Math.random().toString(36).slice(2, 10);
  }

  // ── render ─────────────────────────────────────────────────────
  function _draw() {
    if (!_container) return;
    _container.innerHTML = "";

    if (_props.length === 0 && _readonly) return;

    const panel = document.createElement("div");
    panel.className = "prop-panel";

    _props.forEach((prop, idx) => {
      panel.appendChild(_makeRow(prop, idx));
    });

    if (!_readonly) {
      const addBtn = document.createElement("button");
      addBtn.className = "prop-add-btn";
      addBtn.textContent = "+ Add property";
      addBtn.addEventListener("click", e => { e.stopPropagation(); _showTypePopover(addBtn); });
      panel.appendChild(addBtn);
    }

    _container.appendChild(panel);
  }

  function _makeRow(prop, idx) {
    const row = document.createElement("div");
    row.className = "prop-row";

    // ── name cell ────────────────────────────
    const nameCell = document.createElement("div");
    nameCell.className = "prop-cell prop-cell-name";

    const typeInfo = TYPES.find(t => t.id === prop.type) || TYPES[0];
    const icon = document.createElement("span");
    icon.className = "prop-icon";
    icon.textContent = typeInfo.icon;

    const nameEl = document.createElement("span");
    nameEl.className = "prop-name";
    nameEl.textContent = prop.name;

    if (!_readonly) {
      nameEl.title = "Click to rename";
      nameEl.addEventListener("click", e => { e.stopPropagation(); _inlineRename(nameEl, prop); });

      const delBtn = document.createElement("button");
      delBtn.className = "prop-del-btn";
      delBtn.title = "Remove";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", () => {
        _props.splice(idx, 1);
        _save();
        _draw();
      });
      nameCell.appendChild(icon);
      nameCell.appendChild(nameEl);
      nameCell.appendChild(delBtn);
    } else {
      nameCell.appendChild(icon);
      nameCell.appendChild(nameEl);
    }

    // ── value cell ───────────────────────────
    const valCell = document.createElement("div");
    valCell.className = "prop-cell prop-cell-val";
    valCell.appendChild(_makeValueEl(prop));

    row.appendChild(nameCell);
    row.appendChild(valCell);
    return row;
  }

  // ── value elements by type ─────────────────────────────────────
  function _makeValueEl(prop) {
    switch (prop.type) {
      case "checkbox":     return _mkCheckbox(prop);
      case "select":       return _mkSelect(prop, false);
      case "multi_select": return _mkSelect(prop, true);
      case "status":       return _mkStatus(prop);
      case "date":         return _mkDate(prop);
      case "url":          return _mkUrl(prop);
      case "number":
      case "text":
      default:             return _mkText(prop);
    }
  }

  function _mkText(prop) {
    if (_readonly) {
      const el = document.createElement("span");
      el.className = "prop-val-ro";
      el.textContent = prop.value != null ? String(prop.value) : "—";
      return el;
    }
    const el = document.createElement("div");
    el.className = "prop-val prop-val-text";
    el.contentEditable = "plaintext-only";
    el.spellcheck = false;
    const txt = prop.value != null ? String(prop.value) : "";
    el.textContent = txt;
    if (!txt) el.dataset.empty = "1";
    el.dataset.placeholder = prop.type === "number" ? "0" : "Empty";
    el.addEventListener("focus",  () => { delete el.dataset.empty; });
    el.addEventListener("blur",   () => {
      const v = el.textContent.trim();
      if (!v) el.dataset.empty = "1";
      prop.value = prop.type === "number" ? (parseFloat(v) || "") : v;
      _save();
    });
    el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    return el;
  }

  function _mkCheckbox(prop) {
    const label = document.createElement("label");
    label.className = "prop-val prop-val-checkbox";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!prop.value;
    if (_readonly) cb.disabled = true;
    else cb.addEventListener("change", () => { prop.value = cb.checked; _save(); });
    label.appendChild(cb);
    return label;
  }

  function _mkDate(prop) {
    if (_readonly) {
      const el = document.createElement("span");
      el.className = "prop-val-ro";
      el.textContent = prop.value || "—";
      return el;
    }
    const el = document.createElement("input");
    el.type = "date";
    el.className = "prop-val prop-val-date";
    el.value = prop.value || "";
    el.addEventListener("change", () => { prop.value = el.value; _save(); });
    return el;
  }

  function _mkUrl(prop) {
    const wrap = document.createElement("div");
    wrap.className = "prop-val prop-val-url";

    const display = document.createElement("a");
    display.className = "prop-url-link" + (prop.value ? " has-value" : "");
    display.textContent = prop.value ? _shortUrl(prop.value) : "Empty";
    if (prop.value) { display.href = prop.value; display.target = "_blank"; display.rel = "noopener"; }

    if (!_readonly) {
      const editBtn = document.createElement("button");
      editBtn.className = "prop-url-edit";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        const v = prompt("URL:", prop.value || "");
        if (v !== null) {
          prop.value = v.trim();
          display.textContent = prop.value ? _shortUrl(prop.value) : "Empty";
          display.href = prop.value || "#";
          display.classList.toggle("has-value", !!prop.value);
          _save();
        }
      });
      wrap.appendChild(display);
      wrap.appendChild(editBtn);
    } else {
      wrap.appendChild(display);
    }
    return wrap;
  }

  function _shortUrl(url) {
    try { const u = new URL(url); return u.hostname + (u.pathname !== "/" ? u.pathname : ""); }
    catch { return url.slice(0, 40); }
  }

  function _mkStatus(prop) {
    const wrap = document.createElement("div");
    wrap.className = "prop-val prop-val-status";
    const cur = ALL_STATUS.find(o => o.label === prop.value) || ALL_STATUS[0];

    const chip = document.createElement("span");
    chip.className = "prop-status-chip";
    chip.style.setProperty("--sc", cur.color);
    chip.textContent = prop.value || cur.label;

    if (!_readonly) {
      chip.addEventListener("click", e => { e.stopPropagation(); _showStatusPopover(chip, prop, _save, _draw); });
    }
    wrap.appendChild(chip);
    return wrap;
  }

  function _mkSelect(prop, multi) {
    const wrap = document.createElement("div");
    wrap.className = "prop-val prop-val-select";

    const repaint = () => {
      wrap.innerHTML = "";
      const vals = multi
        ? (Array.isArray(prop.value) ? prop.value : [])
        : (prop.value ? [prop.value] : []);
      const opts = prop.options || [];

      vals.forEach(v => {
        const o = opts.find(x => x.label === v);
        const chip = document.createElement("span");
        chip.className = "prop-chip";
        if (o?.color) chip.style.setProperty("--cc", o.color);
        chip.textContent = v;
        if (!_readonly) {
          const x = document.createElement("span");
          x.className = "prop-chip-x";
          x.textContent = "×";
          x.addEventListener("click", e => {
            e.stopPropagation();
            prop.value = multi ? (prop.value || []).filter(i => i !== v) : null;
            _save(); repaint();
          });
          chip.appendChild(x);
        }
        wrap.appendChild(chip);
      });

      if (!_readonly) {
        const addChip = document.createElement("span");
        addChip.className = "prop-chip-add";
        addChip.textContent = "+";
        addChip.addEventListener("click", e => { e.stopPropagation(); _showSelectPopover(addChip, prop, multi, repaint, _save); });
        wrap.appendChild(addChip);
      } else if (!vals.length) {
        const empty = document.createElement("span");
        empty.className = "prop-val-ro";
        empty.textContent = "—";
        wrap.appendChild(empty);
      }
    };

    repaint();
    return wrap;
  }

  // ── Standalone cell renderers ────────────────────────────────────
  // Same colored-tag look as the props panel above, but fully decoupled
  // from the module's _entryId/_props/_save state so callers that manage
  // their own data (e.g. the database table block, one prop object per
  // row) can mount a live, click-to-edit tag directly in a table cell
  // instead of forcing a trip through the full properties panel.
  // `onChange(updatedProp)` fires after every edit — the caller owns
  // persistence and any option-list propagation (e.g. to a shared column
  // schema).
  function renderCell(prop, onChange) {
    const commit = () => onChange({ ...prop });
    if (prop.type === "status") return _cellStatus(prop, commit);
    if (prop.type === "select") return _cellSelect(prop, false, commit);
    if (prop.type === "multi_select") return _cellSelect(prop, true, commit);
    return null;
  }

  function _cellStatus(prop, commit) {
    const chip = document.createElement("span");
    chip.className = "prop-status-chip";
    const paint = () => {
      const cur = ALL_STATUS.find(o => o.label === prop.value) || ALL_STATUS[0];
      chip.style.setProperty("--sc", cur.color);
      chip.textContent = prop.value || cur.label;
    };
    paint();
    chip.addEventListener("click", e => {
      e.stopPropagation();
      _showStatusPopover(chip, prop, commit, paint);
    });
    return chip;
  }

  function _cellSelect(prop, multi, commit) {
    const wrap = document.createElement("div");
    wrap.className = "prop-val prop-val-select";

    const repaint = () => {
      wrap.innerHTML = "";
      const vals = multi
        ? (Array.isArray(prop.value) ? prop.value : [])
        : (prop.value ? [prop.value] : []);
      const opts = prop.options || [];

      vals.forEach(v => {
        const o = opts.find(x => x.label === v);
        const chip = document.createElement("span");
        chip.className = "prop-chip";
        if (o?.color) chip.style.setProperty("--cc", o.color);
        chip.textContent = v;
        wrap.appendChild(chip);
      });

      if (!vals.length) {
        const empty = document.createElement("span");
        empty.className = "prop-val-ro";
        empty.textContent = "Vacío";
        wrap.appendChild(empty);
      }
    };

    repaint();
    wrap.addEventListener("click", e => {
      e.stopPropagation();
      _showSelectPopover(wrap, prop, multi, () => { repaint(); commit(); }, commit);
    });
    return wrap;
  }

  // ── Popovers ───────────────────────────────────────────────────
  function _clearPopovers() {
    document.querySelectorAll(".prop-popover").forEach(p => p.remove());
  }

  function _placePopover(pop, anchor) {
    document.body.appendChild(pop);
    const r  = anchor.getBoundingClientRect();
    const ph = pop.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top  = r.bottom + 4;
    let left = r.left;
    if (top + ph > vh - 8) top = r.top - ph - 4;
    if (left + pop.offsetWidth > vw - 8) left = vw - pop.offsetWidth - 8;
    pop.style.top  = top  + "px";
    pop.style.left = left + "px";
  }

  function _showStatusPopover(anchor, prop, onCommit, onRefresh) {
    onCommit = onCommit || _save;
    onRefresh = onRefresh || _draw;
    _clearPopovers();
    const pop = document.createElement("div");
    pop.className = "prop-popover";

    STATUS_GROUPS.forEach(grp => {
      const label = document.createElement("div");
      label.className = "prop-pop-group";
      label.textContent = grp.group;
      pop.appendChild(label);

      grp.options.forEach(opt => {
        const item = document.createElement("div");
        item.className = "prop-pop-item" + (prop.value === opt.label ? " active" : "");
        item.innerHTML = `<span class="prop-status-dot" style="background:${opt.color}"></span>${opt.label}`;
        item.addEventListener("click", () => {
          prop.value = opt.label;
          onCommit(); onRefresh(); _clearPopovers();
        });
        pop.appendChild(item);
      });
    });

    _placePopover(pop, anchor);
    setTimeout(() => {
      const h = e => { if (!pop.contains(e.target)) { _clearPopovers(); document.removeEventListener("click", h); } };
      document.addEventListener("click", h);
    }, 0);
  }

  function _showSelectPopover(anchor, prop, multi, onDone, onCommit) {
    onCommit = onCommit || _save;
    _clearPopovers();
    const pop = document.createElement("div");
    pop.className = "prop-popover";

    const search = document.createElement("input");
    search.type = "text";
    search.className = "prop-pop-search";
    search.placeholder = "Search or create…";
    pop.appendChild(search);

    const listEl = document.createElement("div");
    pop.appendChild(listEl);

    const repaintList = (filter) => {
      listEl.innerHTML = "";
      const opts = (prop.options || []).filter(o => o.label.toLowerCase().includes(filter.toLowerCase()));

      opts.forEach(opt => {
        const vals = multi ? (prop.value || []) : (prop.value ? [prop.value] : []);
        const selected = vals.includes(opt.label);
        const item = document.createElement("div");
        item.className = "prop-pop-item" + (selected ? " active" : "");
        item.innerHTML = `<span class="prop-chip-dot" style="background:${opt.color || "var(--accent)"}"></span>${opt.label}`;
        item.addEventListener("click", () => {
          if (multi) {
            if (!prop.value) prop.value = [];
            if (selected) prop.value = prop.value.filter(v => v !== opt.label);
            else prop.value.push(opt.label);
            repaintList(search.value);
          } else {
            prop.value = selected ? null : opt.label;
            _clearPopovers();
          }
          onCommit(); onDone();
        });
        listEl.appendChild(item);
      });

      // create new
      const exact = (prop.options || []).find(o => o.label.toLowerCase() === filter.toLowerCase());
      if (filter && !exact) {
        const createItem = document.createElement("div");
        createItem.className = "prop-pop-item prop-pop-create";
        createItem.textContent = `+ Create "${filter}"`;
        createItem.addEventListener("click", () => {
          const palette = ["#4ec9b0","#d4a843","#7c8cff","#e05555","#f09a6a","#88c057","#64b5f6","#f06292"];
          const color = palette[(prop.options || []).length % palette.length];
          if (!prop.options) prop.options = [];
          prop.options.push({ label: filter, color });
          if (multi) { if (!prop.value) prop.value = []; prop.value.push(filter); }
          else prop.value = filter;
          onCommit(); onDone(); _clearPopovers();
        });
        listEl.appendChild(createItem);
      }
    };

    repaintList("");
    search.addEventListener("input", () => repaintList(search.value));
    _placePopover(pop, anchor);
    search.focus();

    setTimeout(() => {
      const h = e => { if (!pop.contains(e.target)) { _clearPopovers(); document.removeEventListener("click", h); } };
      document.addEventListener("click", h);
    }, 0);
  }

  function _showTypePopover(anchor) {
    _clearPopovers();
    const pop = document.createElement("div");
    pop.className = "prop-popover";

    const title = document.createElement("div");
    title.className = "prop-pop-title";
    title.textContent = "Property type";
    pop.appendChild(title);

    TYPES.forEach(type => {
      const item = document.createElement("div");
      item.className = "prop-pop-item";
      item.innerHTML = `<span class="prop-icon-sm">${type.icon}</span>${type.label}`;
      item.addEventListener("click", () => { _clearPopovers(); _promptAddProperty(type.id); });
      pop.appendChild(item);
    });

    _placePopover(pop, anchor);
    setTimeout(() => {
      const h = e => { if (!pop.contains(e.target)) { _clearPopovers(); document.removeEventListener("click", h); } };
      document.addEventListener("click", h);
    }, 0);
  }

  function _promptAddProperty(typeId) {
    const name = prompt("Property name:", _defaultName(typeId));
    if (!name) return;
    const defaults = {
      text: "", number: 0, select: null, multi_select: [],
      status: "No iniciado", date: "", checkbox: false, url: "",
    };
    const prop = {
      id:    _uid(),
      name:  name.trim(),
      type:  typeId,
      value: defaults[typeId] ?? "",
    };
    if (typeId === "select" || typeId === "multi_select") prop.options = [];
    _props.push(prop);
    _save();
    _draw();
  }

  function _defaultName(typeId) {
    const map = {
      text: "Notas", number: "Número", select: "Etiqueta",
      multi_select: "Categorías", status: "Estado", date: "Fecha",
      checkbox: "Completado", url: "URL",
    };
    return map[typeId] || "Propiedad";
  }

  function _inlineRename(el, prop) {
    const old = prop.name;
    el.contentEditable = "plaintext-only";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const done = () => {
      el.contentEditable = "false";
      const v = el.textContent.trim();
      prop.name = v || old;
      if (!v) el.textContent = old;
      _save();
    };
    el.addEventListener("blur", done, { once: true });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") { el.textContent = old; el.blur(); }
    }, { once: true });
  }

  return { render, renderCell };
})();
