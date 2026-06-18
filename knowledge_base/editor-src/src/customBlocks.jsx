import { createReactBlockSpec } from "@blocknote/react";

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
// Minimal embedded table backed by a JSON prop. Mirrors the legacy
// ":::database\n{json}\n:::" block. cols: [{id,name}], rows: [{id,cells:{colId:value}}]
function parseData(raw) {
  try {
    const d = JSON.parse(raw || "{}");
    if (d && Array.isArray(d.cols) && Array.isArray(d.rows)) return d;
  } catch (_) {}
  return { cols: [{ id: "c0", name: "Nombre" }, { id: "c1", name: "Estado" }], rows: [{ id: "r0", cells: { c0: "", c1: "" } }] };
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
      const data = parseData(block.props.data);

      const save = (next) => {
        editor.updateBlock(block, { props: { data: JSON.stringify(next) } });
      };

      const setCell = (rowId, colId, value) => {
        const next = { ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)) };
        save(next);
      };

      const setColName = (colId, name) => {
        const next = { ...data, cols: data.cols.map((c) => (c.id === colId ? { ...c, name } : c)) };
        save(next);
      };

      const addRow = () => {
        const id = "r" + Math.random().toString(36).slice(2, 9);
        const cells = {};
        data.cols.forEach((c) => (cells[c.id] = ""));
        save({ ...data, rows: [...data.rows, { id, cells }] });
      };

      const addCol = () => {
        const id = "c" + Math.random().toString(36).slice(2, 9);
        const next = {
          cols: [...data.cols, { id, name: "Nueva" }],
          rows: data.rows.map((r) => ({ ...r, cells: { ...r.cells, [id]: "" } })),
        };
        save(next);
      };

      return (
        <div className="bn-database" contentEditable={false}>
          <table className="bn-database-table">
            <thead>
              <tr>
                {data.cols.map((c) => (
                  <th key={c.id}>
                    <input value={c.name} onChange={(e) => setColName(c.id, e.target.value)} />
                  </th>
                ))}
                <th className="bn-database-addcol">
                  <button onClick={addCol}>+</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  {data.cols.map((c) => (
                    <td key={c.id}>
                      <input value={r.cells[c.id] || ""} onChange={(e) => setCell(r.id, c.id, e.target.value)} />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <button className="bn-database-addrow" onClick={addRow}>+ fila</button>
        </div>
      );
    },
  },
);
