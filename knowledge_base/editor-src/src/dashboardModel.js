import {clone, filteredRows, uid} from './databaseModel.js';

// Widgets refer to canonical sources. No record or body is stored in this model.
export const DASHBOARD_TYPES = ['table','board','gallery','list','calendar','timeline','chart','feed','map'];
export const sourceKey = source => source.base || `/api/databases/${source.parent_id}/${source.database_id || source.id}`;
export const filterFamily = type => ['text','url','email','phone','title'].includes(type) ? 'text' : ['select','status'].includes(type) ? 'option' : type;
export const compatibleFilterProperty = (type, column) => !!column && filterFamily(type) === filterFamily(column.type);
export const WIDGET_SIZE_LIMITS={minWidth:10,maxWidth:100,minHeight:160,maxHeight:1600};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export const widgetWidth=widget=>finite(widget.width)?Math.max(10,Math.min(100,widget.width)):([4,6,8,12].includes(widget.span)?widget.span:6)/12*100;
export function widgetSize(width,height){
  return {width:Math.round(Math.max(10,Math.min(100,finite(width)?width:50))*10000)/10000,
    height:Math.round(Math.max(160,Math.min(1600,finite(height)?height:400)))};
}
// Width is relative to the available dashboard, height is in CSS pixels.
// Pointer coordinates are viewport pixels, including browser/CSS zoom.
export function resizeWidgetSize(start,dx,dy){
  const scale=start.scale>0?start.scale:1;
  const track=start.gridWidth+start.gap;
  const minimum=Math.min(100,Math.max(10,(260*scale+start.gap)/track*100));
  // A vertical resize must not replace the stored width with a slightly
  // different percentage reconstructed from subpixel layout rounding.
  return widgetSize(start.widthLocked||dx===0?start.width:Math.max(minimum,(start.renderedWidth??start.width)+dx/track*100),start.height+dy/scale);
}
export function dashboardConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version:1,
    widgets:Array.isArray(source.widgets) ? source.widgets.filter(w=>w && typeof w.id==='string' && typeof w.base==='string' && w.base.startsWith('/api/databases/')).map(w=>({...clone(w),span:[4,6,8,12].includes(w.span)?w.span:6,...(finite(w.width)?{width:widgetSize(w.width,w.height).width}:{}),height:widgetSize(widgetWidth(w),w.height).height,view:{...clone(w.view||{}),type:DASHBOARD_TYPES.includes(w.view?.type)?w.view.type:'table'}})) : [],
    globalFilters:Array.isArray(source.globalFilters) ? clone(source.globalFilters) : []
  };
}
export function createWidget(base, view={type:'table',name:'Tabla'}) {
  return {id:uid(),base,title:view.name || 'Vista de base de datos',span:6,height:400,sourceViewId:view.id || null,view:{...clone(view),type:DASHBOARD_TYPES.includes(view.type)?view.type:'table'}};
}
export function duplicateWidget(config, id) {
  const index=config.widgets.findIndex(w=>w.id===id);
  if(index<0)return config;
  const duplicate={...clone(config.widgets[index]),id:uid(),title:config.widgets[index].title+' (copia)'};
  return {...config,widgets:[...config.widgets.slice(0,index+1),duplicate,...config.widgets.slice(index+1)]};
}
export function moveWidget(config,id,targetId) {
  const widgets=[...config.widgets];
  const from=widgets.findIndex(w=>w.id===id),to=widgets.findIndex(w=>w.id===targetId);
  if(from<0||to<0||from===to)return config;
  const [widget]=widgets.splice(from,1);widgets.splice(to,0,widget);
  return {...config,widgets};
}
export function mappedGlobalRules(filters,base,columns) {
  return filters.flatMap(filter=>{
    if(filter.enabled===false)return [];
    const id=filter.mapping?.[base];
    const column=id==='title'?{id:'title',type:'title'}:columns.find(c=>c.id===id);
    if(!compatibleFilterProperty(filter.type,column))return [];
    return [{colId:id,op:filter.op || 'contains',value:filter.value ?? '',...(filter.timeZone?{timeZone:filter.timeZone}:{})}];
  });
}
export function widgetRows(rows,widget,filters,columns) {
  // A global filter intersects the widget's own AND/OR rules; it must not turn
  // into one more branch of the widget's OR expression.
  return filteredRows(filteredRows(rows,widget.view),{filters:mappedGlobalRules(filters,widget.base,columns),filterMode:'and'});
}
