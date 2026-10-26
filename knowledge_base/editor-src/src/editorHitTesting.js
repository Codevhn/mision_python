// BlockNote 0.51.4 picks the first editor on equal geometric distance. A Peek
// overlaps its parent editor, so the background editor wins a distance-zero tie.
// Keep the native selection/drag implementation and restrict that search only
// when the frontmost DOM surface is an Atlas Peek (including its owned portals).
export function foregroundEditorAtPoint(root,coords) {
  const top=root.elementFromPoint(coords.clientX,coords.clientY);
  const surface=top?.closest?.('.page-peek-modal');
  const owner=top?.closest?.('[data-peek-owner]')?.dataset.peekOwner;
  const scope=surface||(owner?root.getElementById('pagePeekOverlay'):null);
  if(!scope)return null;
  return scope.querySelector('.bn-editor');
}

// On a full page the reading column can start far inside the editor's block
// group. BlockNote clamps the pointer to the group's left edge while crossing
// the gutter, which can resolve to another block (or no block) and unmount the
// side menu before its drag handle receives the click. Keep the current block
// only in the narrow path between its first line and its own side menu.
export function isSideMenuTransit(view,event) {
  if(!view.state?.show||!view.hoveredBlock||view.menuFrozen)return false;
  if(view.pmView.dom.closest?.('#pagePeekOverlay')||event.target?.closest?.('#pagePeekOverlay'))return false;
  if(view.hoveredBlock.getAttribute('data-id')!==view.state.block?.id)return false;
  const menu=view.editor?.portalElement?.querySelector?.('.bn-side-menu');
  if(!menu)return false;
  if(menu.contains(event.target))return true;

  const menuRect=menu.getBoundingClientRect();
  const blockRect=view.hoveredBlock.getBoundingClientRect();
  const content=view.hoveredBlock.querySelector('.bn-inline-content,.bn-block-content')||view.hoveredBlock;
  const contentRect=content.getBoundingClientRect();
  if(!menuRect.width||!menuRect.height)return false;
  const {clientX:x,clientY:y}=event;
  return x>=menuRect.left-8 && x<=Math.max(menuRect.right,contentRect.left+16)
    && y>=Math.max(menuRect.top-10,blockRect.top-10)
    && y<=Math.min(menuRect.bottom+10,blockRect.bottom+10);
}

export function installSideMenuTransit(view) {
  const root=view.pmView?.root;
  const native=view.onMouseMove;
  if(typeof native!=='function'||!root?.removeEventListener||!root?.addEventListener||native.atlasSideMenuTransit)return;
  const wrapped=function(event){
    if(!isSideMenuTransit(view,event))native.call(view,event);
  };
  wrapped.atlasSideMenuTransit=true;
  root.removeEventListener('mousemove',native,true);
  root.addEventListener('mousemove',wrapped,true);
  // Native destroy() removes this.onMouseMove, so it also cleans up our listener.
  view.onMouseMove=wrapped;
}

export function installForegroundEditorHitTesting(extension) {
  for (const plugin of extension?.prosemirrorPlugins||[]) {
    const create=plugin.spec.view;
    if(typeof create!=='function'||create.atlasForegroundAware)continue;
    const wrapped=function(...args){
      const view=create.apply(this,args);
      const original=view.findClosestEditorElement;
      if(typeof original!=='function')throw new Error('BlockNote SideMenu changed: foreground adapter needs review');
      view.findClosestEditorElement=function(coords){
        const root=this.pmView.dom.ownerDocument;
        const editor=foregroundEditorAtPoint(root,coords);
        if(!editor)return original.call(this,coords);
        const rect=editor.querySelector('.bn-block-group')?.getBoundingClientRect()||editor.getBoundingClientRect();
        const dx=Math.max(rect.left-coords.clientX,0,coords.clientX-rect.right);
        const dy=Math.max(rect.top-coords.clientY,0,coords.clientY-rect.bottom);
        return {element:editor,distance:Math.hypot(dx,dy)};
      };
      installSideMenuTransit(view);
      return view;
    };
    wrapped.atlasForegroundAware=true;
    plugin.spec.view=wrapped;
  }
}
