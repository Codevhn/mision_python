/* Diagram workshop. The server owns revisions and pending AI proposals. */
(() => {
  'use strict';
  const FLOW = {start:'Inicio',end:'Final',process:'Proceso',decision:'Decisión',input:'Entrada / salida',document:'Documento',database:'Base de datos',subprocess:'Subproceso',connector:'Conector'};
  const UML = {class:'Clase',interface:'Interfaz',note:'Nota'};
  const REL = {flow:'Flujo',association:'Asociación',inheritance:'Herencia',implementation:'Realización',aggregation:'Agregación',composition:'Composición',dependency:'Dependencia'};
  const MODES = {socratic:'Mentor socrático',guided:'Construcción guiada',review:'Revisión',automatic:'Creación automática',manual:'Manual'};
  const copy = x => JSON.parse(JSON.stringify(x));
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  let state=null, busy=false, selection=null, connection=null, model=null, undo=[], redo=[], view={x:-40,y:-40,k:1}, area, resizeObserver;
  const el = id => document.getElementById(id);
  async function api(path,method='GET',data) {
    const r=await fetch('/api/diagrams'+path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    let body;try{body=await r.json();}catch{throw new Error('El servidor no devolvió una respuesta válida.');}
    if(!r.ok)throw new Error(body.error || 'No se pudo guardar el diagrama.');
    return body;
  }
  function status(text,error=false){const n=el('dgStatus');if(n){n.textContent=text;n.classList.toggle('dg-error',error);n.dataset.state=error?'error':text.includes('…')?'busy':'ready';}}
  function lock(on){busy=on;area.querySelectorAll('button,input,select,textarea').forEach(n=>{if(on){n.dataset.dgDisabled=String(n.disabled);n.disabled=true;}else if(n.dataset.dgDisabled!==undefined){n.disabled=n.dataset.dgDisabled==='true';delete n.dataset.dgDisabled;}});area.setAttribute('aria-busy',String(on));}
  const mountSelects=root=>window.mountAtlasSelects(root);
  function options(values,current){return Object.entries(values).map(([v,t])=>`<option value="${v}" ${v===current?'selected':''}>${esc(t)}</option>`).join('');}
  function field(key,label,values,cfg){return `<label>${label}<select data-config="${key}">${options(values,cfg[key])}</select></label>`;}
  function configFields(cfg) {
    return `${field('mode','Forma de trabajar',MODES,cfg)}<label>Objetivo<textarea data-config="goal" maxlength="4000" placeholder="Qué quieres representar o aprender">${esc(cfg.goal)}</textarea></label>
    <details><summary>Opciones de aprendizaje y resultado</summary><div class="dg-config-grid">
    ${field('level','Experiencia del usuario',{beginner:'Principiante',intermediate:'Intermedia',advanced:'Avanzada'},cfg)}
    ${field('complexity','Complejidad del diagrama',{simple:'Simple',normal:'Normal',advanced:'Avanzada'},cfg)}
    ${field('depth','Profundidad de las explicaciones',{brief:'Breve',normal:'Normal',deep:'Profunda'},cfg)}
    ${field('hints','Pistas',{on_request:'Solo cuando las pida',proactive:'Puede ofrecerlas'},cfg)}
    ${field('pace','Ritmo',{one_step:'Un paso por turno',milestones:'Por etapas'},cfg)}
    ${field('focus','Enfoque',{both:'Razonamiento y notación',notation:'Notación',reasoning:'Razonamiento'},cfg)}
    ${field('language','Idioma',{es:'Español',en:'English'},cfg)}</div></details>`;
  }
  function readConfig(root,base={}){const cfg={...base};root.querySelectorAll('[data-config]').forEach(n=>cfg[n.dataset.config]=n.value);return cfg;}
  async function showList(){
    if(busy)return;
    area=el('diagramArea'); if(!area)return;
    window.closeAtlasSelectPopup?.();state=null;selection=null;area.innerHTML='<p role="status">Cargando diagramas…</p>';
    try{
      const list=await api('');
      if(area.classList.contains('hidden'))return;
      area.innerHTML=`<div class="dg-header"><h1>Diagramas</h1><button id="dgNew">+ Nuevo diagrama</button></div><p>Construye un flujo o un UML de clases. Elige aprender con el mentor o generar una propuesta completa.</p><div class="dg-list">${list.map(d=>`<button class="dg-card" data-open="${d.id}"><strong>${esc(d.title)}</strong><span class="dg-muted">${d.notation==='flow'?'Diagrama de flujo':'UML · Clases'}</span></button>`).join('')}</div>${!list.length?'<p class="dg-muted">Todavía no hay diagramas guardados.</p>':''}<div class="dg-status" id="dgStatus" role="status"></div>`;
      el('dgNew').onclick=createForm;area.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>open(n.dataset.open));
    }catch(e){area.innerHTML='<div id="dgStatus" role="alert"></div><button id="dgRetry">Reintentar</button>';status(e.message,true);el('dgRetry').onclick=showList;}
  }
  function createForm(){
    const cfg={mode:'socratic',goal:'',level:'beginner',depth:'normal',complexity:'simple',hints:'on_request',pace:'one_step',focus:'both',language:'es'};
    area.innerHTML=`<form class="dg-form" id="dgCreate"><h1>Nuevo diagrama</h1><label>Nombre<input id="dgName" required maxlength="200" placeholder="Ej.: Registro de usuarios"></label><label>Notación<select id="dgNotation"><option value="flow">Diagrama de flujo</option><option value="class">UML · Clases</option></select></label>${configFields(cfg)}<p class="dg-muted" id="dgModeHelp">El mentor pregunta y acompaña. El diagrama avanza con tus decisiones.</p><div class="dg-buttons"><button type="button" id="dgCancel">Volver</button><button type="submit">Crear taller</button></div><div class="dg-status" id="dgStatus" role="status"></div></form>`;
    el('dgCancel').onclick=showList;
    area.querySelector('[data-config="mode"]').onchange=e=>{el('dgModeHelp').textContent=modeHelp(e.target.value);};
    el('dgCreate').onsubmit=async e=>{e.preventDefault();if(busy)return;lock(true);try{
      state=await api('','POST',{title:el('dgName').value,notation:el('dgNotation').value,config:readConfig(area),nodes:[],edges:[]});
      undo=[];redo=[];view={x:-40,y:-40,k:1};render();
    }catch(err){status(err.message,true);}finally{lock(false);}};
    mountSelects(area);el('dgName').focus();
  }
  function modeHelp(mode){return {socratic:'Una pregunta conduce a la siguiente. Las pistas y las soluciones se piden por separado.',guided:'El mentor explica y propone el siguiente paso para construir contigo.',review:'El mentor revisa lo existente y justifica las observaciones.',automatic:'Genera una propuesta completa y editable a partir del objetivo.',manual:'Edita libremente y consulta a la IA cuando lo necesites.'}[mode];}
  async function open(id){if(busy)return;try{state=await api('/'+id);undo=[];redo=[];selection=null;connection=null;view={x:-40,y:-40,k:1};render();}catch(e){status(e.message,true);}}
  async function mutate(fn){
    if(busy||!state)return;
    const before=copy(state.document),candidate=copy(before);fn(candidate);lock(true);status('Guardando…');
    try{state=await api('/'+state.id,'PUT',{revision:state.revision,document:candidate});undo.push(before);undo=undo.slice(-50);redo=[];render();status('Guardado');}
    catch(e){render();status(e.message+' Tu cambio no se ha aplicado. Usa Recargar para obtener la versión guardada.',true);}finally{lock(false);}
  }
  async function history(direction){
    const src=direction==='undo'?undo:redo,dst=direction==='undo'?redo:undo;if(busy||!src.length)return;
    const target=src[src.length-1],current=copy(state.document);lock(true);
    try{state=await api('/'+state.id,'PUT',{revision:state.revision,document:target});src.pop();dst.push(current);selection=null;render();status('Guardado');}catch(e){status(e.message,true);}finally{lock(false);}
  }
  function render(){
    resizeObserver?.disconnect();
    const d=state.document,shapes=d.notation==='flow'?FLOW:UML;
    if(selection&&!d.nodes.concat(d.edges).some(n=>n.id===selection))selection=null;
    area.innerHTML=`<div class="dg-header"><div><h1>${esc(d.title)}</h1><span class="dg-muted">${d.notation==='flow'?'Diagrama de flujo':'UML · Clases'} · ${esc(MODES[d.config.mode])}</span></div><div class="dg-buttons"><button id="dgBack">Todos los diagramas</button><button id="dgSettingsBtn">Configuración</button><button id="dgReload">Recargar</button></div><div class="dg-status" id="dgStatus" role="status" aria-live="polite"></div></div>
    <div class="dg-settings hidden" id="dgSettings"><label>Nombre<input id="dgTitleEdit" maxlength="200" value="${esc(d.title)}"></label>${configFields(d.config)}<button id="dgConfigSave">Guardar configuración</button><p class="dg-muted">Cambiar de modo conserva el diagrama, la conversación y las decisiones.</p></div>
    <div class="dg-layout"><aside class="dg-panel"><details open><summary><strong>Elementos</strong></summary><div class="dg-palette">${Object.entries(shapes).map(([shape,title])=>`<button type="button" class="dg-shape-tool" data-shape="${shape}" aria-label="Añadir ${esc(title)}" title="Añadir ${esc(title)}">${paletteFigure(shape)}<span>${esc(title)}</span></button>`).join('')}</div></details><details open><summary><strong>Relaciones</strong></summary><label for="dgRelation" class="dg-muted">Tipo de relación</label><select id="dgRelation">${options(Object.fromEntries(Object.entries(REL).filter(([k])=>d.notation==='flow'?k==='flow':k!=='flow')), 'flow')}</select><button id="dgConnect" aria-pressed="false">Conectar</button><p class="dg-connection-step hidden" id="dgConnectHelp"></p></details><div id="dgInspector" class="dg-inspector"></div></aside>
    <section><div class="dg-toolbar"><button id="dgUndo" ${undo.length?'':'disabled'}>Deshacer</button><button id="dgRedo" ${redo.length?'':'disabled'}>Rehacer</button><button id="dgFit">Centrar</button><button id="dgZoomOut" aria-label="Alejar">−</button><button id="dgZoomIn" aria-label="Acercar">+</button><span class="dg-spacer"></span><button id="dgExport">Exportar SVG</button><button id="dgExportJson">JSON</button><button type="button" id="dgImportBtn" title="Importar un diagrama JSON">Importar</button><input type="file" id="dgImport" class="hidden" accept=".json,application/json" aria-label="Importar diagrama JSON"></div>
    <svg class="dg-canvas" id="dgCanvas" role="group" aria-label="Lienzo del diagrama. Selecciona elementos para editarlos; arrastra para moverlos." tabindex="0" xmlns="http://www.w3.org/2000/svg"></svg><div class="dg-canvas-footer"><details class="dg-canvas-help"><summary>Controles del lienzo</summary><ul><li>Arrastra un elemento para moverlo.</li><li>Arrastra el fondo para desplazar el lienzo.</li><li>Usa la rueda para ampliar o reducir.</li><li>Edita las posiciones en el panel del elemento.</li></ul></details><button id="dgDelete" class="dg-delete" aria-label="Eliminar diagrama">Eliminar</button></div><div class="dg-review-panels"><details class="dg-review-card dg-warnings"><summary><span>Comprobaciones</span><span class="dg-count">${state.warnings.length}</span></summary><ul class="dg-check-list">${state.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${!state.warnings.length?'<p class="dg-empty-note">Sin advertencias de estructura.</p>':''}</details><details class="dg-review-card"><summary title="Registro de propuestas aceptadas, incluidas las que hayas deshecho."><span>Decisiones</span><span class="dg-count">${state.decisions.length}</span></summary><div class="dg-decision-list">${state.decisions.map(x=>`<div class="dg-decision"><strong>${esc(x.title)}</strong>${x.reason?`<p>${esc(x.reason)}</p>`:''}</div>`).join('')||'<p class="dg-empty-note">Sin decisiones registradas.</p>'}</div></details></div></section>
    <aside class="dg-panel dg-mentor"><h2>${esc(MODES[d.config.mode])}</h2><p class="dg-muted">${modeHelp(d.config.mode)}</p><div id="dgModel"></div><div class="dg-mentor-log" id="dgLog">${state.conversation.map(m=>`<div class="dg-message ${m.role==='user'?'dg-message-user':''}">${esc(m.content)}${m.question?`<div class="dg-question">${esc(m.question)}</div>`:''}</div>`).join('')}</div><div id="dgProposals">${state.proposals.map(p=>`<div class="dg-proposal"><strong>${esc(p.title)}</strong><p>${esc(p.reason)}</p><details><summary>Ver cambios propuestos</summary><svg class="dg-proposal-canvas" data-preview="${p.id}" aria-label="Vista previa de la propuesta"></svg><div class="dg-preview">${esc(describe(p))}</div></details><div class="dg-buttons"><button data-proposal="${p.id}" data-decision="apply">Aplicar</button><button data-proposal="${p.id}" data-decision="discard">Descartar</button></div></div>`).join('')}</div><form id="dgAsk"><label for="dgAnswer" class="dg-muted">Tu respuesta o consulta</label><textarea id="dgAnswer" maxlength="6000" placeholder="Explica tu decisión o pregunta al mentor…"></textarea><button type="submit">Enviar</button></form><div class="dg-buttons" style="margin-top:10px"><button data-action="start">Iniciar mentoría</button><button data-action="hint">Pista</button><button data-action="example">Ejemplo</button><button data-action="explain">Explicar</button><button data-action="review">Revisar</button><button data-action="solution">Mostrar solución</button><button data-action="generate">Generar completo</button></div></aside></div>`;
    el('dgBack').onclick=showList;el('dgReload').onclick=()=>open(state.id);
    el('dgSettingsBtn').onclick=()=>el('dgSettings').classList.toggle('hidden');
    el('dgConfigSave').onclick=()=>mutate(doc=>{doc.title=el('dgTitleEdit').value;doc.config=readConfig(el('dgSettings'),doc.config);});
    area.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>mutate(doc=>{const y=doc.nodes.length?Math.max(...doc.nodes.map(n=>n.y+dimensions(n).h))+70:view.y+80;doc.nodes.push({id:uid(),shape:b.dataset.shape,label:shapes[b.dataset.shape],x:view.x+80,y,attributes:'',methods:''});selection=doc.nodes[doc.nodes.length-1].id;}));
    el('dgUndo').onclick=()=>history('undo');el('dgRedo').onclick=()=>history('redo');
    el('dgConnect').onclick=()=>{connection=connection?null:{from:null,kind:el('dgRelation').value};connectionHint();};
    el('dgFit').onclick=fit;el('dgZoomIn').onclick=()=>zoom(1.2);el('dgZoomOut').onclick=()=>zoom(1/1.2);
    el('dgExport').onclick=exportSVG;el('dgExportJson').onclick=()=>download(JSON.stringify(d,null,2),'application/json',d.title+'.json');
    el('dgImportBtn').onclick=()=>el('dgImport').click();
    el('dgImport').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw new Error('El archivo supera 500 KB.');const doc=JSON.parse(await file.text());if(doc.notation!==d.notation)throw new Error('Importa la misma notación o crea otro taller.');if(!await confirmAction('Importar reemplazará el contenido del lienzo. Puedes deshacer el cambio.'))return;mutate(candidate=>Object.assign(candidate,doc));}catch(err){status(err.message,true);}};
    el('dgDelete').onclick=async()=>{if(!await confirmAction('¿Eliminar este diagrama y su conversación?'))return;lock(true);try{await api('/'+state.id,'DELETE',{revision:state.revision});lock(false);showList();}catch(e){status(e.message,true);lock(false);}};
    el('dgAsk').onsubmit=e=>{e.preventDefault();assist('answer');};
    area.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>assist(b.dataset.action));
    area.querySelectorAll('[data-proposal]').forEach(b=>b.onclick=()=>decide(b.dataset.proposal,b.dataset.decision));
    window._mountModelSelector?.(el('dgModel'),{context:'diagram',value:model,onChange:c=>{model=c;}});
    draw();previews();inspector();connectionHint();mountSelects(area);bindCanvas();resizeObserver=new ResizeObserver(()=>{if(el('dgCanvas')?.isConnected)draw();});resizeObserver.observe(el('dgCanvas'));el('dgLog').scrollTop=el('dgLog').scrollHeight;
  }
  function describe(p){
    const names=Object.fromEntries(p.preview.nodes.concat(state.document.nodes).map(n=>[n.id,n.label]));
    const verbs={add_node:'Añadir elemento',update_node:'Editar elemento',remove_node:'Eliminar elemento',add_edge:'Añadir relación',update_edge:'Editar relación',remove_edge:'Eliminar relación'};
    return p.operations.map(op=>{
      const n=op.value||{};
      if(op.op==='replace_graph')return `Reemplazar el lienzo: ${n.nodes.length} elementos y ${n.edges.length} relaciones.\n`+n.nodes.map(x=>`${(FLOW[x.shape]||UML[x.shape])}: ${x.label}`).join('\n')+'\n'+n.edges.map(e=>`${names[e.from]} → ${names[e.to]}${e.label?' · '+e.label:''} (${REL[e.kind]})`).join('\n');
      let text=`${verbs[op.op]}: ${n.label||names[op.id]||''}`;
      if(n.shape)text+=` (${FLOW[n.shape]||UML[n.shape]})`;
      if(n.from)text+=` ${names[n.from]} → ${names[n.to]} (${REL[n.kind]})`;
      if(n.attributes)text+='\nAtributos:\n'+n.attributes;
      if(n.methods)text+='\nMétodos:\n'+n.methods;
      if(n.sourceMultiplicity||n.targetMultiplicity)text+=`\nMultiplicidades: ${n.sourceMultiplicity||''} → ${n.targetMultiplicity||''}`;
      return text;
    }).join('\n\n');
  }
  function previews(){
    const doc=state.document,selected=selection;selection=null;
    for(const p of state.proposals){
      const svg=area.querySelector(`[data-preview="${p.id}"]`),nodes=p.preview.nodes;
      state.document=p.preview;
      const x=nodes.length?Math.min(...nodes.map(n=>n.x))-40:0,y=nodes.length?Math.min(...nodes.map(n=>n.y))-40:0;
      const w=nodes.length?Math.max(...nodes.map(n=>n.x+dimensions(n).w))-x+40:400,h=nodes.length?Math.max(...nodes.map(n=>n.y+dimensions(n).h))-y+40:240;
      svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);
      svg.innerHTML=(el('dgCanvas').querySelector('defs').outerHTML+nodes.map(nodeSVG).join('')+p.preview.edges.map(edgeSVG).join('')).replace(/id="dg-/g,`id="${p.id}-dg-`).replace(/url\(#dg-/g,`url(#${p.id}-dg-`);
      svg.querySelectorAll('[tabindex]').forEach(n=>{n.removeAttribute('tabindex');n.removeAttribute('role');});
    }
    state.document=doc;selection=selected;
  }
  async function confirmAction(text){return window.showConfirm?await window.showConfirm('Diagramas',text,'Continuar'):window.confirm(text);}
  async function assist(action){
    if(busy||!state)return;if(!model){status('Selecciona un modelo de IA.',true);return;}
    if(['solution','generate'].includes(action)&&state.document.nodes.length&&!await confirmAction('La IA propondrá una solución completa. Podrás revisar los cambios antes de aplicarlos.'))return;
    const message=el('dgAnswer').value;if(action==='answer'&&!message.trim())return;
    lock(true);status('Consultando al mentor…');
    try{state=await api('/'+state.id+'/assist','POST',{revision:state.revision,action,message,selection,...model});render();status(state.proposals.length?'Propuestas por revisar':'Guardado');}catch(e){status(e.message,true);}finally{lock(false);}
  }
  async function decide(id,decision){if(busy)return;const before=copy(state.document);lock(true);try{state=await api('/'+state.id+'/proposals/'+id,'POST',{revision:state.revision,decision});if(decision==='apply'){undo.push(before);redo=[];}render();if(decision==='apply')fit();status(decision==='apply'?'Cambios aplicados y guardados.':'Propuesta descartada.');}catch(e){status(e.message,true);}finally{lock(false);}}
  function dimensions(n){return {w:n.shape==='connector'?50:200,h:['class','interface'].includes(n.shape)?Math.max(128,76+(n.attributes.split('\n').filter(Boolean).length+n.methods.split('\n').filter(Boolean).length)*18):n.shape==='connector'?50:80};}
  function svgText(text,x,y,max=26){const lines=String(text).match(new RegExp('.{1,'+max+'}(?:\\s|$)|.{1,'+max+'}','g'))||[''];return lines.slice(0,3).map((l,i)=>`<text x="${x}" y="${y+i*17}" text-anchor="middle">${esc(l.trim())}</text>`).join('');}
  function shapeMarkup(type,w,h){let shape='';
    switch(type){
      case 'decision':shape=`<polygon points="${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}"/>`;break;
      case 'input':shape=`<polygon points="20,0 ${w},0 ${w-20},${h} 0,${h}"/>`;break;
      case 'database':shape=`<path d="M0 14 C0 -4 ${w} -4 ${w} 14 V${h-14} C${w} ${h+4} 0 ${h+4} 0 ${h-14} Z M0 14 C0 32 ${w} 32 ${w} 14"/>`;break;
      case 'document':shape=`<path d="M0 0 H${w} V${h-12} Q${w*.75} ${h-28} ${w*.5} ${h-12} T0 ${h-12} Z"/>`;break;
      case 'note':shape=`<path d="M0 0 H${w-18} L${w} 18 V${h} H0 Z M${w-18} 0 V18 H${w}"/>`;break;
      default:shape=`<rect width="${w}" height="${h}" rx="${['start','end','connector'].includes(type)?h/2:4}"/>`;
    }
    if(type==='subprocess')shape+=`<path d="M12 0 V${h} M${w-12} 0 V${h}"/>`;
    return shape;
  }
  function paletteFigure(type){
    const uml=['class','interface'].includes(type);
    const w=type==='connector'?50:type==='decision'?90:type==='database'?85:120,h=type==='connector'?50:uml?90:70;
    const gid='dg-palette-'+type;
    let detail='';
    if(uml){detail=`<path class="dg-shape-detail" d="M0 29 H${w} M0 59 H${w}"/><text x="${w/2}" y="20" text-anchor="middle">${type==='interface'?'«interface»':'Clase'}</text><path class="dg-shape-member" d="M12 41 h6 m-3 -3 v6 M25 41 h50 M12 72 h6 M25 72 h60"/>`;}
    if(type==='connector')detail='<text x="25" y="31" text-anchor="middle">A</text>';
    return `<svg class="dg-shape-figure" viewBox="-8 -8 ${w+16} ${h+16}" aria-hidden="true" focusable="false"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop class="dg-shape-top"/><stop class="dg-shape-bottom" offset="1"/></linearGradient></defs><g class="dg-shape-body" style="fill:url(#${gid})">${shapeMarkup(type,w,h)}</g>${detail}</svg>`;
  }
  function nodeSVG(n){const {w,h}=dimensions(n);let shape=shapeMarkup(n.shape,w,h);
    let text;
    if(['class','interface'].includes(n.shape)){
      const attrs=n.attributes.split('\n').filter(Boolean),methods=n.methods.split('\n').filter(Boolean),divider=54+attrs.length*18;
      shape+=`<path d="M0 44 H${w} M0 ${divider} H${w}"/>`;
      text=(n.shape==='interface'?'<text x="100" y="16" text-anchor="middle">«interface»</text>':'')+svgText(n.label,100,n.shape==='interface'?34:28)+attrs.map((t,i)=>`<text x="9" y="${61+i*18}">${esc(t.slice(0,27))}</text>`).join('')+methods.map((t,i)=>`<text x="9" y="${divider+19+i*18}">${esc(t.slice(0,27))}</text>`).join('');
    }else text=svgText(n.label,w/2,h/2-5,n.shape==='connector'?5:25);
    return `<g data-node="${esc(n.id)}" class="dg-node ${selection===n.id?'dg-selected':''}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${esc(n.label)}">${shape}${text}</g>`;
  }
  function edgeSVG(e){const a=state.document.nodes.find(n=>n.id===e.from),b=state.document.nodes.find(n=>n.id===e.to);if(!a||!b)return '';const da=dimensions(a),db=dimensions(b),ac={x:a.x+da.w/2,y:a.y+da.h/2},bc={x:b.x+db.w/2,y:b.y+db.h/2};const dx=bc.x-ac.x,dy=bc.y-ac.y;
    function border(c,dim,sign){const ratio=Math.max(Math.abs(dx)/(dim.w/2),Math.abs(dy)/(dim.h/2),.001);return {x:c.x+sign*dx/ratio,y:c.y+sign*dy/ratio};}
    let p=border(ac,da,1),q=border(bc,db,-1),path=`M${p.x} ${p.y} L${q.x} ${q.y}`;
    if(a.id===b.id){p={x:a.x+da.w,y:a.y+20};q={x:a.x+da.w,y:a.y+60};path=`M${p.x} ${p.y} C${p.x+90} ${p.y-60} ${q.x+90} ${q.y+60} ${q.x} ${q.y}`;}
    const marker=['inheritance','implementation'].includes(e.kind)?'triangle':['flow','dependency'].includes(e.kind)?'arrow':null;
    return `<g data-edge="${esc(e.id)}" tabindex="0" role="button" aria-label="Relación ${esc(e.label||REL[e.kind])}"><path class="dg-hit" d="${path}"/><path class="dg-edge ${selection===e.id?'dg-selected':''}" d="${path}" ${['dependency','implementation'].includes(e.kind)?'stroke-dasharray="6 4"':''} ${marker?`marker-end="url(#dg-${marker})"`:''} ${['composition','aggregation'].includes(e.kind)?`marker-start="url(#dg-${e.kind})"`:''}/><text class="dg-edge-label" text-anchor="middle" x="${(p.x+q.x)/2}" y="${(p.y+q.y)/2-8}">${esc(e.label)}</text><text class="dg-edge-label" x="${p.x+8}" y="${p.y-8}">${esc(e.sourceMultiplicity)}</text><text class="dg-edge-label" x="${q.x+8}" y="${q.y-8}">${esc(e.targetMultiplicity)}</text></g>`;
  }
  function draw(){const svg=el('dgCanvas');if(!svg||!state)return;svg.setAttribute('viewBox',`${view.x} ${view.y} ${(svg.clientWidth||900)/view.k} ${(svg.clientHeight||520)/view.k}`);svg.innerHTML=`<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none"/></marker><marker id="dg-triangle" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1 L11 6 L1 11 Z"/></marker>${['composition','aggregation'].map(k=>`<marker id="dg-${k}" viewBox="0 0 14 12" refX="1" refY="6" markerWidth="11" markerHeight="9" orient="auto"><path class="${k==='composition'?'dg-filled':''}" d="M1 6 L7 1 L13 6 L7 11 Z"/></marker>`).join('')}</defs>${state.document.edges.map(edgeSVG).join('')}${state.document.nodes.map(nodeSVG).join('')}`;}
  function inspector(){const root=el('dgInspector'),d=state.document,n=d.nodes.find(n=>n.id===selection),e=d.edges.find(e=>e.id===selection);if(!n&&!e){root.innerHTML='<p class="dg-inspector-empty">Selecciona un elemento para editarlo.</p>';return;}
    root.innerHTML=`<h2>${n?'Elemento':'Relación'}</h2><form id="dgEdit"><label>Texto<input name="label" maxlength="${n?300:200}" value="${esc((n||e).label)}"></label>${n?`<label>Forma<select name="shape">${options(d.notation==='flow'?FLOW:UML,n.shape)}</select></label><label>X<input name="x" type="number" value="${n.x}" min="-20000" max="20000" step="any"></label><label>Y<input name="y" type="number" value="${n.y}" min="-20000" max="20000" step="any"></label>${d.notation==='class'?`<label>Atributos<textarea name="attributes" maxlength="4000">${esc(n.attributes)}</textarea></label><label>Métodos<textarea name="methods" maxlength="4000">${esc(n.methods)}</textarea></label><p class="dg-muted">Un miembro por línea. Ej.: − email: String; + validar(): Boolean</p>`:''}`:`<label>Tipo<select name="kind">${options(Object.fromEntries(Object.entries(REL).filter(([k])=>d.notation==='flow'?k==='flow':k!=='flow')),e.kind)}</select></label><label>Origen<select name="from">${options(Object.fromEntries(d.nodes.map(n=>[n.id,n.label])),e.from)}</select></label><label>Destino<select name="to">${options(Object.fromEntries(d.nodes.map(n=>[n.id,n.label])),e.to)}</select></label>${d.notation==='class'?`<label>Multiplicidad del origen<input name="sourceMultiplicity" maxlength="30" value="${esc(e.sourceMultiplicity)}"></label><label>Multiplicidad del destino<input name="targetMultiplicity" maxlength="30" value="${esc(e.targetMultiplicity)}"></label>`:''}`}<button type="submit">Guardar cambios</button></form><button id="dgRemove" style="margin-top:8px">Eliminar ${n?'elemento':'relación'}</button>`;
    el('dgEdit').onsubmit=evt=>{evt.preventDefault();const fields=Object.fromEntries(new FormData(evt.target));if(n){fields.x=Number(fields.x);fields.y=Number(fields.y);}mutate(doc=>Object.assign((n?doc.nodes:doc.edges).find(x=>x.id===selection),fields));};
    mountSelects(root);
    el('dgRemove').onclick=()=>mutate(doc=>{if(n){doc.nodes=doc.nodes.filter(x=>x.id!==selection);doc.edges=doc.edges.filter(x=>![x.from,x.to].includes(selection));}else doc.edges=doc.edges.filter(x=>x.id!==selection);selection=null;});
  }
  function point(e){const svg=el('dgCanvas'),p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  function connectionHint(){
    const help=el('dgConnectHelp'),button=el('dgConnect');
    if(!help||!button)return;
    help.classList.toggle('hidden',!connection);
    help.textContent=connection?.from?'2. Selecciona el destino.':'1. Selecciona el origen.';
    button.textContent=connection?'Cancelar conexión':'Conectar';
    button.setAttribute('aria-pressed',String(Boolean(connection)));
  }
  function choose(id,isNode){if(busy)return;if(connection&&isNode){if(!connection.from){connection.from=id;connectionHint();}else{const from=connection.from,kind=connection.kind;connection=null;mutate(d=>{const edge={id:uid(),from,to:id,kind,label:'',sourceMultiplicity:'',targetMultiplicity:''};d.edges.push(edge);selection=edge.id;});}return;}selection=id;draw();inspector();}
  function bindCanvas(){const svg=el('dgCanvas');let drag=null;
    svg.onpointerdown=e=>{if(busy||e.button!==0)return;const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]');if(connection&&node){choose(node.dataset.node,true);return;}if(edge){choose(edge.dataset.edge,false);return;}const p=point(e);drag={id:node?.dataset.node,start:p,original:copy(state.document),view:{...view},changed:false};selection=node?.dataset.node||null;svg.setPointerCapture(e.pointerId);draw();inspector();};
    svg.onpointermove=e=>{if(!drag)return;const p=point(e);if(drag.id){const n=state.document.nodes.find(n=>n.id===drag.id),old=drag.original.nodes.find(n=>n.id===drag.id);n.x=old.x+p.x-drag.start.x;n.y=old.y+p.y-drag.start.y;drag.changed=Math.abs(p.x-drag.start.x)+Math.abs(p.y-drag.start.y)>3;draw();}else{view.x-=p.x-drag.start.x;view.y-=p.y-drag.start.y;draw();}};
    const finish=()=>{if(!drag)return;const d=drag;drag=null;if(d.id&&d.changed){const changed=copy(state.document);state.document=d.original;mutate(doc=>Object.assign(doc,changed));}};
    svg.onpointerup=finish;svg.onpointercancel=finish;
    svg.onwheel=e=>{e.preventDefault();if(!busy)zoom(e.deltaY<0?1.1:1/1.1);};
    svg.onkeydown=e=>{if(e.key==='Escape'){connection=null;selection=null;connectionHint();draw();inspector();}if(e.target.dataset.node&&['Enter',' '].includes(e.key)){e.preventDefault();choose(e.target.dataset.node,true);}if(e.target.dataset.edge&&['Enter',' '].includes(e.key)){e.preventDefault();choose(e.target.dataset.edge,false);}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');}};
  }
  function zoom(factor){const k=Math.max(.2,Math.min(3,view.k*factor));view.x+=(el('dgCanvas').clientWidth/view.k-el('dgCanvas').clientWidth/k)/2;view.y+=(el('dgCanvas').clientHeight/view.k-el('dgCanvas').clientHeight/k)/2;view.k=k;draw();}
  function fit(){const nodes=state.document.nodes;if(!nodes.length){view={x:-40,y:-40,k:1};draw();return;}const minX=Math.min(...nodes.map(n=>n.x))-60,minY=Math.min(...nodes.map(n=>n.y))-60,maxX=Math.max(...nodes.map(n=>n.x+dimensions(n).w))+60,maxY=Math.max(...nodes.map(n=>n.y+dimensions(n).h))+60;view={x:minX,y:minY,k:Math.min(el('dgCanvas').clientWidth/(maxX-minX),el('dgCanvas').clientHeight/(maxY-minY),1.5)};draw();}
  function download(text,type,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportSVG(){const source=el('dgCanvas'),clone=source.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.removeAttribute('class');const nodes=state.document.nodes;if(nodes.length){const x=Math.min(...nodes.map(n=>n.x))-50,y=Math.min(...nodes.map(n=>n.y))-50,w=Math.max(...nodes.map(n=>n.x+dimensions(n).w))-x+100,h=Math.max(...nodes.map(n=>n.y+dimensions(n).h))-y+80;clone.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);clone.setAttribute('width',w);clone.setAttribute('height',h);}const originals=source.querySelectorAll('*'),clones=clone.querySelectorAll('*');originals.forEach((n,i)=>{const css=getComputedStyle(n);for(const key of ['fill','stroke','stroke-width','stroke-dasharray','font','paint-order'])clones[i].style.setProperty(key,css.getPropertyValue(key));clones[i].removeAttribute('tabindex');clones[i].removeAttribute('role');});download(new XMLSerializer().serializeToString(clone),'image/svg+xml',state.document.title+'.svg');}
  window.DiagramApp={showList,getAssistantContext:()=>state?{type:'view',id:'diagramArea',title:'Diagramas',excerpt:JSON.stringify(state.document).slice(0,8000)}:null};
})();
