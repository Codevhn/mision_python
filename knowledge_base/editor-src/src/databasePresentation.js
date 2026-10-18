// The redesign stays opt-in until the first functional table is reviewed.
export const TABLE_PREVIEW = 'notion-table-v1';
export const isTablePreview = (schema, view) => schema.presentation_preview === TABLE_PREVIEW && (!view.type || view.type === 'table');
export function previewNumberValue(raw) {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : '';
}
