import React, { useState, useEffect } from 'react';
import { moveOption } from './databasePropertyValues.js';
import { Popover, MenuItem, Cell, IconButton } from './databaseUI.jsx';
import { FormField } from './databaseViews.jsx';
import { PROPERTY_TYPES, optionsFor, clone, uid, api, COMPUTED } from './databaseModel.js';
export function PropertyConfig({
  anchor,
  col,
  schema,
  base,
  onSave,
  onClose,
  onBack
}) {
  const [draft, setDraft] = useState(() => ({
    ...clone(col),
    options: clone(optionsFor(col)).map(o => ({
      ...o,
      _original: o.label
    })),
    groups: col.groups?.length ? clone(col.groups) : ['Pendiente', 'En progreso', 'Completado'].map((name, i) => ({
      id: String(i),
      name
    }))
  }));
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = patch => setDraft(d => ({
    ...d,
    ...patch
  }));
  useEffect(() => {
    api('/api/databases/catalog').then(data => setCatalog(data.sources)).catch(e => setError(e.message));
  }, []);
  const target = catalog.find(s => s.id === draft.target_database && s.parent_id === draft.target_parent);
  const relations = schema.columns.filter(c => c.type === 'relation');
  const rollupRelation = relations.find(c => c.id === draft.relation_id);
  const rollupTarget = catalog.find(s => s.id === rollupRelation?.target_database && s.parent_id === rollupRelation?.target_parent);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const allowed = ['name', 'options', 'groups', 'expression', 'relation_id', 'target_property', 'aggregation', 'target_parent', 'target_database', 'prefix', 'action', 'number_format', 'date_format', 'time_format'];
      const patch = Object.fromEntries(allowed.filter(k => draft[k] !== undefined).map(k => [k, draft[k]]));
      if (!['status', 'select', 'multi_select'].includes(col.type)) delete patch.options;
      if(col.type!=='date'){delete patch.date_format;delete patch.time_format;}
      const renames = {};
      optionsFor(col).forEach((option, i) => {
        const current = draft.options.find(o => o._original === option.label);
        if (current && option.label !== current.label) renames[option.label] = current.label;
      });
      if (patch.options) patch.options = patch.options.map(({
        _original,
        ...option
      }) => option);
      await onSave({
        operation: 'configure',
        column_id: col.id,
        patch,
        renames
      });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const select = (label, key, items, empty = 'Seleccionar…') => <label>{label}<select aria-label={label} value={draft[key] || ''} onChange={e => set({
      [key]: e.target.value
    })}><option value="">{empty}</option>{items.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  return <Popover anchor={anchor} wide label={'Configurar ' + col.name} onClose={onClose} onBack={onBack}>
    <div className="adb-popover-title">Editar propiedad · {PROPERTY_TYPES.find(([id]) => id === col.type)?.[1]}</div>
    <label>Nombre<input autoFocus value={draft.name} onChange={e => set({
        name: e.target.value
      })} /></label>
    {['select', 'multi_select', 'status'].includes(col.type) && <>
      {col.type === 'status' && <div className="adb-status-groups">{draft.groups.map((group, i) => <label key={group.id}>Grupo {i + 1}<input value={group.name} onChange={e => set({
            groups: draft.groups.map((g, n) => n === i ? {
              ...g,
              name: e.target.value
            } : g),
            options: draft.options.map(o => o.group === group.name ? {
              ...o,
              group: e.target.value
            } : o)
          })} /></label>)}</div>}
      <div className="adb-options-editor">{draft.options.map((option, i) => <div className="adb-option-editor" key={option.id || option._original || i}>
        <input type="color" aria-label={'Color de ' + option.label} value={option.color || '#888888'} onChange={e => set({
            options: draft.options.map((o, n) => n === i ? {
              ...o,
              color: e.target.value
            } : o)
          })} />
        <input aria-label={'Opción ' + (i + 1)} value={option.label} onChange={e => set({
            options: draft.options.map((o, n) => n === i ? {
              ...o,
              _original: o._original || option.label,
              label: e.target.value
            } : o)
          })} />
        {col.type === 'status' && <select aria-label={'Grupo de ' + option.label} value={option.group || 'Pendiente'} onChange={e => set({
            options: draft.options.map((o, n) => n === i ? {
              ...o,
              group: e.target.value
            } : o)
          })}>{draft.groups.map(g => <option key={g.id}>{g.name}</option>)}</select>}
        <span className="adb-option-order"><IconButton icon="up" label={'Subir opción '+option.label} disabled={i===0||busy} onClick={()=>set({options:moveOption(draft.options,i,-1)})}/><IconButton icon="down" label={'Bajar opción '+option.label} disabled={i===draft.options.length-1||busy} onClick={()=>set({options:moveOption(draft.options,i,1)})}/></span>
        <button type="button" title="Retirar opción; se conservan los valores existentes" onClick={() => set({
            options: draft.options.filter((_, n) => n !== i)
          })}>×</button>
      </div>)}</div>
      <MenuItem icon="plus" label="Añadir opción" onClick={() => set({
        options: [...draft.options, {
          id: uid(),
          label: 'Nueva opción ' + (draft.options.length + 1),
          color: '#888888',
          ...(col.type === 'status' ? {
            group: 'Pendiente'
          } : {})
        }]
      })} />
      <p className="adb-help">Renombrar actualiza los registros. Retirar una opción conserva sus valores antiguos; puedes volver a añadirla.</p>
    </>}
    {col.type === 'relation' && <label>Base de destino<select value={draft.target_database ? draft.target_parent+'/'+draft.target_database : ''} onChange={e => {
        const selected = catalog.find(s => s.parent_id+'/'+s.id === e.target.value);
        set({
          target_database: selected?.id || '',
          target_parent: selected?.parent_id || ''
        });
      }}><option value="">Seleccionar base…</option>{catalog.map(s => <option key={s.parent_id+'/'+s.id} value={s.parent_id+'/'+s.id}>{s.name} · {s.id.slice(-5)}</option>)}</select></label>}
    {col.type === 'rollup' && <>{select('Relación', 'relation_id', relations.map(c => [c.id, c.name]))}{select('Propiedad de destino', 'target_property', (rollupTarget?.columns || []).map(c => [c.id, c.name]))}{select('Cálculo', 'aggregation', [['count', 'Contar registros'], ['sum', 'Suma'], ['average', 'Promedio'], ['min', 'Mínimo'], ['max', 'Máximo']])}</>}
    {col.type === 'formula' && <><label>Expresión<textarea value={draft.expression || ''} onChange={e => set({
          expression: e.target.value
        })} placeholder={'prop("Calificación") * 2'} /></label><p className="adb-help">Aritmética + − * / %, prop("Nombre"), concat, round, length e ifelse. Las dependencias se recalculan al consultar los registros. No admite código ni toda la sintaxis de Notion.</p></>}
    {col.type === 'id' && <label>Prefijo<input value={draft.prefix || 'AT'} onChange={e => set({
        prefix: e.target.value
      })} /></label>}
    {col.type === 'date' && <>{select('Formato de fecha','date_format',[['locale','Local · 18 oct 2026'],['iso','ISO · 2026-10-18'],['long','Largo · 18 de octubre de 2026']],'Local · predeterminado')}{select('Formato de hora','time_format',[['24','24 horas'],['12','12 horas']],'24 horas · predeterminado')}<p className="adb-help">Sólo cambia la presentación de esta propiedad. Conserva el valor ISO, zona y ambos extremos; filtros y orden usan el inicio del rango.</p></>}
    {col.type === 'number' && select('Formato', 'number_format', [['number', 'Número'], ['percent', 'Porcentaje'], ['currency', 'Moneda (USD)']])}
    {col.type === 'button' && <><p className="adb-help">Acción local: actualizar una propiedad de este registro.</p><label>Propiedad<select value={draft.action?.property || ''} onChange={e => set({
          action: {
            type: 'set',
            property: e.target.value,
            value: ''
          }
        })}><option value="">Seleccionar…</option>{schema.columns.filter(c => !COMPUTED.has(c.type) && c.type !== 'button').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{schema.columns.some(c => c.id === draft.action?.property) && <label>Valor<FormField col={schema.columns.find(c => c.id === draft.action.property)} value={draft.action?.value} onChange={value => set({
          action: {
            ...draft.action,
            type: 'set',
            value
          }
        })} /></label>}</>}
    {col.type === 'person' && <p className="adb-help">Atlas usa autenticación de un propietario. Se puede asignar «Propietario»; no se simula un directorio de miembros.</p>}
    {col.type === 'place' && <p className="adb-help">Nombre y coordenadas geográficas. La vista Mapa usa esas coordenadas; no incluye búsqueda geográfica externa.</p>}
    {['created_time', 'edited_time', 'created_by', 'edited_by'].includes(col.type) && <p className="adb-help">Valor automático de Atlas. Los registros antiguos sin fecha conservan ese campo vacío; no se inventan fechas históricas.</p>}
    {error && <p className="adb-error" role="alert">{error}</p>}
    <div className="adb-popover-footer"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="adb-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
  </Popover>;
}
