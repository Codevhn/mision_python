/* Explicit course links in syllabus tables; no fuzzy match navigates automatically. */
(() => {
  const storage='atlas-course-topic-return';let returnContext=null,pendingTarget=null,navigationVersion=0;
  try{returnContext=JSON.parse(sessionStorage.getItem(storage)||'null');}catch{}
  const saveContext=value=>{returnContext=value;try{if(value)sessionStorage.setItem(storage,JSON.stringify(value));else sessionStorage.removeItem(storage);}catch{}};
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const api=async(url,body)=>{const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo completar la operación.');return data;};
  const parse=href=>{try{const u=new URL(href,location.href);if(u.origin!==location.origin||u.searchParams.get('atlas-topic')!=='1')return null;const p=u.searchParams;return {entry_id:p.get('open'),course_id:p.get('course'),heading:p.has('section')?p.get('section'):null,occurrence:Number(p.get('occurrence')||0),sourceId:p.get('temario'),rootId:p.get('roadmap')};}catch{return null;}};
  const link=(target,source)=>{
    const p=new URLSearchParams({'atlas-topic':'1',open:target.entry_id,course:target.course_id,temario:source.sourceId,roadmap:source.rootId||source.sourceId});
    if(target.heading!==null){p.set('section',target.heading);p.set('occurrence',String(target.occurrence));}
    return location.pathname+'?'+p;
  };
  const label=target=>[target.module,target.title,target.heading].filter(Boolean).join(' › ');
  async function configure(){
    const editor=window.AtlasPeekCourseContext?.editor(),source=window.AtlasPeekCourseContext?.capture();if(!editor||!source)return;
    const topics=editor.getCourseTopics();if(!topics.length)return;
    const dialog=node('dialog',undefined,'assistant-confirm-dialog course-topic-dialog');dialog.dataset.peekOwner=source.sourceId;dialog.setAttribute('aria-label','Vincular temario con curso');
    const heading=node('h2','Vincular temario con curso'),intro=node('p','Elige el curso. Solo se proponen automáticamente coincidencias únicas; revisa los destinos antes de aplicar.');
    const courseLabel=node('label','Curso '),course=node('select');course.setAttribute('aria-label','Curso del temario');courseLabel.append(course);
    const analyze=node('button','Analizar subtemas');analyze.type='button';const status=node('p');status.setAttribute('role','status');
    const results=node('div',undefined,'course-topic-matches'),footer=node('div',undefined,'course-topic-footer'),cancel=node('button','Cancelar'),apply=node('button','Aplicar vínculos');cancel.type=apply.type='button';apply.disabled=true;footer.append(cancel,apply);dialog.append(heading,intro,courseLabel,analyze,status,results,footer);
    let version=0,choices=[],selections=[],applied=false;
    const count=()=>{const n=selections.filter(item=>item.select.value||parse(item.topic.href)).length;apply.textContent=`Aplicar ${n} vínculos`;apply.disabled=!n;};
    course.addEventListener('change',()=>{version++;results.replaceChildren();selections=[];count();});
    analyze.onclick=async()=>{
      const token=++version,courseId=course.value;if(!courseId)return;analyze.disabled=true;status.textContent='Buscando apartados en las lecciones…';results.replaceChildren();apply.disabled=true;
      try{
        const scanned=editor.getCourseTopics();
        const data=await api('/api/roadmap/course-topics',{course_id:courseId,topics:scanned.map(({key,text,module})=>({key,text,module}))});if(token!==version)return;
        choices=data.targets;selections=[];applied=false;
        for(const item of data.results){
          const topic=scanned.find(t=>t.key===item.key),row=node('div',undefined,'course-topic-match'),title=node('div'),destination=node('div'),search=node('input'),select=node('select');
          title.append(node('small',topic.module),node('p',topic.text));search.placeholder='Buscar otro apartado del curso…';search.setAttribute('aria-label','Buscar destino de '+topic.text);select.setAttribute('aria-label','Destino de '+topic.text);
          const previous=parse(topic.href),existing=previous?.course_id===courseId?choices.find(t=>t.entry_id===previous.entry_id&&t.heading===previous.heading&&t.occurrence===previous.occurrence):null;
          let initial=true;const fill=items=>{const selected=initial?(existing?.id||(topic.href&&!previous?null:item.selected)):select.value;initial=false;select.replaceChildren();select.append(new Option('Sin vincular', ''));const kept=choices.find(t=>t.id===selected);if(kept&&!items.some(t=>t.id===kept.id))items=[kept,...items];for(const target of items)select.append(new Option(label(target),target.id));if([...select.options].some(o=>o.value===selected))select.value=selected;};
          fill([...new Map([existing,...item.candidates.map(id=>choices.find(c=>c.id===id))].filter(Boolean).map(t=>[t.id,t])).values()]);
          search.oninput=()=>{const q=search.value.toLocaleLowerCase();fill(choices.filter(t=>label(t).toLocaleLowerCase().includes(q)).slice(0,60));count();};select.onchange=count;
          destination.append(search,select);row.append(title,destination);results.append(row);selections.push({topic,select});
        }
        status.textContent=`${scanned.length} subtemas. ${data.results.filter(r=>r.selected).length} coincidencias únicas. Los demás requieren elegir un destino.`;count();
      }catch(error){status.textContent=error.message;}finally{analyze.disabled=false;}
    };
    apply.onclick=async()=>{
      apply.disabled=true;
      try{
        const assignments=selections.filter(item=>item.select.value||parse(item.topic.href)).map(({topic,select})=>({key:topic.key,href:select.value?link(choices.find(t=>t.id===select.value),source):null}));
        if(window.AtlasPeekCourseContext.editor()!==editor)throw Error('El Peek cambió. Abre de nuevo el temario.');
        if(!applied){editor.applyCourseTopicLinks(assignments);applied=true;results.inert=true;course.disabled=true;analyze.disabled=true;}
        await window.AtlasPeekCourseContext.flush();dialog.close();window.showToast?.(`${assignments.length} subtemas actualizados.`);
      }catch(error){status.textContent=error.message;if(applied){apply.textContent='Reintentar guardado';apply.disabled=false;}else count();}
    };
    cancel.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
    try{const courses=await api('/api/courses');course.append(new Option('Elige un curso',''));for(const c of courses)course.append(new Option(c.label||c.id,c.id));const linked=topics.map(t=>parse(t.href)).find(Boolean);if(linked)course.value=linked.course_id;}catch(error){status.textContent=error.message;}
  }
  async function openLesson(target,anchor){
    const version=++navigationVersion,sourceEditor=window.AtlasPeekCourseContext.editor(),sourcePage=window.AtlasCourseLessonState().id;
    const validated=(await api('/api/roadmap/course-topic/validate',target)).target;
    if(version!==navigationVersion||sourceEditor!==window.AtlasPeekCourseContext.editor()||sourcePage!==window.AtlasCourseLessonState().id)return;
    const origin=window.AtlasPeekCourseContext.capture()||{sourceId:target.sourceId,rootId:target.rootId,mode:'side',path:[{id:target.sourceId}]};
    const cell=anchor.closest('td,th'),table=cell?.closest('table');
    let topic=cell?.textContent.trim()||'',module='';
    if(cell&&table){const topics=window.AtlasPeekCourseContext.editor()?.getCourseTopics()||[];const blockId=table.closest('[data-id]')?.dataset.id;module=topics.find(t=>t.blockId===blockId&&t.row===cell.parentElement.rowIndex&&t.column===cell.cellIndex)?.module||'';}
    const previous=returnContext;saveContext({...origin,course_id:validated.course_id,topic,module});pendingTarget=validated;
    await window._loadEntryById(validated.entry_id);
    if(window.AtlasCourseLessonState().id!==validated.entry_id){pendingTarget=null;saveContext(previous);throw Error('No se pudo abrir la lección; el contenido actual se conserva.');}
  }
  async function onEntry({detail}){
    document.getElementById('courseTopicReturn')?.remove();
    if(returnContext&&detail.meta.type==='course'&&detail.meta.course===returnContext.course_id){
      const button=node('button','← Volver al temario','btn-ghost course-topic-return');button.id='courseTopicReturn';button.type='button';
      button.onclick=async()=>{button.disabled=true;try{if(await window.AtlasPeekCourseContext.restore(returnContext))saveContext(null);else throw Error('No se pudo volver al temario.');}catch(error){window.showToast?.(error.message,'error');button.disabled=false;}};
      document.getElementById('inlineTitleWrap').before(button);
    }
    const incoming=pendingTarget||parse(location.href);
    if(incoming&&detail.id===incoming.entry_id){
      pendingTarget=null;
      try{const target=(await api('/api/roadmap/course-topic/validate',incoming)).target;
        const editor=window.AtlasCourseLessonState().editor;await editor.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        if(window.AtlasCourseLessonState().id!==target.entry_id)return;
        if(!editor.scrollToCourseHeading(target.heading,target.occurrence))window.showToast?.('La lección está abierta, pero el apartado cambió. Vuelve a vincularlo desde el temario.','error');
      }catch(error){window.showToast?.(error.message,'error');}
    }
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('#pagePeekLinkCourse')){configure().catch(error=>window.showToast?.(error.message,'error'));return;}
    const anchor=event.target.closest('a[href]'),target=anchor&&parse(anchor.getAttribute('href'));if(!target||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();event.stopImmediatePropagation();openLesson(target,anchor).catch(error=>window.showToast?.(error.message,'error'));
  },true);
  const incoming=parse(location.href);if(incoming&&!returnContext)saveContext({sourceId:incoming.sourceId,rootId:incoming.rootId,course_id:incoming.course_id,mode:'side',path:[{id:incoming.sourceId}]});
  window.addEventListener('atlas:entry-opened',onEntry);
})();
