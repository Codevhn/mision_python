import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useState, useCallback, useRef } from "react";

// ── Page link block ───────────────────────────────────────────────
// Mirrors the legacy "page" block: a clickable chip that navigates to
// another entry. Serialized to/from `[[title|pageId]]` in markdown.js.
export const pageLink = createReactBlockSpec(
  {
    type: "pageLink",
    propSchema: {
      title: { default: "" },
      pageId: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { title, pageId } = props.block.props;
      return (
        <div
          className="bn-pagelink-chip"
          contentEditable={false}
          onClick={() => {
            if (pageId && window._loadEntryById) window._loadEntryById(pageId);
          }}
        >
          <span className="bn-pagelink-icon">📄</span>
          <span className="bn-pagelink-title">{title || "Sin título"}</span>
        </div>
      );
    },
  },
);

// ── Database block ────────────────────────────────────────────────
// A live table of the CURRENT page's child pages — real KB entries, not
// values trapped inside the block. Columns are a schema (name/type) stored
// on the block itself; cell values live on each row-page's own
// `.properties` (the existing per-page custom-properties system in
// properties.js), matched by property name. Clicking a row title opens
// it in the floating page peek (window._openPagePeek) so you can view/edit
// the full page — properties AND body — without leaving the table, exactly
// like a Notion database. window._currentEntryId (kept in sync by app.js /
// the peek panel) tells this block which page's children to list.
function parseSchema(raw) {
  try {
    const d = JSON.parse(raw || "{}");
    if (d && Array.isArray(d.columns)) return d;
  } catch (_) {}
  return { columns: [{ id: "col_status", name: "Estado", type: "status" }] };
}

const PROP_TYPES = [
  { id: "text", label: "Texto" },
  { id: "number", label: "Número" },
  { id: "select", label: "Selección" },
  { id: "multi_select", label: "Multi-selección" },
  { id: "status", label: "Estado" },
  { id: "date", label: "Fecha" },
  { id: "checkbox", label: "Casilla" },
  { id: "url", label: "URL" },
];

const PROP_DEFAULTS = {
  text: "", number: 0, select: null, multi_select: [],
  status: "No iniciado", date: "", checkbox: false, url: "",
};

// Types simple enough to edit with a plain input right in the table cell.
// select/multi_select/status get their own colored-tag cell (PropCell,
// below) that reuses properties.js's real popovers instead of a plain
// input. text gets its own wrap-capable contentEditable cell (TextCell,
// below), since row-height needs it to actually grow with content — a
// plain <input> can never wrap. date stays a click-through to the peek
// for now (needs the same date-picker treatment as the props panel).
function isInlineEditable(type) {
  return type === "number" || type === "url" || type === "checkbox";
}

const ROW_HEIGHTS = [
  { id: "small", label: "Pequeña" },
  { id: "medium", label: "Mediana" },
  { id: "large", label: "Grande" },
];

// A row's height is table-wide, not per-row — matches real Notion (its
// "..." menu sets one row-height preset for the whole database, it isn't
// configurable per individual row either). Small keeps the original
// always-truncated look untouched; medium/large let the title and text
// cells wrap up to a line-clamp instead of always ellipsizing.
function TextCell({ value, onCommit }) {
  return (
    <div
      key={value}
      className="bn-db-cell-input bn-db-cell-text-wrap"
      contentEditable
      suppressContentEditableWarning
      ref={(el) => { if (el && el.textContent !== value) el.textContent = value; }}
      onBlur={(e) => {
        const v = e.currentTarget.textContent || "";
        if (v !== value) onCommit(v);
      }}
    />
  );
}

function isTagType(type) {
  return type === "status" || type === "select" || type === "multi_select";
}

function propValueDisplay(prop) {
  if (!prop) return "";
  if (prop.type === "multi_select") return Array.isArray(prop.value) ? prop.value.join(", ") : "";
  return prop.value != null ? String(prop.value) : "";
}

// Same 5 status labels properties.js's STATUS_GROUPS defines (that module
// doesn't export them) — kept in sync here the same way PROP_DEFAULTS.status
// already duplicates properties.js's own default.
const STATUS_OPTIONS = ["No iniciado", "En proceso", "Revisión", "Terminado", "Cancelado"];

// "__title" is the synthetic column id for the (always-present, not a real
// schema.columns entry) title/name field, both here and in the filter/sort
// popovers below.
function resolveFilterSortCol(colId, columns) {
  if (colId === "__title") return { id: "__title", type: "title", name: "Nombre" };
  return columns.find((c) => c.id === colId) || null;
}

function rowMatchesFilter(row, filter, columns) {
  if (!filter || !filter.colId) return true;
  const col = resolveFilterSortCol(filter.colId, columns);
  if (!col) return true;
  if (col.type === "title") {
    if (!filter.value) return true;
    return (row.title || "").toLowerCase().includes(filter.value.toLowerCase());
  }
  const prop = (row.properties || []).find((p) => p.id === col.id);
  if (col.type === "checkbox") {
    const checked = !!(prop && prop.value);
    return filter.value === "unchecked" ? !checked : checked;
  }
  if (col.type === "status" || col.type === "select") {
    if (!filter.value) return true;
    return !!prop && prop.value === filter.value;
  }
  if (col.type === "multi_select") {
    if (!filter.value) return true;
    return !!prop && Array.isArray(prop.value) && prop.value.includes(filter.value);
  }
  if (!filter.value) return true;
  const v = prop && prop.value != null ? String(prop.value) : "";
  return v.toLowerCase().includes(filter.value.toLowerCase());
}

function rowSortValue(row, col) {
  if (col.type === "title") return (row.title || "").toLowerCase();
  const prop = (row.properties || []).find((p) => p.id === col.id);
  if (col.type === "checkbox") return prop && prop.value ? 1 : 0;
  if (col.type === "number") return typeof prop?.value === "number" ? prop.value : -Infinity;
  if (col.type === "multi_select") return Array.isArray(prop?.value) ? prop.value.join(",").toLowerCase() : "";
  return prop && prop.value != null ? String(prop.value).toLowerCase() : "";
}

// Mounts a live, click-to-edit colored tag (window.Properties.renderCell)
// into a plain DOM container. Select/multi_select options are owned by the
// COLUMN (schema.columns[i].options), not by each row — exactly like a
// real Notion database property, where creating a new tag on one row makes
// it selectable on every other row of that column immediately. Remounts
// whenever the resolved value/options actually change, not on every parent
// re-render (typing elsewhere in the table shouldn't blow away an open
// popover).
function PropCell({ prop, onChange }) {
  const ref = useRef(null);
  const depKey = JSON.stringify([prop.value, prop.options]);
  useEffect(() => {
    if (!ref.current || !window.Properties) return;
    ref.current.innerHTML = "";
    const el = window.Properties.renderCell(prop, onChange);
    if (el) ref.current.appendChild(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);
  return <div className="bn-db-cell bn-db-cell-tag" ref={ref} />;
}

export const database = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      data: { default: "{}" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const schema = parseSchema(block.props.data);
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [addColOpen, setAddColOpen] = useState(false);
      const [newColName, setNewColName] = useState("");
      const [newColType, setNewColType] = useState("text");
      const [colMenuOpen, setColMenuOpen] = useState(null);
      const [colMenuView, setColMenuView] = useState("main");
      const [renameDraft, setRenameDraft] = useState("");
      const addColRef = useRef(null);
      const colMenuRef = useRef(null);
      const dragRowIdRef = useRef(null);
      const pageId = window._currentEntryId;

      // Row "⋮⋮" menu (Abrir/Duplicar/Copiar enlace/Eliminar) and bulk
      // selection checkboxes — the same handle serves both drag-to-reorder
      // (see startResize-adjacent handlers below) and, on a plain click
      // (no movement, so no dragstart ever fires), this menu.
      const [rowMenuOpen, setRowMenuOpen] = useState(null);
      const rowMenuRef = useRef(null);
      const [selectedIds, setSelectedIds] = useState(() => new Set());

      useEffect(() => {
        if (!rowMenuOpen) return;
        const h = (e) => { if (rowMenuRef.current && !rowMenuRef.current.contains(e.target)) setRowMenuOpen(null); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [rowMenuOpen]);

      const [rowHeightOpen, setRowHeightOpen] = useState(false);
      const rowHeightRef = useRef(null);

      useEffect(() => {
        if (!rowHeightOpen) return;
        const h = (e) => { if (rowHeightRef.current && !rowHeightRef.current.contains(e.target)) setRowHeightOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [rowHeightOpen]);

      const [filterOpen, setFilterOpen] = useState(false);
      const filterRef = useRef(null);

      useEffect(() => {
        if (!filterOpen) return;
        const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [filterOpen]);

      const [sortOpen, setSortOpen] = useState(false);
      const sortRef = useRef(null);

      useEffect(() => {
        if (!sortOpen) return;
        const h = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [sortOpen]);

      // Column widths, drag-to-resize (like Notion's own table). `colWidths`
      // holds only the column(s) currently mid-drag, for immediate visual
      // feedback without spamming editor.updateBlock (and its undo history)
      // on every mousemove tick. "__title" is the special key for the fixed
      // title column, since it isn't a real entry in schema.columns.
      const [colWidths, setColWidths] = useState({});
      const liveWidthRef = useRef(null);

      const startResize = (e, key) => {
        e.preventDefault();
        e.stopPropagation();
        const cell = e.currentTarget.parentElement;
        const startWidth = cell.getBoundingClientRect().width;
        const startX = e.clientX;
        liveWidthRef.current = startWidth;
        document.body.classList.add("bn-db-resizing-cursor");
        const onMove = (ev) => {
          const next = Math.max(80, Math.round(startWidth + (ev.clientX - startX)));
          liveWidthRef.current = next;
          setColWidths((prev) => ({ ...prev, [key]: next }));
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("bn-db-resizing-cursor");
          const finalWidth = liveWidthRef.current;
          if (key === "__title") {
            saveSchema({ ...schema, titleWidth: finalWidth });
          } else {
            saveSchema({ ...schema, columns: schema.columns.map((c) => (c.id === key ? { ...c, width: finalWidth } : c)) });
          }
          setColWidths((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };

      // Read at click-time via this ref, never via a value captured in a
      // handler closure: two different PropCell instances (e.g. Estado and
      // Nivel on the same row) each hold their own onChange closure that
      // only refreshes when THEIR OWN cell's value/options change. Editing
      // cell A then cell B in quick succession, before A's edit causes a
      // re-render that A's own cell picks up, must not let B's still-stale
      // closure PATCH a properties array that's missing A's edit.
      const rowsRef = useRef(rows);
      useEffect(() => { rowsRef.current = rows; }, [rows]);

      useEffect(() => {
        if (!addColOpen) return;
        const h = (e) => { if (addColRef.current && !addColRef.current.contains(e.target)) setAddColOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [addColOpen]);

      useEffect(() => {
        if (!colMenuOpen) return;
        const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(null); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [colMenuOpen]);

      const reload = useCallback(() => {
        if (!pageId) { setLoading(false); return; }
        setLoading(true);
        fetch(`/api/entry/${pageId}/children`)
          .then((r) => r.json())
          .then((data) => {
            setRows(Array.isArray(data) ? data.filter((c) => c.type === "page") : []);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      }, [pageId]);

      useEffect(() => { reload(); }, [reload]);

      const saveSchema = (next) => {
        editor.updateBlock(block, { props: { data: JSON.stringify(next) } });
      };

      const confirmAddColumn = () => {
        const name = newColName.trim();
        if (!name) return;
        const id = "col_" + Math.random().toString(36).slice(2, 9);
        const col = { id, name, type: newColType };
        if (newColType === "select" || newColType === "multi_select") col.options = [];
        saveSchema({ ...schema, columns: [...schema.columns, col] });
        setNewColName("");
        setNewColType("text");
        setAddColOpen(false);
      };

      const removeColumn = (colId) => {
        saveSchema({ ...schema, columns: schema.columns.filter((c) => c.id !== colId) });
      };

      // Select/multi_select options live on the column itself, not on each
      // row's copy of the property — this is what makes creating a new tag
      // on one row instantly selectable on every other row, matching how a
      // real Notion database property works.
      const setColumnOptions = (col, options) => {
        saveSchema({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? { ...c, options } : c)) });
      };

      const openColMenu = (col) => {
        setColMenuOpen(col.id);
        setColMenuView("main");
        setRenameDraft(col.name);
      };

      const renameColumn = (col) => {
        const name = renameDraft.trim();
        if (!name) return;
        saveSchema({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? { ...c, name } : c)) });
        setColMenuOpen(null);
        // Keep each row's own stored property name in sync — the page
        // peek's properties panel lists a row's properties independently
        // by name, so without this it would keep showing the old name.
        const affected = rowsRef.current.filter((r) => (r.properties || []).some((p) => p.id === col.id));
        affected.forEach((r) => {
          const rowProps = r.properties.map((p) => (p.id === col.id ? { ...p, name } : p));
          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, properties: rowProps } : x)));
          fetch(`/api/entry/${r.id}/properties`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ properties: rowProps }),
          });
        });
      };

      const changeColumnType = (col, type) => {
        const next = { ...col, type };
        if (type === "select" || type === "multi_select") { if (!Array.isArray(next.options)) next.options = []; }
        else delete next.options;
        saveSchema({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? next : c)) });
        setColMenuOpen(null);
      };

      const addRow = async () => {
        if (!pageId) return;
        const res = await fetch("/api/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Sin título", entry_type: "page", parent_id: pageId }),
        });
        const data = await res.json();
        if (!data.id) return;
        const seeded = schema.columns.map((c) => ({
          id: c.id, name: c.name, type: c.type,
          value: PROP_DEFAULTS[c.type] ?? "",
        }));
        await fetch(`/api/entry/${data.id}/properties`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ properties: seeded }),
        });
        reload();
        if (window._openPagePeek) window._openPagePeek(data.id, { onClose: reload });
      };

      const deleteRow = async (rowId) => {
        if (!window.confirm("¿Eliminar esta página? No se puede deshacer.")) return;
        await fetch(`/api/entry/${rowId}`, { method: "DELETE" });
        reload();
      };

      const setCellValue = async (rowId, col, value) => {
        const row = rowsRef.current.find((r) => r.id === rowId);
        const rowProps = row && Array.isArray(row.properties) ? [...row.properties] : [];
        const idx = rowProps.findIndex((p) => p.id === col.id);
        if (idx >= 0) rowProps[idx] = { ...rowProps[idx], value };
        else rowProps.push({ id: col.id, name: col.name, type: col.type, value });
        setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, properties: rowProps } : r)));
        await fetch(`/api/entry/${rowId}/properties`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ properties: rowProps }),
        });
      };

      const openRow = (rowId) => {
        if (window._openPagePeek) window._openPagePeek(rowId, { onClose: reload });
      };

      // Row drag-to-reorder, via the "⋮⋮" handle. Reuses the app's existing
      // generic /api/entry/reorder endpoint (sets `order` on a list of ids,
      // in the order given) — no dedicated backend endpoint needed. It's
      // fine that this only ever sees THIS table's own row ids: order is
      // only ever compared among children of the same parent, so reusing
      // 0..N-1 across unrelated parents elsewhere never collides.
      const [dragOverRowId, setDragOverRowId] = useState(null);

      const handleRowDrop = async (targetRowId) => {
        setDragOverRowId(null);
        const draggedId = dragRowIdRef.current;
        dragRowIdRef.current = null;
        if (!draggedId || draggedId === targetRowId) return;
        const current = rowsRef.current;
        const draggedIdx = current.findIndex((r) => r.id === draggedId);
        const targetIdx = current.findIndex((r) => r.id === targetRowId);
        if (draggedIdx < 0 || targetIdx < 0) return;
        const next = [...current];
        const [moved] = next.splice(draggedIdx, 1);
        next.splice(targetIdx, 0, moved);
        setRows(next);
        await fetch("/api/entry/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: next.map((r) => r.id) }),
        });
      };

      // "⋮⋮" row menu actions. Duplicate reuses the app's existing generic
      // POST /api/entry/<id>/duplicate (same one behind the page-level
      // "Más ⋯ → Duplicar" button) — it already copies content+properties
      // and keeps parent_id, so no database-specific backend work needed.
      const duplicateRow = async (rowId) => {
        setRowMenuOpen(null);
        await fetch(`/api/entry/${rowId}/duplicate`, { method: "POST" });
        reload();
      };

      const copyRowLink = (rowId) => {
        setRowMenuOpen(null);
        const url = `${window.location.origin}${window.location.pathname}?open=${encodeURIComponent(rowId)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => window.showToast && window.showToast("Enlace copiado"));
        }
      };

      // Bulk selection — a real Notion table shows a checkbox per row (and
      // one in the header to select all) once you hover, with a small
      // "N selected" bar for bulk actions. Bulk property-editing is a much
      // bigger feature (out of scope here); bulk delete is the one that
      // actually saves time day-to-day, so that's what's wired up.
      const toggleRowSelected = (rowId) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          return next;
        });
      };

      const toggleSelectAll = () => {
        // Selects only the currently VISIBLE (filtered) rows, matching
        // Notion's own "select all" behavior under an active filter.
        setSelectedIds((prev) => (prev.size === displayRows.length ? new Set() : new Set(displayRows.map((r) => r.id))));
      };

      const deleteSelected = async () => {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;
        if (!window.confirm(`¿Eliminar ${ids.length} página(s)? No se puede deshacer.`)) return;
        await Promise.all(ids.map((id) => fetch(`/api/entry/${id}`, { method: "DELETE" })));
        setSelectedIds(new Set());
        reload();
      };

      // Deliberately NOT a real <table>: BlockNote's own native-table
      // extension attaches a document-wide mousemove listener that assumes
      // any <table> element in the DOM carries its internal column-resize
      // state, and throws ("Cannot read properties of undefined (reading
      // 'rows')") when it hovers a plain HTML table that isn't one of its
      // own blocks. A CSS-grid layout sidesteps that entirely.
      //
      // Columns only get a fixed pixel width once a user actually drags
      // their resize handle (persisted as column.width / schema.titleWidth);
      // an untouched column stays flexible (minmax(...,1fr)) so tables that
      // have never been resized keep filling the block's width, matching
      // the look every table had before this feature existed.
      const titleWidth = colWidths.__title ?? schema.titleWidth ?? 220;
      const colTemplate = schema.columns
        .map((c) => {
          const live = colWidths[c.id];
          if (live != null) return `${live}px`;
          return c.width ? `${c.width}px` : "minmax(120px, 1fr)";
        })
        .join(" ");
      const gridTemplateColumns = `28px ${titleWidth}px ${colTemplate} 32px`;

      const rowHeight = schema.rowHeight || "small";

      // Filter/sort are derived views over `rows`, never mutate the
      // underlying data or its stored order. A row's real position (used
      // by drag-to-reorder and by the server's own default ordering) is
      // untouched by either — sort only changes DISPLAY order, and only
      // while a sort is actually configured.
      const filterColResolved = schema.filter ? resolveFilterSortCol(schema.filter.colId, schema.columns) : null;
      const sortColResolved = schema.sort ? resolveFilterSortCol(schema.sort.colId, schema.columns) : null;
      let displayRows = schema.filter && filterColResolved
        ? rows.filter((r) => rowMatchesFilter(r, schema.filter, schema.columns))
        : rows;
      if (schema.sort && sortColResolved) {
        const dir = schema.sort.dir === "desc" ? -1 : 1;
        displayRows = [...displayRows].sort((a, b) => {
          const av = rowSortValue(a, sortColResolved);
          const bv = rowSortValue(b, sortColResolved);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }

      const filterSortColumns = [{ id: "__title", name: "Nombre" }, ...schema.columns];

      return (
        <div className="bn-database" contentEditable={false}>
          <div className="bn-db-toolbar">
            <div className="bn-db-toolbar-left">
              <div className="bn-db-filter-wrap" ref={filterRef}>
                <button className={"bn-db-toolbar-btn" + (schema.filter ? " active" : "")} onClick={() => setFilterOpen((v) => !v)}>
                  Filtro{schema.filter && filterColResolved ? `: ${filterColResolved.name}` : ""}
                </button>
                {filterOpen && (
                  <div className="bn-db-colmenu-pop bn-db-filter-pop" contentEditable={false}>
                    <select
                      className="bn-db-pop-select"
                      value={schema.filter?.colId || ""}
                      onChange={(e) => {
                        const colId = e.target.value;
                        saveSchema({ ...schema, filter: colId ? { colId, value: "" } : null });
                      }}
                    >
                      <option value="">Sin filtro</option>
                      {filterSortColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {schema.filter && filterColResolved && (
                      <>
                        {filterColResolved.type === "checkbox" ? (
                          <select
                            className="bn-db-pop-select"
                            value={schema.filter.value || "checked"}
                            onChange={(e) => saveSchema({ ...schema, filter: { ...schema.filter, value: e.target.value } })}
                          >
                            <option value="checked">Marcada</option>
                            <option value="unchecked">No marcada</option>
                          </select>
                        ) : (filterColResolved.type === "status" || filterColResolved.type === "select" || filterColResolved.type === "multi_select") ? (
                          <select
                            className="bn-db-pop-select"
                            value={schema.filter.value || ""}
                            onChange={(e) => saveSchema({ ...schema, filter: { ...schema.filter, value: e.target.value } })}
                          >
                            <option value="">Cualquiera</option>
                            {(filterColResolved.type === "status" ? STATUS_OPTIONS : (filterColResolved.options || []).map((o) => o.label)).map((label) => (
                              <option key={label} value={label}>{label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="bn-db-pop-input"
                            placeholder="Contiene…"
                            autoFocus
                            value={schema.filter.value || ""}
                            onChange={(e) => saveSchema({ ...schema, filter: { ...schema.filter, value: e.target.value } })}
                          />
                        )}
                        <button className="bn-db-colmenu-item bn-db-colmenu-danger" onClick={() => saveSchema({ ...schema, filter: null })}>Quitar filtro</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="bn-db-sort-wrap" ref={sortRef}>
                <button className={"bn-db-toolbar-btn" + (schema.sort ? " active" : "")} onClick={() => setSortOpen((v) => !v)}>
                  Orden{schema.sort && sortColResolved ? `: ${sortColResolved.name}` : ""}
                </button>
                {sortOpen && (
                  <div className="bn-db-colmenu-pop bn-db-filter-pop" contentEditable={false}>
                    <select
                      className="bn-db-pop-select"
                      value={schema.sort?.colId || ""}
                      onChange={(e) => {
                        const colId = e.target.value;
                        saveSchema({ ...schema, sort: colId ? { colId, dir: schema.sort?.dir || "asc" } : null });
                      }}
                    >
                      <option value="">Sin orden (manual)</option>
                      {filterSortColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {schema.sort && (
                      <>
                        <button
                          className={"bn-db-colmenu-item" + (schema.sort.dir !== "desc" ? " active" : "")}
                          onClick={() => saveSchema({ ...schema, sort: { ...schema.sort, dir: "asc" } })}
                        >
                          Ascendente
                        </button>
                        <button
                          className={"bn-db-colmenu-item" + (schema.sort.dir === "desc" ? " active" : "")}
                          onClick={() => saveSchema({ ...schema, sort: { ...schema.sort, dir: "desc" } })}
                        >
                          Descendente
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="bn-db-rowheight-wrap" ref={rowHeightRef}>
              <button className="bn-db-toolbar-btn" onClick={() => setRowHeightOpen((v) => !v)}>
                ≡ {(ROW_HEIGHTS.find((r) => r.id === rowHeight) || ROW_HEIGHTS[0]).label}
              </button>
              {rowHeightOpen && (
                <div className="bn-db-colmenu-pop bn-db-rowheight-pop" contentEditable={false}>
                  {ROW_HEIGHTS.map((rh) => (
                    <button
                      key={rh.id}
                      className={"bn-db-colmenu-item" + (rowHeight === rh.id ? " active" : "")}
                      onClick={() => { saveSchema({ ...schema, rowHeight: rh.id }); setRowHeightOpen(false); }}
                    >
                      {rh.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div
            className={"bn-database-grid" + (selectedIds.size ? " bn-db-has-selection" : "")}
            style={{ gridTemplateColumns }}
            data-row-height={rowHeight}
          >
            <div className="bn-db-grid-row bn-db-grid-header">
              <div className="bn-db-cell bn-db-checkbox-cell">
                <input
                  type="checkbox"
                  checked={displayRows.length > 0 && selectedIds.size === displayRows.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < displayRows.length; }}
                  onChange={toggleSelectAll}
                  title="Seleccionar todo"
                />
              </div>
              <div className="bn-db-title-col bn-db-cell">
                Nombre
                <div className="bn-db-resize-handle" onMouseDown={(e) => startResize(e, "__title")} />
              </div>
              {schema.columns.map((c) => (
                <div
                  className="bn-db-cell"
                  key={c.id}
                  ref={colMenuOpen === c.id ? colMenuRef : null}
                >
                  <button className="bn-db-col-name-btn" onClick={() => openColMenu(c)}>
                    <span className="bn-db-col-name">{c.name}</span>
                  </button>
                  <div className="bn-db-resize-handle" onMouseDown={(e) => startResize(e, c.id)} />
                  {colMenuOpen === c.id && (
                    <div className="bn-db-colmenu-pop" contentEditable={false}>
                      {colMenuView === "main" ? (
                        <>
                          <input
                            className="bn-db-colmenu-rename"
                            value={renameDraft}
                            autoFocus
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") renameColumn(c); if (e.key === "Escape") setColMenuOpen(null); }}
                          />
                          <button className="bn-db-colmenu-item" onClick={() => setColMenuView("type")}>
                            Cambiar tipo <span className="bn-db-colmenu-current">{(PROP_TYPES.find((t) => t.id === c.type) || {}).label}</span>
                          </button>
                          <button
                            className="bn-db-colmenu-item bn-db-colmenu-danger"
                            onClick={() => { removeColumn(c.id); setColMenuOpen(null); }}
                          >
                            Eliminar propiedad
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="bn-db-colmenu-back" onClick={() => setColMenuView("main")}>← Atrás</button>
                          {PROP_TYPES.map((t) => (
                            <button
                              key={t.id}
                              className={"bn-db-colmenu-item" + (c.type === t.id ? " active" : "")}
                              onClick={() => changeColumnType(c, t.id)}
                            >
                              {t.label}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="bn-database-addcol bn-db-cell" ref={addColRef}>
                <button onClick={() => setAddColOpen((v) => !v)} title="Agregar columna">+</button>
                {addColOpen && (
                  <div className="bn-db-addcol-pop" contentEditable={false}>
                    <input
                      className="bn-db-addcol-name"
                      placeholder="Nombre de columna"
                      value={newColName}
                      autoFocus
                      onChange={(e) => setNewColName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmAddColumn(); if (e.key === "Escape") setAddColOpen(false); }}
                    />
                    <div className="bn-db-addcol-types">
                      {PROP_TYPES.map((t) => (
                        <button
                          key={t.id}
                          className={"bn-db-addcol-type" + (newColType === t.id ? " active" : "")}
                          onClick={() => setNewColType(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <button className="bn-db-addcol-confirm" onClick={confirmAddColumn}>Agregar</button>
                  </div>
                )}
              </div>
            </div>

            {displayRows.map((row) => (
              <div className="bn-db-grid-row" key={row.id}>
                <div className="bn-db-cell bn-db-checkbox-cell">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRowSelected(row.id)}
                  />
                </div>
                <div
                  className={"bn-db-title-col bn-db-cell" + (dragOverRowId === row.id ? " bn-db-row-dragover" : "")}
                  onDragOver={(e) => { e.preventDefault(); if (dragRowIdRef.current && dragRowIdRef.current !== row.id) setDragOverRowId(row.id); }}
                  onDragLeave={() => setDragOverRowId((prev) => (prev === row.id ? null : prev))}
                  onDrop={(e) => { e.preventDefault(); handleRowDrop(row.id); }}
                  ref={rowMenuOpen === row.id ? rowMenuRef : null}
                >
                  <span
                    className="bn-db-row-handle"
                    title={schema.sort ? "Clic para más opciones (arrastrar deshabilitado: hay un orden activo)" : "Arrastrar para reordenar, clic para más opciones"}
                    draggable={!schema.sort}
                    onDragStart={(e) => { dragRowIdRef.current = row.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.id); }}
                    onDragEnd={() => { dragRowIdRef.current = null; setDragOverRowId(null); }}
                    onClick={(e) => { e.stopPropagation(); setRowMenuOpen((prev) => (prev === row.id ? null : row.id)); }}
                  >⠿</span>
                  <button className="bn-db-open-row" onClick={() => openRow(row.id)}>
                    <span className="bn-db-row-icon">{row.icon || "📄"}</span>
                    <span className="bn-db-row-title">{row.title || "Sin título"}</span>
                  </button>
                  {rowMenuOpen === row.id && (
                    <div className="bn-db-colmenu-pop" contentEditable={false}>
                      <button className="bn-db-colmenu-item" onClick={() => { setRowMenuOpen(null); openRow(row.id); }}>Abrir</button>
                      <button className="bn-db-colmenu-item" onClick={() => duplicateRow(row.id)}>Duplicar</button>
                      <button className="bn-db-colmenu-item" onClick={() => copyRowLink(row.id)}>Copiar enlace</button>
                      <button
                        className="bn-db-colmenu-item bn-db-colmenu-danger"
                        onClick={() => { setRowMenuOpen(null); deleteRow(row.id); }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
                {schema.columns.map((c) => {
                  const prop = (row.properties || []).find((p) => p.id === c.id);
                  const editable = isInlineEditable(c.type);
                  if (c.type === "checkbox") {
                    return (
                      <div className="bn-db-cell" key={c.id}>
                        <input
                          type="checkbox"
                          checked={!!(prop && prop.value)}
                          onChange={(e) => setCellValue(row.id, c, e.target.checked)}
                        />
                      </div>
                    );
                  }
                  if (isTagType(c.type)) {
                    const effectiveProp = {
                      id: c.id, name: c.name, type: c.type,
                      value: prop ? prop.value : PROP_DEFAULTS[c.type],
                      options: c.options || [],
                    };
                    return (
                      <PropCell
                        key={c.id}
                        prop={effectiveProp}
                        onChange={(updated) => {
                          if (c.type !== "status" && JSON.stringify(updated.options || []) !== JSON.stringify(c.options || [])) {
                            setColumnOptions(c, updated.options || []);
                          }
                          setCellValue(row.id, c, updated.value);
                        }}
                      />
                    );
                  }
                  if (c.type === "text") {
                    return (
                      <div className="bn-db-cell" key={c.id}>
                        <TextCell
                          value={propValueDisplay(prop)}
                          onCommit={(v) => setCellValue(row.id, c, v)}
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      className={"bn-db-cell" + (editable ? "" : " bn-db-cell-ro")}
                      key={c.id}
                      onClick={() => { if (!editable) openRow(row.id); }}
                    >
                      {editable ? (
                        <input
                          className="bn-db-cell-input"
                          value={propValueDisplay(prop)}
                          onChange={(e) => setCellValue(row.id, c, c.type === "number" ? (parseFloat(e.target.value) || "") : e.target.value)}
                        />
                      ) : (
                        <span className="bn-db-cell-val">{propValueDisplay(prop) || "—"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {!loading && displayRows.length === 0 && (
              <div className="bn-db-grid-row">
                <div className="bn-db-empty">
                  {rows.length === 0 ? "Sin páginas todavía" : "Ninguna página coincide con el filtro"}
                </div>
              </div>
            )}
          </div>
          {selectedIds.size > 0 ? (
            <div className="bn-db-selection-bar" contentEditable={false}>
              <span>{selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}</span>
              <button className="bn-db-selection-clear" onClick={() => setSelectedIds(new Set())}>Cancelar</button>
              <button className="bn-db-selection-delete" onClick={deleteSelected}>Eliminar</button>
            </div>
          ) : (
            <button className="bn-database-addrow" onClick={addRow}>+ Nueva página</button>
          )}
        </div>
      );
    },
  },
);
