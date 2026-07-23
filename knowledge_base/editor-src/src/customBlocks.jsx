import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useState, useCallback } from "react";

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
// select/multi_select/status/date need the real popovers from properties.js,
// so those cells are read-only here — click opens the peek to edit them.
function isInlineEditable(type) {
  return type === "text" || type === "number" || type === "url" || type === "checkbox";
}

function propValueDisplay(prop) {
  if (!prop) return "";
  if (prop.type === "multi_select") return Array.isArray(prop.value) ? prop.value.join(", ") : "";
  return prop.value != null ? String(prop.value) : "";
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
      const pageId = window._currentEntryId;

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
        saveSchema({ ...schema, columns: [...schema.columns, { id, name, type: newColType }] });
        setNewColName("");
        setNewColType("text");
        setAddColOpen(false);
      };

      const removeColumn = (colId) => {
        saveSchema({ ...schema, columns: schema.columns.filter((c) => c.id !== colId) });
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
          value: PROP_DEFAULTS[c.type] ?? "", options: c.options,
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

      const setCellValue = async (row, col, value) => {
        const rowProps = Array.isArray(row.properties) ? [...row.properties] : [];
        const idx = rowProps.findIndex((p) => p.name === col.name);
        if (idx >= 0) rowProps[idx] = { ...rowProps[idx], value };
        else rowProps.push({ id: col.id, name: col.name, type: col.type, value, options: col.options });
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, properties: rowProps } : r)));
        await fetch(`/api/entry/${row.id}/properties`, {
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
      const gridTemplateColumns = `220px repeat(${schema.columns.length}, minmax(120px, 1fr)) 32px`;

      return (
        <div className="bn-database" contentEditable={false}>
          <div className="bn-database-grid" style={{ gridTemplateColumns }}>
            <div className="bn-db-grid-row bn-db-grid-header">
              <div className="bn-db-title-col bn-db-cell">Nombre</div>
              {schema.columns.map((c) => (
                <div className="bn-db-cell" key={c.id}>
                  <span className="bn-db-col-name">{c.name}</span>
                  <button className="bn-db-col-del" title="Quitar columna" onClick={() => removeColumn(c.id)}>×</button>
                </div>
              ))}
              <div className="bn-database-addcol bn-db-cell">
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
                  const prop = (row.properties || []).find((p) => p.name === c.name);
                  const editable = isInlineEditable(c.type);
                  if (c.type === "checkbox") {
                    return (
                      <div className="bn-db-cell" key={c.id}>
                        <input
                          type="checkbox"
                          checked={!!(prop && prop.value)}
                          onChange={(e) => setCellValue(row, c, e.target.checked)}
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
                          onChange={(e) => setCellValue(row, c, c.type === "number" ? (parseFloat(e.target.value) || "") : e.target.value)}
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
