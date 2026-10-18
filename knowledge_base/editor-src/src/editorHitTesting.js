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
      return view;
    };
    wrapped.atlasForegroundAware=true;
    plugin.spec.view=wrapped;
  }
}
