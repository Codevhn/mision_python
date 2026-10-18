// Source identity belongs to the serialized block, never to a transient block ID.
export const newDatabaseId = () => `db_${crypto.randomUUID().replaceAll("-", "")}`;
export const newDatabaseData = () => JSON.stringify({ database_id: newDatabaseId(), identity_version: 1 });
export const editorDatabaseContext = new WeakMap();

// A copied independent block gets a new source; tabs inside a block keep theirs.
// Prefer the original block even when the copy was inserted before it.
export function duplicateIdentityRepairs(blocks, previous = new Map()) {
  const databases = [];
  const visit = (items) => items.forEach((block) => {
    if (block.type === "database") {
      try {
        const data = JSON.parse(block.props.data);
        if (data.database_id) databases.push({ block, data });
      } catch (_) { /* Invalid legacy schemas are left for the migration report. */ }
    }
    if (block.children?.length) visit(block.children);
  });
  visit(blocks);
  databases.sort((a, b) => Number(previous.get(b.block.id) === b.data.database_id) - Number(previous.get(a.block.id) === a.data.database_id));
  const seen = new Set();
  const repairs = [];
  for (const { block, data } of databases) {
    if (seen.has(data.database_id)) {
      data.database_id = newDatabaseId();
      repairs.push({ id: block.id, data: JSON.stringify(data) });
    }
    seen.add(data.database_id);
  }
  return { repairs, identities: new Map(databases.map(({ block, data }) => [block.id, data.database_id])) };
}
