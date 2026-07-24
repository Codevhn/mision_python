import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";

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
// ── Múltiples vistas (audit item #10) ───────────────────────────────────
// `columns` (the property definitions themselves — name/type/options/width)
// stay GLOBAL to the database, exactly like Notion: every view shows the
// same underlying properties, just laid out differently. Everything that
// used to live flat on the schema (filter/sort/groupBy/calc/rowHeight/
// titleWidth) is now per-VIEW instead — the same rows, filtered/sorted/
// grouped differently per tab, no data duplicated.
function makeDefaultView(name, overrides, id) {
  return {
    id: id || ("view_" + Math.random().toString(36).slice(2, 9)),
    name,
    type: "table",
    filter: null,
    sort: null,
    groupBy: null,
    calc: {},
    rowHeight: "small",
    titleWidth: 220,
    ...overrides,
  };
}

function parseSchema(raw) {
  let d;
  try {
    d = JSON.parse(raw || "{}");
  } catch (_) {
    d = null;
  }
  if (!d || typeof d !== "object") d = {};
  const columns = Array.isArray(d.columns) ? d.columns : [{ id: "col_status", name: "Estado", type: "status" }];

  // Migrate the old flat single-view schema into one "Tabla" view the first
  // time this loads under the new format — every database already in the
  // wild keeps looking and behaving exactly the same, nothing for the user
  // to do. Only written back to disk once the user actually changes
  // something (saveSchema/saveView), never forced on a bare read.
  //
  // The migrated view's id MUST be stable (not random) across repeated
  // calls: parseSchema re-runs on every single render straight off
  // block.props.data, and until something actually calls saveSchema this
  // fallback is regenerated fresh each time — a random id here would mint
  // a NEW id on every render, so any state keyed by "this view's id" set
  // between two renders (e.g. opening its own rename/type popover) would
  // find its target already replaced by the next render and silently fail
  // to open. A brand-new, never-saved block hits this exact window.
  const views = Array.isArray(d.views) && d.views.length
    ? d.views
    : [makeDefaultView("Tabla", {
        filter: d.filter ?? null,
        sort: d.sort ?? null,
        groupBy: d.groupBy ?? null,
        calc: d.calc ?? {},
        rowHeight: d.rowHeight || "small",
        titleWidth: d.titleWidth ?? 220,
      }, "view_default")];
  const activeView = views.some((v) => v.id === d.activeView) ? d.activeView : views[0].id;
  return { columns, views, activeView };
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

// A view's own layout — "Tabla" (the grid this block has always been) or
// "Tablero" (Notion's board/Kanban: the same rows as draggable cards, laned
// by whatever column "Agrupar" is set to — reuses that exact grouping
// mechanism instead of a separate board-only concept).
const VIEW_TYPES = [
  { id: "table", label: "Tabla" },
  { id: "board", label: "Tablero" },
];
function viewTypeIcon(type) { return type === "board" ? "▦" : "▤"; }

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

const NO_GROUP_KEY = "Sin valor";

// A multi_select row technically belongs under EVERY one of its values in
// real Notion (grouping by "Tags" with a row tagged [A, B] shows that row
// under both the A and B sections). Reproducing that means a row can
// render more than once, which complicates row-level state (selection,
// drag) elsewhere in this file — kept simple here instead: multi_select
// groups by the whole joined set as one key, same as sorting already does.
function rowGroupKey(row, col) {
  if (col.type === "title") return row.title || NO_GROUP_KEY;
  const prop = (row.properties || []).find((p) => p.id === col.id);
  if (col.type === "checkbox") return prop && prop.value ? "Marcada" : "No marcada";
  if (col.type === "multi_select") {
    return prop && Array.isArray(prop.value) && prop.value.length ? prop.value.join(", ") : NO_GROUP_KEY;
  }
  return prop && prop.value != null && prop.value !== "" ? String(prop.value) : NO_GROUP_KEY;
}

// Inverse of rowGroupKey, for the board view: dropping a card into a lane
// (or creating one straight in a lane via its own "+") needs to turn that
// lane's label back into the actual property value to write. Undefined for
// "title" and "multi_select" group columns — moving a card can't sensibly
// rewrite a page's title, and a multi_select row can belong to several
// lanes at once so "which one did you drag it out of" has no single answer.
function groupKeyToValue(key, col) {
  if (!col || col.type === "title" || col.type === "multi_select") return undefined;
  if (col.type === "checkbox") return key === "Marcada";
  return key === NO_GROUP_KEY ? "" : key;
}

// seedKeys: pre-populate these lane keys with an empty array before rows
// are placed, so a lane with zero rows still shows up (needed for the board
// view — an empty lane must still exist to be a valid drop target). Table
// view's own "Agrupar" never passes this — omitted groups collapsing away
// entirely is the existing, already-shipped, already-tested behavior there.
function groupRows(displayRows, groupCol, seedKeys) {
  const groups = new Map();
  if (seedKeys) { for (const k of seedKeys) groups.set(k, []); }
  for (const row of displayRows) {
    const key = rowGroupKey(row, groupCol);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let keys = Array.from(groups.keys());
  if (groupCol.type === "status") {
    keys = STATUS_OPTIONS.filter((k) => groups.has(k)).concat(keys.filter((k) => !STATUS_OPTIONS.includes(k)));
  } else if (groupCol.type === "select" || groupCol.type === "multi_select") {
    const optionOrder = (groupCol.options || []).map((o) => o.label);
    keys.sort((a, b) => {
      const ia = optionOrder.indexOf(a), ib = optionOrder.indexOf(b);
      if (a === NO_GROUP_KEY) return 1;
      if (b === NO_GROUP_KEY) return -1;
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } else if (groupCol.type === "checkbox") {
    keys = ["No marcada", "Marcada"].filter((k) => groups.has(k));
  } else {
    keys.sort((a, b) => {
      if (a === NO_GROUP_KEY) return 1;
      if (b === NO_GROUP_KEY) return -1;
      return a.localeCompare(b);
    });
  }
  return keys.map((key) => ({ key, rows: groups.get(key) }));
}

// "Calcular" — a per-column summary shown in a footer row under the table,
// same idea as Notion's own bottom-of-column calculate row. Table-wide
// (activeView.calc: { [colId or "__title"]: calcTypeId }), computed live over
// `displayRows` so it reflects the current filter, same as Notion's own
// calc row does. Deliberately a single table-wide footer, not one row per
// group — per-group subtotals would need real per-group state and this
// audit item's own sizing note calls it "mediano", not the largest item.
const CALC_LABELS = {
  count_all: "Contar todos",
  count_empty: "Contar vacíos",
  count_not_empty: "Contar no vacíos",
  sum: "Suma",
  average: "Promedio",
  min: "Mín",
  max: "Máx",
  checked: "Marcadas",
  unchecked: "No marcadas",
  percent_checked: "% marcadas",
};

function calcOptionsForType(type) {
  const common = [
    { id: "count_all", label: "Contar todos" },
    { id: "count_empty", label: "Contar vacíos" },
    { id: "count_not_empty", label: "Contar no vacíos" },
  ];
  if (type === "number") {
    return [...common,
      { id: "sum", label: "Suma" },
      { id: "average", label: "Promedio" },
      { id: "min", label: "Mín" },
      { id: "max", label: "Máx" },
    ];
  }
  if (type === "checkbox") {
    return [...common,
      { id: "checked", label: "Marcadas" },
      { id: "unchecked", label: "No marcadas" },
      { id: "percent_checked", label: "% marcadas" },
    ];
  }
  return common;
}

function calcIsEmpty(row, col) {
  if (col.type === "title") return !row.title || !row.title.trim();
  const prop = (row.properties || []).find((p) => p.id === col.id);
  if (!prop || prop.value == null || prop.value === "") return true;
  if (col.type === "multi_select") return !Array.isArray(prop.value) || prop.value.length === 0;
  return false;
}

function computeCalc(displayRows, col, calcType) {
  const n = displayRows.length;
  if (calcType === "count_all") return String(n);
  if (calcType === "count_empty") return String(displayRows.filter((r) => calcIsEmpty(r, col)).length);
  if (calcType === "count_not_empty") return String(displayRows.filter((r) => !calcIsEmpty(r, col)).length);
  if (col.type === "number" && (calcType === "sum" || calcType === "average" || calcType === "min" || calcType === "max")) {
    const nums = displayRows
      .map((r) => (r.properties || []).find((p) => p.id === col.id))
      .map((p) => (p && typeof p.value === "number" ? p.value : null))
      .filter((v) => v != null);
    if (calcType === "sum") return String(nums.reduce((a, b) => a + b, 0));
    if (calcType === "average") return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "0";
    if (calcType === "min") return nums.length ? String(Math.min(...nums)) : "—";
    if (calcType === "max") return nums.length ? String(Math.max(...nums)) : "—";
  }
  if (col.type === "checkbox" && (calcType === "checked" || calcType === "unchecked" || calcType === "percent_checked")) {
    const checkedCount = displayRows.filter((r) => {
      const p = (r.properties || []).find((pp) => pp.id === col.id);
      return !!(p && p.value);
    }).length;
    if (calcType === "checked") return String(checkedCount);
    if (calcType === "unchecked") return String(n - checkedCount);
    if (calcType === "percent_checked") return n ? `${Math.round((checkedCount / n) * 100)}%` : "0%";
  }
  return "0";
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
      const activeView = schema.views.find((v) => v.id === schema.activeView) || schema.views[0];
      const [viewMenuOpen, setViewMenuOpen] = useState(null);
      const [viewMenuView, setViewMenuView] = useState("main");
      const [viewRenameDraft, setViewRenameDraft] = useState("");
      const viewMenuRef = useRef(null);
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [colMenuOpen, setColMenuOpen] = useState(null);
      const [colMenuView, setColMenuView] = useState("main");
      const [renameDraft, setRenameDraft] = useState("");
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

      const [groupOpen, setGroupOpen] = useState(false);
      const groupRef = useRef(null);
      // Which groups are collapsed — session-only UI state, not persisted
      // to the schema (unlike Notion, which does remember this per view).
      const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

      useEffect(() => {
        if (!groupOpen) return;
        const h = (e) => { if (groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [groupOpen]);

      const toggleGroupCollapsed = (key) => {
        setCollapsedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      };

      // "Calcular" footer popover — one open at a time, same shared-ref
      // outside-click pattern as the column-header "⋮" menu (colMenuOpen).
      // Keyed by column id, or "__title" for the title column's own cell.
      const [calcMenuOpen, setCalcMenuOpen] = useState(null);
      const calcMenuRef = useRef(null);

      useEffect(() => {
        if (!calcMenuOpen) return;
        const h = (e) => { if (calcMenuRef.current && !calcMenuRef.current.contains(e.target)) setCalcMenuOpen(null); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [calcMenuOpen]);

      const setColCalc = (colId, calcType) => {
        const nextCalc = { ...(activeView.calc || {}) };
        if (!calcType) delete nextCalc[colId];
        else nextCalc[colId] = calcType;
        saveView({ calc: nextCalc });
        setCalcMenuOpen(null);
      };

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
            saveView({ titleWidth: finalWidth });
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
        if (!colMenuOpen) return;
        const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(null); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [colMenuOpen]);

      useEffect(() => {
        if (!viewMenuOpen) return;
        const h = (e) => { if (viewMenuRef.current && !viewMenuRef.current.contains(e.target)) setViewMenuOpen(null); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, [viewMenuOpen]);

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

      // Everything view-specific (filter/sort/groupBy/calc/rowHeight/
      // titleWidth) patches the CURRENTLY ACTIVE view only — every other
      // view, and the rows/columns themselves, are untouched.
      const saveView = (patch) => {
        saveSchema({ ...schema, views: schema.views.map((v) => (v.id === activeView.id ? { ...v, ...patch } : v)) });
      };

      const switchView = (viewId) => {
        saveSchema({ ...schema, activeView: viewId });
        // Ephemeral per-view display state — none of this is meaningful
        // once you're looking at a different view's own filter/group/etc.
        setCollapsedGroups(new Set());
        setSelectedIds(new Set());
        setFilterOpen(false);
        setSortOpen(false);
        setGroupOpen(false);
        setCalcMenuOpen(null);
        setColMenuOpen(null);
      };

      // Same "create with a sensible default, then immediately open its own
      // rename popover" pattern addColumn already uses below — no jarring
      // native prompt() for something this central to the feature. Opens
      // straight to the "type" pane (table vs tablero), since picking that
      // is the one decision that actually matters for a brand-new view —
      // exactly how addColumn jumps straight to picking a column's type.
      const addView = () => {
        const view = makeDefaultView(`Vista ${schema.views.length + 1}`);
        saveSchema({ ...schema, views: [...schema.views, view], activeView: view.id });
        setViewMenuOpen(view.id);
        setViewMenuView("type");
        setViewRenameDraft(view.name);
      };

      const openViewMenu = (v) => {
        setViewMenuOpen(v.id);
        setViewMenuView("main");
        setViewRenameDraft(v.name);
      };

      const commitViewRename = (v) => {
        const name = viewRenameDraft.trim();
        if (!name) return;
        saveSchema({ ...schema, views: schema.views.map((x) => (x.id === v.id ? { ...x, name } : x)) });
        setViewMenuOpen(null);
      };

      // Switching a view TO "board" needs a groupBy or it has no lanes to
      // show — auto-pick the first status/select column (col_status, if
      // present, same as a fresh database's own default column) so a new
      // board is never empty and unconfigured. Leaves an already-set
      // groupBy alone (switching back and forth shouldn't reshuffle it).
      const changeViewType = (v, type) => {
        const patch = { type };
        if (type === "board" && !v.groupBy) {
          const groupable = schema.columns.find((c) => c.type === "status" || c.type === "select");
          if (groupable) patch.groupBy = groupable.id;
        }
        saveSchema({ ...schema, views: schema.views.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) });
        setViewMenuOpen(null);
      };

      const deleteView = (v) => {
        if (schema.views.length <= 1) return; // always at least one view — the "+" is the only way to get a second
        if (!window.confirm(`¿Eliminar la vista "${v.name}"? No se puede deshacer.`)) return;
        const remaining = schema.views.filter((x) => x.id !== v.id);
        const nextActive = activeView.id === v.id ? remaining[0].id : schema.activeView;
        saveSchema({ ...schema, views: remaining, activeView: nextActive });
        setViewMenuOpen(null);
      };

      // Matches Notion's own "+" behavior: the column exists in the grid
      // immediately (default type "text", unnamed) — no modal blocks on
      // typing a name first. The same popover used to rename/retype an
      // EXISTING column just opens straight to its "type" pane so the new
      // column's type is one click away, with the rename input still
      // visible above it the whole time.
      const addColumn = () => {
        const id = "col_" + Math.random().toString(36).slice(2, 9);
        const col = { id, name: "", type: "text" };
        saveSchema({ ...schema, columns: [...schema.columns, col] });
        setColMenuOpen(id);
        setColMenuView("type");
        setRenameDraft("");
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
        // Also applies whatever's currently in the rename input — lets a
        // user type a name for a brand-new column and click a type right
        // after, without needing to press Enter first to commit the name.
        // A no-op for the ordinary "change type of an existing, already-
        // named column" flow, since renameDraft is seeded from col.name.
        const name = renameDraft.trim() || col.name;
        const next = { ...col, name, type };
        if (type === "select" || type === "multi_select") { if (!Array.isArray(next.options)) next.options = []; }
        else delete next.options;
        saveSchema({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? next : c)) });
        setColMenuOpen(null);
      };

      // insertAfterId: the row's own gutter "+" (Notion-style, adds a page
      // right where you are, not just at the end) passes the row it was
      // clicked on; the bottom "+ Nueva página" button omits it, keeping
      // its existing append-at-the-end behavior. presetGroupCol/Value: a
      // board lane's own "+ Nueva página" (a card should land in THAT lane
      // already, not in whatever the groupBy column's bare default is).
      const addRow = async (insertAfterId, presetGroupCol, presetGroupValue) => {
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
          value: (presetGroupCol && c.id === presetGroupCol.id) ? presetGroupValue : (PROP_DEFAULTS[c.type] ?? ""),
        }));
        await fetch(`/api/entry/${data.id}/properties`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ properties: seeded }),
        });
        if (insertAfterId) {
          const ids = rowsRef.current.map((r) => r.id);
          const idx = ids.indexOf(insertAfterId);
          ids.splice(idx >= 0 ? idx + 1 : ids.length, 0, data.id);
          await fetch("/api/entry/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
        }
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

      // Board view's card drag — dropping a card into a different lane
      // rewrites its groupBy-column value to that lane's, same underlying
      // write as editing the property directly (setCellValue), just
      // triggered by a drop instead of a click. No-ops for group columns
      // groupKeyToValue can't map back to a value (title, multi_select).
      const handleCardDrop = async (laneKey) => {
        const draggedId = dragRowIdRef.current;
        dragRowIdRef.current = null;
        if (!draggedId || !groupColResolved) return;
        const value = groupKeyToValue(laneKey, groupColResolved);
        if (value === undefined) return;
        const row = rowsRef.current.find((r) => r.id === draggedId);
        if (!row || rowGroupKey(row, groupColResolved) === laneKey) return;
        await setCellValue(draggedId, groupColResolved, value);
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
      // their resize handle (persisted as column.width / activeView.titleWidth);
      // an untouched column defaults to a fixed, content-sized 180px —
      // NOT a flexible 1fr track. 1fr used to fill 100% of the block's
      // width, which meant a table's only unresized column started out
      // rendered many hundreds of pixels wide; dragging its handle by a
      // normal amount barely dented that inflated starting width, so the
      // column stayed almost as wide as before with a big dead-looking
      // gap between its actual content and the true column edge. A fixed
      // default also matches Notion's own tables, which size to their
      // content and don't force-stretch to fill the page.
      const titleWidth = colWidths.__title ?? activeView.titleWidth ?? 220;
      const colTemplate = schema.columns
        .map((c) => {
          const live = colWidths[c.id];
          if (live != null) return `${live}px`;
          return c.width ? `${c.width}px` : "180px";
        })
        .join(" ");
      // Leading 32px track is the outside-the-table gutter (drag handle +
      // per-row "+"), sticky-pinned same as checkbox/title — see renderRow.
      const gridTemplateColumns = `32px 28px ${titleWidth}px ${colTemplate} 32px`;

      const rowHeight = activeView.rowHeight || "small";

      // Filter/sort are derived views over `rows`, never mutate the
      // underlying data or its stored order. A row's real position (used
      // by drag-to-reorder and by the server's own default ordering) is
      // untouched by either — sort only changes DISPLAY order, and only
      // while a sort is actually configured.
      const filterColResolved = activeView.filter ? resolveFilterSortCol(activeView.filter.colId, schema.columns) : null;
      const sortColResolved = activeView.sort ? resolveFilterSortCol(activeView.sort.colId, schema.columns) : null;
      let displayRows = activeView.filter && filterColResolved
        ? rows.filter((r) => rowMatchesFilter(r, activeView.filter, schema.columns))
        : rows;
      if (activeView.sort && sortColResolved) {
        const dir = activeView.sort.dir === "desc" ? -1 : 1;
        displayRows = [...displayRows].sort((a, b) => {
          const av = rowSortValue(a, sortColResolved);
          const bv = rowSortValue(b, sortColResolved);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }

      const renderRow = (row) => (
        <div className="bn-db-grid-row" key={row.id}>
          {/* Outside-the-table gutter (audit follow-up): drag handle "⠿"
              and a per-row "+" (insert a page right after this one), both
              hover-revealed — matches Notion's own row controls living in
              a left margin rather than inside the title cell itself. */}
          <div
            className="bn-db-cell bn-db-gutter-cell"
            // Sticky cells (item #9) each create their own stacking context
            // (position:sticky + z-index), so with every row tied at the
            // same z-index a LATER row's cell paints over an EARLIER row's
            // open "⋮⋮" popover once it visually overflows downward — bump
            // only the row whose menu is actually open above its siblings.
            style={rowMenuOpen === row.id ? { zIndex: 20 } : undefined}
            ref={rowMenuOpen === row.id ? rowMenuRef : null}
          >
            <button className="bn-db-gutter-add" title="Agregar página debajo" onClick={() => addRow(row.id)}>+</button>
            <span
              className="bn-db-row-handle"
              title={dragDisabledReason ? `Clic para más opciones (arrastrar deshabilitado: ${dragDisabledReason})` : "Arrastrar para reordenar, clic para más opciones"}
              draggable={!dragDisabledReason}
              onDragStart={(e) => { dragRowIdRef.current = row.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.id); }}
              onDragEnd={() => { dragRowIdRef.current = null; setDragOverRowId(null); }}
              onClick={(e) => { e.stopPropagation(); setRowMenuOpen((prev) => (prev === row.id ? null : row.id)); }}
            >⠿</span>
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
          >
            <button className="bn-db-open-row" onClick={() => openRow(row.id)}>
              <span className="bn-db-row-icon">{row.icon || "📄"}</span>
              <span className="bn-db-row-title">{row.title || "Sin título"}</span>
            </button>
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
          {/* Structural filler for the trailing 32px track the header's "+"
              add-column button occupies. Without a matching item here, a
              data row only fills 3+N of the grid's 4+N column tracks, and
              CSS grid's sparse auto-placement fills that leftover slot
              with the FOLLOWING row's first cell instead of leaving it
              blank — corrupting every row from the second one on. Empty
              (the old per-row "×" delete button lived here; removed as
              redundant with the "⋮⋮" menu's own Eliminar, but the slot
              itself still has to be filled by something). */}
          <div className="bn-db-cell bn-db-row-actions" />
        </div>
      );

      const filterSortColumns = [{ id: "__title", name: "Nombre" }, ...schema.columns];
      const groupColResolved = activeView.groupBy ? resolveFilterSortCol(activeView.groupBy, schema.columns) : null;
      // Board lanes need every known option present even at 0 cards (a lane
      // has to exist to be draggable-into) — table's own grouped rows don't
      // want that (an empty section is just clutter there), so this only
      // applies when the active view actually IS a board.
      const boardSeedKeys = activeView.type === "board" && groupColResolved
        ? (groupColResolved.type === "status" ? STATUS_OPTIONS
          : groupColResolved.type === "select" ? (groupColResolved.options || []).map((o) => o.label)
          : groupColResolved.type === "checkbox" ? ["No marcada", "Marcada"]
          : null)
        : null;
      const groups = groupColResolved ? groupRows(displayRows, groupColResolved, boardSeedKeys) : null;
      // Manual drag-reorder is disabled whenever a sort OR a grouping is
      // active — both compete with a freely-dragged manual order the same
      // way (grouping additionally has no defined cross-group semantics).
      const dragDisabledReason = activeView.sort
        ? "hay un orden activo"
        : activeView.groupBy
        ? "las filas están agrupadas"
        : null;

      return (
        <div className="bn-database" contentEditable={false}>
          {/* Vistas (audit item #10): tabs over the SAME rows/columns, each
              with its own filter/sort/groupBy/calc/rowHeight/titleWidth.
              Single-tab databases (the common case, and every database
              migrated from the old flat format) render one plain "Tabla"
              tab — no visual clutter until a second view actually exists. */}
          <div className="bn-db-view-tabs">
            {schema.views.map((v) => (
              <div
                className={"bn-db-view-tab" + (v.id === activeView.id ? " active" : "")}
                key={v.id}
                ref={viewMenuOpen === v.id ? viewMenuRef : null}
              >
                <button className="bn-db-view-tab-btn" onClick={() => switchView(v.id)}>
                  <span className="bn-db-view-tab-icon">{viewTypeIcon(v.type)}</span>
                  <span className="bn-db-view-tab-name">{v.name}</span>
                </button>
                {v.id === activeView.id && (
                  <button className="bn-db-view-tab-menu-btn" onClick={() => openViewMenu(v)} title="Opciones de la vista">⋮</button>
                )}
                {viewMenuOpen === v.id && (
                  <div className="bn-db-colmenu-pop" contentEditable={false}>
                    <input
                      className="bn-db-colmenu-rename"
                      value={viewRenameDraft}
                      autoFocus
                      placeholder="Nombre de la vista"
                      onChange={(e) => setViewRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { commitViewRename(v); if (viewMenuView === "type") setViewMenuOpen(null); }
                        if (e.key === "Escape") setViewMenuOpen(null);
                      }}
                    />
                    {viewMenuView === "main" ? (
                      <>
                        <button className="bn-db-colmenu-item" onClick={() => commitViewRename(v)}>Guardar nombre</button>
                        <button className="bn-db-colmenu-item" onClick={() => setViewMenuView("type")}>
                          Cambiar tipo <span className="bn-db-colmenu-current">{(VIEW_TYPES.find((t) => t.id === v.type) || {}).label}</span>
                        </button>
                        {schema.views.length > 1 && (
                          <button className="bn-db-colmenu-item bn-db-colmenu-danger" onClick={() => deleteView(v)}>Eliminar vista</button>
                        )}
                      </>
                    ) : (
                      <>
                        <button className="bn-db-colmenu-back" onClick={() => setViewMenuView("main")}>← Atrás</button>
                        {VIEW_TYPES.map((t) => (
                          <button
                            key={t.id}
                            className={"bn-db-colmenu-item" + (v.type === t.id ? " active" : "")}
                            onClick={() => changeViewType(v, t.id)}
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
            <button className="bn-db-view-tab-add" onClick={addView} title="Nueva vista">+</button>
          </div>
          <div className="bn-db-toolbar">
            <div className="bn-db-toolbar-left">
              <div className="bn-db-filter-wrap" ref={filterRef}>
                <button className={"bn-db-toolbar-btn" + (activeView.filter ? " active" : "")} onClick={() => setFilterOpen((v) => !v)}>
                  Filtro{activeView.filter && filterColResolved ? `: ${filterColResolved.name}` : ""}
                </button>
                {filterOpen && (
                  <div className="bn-db-colmenu-pop bn-db-filter-pop" contentEditable={false}>
                    <select
                      className="bn-db-pop-select"
                      value={activeView.filter?.colId || ""}
                      onChange={(e) => {
                        const colId = e.target.value;
                        saveView({ filter: colId ? { colId, value: "" } : null });
                      }}
                    >
                      <option value="">Sin filtro</option>
                      {filterSortColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {activeView.filter && filterColResolved && (
                      <>
                        {filterColResolved.type === "checkbox" ? (
                          <select
                            className="bn-db-pop-select"
                            value={activeView.filter.value || "checked"}
                            onChange={(e) => saveView({ filter: { ...activeView.filter, value: e.target.value } })}
                          >
                            <option value="checked">Marcada</option>
                            <option value="unchecked">No marcada</option>
                          </select>
                        ) : (filterColResolved.type === "status" || filterColResolved.type === "select" || filterColResolved.type === "multi_select") ? (
                          <select
                            className="bn-db-pop-select"
                            value={activeView.filter.value || ""}
                            onChange={(e) => saveView({ filter: { ...activeView.filter, value: e.target.value } })}
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
                            value={activeView.filter.value || ""}
                            onChange={(e) => saveView({ filter: { ...activeView.filter, value: e.target.value } })}
                          />
                        )}
                        <button className="bn-db-colmenu-item bn-db-colmenu-danger" onClick={() => saveView({ filter: null })}>Quitar filtro</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="bn-db-sort-wrap" ref={sortRef}>
                <button className={"bn-db-toolbar-btn" + (activeView.sort ? " active" : "")} onClick={() => setSortOpen((v) => !v)}>
                  Orden{activeView.sort && sortColResolved ? `: ${sortColResolved.name}` : ""}
                </button>
                {sortOpen && (
                  <div className="bn-db-colmenu-pop bn-db-filter-pop" contentEditable={false}>
                    <select
                      className="bn-db-pop-select"
                      value={activeView.sort?.colId || ""}
                      onChange={(e) => {
                        const colId = e.target.value;
                        saveView({ sort: colId ? { colId, dir: activeView.sort?.dir || "asc" } : null });
                      }}
                    >
                      <option value="">Sin orden (manual)</option>
                      {filterSortColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {activeView.sort && (
                      <>
                        <button
                          className={"bn-db-colmenu-item" + (activeView.sort.dir !== "desc" ? " active" : "")}
                          onClick={() => saveView({ sort: { ...activeView.sort, dir: "asc" } })}
                        >
                          Ascendente
                        </button>
                        <button
                          className={"bn-db-colmenu-item" + (activeView.sort.dir === "desc" ? " active" : "")}
                          onClick={() => saveView({ sort: { ...activeView.sort, dir: "desc" } })}
                        >
                          Descendente
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="bn-db-group-wrap" ref={groupRef}>
                <button className={"bn-db-toolbar-btn" + (activeView.groupBy ? " active" : "")} onClick={() => setGroupOpen((v) => !v)}>
                  Agrupar{groupColResolved ? `: ${groupColResolved.name}` : ""}
                </button>
                {groupOpen && (
                  <div className="bn-db-colmenu-pop bn-db-filter-pop" contentEditable={false}>
                    <select
                      className="bn-db-pop-select"
                      value={activeView.groupBy || ""}
                      onChange={(e) => {
                        const colId = e.target.value;
                        saveView({ groupBy: colId || null });
                        setCollapsedGroups(new Set());
                      }}
                    >
                      <option value="">Sin agrupar</option>
                      {filterSortColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {activeView.groupBy && (
                      <button className="bn-db-colmenu-item bn-db-colmenu-danger" onClick={() => { saveView({ groupBy: null }); setCollapsedGroups(new Set()); }}>
                        Quitar agrupación
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {activeView.type === "table" && (
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
                        onClick={() => { saveView({ rowHeight: rh.id }); setRowHeightOpen(false); }}
                      >
                        {rh.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {activeView.type === "board" ? (
            <div className="bn-db-board">
              {!groups ? (
                <div className="bn-db-board-empty">
                  Elegí una propiedad en "Agrupar" para definir las columnas del tablero.
                </div>
              ) : (
                groups.map(({ key, rows: laneRows }) => (
                  <div className="bn-db-board-lane" key={key}>
                    <div className="bn-db-board-lane-header">
                      <span className="bn-db-board-lane-label">{key}</span>
                      <span className="bn-db-board-lane-count">{laneRows.length}</span>
                    </div>
                    <div
                      className="bn-db-board-lane-cards"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleCardDrop(key); }}
                    >
                      {laneRows.map((row) => (
                        <div
                          className="bn-db-board-card"
                          key={row.id}
                          draggable={groupKeyToValue(key, groupColResolved) !== undefined}
                          onDragStart={(e) => { dragRowIdRef.current = row.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.id); }}
                          onDragEnd={() => { dragRowIdRef.current = null; }}
                          onClick={() => openRow(row.id)}
                        >
                          <div className="bn-db-board-card-head">
                            <span className="bn-db-board-card-title">{row.icon || "📄"} {row.title || "Sin título"}</span>
                            <button
                              className="bn-db-board-card-menu-btn"
                              onClick={(e) => { e.stopPropagation(); setRowMenuOpen((prev) => (prev === row.id ? null : row.id)); }}
                              ref={rowMenuOpen === row.id ? rowMenuRef : null}
                            >⋮</button>
                            {rowMenuOpen === row.id && (
                              <div className="bn-db-colmenu-pop" contentEditable={false} onClick={(e) => e.stopPropagation()}>
                                <button className="bn-db-colmenu-item" onClick={() => { setRowMenuOpen(null); openRow(row.id); }}>Abrir</button>
                                <button className="bn-db-colmenu-item" onClick={() => duplicateRow(row.id)}>Duplicar</button>
                                <button className="bn-db-colmenu-item" onClick={() => copyRowLink(row.id)}>Copiar enlace</button>
                                <button className="bn-db-colmenu-item bn-db-colmenu-danger" onClick={() => { setRowMenuOpen(null); deleteRow(row.id); }}>Eliminar</button>
                              </div>
                            )}
                          </div>
                          {schema.columns.filter((c) => c.id !== activeView.groupBy).length > 0 && (
                            <div className="bn-db-board-card-props">
                              {schema.columns.filter((c) => c.id !== activeView.groupBy).map((c) => {
                                const prop = (row.properties || []).find((p) => p.id === c.id);
                                if (isTagType(c.type)) {
                                  const val = prop ? prop.value : PROP_DEFAULTS[c.type];
                                  const hasVal = c.type === "multi_select" ? Array.isArray(val) && val.length : !!val;
                                  if (!hasVal) return null;
                                  const effectiveProp = { id: c.id, name: c.name, type: c.type, value: val, options: c.options || [] };
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
                                const display = propValueDisplay(prop);
                                if (!display) return null;
                                return <span className="bn-db-board-card-prop" key={c.id}>{display}</span>;
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      className="bn-db-board-lane-add"
                      onClick={() => addRow(undefined, groupColResolved, groupKeyToValue(key, groupColResolved))}
                    >
                      + Nueva página
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
          <div className="bn-db-scroll">
            <div
              className={"bn-database-grid" + (selectedIds.size ? " bn-db-has-selection" : "")}
              style={{ gridTemplateColumns }}
              data-row-height={rowHeight}
            >
            <div className="bn-db-grid-row bn-db-grid-header">
              <div className="bn-db-cell bn-db-gutter-cell" />
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
                    <span className="bn-db-col-name">{c.name || "Propiedad"}</span>
                  </button>
                  <div className="bn-db-resize-handle" onMouseDown={(e) => startResize(e, c.id)} />
                  {colMenuOpen === c.id && (
                    <div className="bn-db-colmenu-pop" contentEditable={false}>
                      <input
                        className="bn-db-colmenu-rename"
                        value={renameDraft}
                        autoFocus
                        placeholder="Nombre de propiedad"
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { renameColumn(c); if (colMenuView === "type") setColMenuOpen(null); }
                          if (e.key === "Escape") setColMenuOpen(null);
                        }}
                      />
                      {colMenuView === "main" ? (
                        <>
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
              {/* Matches Notion: clicking "+" creates the column immediately
                  (see addColumn) and opens the SAME rename/type popover a
                  column's own header uses, rather than a separate modal
                  that blocked column creation on typing a name first. */}
              <div className="bn-database-addcol bn-db-cell">
                <button onClick={addColumn} title="Agregar columna">+</button>
              </div>
            </div>

            {groups ? (
              groups.map(({ key, rows: groupedRows }) => {
                const collapsed = collapsedGroups.has(key);
                return (
                  <Fragment key={key}>
                    <div className="bn-db-grid-row">
                      <button
                        className="bn-db-group-header"
                        onClick={() => toggleGroupCollapsed(key)}
                      >
                        <span className="bn-db-group-toggle">{collapsed ? "▸" : "▾"}</span>
                        <span className="bn-db-group-label">{key}</span>
                        <span className="bn-db-group-count">{groupedRows.length}</span>
                      </button>
                    </div>
                    {!collapsed && groupedRows.map((row) => renderRow(row))}
                  </Fragment>
                );
              })
            ) : (
              displayRows.map((row) => renderRow(row))
            )}
            {!loading && displayRows.length === 0 && (
              <div className="bn-db-grid-row">
                <div className="bn-db-empty">
                  {rows.length === 0 ? "Sin páginas todavía" : "Ninguna página coincide con el filtro"}
                </div>
              </div>
            )}

            {/* "Calcular" footer — one cell per column (plus the title
                column and the checkbox/trailing filler cells) so the grid's
                column-track count matches every other row exactly. Skipping
                any of these cells here would reproduce the same
                auto-placement misalignment bug fixed above for data rows. */}
            <div className="bn-db-grid-row bn-db-grid-footer">
              <div className="bn-db-cell bn-db-gutter-cell" />
              <div className="bn-db-cell bn-db-checkbox-cell" />
              <div
                className="bn-db-title-col bn-db-cell bn-db-calc-cell"
                ref={calcMenuOpen === "__title" ? calcMenuRef : null}
              >
                <button
                  className={"bn-db-calc-btn" + (activeView.calc?.__title ? " active" : "")}
                  onClick={() => setCalcMenuOpen((v) => (v === "__title" ? null : "__title"))}
                >
                  {activeView.calc?.__title
                    ? `${CALC_LABELS[activeView.calc.__title]} ${computeCalc(displayRows, { id: "__title", type: "title" }, activeView.calc.__title)}`
                    : "Calcular"}
                </button>
                {calcMenuOpen === "__title" && (
                  <div className="bn-db-colmenu-pop" contentEditable={false}>
                    <button className={"bn-db-colmenu-item" + (!activeView.calc?.__title ? " active" : "")} onClick={() => setColCalc("__title", null)}>Ninguno</button>
                    {calcOptionsForType("title").map((opt) => (
                      <button
                        key={opt.id}
                        className={"bn-db-colmenu-item" + (activeView.calc?.__title === opt.id ? " active" : "")}
                        onClick={() => setColCalc("__title", opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {schema.columns.map((c) => (
                <div
                  className="bn-db-cell bn-db-calc-cell"
                  key={c.id}
                  ref={calcMenuOpen === c.id ? calcMenuRef : null}
                >
                  <button
                    className={"bn-db-calc-btn" + (activeView.calc?.[c.id] ? " active" : "")}
                    onClick={() => setCalcMenuOpen((v) => (v === c.id ? null : c.id))}
                  >
                    {activeView.calc?.[c.id]
                      ? `${CALC_LABELS[activeView.calc[c.id]]} ${computeCalc(displayRows, c, activeView.calc[c.id])}`
                      : "Calcular"}
                  </button>
                  {calcMenuOpen === c.id && (
                    <div className="bn-db-colmenu-pop" contentEditable={false}>
                      <button className={"bn-db-colmenu-item" + (!activeView.calc?.[c.id] ? " active" : "")} onClick={() => setColCalc(c.id, null)}>Ninguno</button>
                      {calcOptionsForType(c.type).map((opt) => (
                        <button
                          key={opt.id}
                          className={"bn-db-colmenu-item" + (activeView.calc?.[c.id] === opt.id ? " active" : "")}
                          onClick={() => setColCalc(c.id, opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="bn-db-cell bn-db-row-actions" />
            </div>
          </div>
          </div>
          )}
          {selectedIds.size > 0 ? (
            <div className="bn-db-selection-bar" contentEditable={false}>
              <span>{selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}</span>
              <button className="bn-db-selection-clear" onClick={() => setSelectedIds(new Set())}>Cancelar</button>
              <button className="bn-db-selection-delete" onClick={deleteSelected}>Eliminar</button>
            </div>
          ) : activeView.type === "table" ? (
            <button className="bn-database-addrow" onClick={addRow}>+ Nueva página</button>
          ) : null}
        </div>
      );
    },
  },
);
