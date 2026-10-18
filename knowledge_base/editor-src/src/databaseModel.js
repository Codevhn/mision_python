import {dateStart,isDateRange,dateLabel} from './databasePropertyValues.js';
// Shared schema/view semantics. These functions never create or copy records.
import {dateRule,filterNumber,filterToday,validateFilterTree,matchFilterTree} from './databaseFilters.js';
export const PROPERTY_TYPES = [['text', 'Texto'], ['number', 'Número'], ['select', 'Selección'], ['multi_select', 'Selección múltiple'], ['status', 'Estado'], ['date', 'Fecha'], ['person', 'Persona'], ['files', 'Archivos y multimedia'], ['checkbox', 'Casilla de verificación'], ['url', 'URL'], ['phone', 'Teléfono'], ['email', 'Correo electrónico'], ['relation', 'Relación'], ['rollup', 'Rollup'], ['formula', 'Fórmula'], ['button', 'Botón'], ['id', 'ID'], ['place', 'Lugar'], ['created_time', 'Fecha de creación'], ['edited_time', 'Fecha de última edición'], ['created_by', 'Creado por'], ['edited_by', 'Editado por']];
export const VIEW_TYPES = [['table', 'Tabla'], ['board', 'Board'], ['gallery', 'Galería'], ['list', 'Lista'], ['calendar', 'Calendario'], ['timeline', 'Timeline'], ['chart', 'Gráficos'], ['dashboard', 'Dashboard'], ['feed', 'Feed'], ['map', 'Mapa'], ['form', 'Formulario']];
export const COMPUTED = new Set(['rollup', 'formula', 'id', 'created_time', 'edited_time', 'created_by', 'edited_by']);
export const STATUS_OPTIONS = [{
  label: 'No iniciado',
  color: '#888888',
  group: 'Pendiente'
}, {
  label: 'En proceso',
  color: '#d4a843',
  group: 'En progreso'
}, {
  label: 'Revisión',
  color: '#7c8cff',
  group: 'En progreso'
}, {
  label: 'Terminado',
  color: '#4ec9b0',
  group: 'Completado'
}, {
  label: 'Cancelado',
  color: '#e05555',
  group: 'Completado'
}];
export const uid = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);
export const clone = v => JSON.parse(JSON.stringify(v));
export function normalizeSchema(raw) {
  const schema = clone(raw || {});
  schema.columns ||= [{
    id: 'col_status',
    name: 'Estado',
    type: 'status'
  }];
  schema.views = schema.views?.length ? schema.views : [{
    id: 'view_default',
    name: 'Tabla',
    type: 'table',
    ...Object.fromEntries(['filter', 'sort', 'groupBy', 'calc', 'rowHeight', 'titleWidth'].filter(key => key in schema).map(key => [key, schema[key]]))
  }];
  const aliases = {
    count_all: 'count',
    count_not_empty: 'filled'
  };
  schema.views = schema.views.map((original, i) => {
    const v = {
      type: 'table',
      id: 'view_' + i,
      name: i ? 'Vista ' + (i + 1) : 'Tabla',
      ...original
    };
    if (v.groupBy === '__title') v.groupBy = 'title';
    if (!v.calculations && v.calc) v.calculations = Object.fromEntries(Object.entries(v.calc).map(([id, method]) => [id === '__title' ? 'title' : id, aliases[method] || method]));
    if (!('filters' in v) && v.filter?.colId) {
      const col = schema.columns.find(c => c.id === v.filter.colId);
      const value = col?.type === 'checkbox' ? v.filter.value !== 'unchecked' : v.filter.value ?? '';
      v.filters = value === '' ? [] : [{
        colId: v.filter.colId === '__title' ? 'title' : v.filter.colId,
        op: ['select', 'multi_select', 'status', 'checkbox'].includes(col?.type) ? 'is' : 'contains',
        value
      }];
    }
    if (!('sorts' in v) && v.sort?.colId) v.sorts = [{
      ...v.sort,
      colId: v.sort.colId === '__title' ? 'title' : v.sort.colId
    }];
    return v;
  });
  if (!schema.views.some(v => v.id === schema.activeView)) schema.activeView = schema.views[0].id;
  return schema;
}
export const optionsFor = col => col.options?.length ? col.options : col.type === 'status' ? STATUS_OPTIONS : [];
export function valueOf(row, col) {
  if (col === 'title' || col?.id === 'title' || col === '__title') return row.title || '';
  return row.properties?.find(p => p.id === (col?.id || col))?.value ?? '';
}
export function displayValue(value, type) {
  if (type === 'person') return Array.isArray(value) ? value.map(()=> 'Propietario').join(', ') : value == null ? '' : String(value);
  if(isDateRange(value))return dateLabel(value);
  if (Array.isArray(value)) return value.map(v => v && typeof v === 'object' ? v.name || JSON.stringify(v) : String(v ?? '')).join(', ');
  if (value && typeof value === 'object') return value.name || JSON.stringify(value);
  if (type === 'checkbox') return value ? 'Sí' : 'No';
  return value == null ? '' : String(value);
}
export function filteredRows(rows, view, search = '', now = new Date()) {
  const filters = view.filters || (view.filter?.colId ? [{
    ...view.filter,
    op: 'contains'
  }] : []);
  validateFilterTree(filters);
  const days=new Map();
  const today=zone=>{if(!days.has(zone))days.set(zone,filterToday(zone,now));return days.get(zone);};
  const matches = (row, rule) => {
    const type=row.properties?.find(p=>p.id===rule.colId)?.type;
    const raw=valueOf(row,rule.colId);
    const value=['date','created_time','edited_time'].includes(type)?dateStart(raw):raw;
    const date=dateRule(value,rule,type,rule.op==='relative'?today(rule.timeZone||view.filterTimeZone||'UTC'):undefined);
    if(date!==null)return date;
    const actualNumber=filterNumber(value),expectedNumber=filterNumber(rule.value);
    if(['number','formula','rollup'].includes(type)&&['is','not'].includes(rule.op)&&actualNumber!==null&&expectedNumber!==null)return rule.op==='is'?actualNumber===expectedNumber:actualNumber!==expectedNumber;
    const actual = displayValue(value).toLocaleLowerCase();
    const expected = String(rule.value ?? '').toLocaleLowerCase();
    switch (rule.op) {
      case 'is':
        return Array.isArray(value) ? value.includes(rule.value) : actual === expected;
      case 'not':
        return Array.isArray(value) ? !value.includes(rule.value) : actual !== expected;
      case 'empty':
        return value === '' || value == null || Array.isArray(value) && !value.length;
      case 'not_empty':
        return !(value === '' || value == null || Array.isArray(value) && !value.length);
      case 'gt':
        return actualNumber!==null&&expectedNumber!==null&&actualNumber>expectedNumber;
      case 'lt':
        return actualNumber!==null&&expectedNumber!==null&&actualNumber<expectedNumber;
      default:
        return Array.isArray(value)&&['multi_select','person','relation'].includes(type)?value.includes(rule.value):actual.includes(expected);
    }
  };
  const result = rows.filter(row => (!search || row.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && matchFilterTree(filters,view.filterMode,rule=>matches(row,rule)));
  const sorts = view.sorts || (view.sort?.colId ? [view.sort] : []);
  return result.sort((a, b) => {
    for (const sort of sorts) {
      const av = dateStart(valueOf(a, sort.colId)),
        bv = dateStart(valueOf(b, sort.colId));
      const d = typeof av === 'number' && typeof bv === 'number' ? av - bv : displayValue(av).localeCompare(displayValue(bv), 'es', {
        numeric: true
      });
      if (d) return sort.dir === 'desc' ? -d : d;
    }
    return (a.order || 0) - (b.order || 0);
  });
}
export function emptyGroupLabel(rows,col) {
  if(!col)return 'Sin valor';
  const labels=new Set(optionsFor(col).map(o=>o.label));
  for(const row of rows){const raw=valueOf(row,col);for(const v of Array.isArray(raw)?raw:[raw])if(v!==''&&v!=null)labels.add(displayValue(v,col.type==='checkbox'?'checkbox':undefined));}
  let label='Sin '+col.name;while(labels.has(label))label='('+label+')';return label;
}
export function groupRows(rows, col) {
  if (!col) return [['Todos', rows]];
  const map = new Map(optionsFor(col).map(o => [o.label, []]));
  const blankLabel=emptyGroupLabel(rows,col);
  for (const row of rows) {
    const raw = valueOf(row, col);
    const values = Array.isArray(raw) ? [...new Set(raw)] : [raw];
    for (const val of values.length ? values : ['']) {
      const key = (col.type === 'person' && val === 'owner' ? 'Propietario' : displayValue(val, col.type === 'checkbox' ? 'checkbox' : undefined)) || blankLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return [...map];
}
export function aggregate(rows, col, method) {
  const values = rows.map(r => valueOf(r, col));
  const numbers = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (['count', 'count_all'].includes(method)) return rows.length;
  const isEmpty = v => v === '' || v == null || Array.isArray(v) && !v.length;
  if (method === 'count_empty') return values.filter(isEmpty).length;
  if (['filled', 'count_not_empty'].includes(method)) return values.filter(v => !isEmpty(v)).length;
  if (['checked', 'unchecked', 'percent_checked'].includes(method)) {
    const count = values.filter(v => v === true).length;
    return method === 'checked' ? count : method === 'unchecked' ? rows.length - count : rows.length ? Math.round(count / rows.length * 10000) / 100 + '%' : '0%';
  }
  if (method === 'filled') return values.filter(v => v !== '' && v != null && (!Array.isArray(v) || v.length)).length;
  if (!numbers.length) return '—';
  return method === 'sum' ? numbers.reduce((a, b) => a + b, 0) : method === 'average' ? numbers.reduce((a, b) => a + b, 0) / numbers.length : method === 'min' ? Math.min(...numbers) : method === 'max' ? Math.max(...numbers) : '—';
}
export async function api(url, body, method = body ? 'PATCH' : 'GET') {
  const response = await fetch(url, {
    method,
    headers: body ? {
      'Content-Type': 'application/json'
    } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo guardar');
    Object.assign(error, data, {
      status: response.status
    });
    throw error;
  }
  return data;
}

// Serial writes retain the latest unsaved payload after failure. A caller must
// await flush before destroying an editor. New edits during an in-flight write
// are saved in the next iteration, never cleared by the older response.
export class SaveQueue {
  constructor(write) {
    this.write = write;
    this.pending = null;
    this.running = null;
    this.version = 0;
  }
  set(payload) {
    this.pending = {
      ...(this.pending || {}),
      ...payload
    };
    this.version++;
  }
  flush() {
    if (this.running) return this.running.then(() => this.pending ? this.flush() : undefined);
    this.running = (async () => {
      while (this.pending) {
        const snapshot = this.pending;
        const version = this.version;
        await this.write(snapshot);
        if (version === this.version) this.pending = null;
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}

// Ordering belongs to a representation; the shared schema and its IDs stay put.
export function columnsForView(schema,view,includeHidden=false) {
  const byId=new Map((schema.columns||[]).map(c=>[c.id,c]));
  const ids=[...new Set([...(Array.isArray(view.columnOrder)?view.columnOrder:[]),...byId.keys()])];
  return ids.filter(id=>byId.has(id)&&(includeHidden||!(view.hidden||[]).includes(id))).map(id=>byId.get(id));
}
export function moveViewColumn(schema,view,id,target,after=false) {
  const ids=columnsForView(schema,view,true).map(c=>c.id);
  if(!ids.includes(id)||(!ids.includes(target)&&target!=='title')||id===target)return ids;
  const rest=ids.filter(c=>c!==id);const index=target==='title'?0:rest.indexOf(target)+(after?1:0);
  rest.splice(index,0,id);return rest;
}
