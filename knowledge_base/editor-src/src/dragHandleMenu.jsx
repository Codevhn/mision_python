import React, { useCallback } from "react";
import {
  useComponentsContext,
  useBlockNoteEditor,
  useExtensionState,
  blockTypeSelectItems,
  SideMenu,
  RemoveBlockItem,
  BlockColorsItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { RiCodeBlock } from "react-icons/ri";

// Verbatim the default props BlockNote sets for a fresh codeBlock (the custom
// spec lives in codeBlock.jsx; its only prop is `language` with default "text").
function codeBlockPropsFor(block) {
  return {
    language: String(
      (block && block.props && block.props.language) || "text",
    ),
  };
}

// Current-type / current-props matcher, mirrors the native BlockTypeSelect so a
// check appears on exactly the type the hovered block already is.
function isMatchingItem(block, item) {
  if (!block) return false;
  if (block.type !== item.type) return false;
  return Object.entries(item.props || {}).every(
    ([propName, propValue]) => block.props[propName] === propValue,
  );
}

// A code block's raw text, e.g. pasted/written markdown source sitting
// inside it (`## Título`, `**negrita**`, numbered steps...) rather than real
// code.
function inlineText(block) {
  return (block.content || [])
    .map((item) => (item && item.type === "text" ? item.text : ""))
    .join("");
}

// Converting a codeBlock into some other type used to just relabel it,
// leaving markdown syntax sitting there as literal text (a "## Título" stays
// exactly that instead of becoming a real heading). Turning code *into* a
// code block already runs text through the editor's own markdown engine
// (pasteCode.js); this is the reverse direction, reusing that same engine
// (tryParseMarkdownToBlocks) so undoing an accidental/no-longer-wanted code
// block gets back real headings/bold/lists instead of a wall of raw syntax.
// Only kicks in when the parse actually finds structure (>1 resulting
// block) — plain text with no markdown just falls through to the normal
// single-type conversion below, respecting whatever type was clicked.
function convertBlock(editor, block, item) {
  if (block.type === "codeBlock" && item.type !== "codeBlock") {
    const text = inlineText(block);
    const parsed = text ? editor.tryParseMarkdownToBlocks(text) : null;
    if (parsed && parsed.length > 1) {
      editor.replaceBlocks([block.id], parsed);
      return;
    }
  }
  const props = item.type === "codeBlock" ? codeBlockPropsFor(block) : item.props;
  editor.updateBlock(block, { type: item.type, props });
}

// The list of block types offered by the drag handle: the canonical text
// blocks (same set and labels as the native "Turn into" selector) plus the
// app's custom codeBlock.
export function buildBlockTypeItems(editor) {
  const items = [
    ...blockTypeSelectItems(editor.dictionary),
    {
      name: "Code Block",
      type: "codeBlock",
      props: { language: "text" },
      icon: RiCodeBlock,
    },
  ];

  const supportedTypes = editor.schema.blockSpecs;

  return items.filter((item) => supportedTypes[item.type]);
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

  if (block === undefined) {
    return null;
  }

  const items = buildBlockTypeItems(editor);

  // Floating-ui positions this dropdown against the raw viewport, with no
  // notion that the sticky #ctxBar (breadcrumb/toolbar) visually occludes its
  // top ~82px. On a block near the top of the page it can flip the dropdown
  // mostly/fully above the handle, landing its first items behind #ctxBar.
  // Nudge it down by exactly the overlap, once, right after it mounts —
  // a transform doesn't fight floating-ui's own top/left positioning.
  const dropdownRef = useCallback((node) => {
    if (!node) return;
    requestAnimationFrame(() => {
      const ctxBar = document.getElementById("ctxBar");
      if (!ctxBar) return;
      const barBottom = ctxBar.getBoundingClientRect().bottom;
      const menuTop = node.getBoundingClientRect().top;
      if (menuTop < barBottom) {
        node.style.transform = `translateY(${barBottom - menuTop + 8}px)`;
      }
    });
  }, []);

  return (
    <Components.Generic.Menu.Dropdown
      ref={dropdownRef}
      className={"bn-menu-dropdown bn-drag-handle-menu"}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isCurrent = isMatchingItem(block, item);

        return (
          <Components.Generic.Menu.Item
            key={item.type + JSON.stringify(item.props || {})}
            className={
              "bn-menu-item bn-drag-handle-type" +
              (isCurrent ? " bn-drag-handle-type-active" : "")
            }
            icon={<Icon size={16} />}
            checked={isCurrent}
            onClick={() => {
              editor.focus();
              editor.transact(() => convertBlock(editor, block, item));
            }}
          >
            {item.name}
          </Components.Generic.Menu.Item>
        );
      })}

      <RemoveBlockItem>Eliminar</RemoveBlockItem>
      <BlockColorsItem>Color</BlockColorsItem>
    </Components.Generic.Menu.Dropdown>
  );
}

// The side menu keeps BlockNote's native buttons (the "+" and the ⋮⋮), only the
// ⋮⋮'s menu is replaced with ours.
export function CustomSideMenu(props) {
  return <SideMenu {...props} dragHandleMenu={DragHandleMenu} />;
}
