import React from 'react';
import {SideMenuController} from '@blocknote/react';
import {firstLineAlignment} from './blockAlignment.js';

// Keep native hit testing, insertion, freeze/unfreeze and drag behavior.
// Measure the first rendered line and retain the popover scroll updater.
export function AlignedSideMenuController(props){
  const options=React.useMemo(()=>({useFloatingOptions:{
    middleware:[firstLineAlignment()],
    // GenericPopover already runs Floating UI autoUpdate for scroll/resize.
    // The native controller adds another observer that hides the handle on
    // scroll, including the focus/scrollIntoView immediately before a click.
    // Keep updating its measured anchor; its own scroll container clips it.
    whileElementsMounted:()=>undefined,
  }}),[]);
  return <SideMenuController {...props} floatingUIOptions={options}/>;
}
