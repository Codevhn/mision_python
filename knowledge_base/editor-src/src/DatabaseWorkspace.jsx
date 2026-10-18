import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DatabaseIcon as Icon } from './databaseIcons.jsx';
import { editorDatabaseContext } from './databaseIdentity.js';
import { normalizeSchema, columnsForView, moveViewColumn, clone, uid, api, VIEW_TYPES, PROPERTY_TYPES, COMPUTED, optionsFor, valueOf, displayValue, filteredRows, groupRows, aggregate } from './databaseModel.js';
import { IconButton, MenuItem, Popover, Cell, CellValue, TypePicker, notifyDatabase, flushDatabaseEditors } from './databaseUI.jsx';
import { PropertyConfig } from './databasePropertyConfig.jsx';
import { ViewConfig } from './databaseViewConfig.jsx';
import { DatabaseAlternateView } from './databaseViews.jsx';
import {defaultFilterOperator,storedFilterOperations} from './databaseFilters.js';
import {PropertyFilterValue} from './PropertyFilterValue.jsx';
import {FilterRules} from './FilterRules.jsx';
import {localFilterZone,validateFilterTree} from './databaseFilters.js';
export function DatabaseWorkspace({
  block,
  editor
}) {
  const initial = () => normalizeSchema(JSON.parse(block.props.data || '{}'));
  const [schema, setSchema] = useState(initial);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [legacyRows, setLegacyRows] = useState([]);
  const [menu, setMenu] = useState(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(0);
  const [draftView, setDraftView] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [conversion, setConversion] = useState(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const context = editorDatabaseContext.get(editor);
  const parent = context?.pageId;
  const databaseId = schema.database_id;
  const base = `/api/databases/${parent}/${databaseId}`;
  const view = draftView || schema.views.find(v => v.id === schema.activeView) || schema.views[0];
  const shown = filteredRows(rows, view, search);
  const cols = columnsForView(schema,view);
  const install = next => {
    setSchema(normalizeSchema(next));
    editor.updateBlock(block, {
      props: {
        data: JSON.stringify(next)
      }
    });
  };
  const reload = useCallback(async () => {
    if (!parent) return;
    try {
      let data;
      try { data=await api(base); }
      catch(error){
        if(error.status!==400||!error.message.includes('no está guardada')||!context?.flush)throw error;
        // A newly inserted/copied block has its own ID before its parent has
        // autosaved. Persist that editor first, then connect the new source.
        await context.flush();data=await api(base);
      }
      if (mounted.current) {
        const current=editor.getBlock(block.id);
        const saved=JSON.parse(current?.props.data||'{}');
        if((data.schema._schema_version||0)>(saved._schema_version||0)){
          editor.updateBlock(block.id,{props:{data:JSON.stringify(data.schema)}});
        }
        setRows(data.rows);
        setSchema(normalizeSchema(data.schema));
        setError('');
      }
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [base, parent]);
  useEffect(() => {
    const warn = e => {
      if (saving > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);
  useEffect(() => {
    mounted.current = true;
    reload();
    if (parent) api(`/api/entry/${parent}/children?database_id=__legacy__`).then(items => {
      if (mounted.current) setLegacyRows(items.filter(r => r.db_row));
    }).catch(() => {});
    const listener = e => {
      if (e.detail === base) reload();
    };
    window.addEventListener('atlas:database-changed', listener);
    return () => {
      mounted.current = false;
      window.removeEventListener('atlas:database-changed', listener);
    };
  }, [reload]);
  // Other schema instances are not copied: the serialized source identity stays
  // the same when changing a tab or previewing a new representation.
  const mutate = payload => {
    setSaving(n => n + 1);
    const operation = queue.current.catch(() => {}).then(async () => {
      // Configuration writes share this schema queue and are themselves
      // tracked for navigation. Flush cells here, without waiting recursively
      // on a configuration queued behind this mutation.
      await flushDatabaseEditors({configurations:false});
      await context?.flush?.({configurations:false});
      const current = await api(base);
      const body = typeof payload === 'function' ? payload(clone(current.schema)) : payload;
      const result = await api(base, {
        ...body,
        revision: current.revision
      });
      if (mounted.current) {
        install(result.schema);
        await reload();
      }
      notifyDatabase(base);
      return result;
    });
    queue.current = operation;
    operation.finally(() => {
      if (mounted.current) setSaving(n => n - 1);
    }).catch(() => {});
    operation.catch(e => {
      setError(e.message);
      if (e.pending) setConversion({
        payload,
        pending: e.pending
      });
    });
    return operation;
  };
  const updateView = patch => {
    if (draftView) {
      setDraftView(v => ({
        ...v,
        ...patch
      }));
      return Promise.resolve();
    }
    const viewId = view.id;
    // Optimistic rendering is limited to presentation; the queued write merges
    // each change with the latest saved schema and keeps all other view settings.
    setSchema(s => ({
      ...s,
      views: s.views.map(v => v.id === viewId ? {
        ...v,
        ...patch
      } : v)
    }));
    return mutate(current => ({
      operation: 'schema',
      schema: {
        ...current,
        views: current.views.map(v => v.id === viewId ? {
          ...v,
          ...patch
        } : v)
      }
    }));
  };
  const switchView = async id => {
    if(id===schemaRef.current.activeView&&!draftView){setMenu(null);return;}
    await flushDatabaseEditors();
    setDraftView(null);
    setSchema(s => ({
      ...s,
      activeView: id
    }));
    mutate(current => ({
      operation: 'schema',
      schema: {
        ...current,
        activeView: id
      }
    })).catch(() => {});
    setMenu(null);
  };
  const onRow = row => setRows(items => items.map(item => item.id === row.id ? row : item));
  const openRow = row => {
    if (view.openMode === 'page') window._loadEntryById?.(row.id);else window._openPagePeek?.(row.id, {
      databasePreview: true,
      mode:view.openMode==='center'?'center':'side',
      recordIds:shown.map(record=>record.id),
      onClose: reload
    });
  };
  const addRow = async (values = {}, title = 'Sin título', open = true) => {
    try {
      await context?.flush?.();
      const result = await api(base + '/rows', {
        title,
        values
      }, 'POST');
      await reload();
      notifyDatabase(base);
      if (open) openRow(result.row);
      return result.row;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };
  const chooseType = async column => {
    const action = menu.kind === 'changeType' ? {
      operation: 'convert',
      column_id: menu.col.id,
      type: column.type
    } : {
      operation: 'add',
      column,
      position: menu.position ?? schema.columns.length
    };
    setMenu(null);
    try {
      const result = await mutate(action);
      if (action.operation === 'add') {
        const created = result.schema.columns.find(c => !schema.columns.some(old => old.id === c.id));
        if (created) setMenu({
          kind: 'configure',
          col: created,
          anchor: menu.anchor
        });
      }
    } catch {}
  };
  const headerMenu = (event, col) => setMenu({
    kind: 'column',
    col,
    anchor: event.currentTarget
  });
  const setViewOption = (key, value) => updateView({
    [key]: value
  }).catch(() => {});
  const startResize = (event, col) => {
    event.preventDefault();
    event.stopPropagation();
    const x = event.clientX;
    const start = col.id === 'title' ? view.titleWidth || 250 : view.widths?.[col.id] || col.width || 160;
    let width = start;
    const move = e => {
      width = Math.max(90, start + e.clientX - x);
      setSchema(s => ({
        ...s,
        views: s.views.map(v => v.id === view.id ? {
          ...v,
          ...(col.id === 'title' ? {
            titleWidth: width
          } : {
            widths: {
              ...v.widths,
              [col.id]: width
            }
          })
        } : v)
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      updateView(col.id === 'title' ? {
        titleWidth: width
      } : {
        widths: {
          ...view.widths,
          [col.id]: width
        }
      }).catch(() => {});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, {
      once: true
    });
  };
  const saveNewView = async () => {
    try {
      const created = clone(draftView);
      await mutate(current => ({
        operation: 'schema',
        schema: {
          ...current,
          views: [...current.views, created],
          activeView: created.id
        }
      }));
      setDraftView(null);
      setConfigOpen(false);
    } catch {}
  };
  const groupCol = view.groupBy === 'title' ? {
    id: 'title',
    type: 'title',
    name: schema.titleName || 'Nombre'
  } : schema.columns.find(c => c.id === view.groupBy);
  const groups = view.type === 'table' && groupCol ? groupRows(shown, groupCol) : [['', shown]];
  const titleCol = {
    id: 'title',
    name: schema.titleName || 'Nombre',
    type: 'title'
  };
  const widths = [38, view.titleWidth || 250, ...cols.map(c => view.widths?.[c.id] || c.width || 160), 44];
  const template = widths.map(w => w + 'px').join(' ');
  const frozenStyle = id => {
    if (id === 'title' && view.freezeTitle !== false) return {
      position: 'sticky',
      left: 38,
      zIndex: 2
    };
    if (!(view.frozen || []).includes(id)) return {};
    const index = cols.findIndex(c => c.id === id);
    return {
      position: 'sticky',
      left: 38 + (view.titleWidth || 250) + cols.slice(0, index).filter(c => (view.frozen || []).includes(c.id)).reduce((sum, c) => sum + (view.widths?.[c.id] || c.width || 160), 0),
      zIndex: 2
    };
  };
  const table = <div onKeyDown={event=>{
    if(!event.currentTarget.contains(event.target)||!event.target.matches('.adb-cell-value')||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const row=event.target.closest('.adb-table-row');if(!row)return;
    const rows=[...event.currentTarget.querySelectorAll('.adb-table-row')];let y=rows.indexOf(row);
    const cells=[...row.querySelectorAll('.adb-cell-value')];let x=cells.indexOf(event.target);
    if(event.key==='Home')x=0;else if(event.key==='End')x=cells.length-1;
    else if(event.key==='ArrowLeft')x=Math.max(0,x-1);else if(event.key==='ArrowRight')x=Math.min(cells.length-1,x+1);
    else y=Math.max(0,Math.min(rows.length-1,y+(event.key==='ArrowDown'?1:-1)));
    const next=rows[y]?.querySelectorAll('.adb-cell-value')[x];
    if(next){event.preventDefault();next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'});}
  }} className={'adb-table-scroll ' + (view.wrap ? 'wrap' : '')} style={{
    '--adb-row-height': view.rowHeight === 'large' ? '52px' : view.rowHeight === 'medium' ? '42px' : '36px'
  }}>
    <div className="adb-table" role="table" aria-label={view.name} style={{
      width: widths.reduce((a, b) => a + b, 0),
      minWidth: '100%'
    }}>
      <div className="adb-grid adb-table-head" role="row" style={{
        gridTemplateColumns: template
      }}>
        <div className="adb-selection-cell"><input type="checkbox" aria-label="Seleccionar todos los registros" checked={!!shown.length && shown.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(shown.map(r => r.id)) : new Set())} /></div>
        {[titleCol, ...cols].map(col => <div key={col.id} className="adb-header-cell" role="columnheader" style={frozenStyle(col.id)} onDragOver={e=>{if([...e.dataTransfer.types].includes('application/atlas-column'))e.preventDefault();}} onDrop={e=>{
          if(![...e.dataTransfer.types].includes('application/atlas-column'))return;
          e.preventDefault();e.stopPropagation();
          try{const data=JSON.parse(e.dataTransfer.getData('application/atlas-column'));if(data.databaseId!==databaseId||data.viewId!==view.id)return;
            const rect=e.currentTarget.getBoundingClientRect();setViewOption('columnOrder',moveViewColumn(schema,view,data.id,col.id,col.id!=='title'&&e.clientX>rect.left+rect.width/2));
          }catch{}
        }}>
          <button type="button" draggable={col.id!=='title'} onDragStart={e=>{if(col.id==='title')return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/atlas-column',JSON.stringify({databaseId,viewId:view.id,id:col.id}));}} title={col.id==='title'?'Menú de propiedad':'Arrastra para ordenar sólo en esta vista'} onClick={e => headerMenu(e, col)} aria-label={'Menú de ' + col.name} aria-haspopup="dialog" aria-expanded={menu?.col?.id===col.id&&['column','configure','changeType','filter','calculate','addProperty'].includes(menu.kind)}><Icon type={col.type} /><span>{col.name}</span><span className="adb-header-chevron">⌄</span></button>
          <span className="adb-column-resizer" onPointerDown={e => startResize(e, col)} />
        </div>)}
        <IconButton icon="plus" label="Añadir propiedad" aria-haspopup="dialog" aria-expanded={menu?.kind==='addProperty'} onClick={e => setMenu({
          kind: 'addProperty',
          anchor: e.currentTarget
        })} />
      </div>
      {groups.map(([name, items]) => <React.Fragment key={name}>
        {name && <div className="adb-table-group"><TagLabel col={groupCol} value={name} /><span>{items.length}</span></div>}
        {items.map(row => <div className={'adb-grid adb-table-row' + (selected.has(row.id) ? ' selected' : '')} role="row" key={row.id} style={{
          gridTemplateColumns: template
        }}>
          <div className="adb-selection-cell"><input type="checkbox" aria-label={'Seleccionar ' + row.title} checked={selected.has(row.id)} onChange={e => setSelected(old => {
              const next = new Set(old);
              e.target.checked ? next.add(row.id) : next.delete(row.id);
              return next;
            })} /></div>
          <div className={'adb-title-cell' + ((view.wrapped || []).includes('title') ? ' wrapped' : '')} role="cell" style={frozenStyle('title')}><Cell row={row} col={titleCol} base={base} onRow={onRow} /><button type="button" className="adb-open" title="Abrir en Peek lateral" aria-label={'Abrir ' + row.title} onClick={() => openRow(row)}><Icon type="open" /> OPEN</button><IconButton icon="more" label={'Opciones de ' + row.title} onClick={e => setMenu({
              kind: 'row',
              row,
              anchor: e.currentTarget
            })} /></div>
          {cols.map(col => <div className={'adb-data-cell' + ((view.wrapped || []).includes(col.id) ? ' wrapped' : '')} key={col.id} role="cell" style={frozenStyle(col.id)}><Cell row={row} col={col} base={base} onRow={onRow} /></div>)}<div />
        </div>)}
      </React.Fragment>)}
      <button className="adb-new-row" type="button" onClick={() => addRow().catch(() => {})}>＋ Nueva página</button>
      {[titleCol, ...cols].some(c => view.calculations?.[c.id]) && <div className="adb-grid adb-calculations" style={{
        gridTemplateColumns: template
      }}><div /><button type="button" onClick={e => setMenu({
          kind: 'calculate',
          col: titleCol,
          anchor: e.currentTarget
        })}>{view.calculations?.title ? `${view.calculations.title} ${aggregate(shown, 'title', view.calculations.title)}` : 'Calcular'}</button>{cols.map(col => <button key={col.id} type="button" onClick={e => setMenu({
          kind: 'calculate',
          col,
          anchor: e.currentTarget
        })}>{view.calculations?.[col.id] ? `${view.calculations[col.id]} ${aggregate(shown, col, view.calculations[col.id])}` : 'Calcular'}</button>)}<div /></div>}
    </div>
  </div>;
  return <div className="adb-workspace" contentEditable={false} data-database-id={databaseId} onKeyDown={e => e.stopPropagation()}>
    <div className="adb-toolbar">
      <div className="adb-tabs" role="tablist" aria-label="Vistas de la base de datos" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||draftView)return;
        const tabs=[...event.currentTarget.querySelectorAll('[role="tab"]')];const index=tabs.indexOf(event.target);if(index<0)return;
        event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].focus();switchView(schema.views[next].id).catch(e=>setError(e.message));
      }}>
        {schema.views.map(v => <button type="button" role="tab" aria-selected={!draftView && v.id === view.id} key={v.id} className={v.id === view.id ? 'active' : ''} onClick={() => switchView(v.id).catch(e => setError(e.message))} onContextMenu={e => {
          e.preventDefault();
          setMenu({
            kind: 'viewMenu',
            view: v,
            anchor: e.currentTarget
          });
        }}><Icon type={v.type} />{v.name}</button>)}
        {draftView && <button className="active" role="tab" aria-selected="true"><Icon type={draftView.type} />{draftView.name}</button>}
        <IconButton icon="plus" label="Añadir vista" aria-haspopup="dialog" aria-expanded={menu?.kind==='newView'} onClick={e => setMenu({
          kind: 'newView',
          anchor: e.currentTarget
        })} />
      </div>
      <div className="adb-toolbar-actions">
        {view.type!=='form'&&<><IconButton icon="filter" label="Filtrar" aria-haspopup="dialog" aria-expanded={menu?.kind==='filter'} active={!!(view.filters?.length || view.filter?.colId)} onClick={e => setMenu({
          kind: 'filter',
          anchor: e.currentTarget
        })} />
        <IconButton icon="sort" label="Ordenar" aria-haspopup="dialog" aria-expanded={menu?.kind==='sort'} active={!!(view.sorts?.length || view.sort?.colId)} onClick={e => setMenu({
          kind: 'sort',
          anchor: e.currentTarget
        })} />
        <IconButton icon="search" label="Buscar en esta vista" active={searchOpen} onClick={() => setSearchOpen(v => !v)} />
        </>}<IconButton icon="settings" label="Configuración de vista" aria-haspopup="dialog" aria-expanded={configOpen} active={configOpen} onClick={() => setConfigOpen(v => !v)} />
        <IconButton icon="more" label="Más opciones de la base de datos" aria-haspopup="dialog" aria-expanded={menu?.kind==='database'} onClick={e => setMenu({
          kind: 'database',
          anchor: e.currentTarget
        })} />
        {view.type!=='form'&&<button type="button" className="adb-new-button" onClick={() => addRow().catch(() => {})}>Nuevo</button>}
      </div>
    </div>
    {searchOpen && <div className="adb-search"><Icon type="search" /><input autoFocus aria-label="Buscar registros" placeholder="Buscar por nombre…" value={search} onChange={e => setSearch(e.target.value)} /><IconButton icon="close" label="Cerrar búsqueda" onClick={() => {
        setSearch('');
        setSearchOpen(false);
      }} /></div>}
    {(error || !parent) && <div className="adb-error" role="alert">{error || 'Guarda la página antes de conectar esta base.'}<button type="button" onClick={async () => {
        try {
          await context?.flush?.();
          await reload();
        } catch (e) {
          setError(e.message);
        }
      }}>Guardar y volver a cargar</button></div>}
    {conversion && <div className="adb-error" role="alert">{conversion.pending.length} valores no se pueden convertir. Se conservarán con una advertencia y un respaldo para recuperación.<button type="button" onClick={() => {
        const payload = conversion.payload;
        setConversion(null);
        mutate({
          ...payload,
          allow_pending: true
        }).catch(() => {});
      }}>Cambiar tipo y conservar originales</button><button type="button" onClick={() => setConversion(null)}>Cancelar conversión</button></div>}
    {legacyRows.length > 0 && <details className="adb-legacy-recovery"><summary>Registros antiguos sin asignación ({legacyRows.length}): conservados para revisión</summary>{legacyRows.map(row => <button key={row.id} type="button" onClick={() => window._openPagePeek?.(row.id, {
        databasePreview: true,
        onClose: reload
      })}>{row.title} ↗</button>)}<p className="adb-help">No se asignan automáticamente a ninguna base. Usa el plan de migración con un mapa de pertenencia explícito para resolverlos.</p></details>}
    {saving > 0 && <div className="adb-source-saving" role="status">Guardando configuración…</div>}
    <div className="adb-view-body">
      <div className="adb-view-canvas">{loading ? <div className="adb-empty">Cargando registros…</div> : view.type === 'table' ? table : <DatabaseAlternateView {...{
          view,
          rows: shown,
          schema,
          base,
          onRow,
          openRow,
          addRow,
          reload,
          updateView
        }} />}</div>
      {configOpen && <ViewConfig view={view} schema={schema} key={view.id} isNew={!!draftView} busy={saving > 0} onChange={updateView} onRules={(kind,anchor)=>setMenu({kind,anchor,configRule:true})} onSave={saveNewView} onClose={() => {
        setDraftView(null);
        setConfigOpen(false);
      }} />}
    </div>
    {selected.size > 0 && <div className="adb-selection-bar"><span>{selected.size} seleccionados</span><button type="button" onClick={() => setSelected(new Set())}>Cancelar selección</button><button type="button" onClick={async () => {
        try {
          for (const id of selected) await api(base + '/rows/' + id, {}, 'DELETE');
          setSelected(new Set());
          await reload();
        } catch (e) {
          setError(e.message);
        }
      }}>Eliminar registros seleccionados</button></div>}
    {menu && renderMenu()}
  </div>;
  function renderMenu() {
    const close = () => setMenu(current=>current===menu?null:current);
    const back = menu.configRule ? () => {const anchor=menu.anchor;setMenu(null);requestAnimationFrame(()=>anchor?.focus({preventScroll:true}));} : menu.parent ? () => setMenu({...menu.parent, focusLabel:menu.returnLabel}) : undefined;
    const sub = (patch,label) => setMenu({...menu,...patch,parent:menu,returnLabel:label,focusLabel:undefined});
    const anchor = menu.anchor;
    const col = menu.col;
    if (['addProperty', 'changeType'].includes(menu.kind)) return <TypePicker anchor={anchor} label={menu.kind === 'changeType' ? 'Cambiar tipo' : 'Nueva propiedad'} initialName={menu.name ?? col?.name ?? ''} showName={menu.kind!=='changeType'} onBack={back} onClose={close} onChoose={chooseType} />;
    if (menu.kind === 'configure') return <PropertyConfig anchor={anchor} col={col} schema={schema} base={base} onSave={mutate} onClose={close} onBack={back} />;
    if (menu.kind === 'newView') return <Popover anchor={anchor} label="Nueva vista" onClose={close}><div className="adb-popover-title">Nueva vista</div><div className="adb-view-type-picker">{VIEW_TYPES.map(([type, name]) => <button key={type} type="button" onClick={() => {
          setDraftView({
            id: 'view_' + uid(),
            name,
            type,
            openMode: 'side',
            groupBy: schema.columns.find(c => ['status', 'select', 'multi_select'].includes(c.type))?.id || '',
            dateProperty: schema.columns.find(c => c.type === 'date')?.id || '',
            cardPreview: 'content',
            cardSize: 'medium',
            showIcon: true
          });
          setConfigOpen(true);
          close();
        }}><Icon type={type} />{name}</button>)}</div></Popover>;
    if (menu.kind === 'column') return <Popover anchor={anchor} label={'Menú de ' + col.name} onClose={close} focusLabel={menu.focusLabel}>
      <div className="adb-menu-section-label">Propiedad compartida</div>
      <input aria-label="Cambiar nombre de propiedad" value={menu.name ?? col.name} onChange={e=>setMenu({...menu,name:e.target.value})} onKeyDown={e=>{
        if(e.key!=='Enter')return;
        e.preventDefault();
        const name=e.target.value.trim();
        if(!name||name===col.name){close();return;}
        const action=col.id==='title'?s=>({operation:'schema',schema:{...s,titleName:name}}):{operation:'configure',column_id:col.id,patch:{name}};
        mutate(action).then(close).catch(()=>{});
      }}/>
      <div className="adb-menu-input-hint">Enter para guardar el nombre</div>
      {col.id !== 'title' && <><MenuItem icon={col.type} label="Editar propiedad" submenu onClick={() => sub({kind:'configure'},'Editar propiedad')} /><MenuItem icon="settings" label="Cambiar tipo" submenu onClick={() => sub({kind:'changeType'},'Cambiar tipo')} /></>}
      <hr /><div className="adb-menu-section-label">Sólo esta vista</div>
      <MenuItem icon="filter" label="Filtrar" submenu onClick={() => sub({kind:'filter',col},'Filtrar')} />
      <MenuItem icon="sort" label="Orden ascendente" onClick={() => {
        setViewOption('sorts', [...(view.sorts || []).filter(s => s.colId !== col.id), {
          colId: col.id,
          dir: 'asc'
        }]);
        close();
      }} />
      <MenuItem icon="sort" label="Orden descendente" onClick={() => {
        setViewOption('sorts', [...(view.sorts || []).filter(s => s.colId !== col.id), {
          colId: col.id,
          dir: 'desc'
        }]);
        close();
      }} />
      {col.id !== 'title' && <MenuItem icon="group" label="Agrupar por esta propiedad" onClick={() => {
        setViewOption('groupBy', col.id);
        close();
      }} />}
      <MenuItem icon="number" label="Calcular" submenu onClick={() => sub({kind:'calculate'},'Calcular')} />
      <MenuItem icon="open" label={col.id === 'title' ? view.freezeTitle === false ? 'Congelar' : 'Descongelar' : (view.frozen || []).includes(col.id) ? 'Descongelar' : 'Congelar'} onClick={() => {
        col.id === 'title' ? setViewOption('freezeTitle', view.freezeTitle === false) : setViewOption('frozen', (view.frozen || []).includes(col.id) ? view.frozen.filter(id => id !== col.id) : [...(view.frozen || []), col.id]);
        close();
      }} />
      {col.id !== 'title' && <MenuItem icon="close" label="Ocultar en esta vista" onClick={() => {
        setViewOption('hidden', [...(view.hidden || []), col.id]);
        close();
      }} />}
      <MenuItem icon="text" label={(view.wrapped || []).includes(col.id) ? 'Una línea' : 'Ajustar el contenido'} onClick={() => {
        setViewOption('wrapped', (view.wrapped || []).includes(col.id) ? view.wrapped.filter(id => id !== col.id) : [...(view.wrapped || []), col.id]);
        close();
      }} />
      {col.id!=='title'&&<><MenuItem icon="left" label="Mover columna a la izquierda" disabled={cols[0]?.id===col.id} onClick={()=>{const index=cols.findIndex(c=>c.id===col.id);setViewOption('columnOrder',moveViewColumn(schema,view,col.id,cols[index-1]?.id));close();}}/><MenuItem icon="right" label="Mover columna a la derecha" disabled={cols.at(-1)?.id===col.id} onClick={()=>{const index=cols.findIndex(c=>c.id===col.id);setViewOption('columnOrder',moveViewColumn(schema,view,col.id,cols[index+1]?.id,true));close();}}/></>}
      <hr /><div className="adb-menu-section-label">Propiedad compartida</div>
      <MenuItem icon="plus" label="Insertar propiedad a la izquierda" submenu onClick={() => sub({kind:'addProperty',position:Math.max(0,schema.columns.findIndex(c=>c.id===col.id))},'Insertar propiedad a la izquierda')} />
      <MenuItem icon="plus" label="Insertar propiedad a la derecha" submenu onClick={() => sub({kind:'addProperty',position:col.id==='title'?0:schema.columns.findIndex(c=>c.id===col.id)+1},'Insertar propiedad a la derecha')} />
      {col.id !== 'title' && <><MenuItem icon="copy" label="Duplicar propiedad" onClick={() => {
          mutate({
            operation: 'duplicate',
            column_id: col.id,
            position: schema.columns.findIndex(c => c.id === col.id) + 1
          }).catch(() => {});
          close();
        }} /><MenuItem icon="trash" danger label="Eliminar propiedad (recuperable)" onClick={() => {
          mutate({
            operation: 'delete',
            column_id: col.id
          }).catch(() => {});
          close();
        }} /></>}
    </Popover>;
    if (menu.kind === 'calculate') return <Popover anchor={anchor} label="Cálculo de columna" onClose={close} onBack={back}>{[['', 'Ninguno'], ['count', 'Contar todos'], ['count_empty', 'Contar vacíos'], ['filled', 'Contar valores'], ...(col.type === 'checkbox' ? [['checked', 'Marcadas'], ['unchecked', 'Sin marcar'], ['percent_checked', 'Porcentaje marcado']] : []), ...(['number', 'formula', 'rollup'].includes(col.type) ? [['sum', 'Suma'], ['average', 'Promedio'], ['min', 'Mínimo'], ['max', 'Máximo']] : [])].map(([method, name]) => <MenuItem key={method} icon="number" checked={(view.calculations?.[col.id]||'')===method} label={name} onClick={() => {
        setViewOption('calculations', {
          ...view.calculations,
          [col.id]: method
        });
        close();
      }} />)}</Popover>;
    if (menu.kind === 'filter' || menu.kind === 'sort') return <RuleMenu anchor={anchor} kind={menu.kind} view={view} columns={[titleCol, ...schema.columns]} initialCol={col?.id} onBack={back} onClose={close} onChange={updateView} />;
    if (menu.kind === 'viewMenu') return <Popover anchor={anchor} label="Opciones de vista" onClose={close}>
      <label>Nombre<input defaultValue={menu.view.name} onBlur={e => {
          const name = e.target.value.trim();
          if (name) mutate(s => ({
            operation: 'schema',
            schema: {
              ...s,
              views: s.views.map(v => v.id === menu.view.id ? {
                ...v,
                name
              } : v)
            }
          })).catch(() => {});
        }} /></label>
      <MenuItem icon="settings" label="Configurar vista" onClick={() => {
        switchView(menu.view.id);
        setConfigOpen(true);
        close();
      }} />
      <MenuItem icon="page" label="Duplicar vista" onClick={() => {
        mutate(s => {
          const original = s.views.find(v => v.id === menu.view.id);
          const copy = {
            ...clone(original),
            id: 'view_' + uid(),
            name: original.name + ' (copia)'
          };
          return {
            operation: 'schema',
            schema: {
              ...s,
              views: [...s.views, copy],
              activeView: copy.id
            }
          };
        }).catch(() => {});
        close();
      }} />
      <MenuItem icon="close" danger label="Eliminar vista" disabled={schema.views.length < 2} onClick={() => {
        mutate(s => {
          const views = s.views.filter(v => v.id !== menu.view.id);
          return {
            operation: 'schema',
            schema: {
              ...s,
              views,
              activeView: s.activeView === menu.view.id ? views[0].id : s.activeView
            }
          };
        }).catch(() => {});
        close();
      }} />
    </Popover>;
    if (menu.kind === 'row') return <Popover anchor={anchor} label="Opciones del registro" onClose={close}><MenuItem icon="open" label="Abrir en Peek lateral" onClick={() => {
        window._openPagePeek?.(menu.row.id, {
          databasePreview: true,
          onClose: reload
        });
        close();
      }} /><MenuItem icon="page" label="Abrir como página" onClick={() => {
        window._loadEntryById?.(menu.row.id);
        close();
      }} /><MenuItem icon="close" danger label="Eliminar registro (recuperable)" onClick={() => {
        api(base + '/rows/' + menu.row.id, {}, 'DELETE').then(reload).catch(e => setError(e.message));
        close();
      }} /></Popover>;
    if (menu.kind === 'database') return <RecoveryMenu {...{
      anchor,
      base,
      schema,
      mutate,
      reload
    }} onClose={close} />;
    return null;
  }
}
function TagLabel({
  col,
  value
}) {
  const option = optionsFor(col || {}).find(o => o.label === value);
  return <span className="adb-group-label" style={{
    color: option?.color
  }}>{value}</span>;
}
function RuleMenu({
  anchor,
  kind,
  view,
  columns,
  initialCol,
  onBack,
  onChange,
  onClose
}) {
  const isSort = kind === 'sort';
  const [rules, setRules] = useState(() => clone(isSort ? view.sorts || (view.sort ? [view.sort] : []) : view.filters || (view.filter ? [{
    ...view.filter,
    op: 'contains'
  }] : [])).concat(initialCol && !isSort ? [{
    colId: initialCol,
    op: defaultFilterOperator(columns.find(c=>c.id===initialCol)?.type),
    value: ''
  }] : []));
  const [mode, setMode] = useState(view.filterMode || 'and');
  const [error, setError] = useState('');
  return <Popover anchor={anchor} wide label={isSort ? 'Ordenar' : 'Filtrar'} onClose={onClose} onBack={onBack}><div className="adb-popover-title">{isSort ? 'Ordenar' : 'Filtrar'} · {view.name}</div>
    {!isSort && <select aria-label="Combinar filtros" value={mode} onChange={e => setMode(e.target.value)}><option value="and">Todas las condiciones</option><option value="or">Cualquier condición</option></select>}
    {!isSort&&<><p className="adb-help">Fechas relativas · zona {view.filterTimeZone||localFilterZone()} · semana de lunes a domingo.</p><FilterRules rules={rules} columns={columns} onChange={(next,error)=>{if(error)setError(error);else{setRules(next);setError('');}}}/></>}
    {isSort&&rules.map((rule, i) => <div className="adb-rule" key={i}><select aria-label="Propiedad" value={rule.colId} onChange={e => setRules(r => r.map((v, n) => n === i ? {
        ...v,
        colId: e.target.value,
        ...(!isSort?{op:defaultFilterOperator(columns.find(c=>c.id===e.target.value)?.type),value:''}:{})
      } : v))}>{columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label={isSort ? 'Dirección' : 'Operador'} value={isSort ? rule.dir : rule.op || 'contains'} onChange={e => setRules(r => r.map((v, n) => n === i ? {
        ...v,
        [isSort ? 'dir' : 'op']: e.target.value
      } : v))}>{(isSort ? [['asc', 'Ascendente'], ['desc', 'Descendente']] : storedFilterOperations(columns.find(c=>c.id===rule.colId)?.type,rule.op)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      {!isSort && !['empty', 'not_empty'].includes(rule.op) && <PropertyFilterValue column={columns.find(c=>c.id===rule.colId)} rule={rule} label="Valor del filtro" onChange={value => setRules(r => r.map((v, n) => n === i ? {
        ...v,
        value
      } : v))} />}
      <button type="button" aria-label="Quitar condición" onClick={() => setRules(r => r.filter((_, n) => n !== i))}>×</button></div>)}
    {isSort&&<MenuItem icon="plus" label={isSort ? 'Añadir ordenación' : 'Añadir condición'} onClick={() => setRules(r => [...r, {
      colId: columns[0].id,
      ...(isSort ? {
        dir: 'asc'
      } : {
        op: defaultFilterOperator(columns[0].type),
        value: ''
      })
    }])} />}
    {error && <p className="adb-error" role="alert">{error}</p>}
    <div className="adb-popover-footer"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="adb-primary" onClick={async () => {
        try {
          if(!isSort)validateFilterTree(rules);
          await onChange(isSort ? {
            sorts: rules,
            sort: null
          } : {
            filters: rules,
            filter: null,
            filterMode: mode,
            filterTimeZone: view.filterTimeZone||localFilterZone()
          });
          onClose();
        } catch (e) {
          setError(e.message);
        }
      }}>Aplicar</button></div>
  </Popover>;
}
function RecoveryMenu({
  anchor,
  base,
  schema,
  mutate,
  reload,
  onClose
}) {
  const [deleted, setDeleted] = useState([]);
  const [backups, setBackups] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api(base + '/deleted').then(setDeleted).catch(e => setError(e.message));
    api(base + '/recoveries').then(setBackups).catch(e => setError(e.message));
  }, [base]);
  return <Popover anchor={anchor} wide label="Opciones y recuperación" onClose={onClose}><div className="adb-popover-title">Papelera de registros</div>{deleted.map(row => <MenuItem key={row.id} icon="page" label={'Restaurar ' + row.title} onClick={() => api(base + '/deleted/' + row.id, {}, 'POST').then(() => {
      reload();
      onClose();
    }).catch(e => setError(e.message))} />)}{!deleted.length && <p className="adb-help">Ningún registro en la papelera.</p>}<hr /><div className="adb-popover-title">Propiedades archivadas</div>{schema.archived_columns?.length ? schema.archived_columns.map(col => <MenuItem key={col.id} icon={col.type} label={'Restaurar ' + col.name} onClick={() => mutate({
      operation: 'restore',
      column_id: col.id
    }).then(onClose).catch(e => setError(e.message))} />) : <p className="adb-help">Ninguna propiedad archivada.</p>}<hr /><div className="adb-popover-title">Respaldos de esquema y conversiones</div>{backups.slice(0, 8).map(item => <div className="adb-recovery" key={item.id}><a href={base + '/recoveries/' + item.id} target="_blank" rel="noreferrer">{new Date(item.created_at).toLocaleString('es')}</a><button type="button" onClick={() => api(base + '/recoveries/' + item.id, {}, 'POST').then(() => {
        reload();
        location.reload();
      }).catch(e => setError(e.message))}>Restaurar</button></div>)}<p className="adb-help">La restauración se bloquea si hay cambios posteriores. Descarga el respaldo para recuperar valores concretos.</p>{error && <p className="adb-error" role="alert">{error}</p>}</Popover>;
}

// A view rendering error must not unmount the containing BlockNote page or
// discard another record editor. Recovery selects a real table of this source.
export class DatabaseBoundary extends React.Component {
  state = {error:null};
  static getDerivedStateFromError(error){return {error:error.message};}
  async recover(){
    try{
      const {block,editor}=this.props;
      const schema=normalizeSchema(JSON.parse(block.props.data||'{}'));
      const context=editorDatabaseContext.get(editor);
      const base=`/api/databases/${context?.pageId}/${schema.database_id}`;
      const current=await api(base);
      let table=current.schema.views.find(v=>v.type==='table');
      if(!table){table={id:'view_'+uid(),name:'Tabla de recuperación',type:'table'};current.schema.views.push(table);}
      current.schema.activeView=table.id;
      const result=await api(base,{operation:'schema',schema:current.schema,revision:current.revision});
      editor.updateBlock(block,{props:{data:JSON.stringify(result.schema)}});
      this.setState({error:null});
    }catch(error){this.setState({error:error.message});}
  }
  render(){
    if(this.state.error)return <div className="adb-workspace" contentEditable={false}><div className="adb-error" role="alert">No se pudo representar esta vista: {this.state.error}. Los registros guardados se conservan.<button type="button" onClick={()=>this.recover()}>Abrir tabla de recuperación</button></div></div>;
    return <DatabaseWorkspace {...this.props}/>;
  }
}
