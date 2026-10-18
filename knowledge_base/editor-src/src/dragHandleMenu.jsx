import React, { useCallback } from "react";
import { createPortal } from "react-dom";
import { printableSection } from "./printSection.js";
import {
  useComponentsContext,
  useBlockNoteEditor,
  useExtensionState,
  SideMenu,
  RemoveBlockItem,
  BlockColorsItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { RiFileCopyLine } from "react-icons/ri";
import { BlockCatalogIcon, buildConversionBlockItems, convertCatalogBlock, duplicateCatalogBlock } from "./blockCatalog.jsx";

function isMatchingItem(block, item) {
  return block?.type === item.type && Object.entries(item.props || {})
    .every(([name, value]) => block.props[name] === value);
}

// Kept as a named public helper for existing integrations. Every projection
// now consumes the same ordered catalogue as insert (+) and slash.
export function buildBlockTypeItems(editor, block) {
  return buildConversionBlockItems(editor, block);
}

// The menu that opens from the ⋮⋮ drag handle. Besides the native Delete and
// Color actions it lists every block type the hovered block can be turned into
// (style angle: same as Notion — the types sit directly in the menu). Clicking
// a type converts the *hovered* block (not the cursor's block), which is what
// BlockNote's own Delete/Color items already do under the hood.
export function DragHandleMenu() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();

  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });

  // Portal the menu past the frame's blur/isolation and anchor in viewport
  // coordinates, so collapsed content cannot clip or cover the dropdown.
  const dropdownRef = useCallback((node) => {
    if (!node) return;
    const position=()=>{
      const anchor=editor.portalElement?.querySelector('.bn-side-menu [aria-haspopup="menu"]')||editor.domElement?.closest('.bn-container')?.querySelector('.bn-side-menu [aria-haspopup="menu"]');
      if(!anchor)return;
      const rect=anchor.getBoundingClientRect();
      const barBottom=document.getElementById('ctxBar')?.getBoundingClientRect().bottom||0;
      node.style.maxHeight='none';
      // Native color submenus render beside this dropdown, without a portal.
      // Only scroll the conversion list so the submenu is never clipped.
      node.style.overflow='visible';
      const types=node.querySelector('.atlas-block-type-list');
      if(types){
        const footerHeight=node.getBoundingClientRect().height-types.getBoundingClientRect().height;
        types.style.maxHeight=`${Math.max(80,innerHeight-barBottom-24-footerHeight)}px`;
      }
      const bounds=node.getBoundingClientRect();
      node.style.setProperty('position','fixed','important');
      node.style.setProperty('left',`${Math.max(8,Math.min(rect.right+6,innerWidth-bounds.width-8))}px`,'important');
      node.style.setProperty('top',`${Math.max(barBottom+8,Math.min(rect.top,innerHeight-bounds.height-12))}px`,'important');
      node.style.setProperty('transform','none','important');
    };
    const frame=requestAnimationFrame(position);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,true);
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
  }, [editor]);

  if (block === undefined) return null;
  const items = buildBlockTypeItems(editor, block);

  return createPortal(
    <div className="bn-container bn-mantine atlas-editor-menu-layer" data-peek-owner={editor.domElement?.closest('#pagePeekOverlay')?.dataset.peekOwner}><Components.Generic.Menu.Dropdown
      ref={dropdownRef}
      className={"bn-menu-dropdown bn-drag-handle-menu"}
    >
      <div className="atlas-block-type-list" style={{overflowY:'auto'}}>{items.map((item, index) => {
        const isCurrent = isMatchingItem(block, item);
        const previous = items[index - 1];
        return (
          <React.Fragment key={item.key}>
          {previous?.group !== item.group && <Components.Generic.Menu.Label className="atlas-block-category">{item.group}</Components.Generic.Menu.Label>}
          <Components.Generic.Menu.Item
            className={
              "bn-menu-item bn-drag-handle-type" +
              (isCurrent ? " bn-drag-handle-type-active" : "")
            }
            icon={<BlockCatalogIcon item={item} />}
            checked={isCurrent}
            onClick={() => {
              editor.focus();
              editor.transact(() => convertCatalogBlock(editor, block, item));
            }}
          >
            {item.name}
          </Components.Generic.Menu.Item>
          </React.Fragment>
        );
      })}

      {block.type==='heading' && <Components.Generic.Menu.Item onClick={()=>{
        const section=printableSection(editor.document,block.id);
        if(section)document.dispatchEvent(new CustomEvent('atlas:print-section',{detail:section}));
      }}>Imprimir este tema…</Components.Generic.Menu.Item>}</div>
      <Components.Generic.Menu.Divider />
      <Components.Generic.Menu.Item className="bn-menu-item" icon={<RiFileCopyLine size={16}/>} onClick={() => {
        editor.focus();
        editor.transact(() => duplicateCatalogBlock(editor, block));
      }}>Duplicar</Components.Generic.Menu.Item>
      <RemoveBlockItem>Eliminar</RemoveBlockItem>
      <BlockColorsItem>Color</BlockColorsItem>
    </Components.Generic.Menu.Dropdown></div>,
    editor.domElement?.closest("dialog[open]") || document.body
  );
}

// The side menu keeps BlockNote's native buttons (the "+" and the ⋮⋮), only the
// ⋮⋮'s menu is replaced with ours.
export function CustomSideMenu(props) {
  return <SideMenu {...props} dragHandleMenu={DragHandleMenu} />;
}
