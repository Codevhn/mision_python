import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The scroll container must not clip property menus in the review table.
export function DatabasePropertyMenu({ preview, anchor, owner, mode, onClose, children }) {
  const menu = useRef(null);
  const [position, setPosition] = useState({visibility:'hidden'});
  useLayoutEffect(() => {
    if (!preview) return;
    const place = () => {
      if (!anchor.current || !menu.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = menu.current.offsetWidth, height = menu.current.offsetHeight;
      setPosition({left:Math.max(8, Math.min(rect.left, window.innerWidth-width-8)),
        top:Math.max(8, Math.min(rect.bottom+4, window.innerHeight-height-8))});
    };
    // Parent host refs are committed after child layout effects.
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [preview, anchor, mode]);
  if (!preview) return <div className="bn-db-colmenu-pop" contentEditable={false}>{children}</div>;
  return createPortal(<div ref={menu} className="bn-db-colmenu-pop db-preview-popover db-preview-colmenu"
    contentEditable={false} data-db-menu-owner={owner} style={position}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); anchor.current?.querySelector('button')?.focus(); } }}>
    {children}
  </div>, document.body);
}
