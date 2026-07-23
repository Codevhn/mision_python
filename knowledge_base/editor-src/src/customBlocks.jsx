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
// input. date stays a click-through to the peek for now (needs the same
// date-picker treatment as the props panel).
function isInlineEditable(type) {
  return type === "text" || type === "number" || type === "url" || type === "checkbox";
}

function isTagType(type) {
  return type === "status" || type === "select" || type === "multi_select";
}

function propValueDisplay(prop) {
  if (!prop) return "";
  if (prop.type === "multi_select") return Array.isArray(prop.value) ? prop.value.join(", ") : "";
  return prop.value != null ? String(prop.value) : "";
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
      const pageId = window._currentEntryId;

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
      const gridTemplateColumns = `${titleWidth}px ${colTemplate} 32px`;

      return (
        <div className="bn-database" contentEditable={false}>
          <div className="bn-database-grid" style={{ gridTemplateColumns }}>
            <div className="bn-db-grid-row bn-db-grid-header">
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

            {rows.map((row) => (
              <div className="bn-db-grid-row" key={row.id}>
                <div className="bn-db-title-col bn-db-cell">
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
                <div className="bn-db-row-actions bn-db-cell">
                  <button className="bn-db-row-del" title="Eliminar página" onClick={() => deleteRow(row.id)}>×</button>
                </div>
              </div>
            ))}
            {!loading && rows.length === 0 && (
              <div className="bn-db-grid-row">
                <div className="bn-db-empty">Sin páginas todavía</div>
              </div>
            )}
          </div>
          <button className="bn-database-addrow" onClick={addRow}>+ Nueva página</button>
        </div>
      );
    },
  },
);
