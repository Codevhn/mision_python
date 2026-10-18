import React from "react";
import { getDefaultReactSlashMenuItems } from "@blocknote/react";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import {
  RiText, RiH1, RiH2, RiH3, RiH4, RiH5, RiH6, RiListUnordered,
  RiListOrdered, RiListCheck3, RiPlayList2Fill, RiQuoteText,
  RiFileTextLine, RiSubtractLine, RiCodeBlock, RiTable2, RiDatabase2Line,
  RiImage2Fill, RiFilmLine, RiVolumeUpFill, RiFile2Line, RiEmotionFill,
} from "react-icons/ri";
import { newDatabaseData, editorDatabaseContext } from "./databaseIdentity.js";
import "./blockCatalog.css";

// A single ordered catalogue for (+), slash and compatible conversions. Native
// insertion callbacks still own tables, media panels and emoji. The native (+)
// opens the same slash controller, so it cannot develop a separate catalogue.
const BASIC = "Bloques básicos";
const ADVANCED = "Bloques avanzados";
const MEDIA = "Multimedia";
const headingIcons = [RiH1, RiH2, RiH3, RiH4, RiH5, RiH6];
export const BLOCK_CATALOG = [
  { key: "paragraph", type: "paragraph", title: "Párrafo", group: BASIC, icon: RiText, aliases: ["parrafo", "texto"] },
  ...headingIcons.map((icon, index) => ({
    key: index === 0 ? "heading" : `heading_${index + 1}`,
    type: "heading", title: `Encabezado ${index + 1}`, group: BASIC, icon,
    props: { level: index + 1, isToggleable: false }, aliases: [`h${index + 1}`, `titulo ${index + 1}`],
  })),
  { key: "bullet_list", type: "bulletListItem", title: "Lista con viñetas", group: BASIC, icon: RiListUnordered },
  { key: "numbered_list", type: "numberedListItem", title: "Lista numerada", group: BASIC, icon: RiListOrdered },
  { key: "check_list", type: "checkListItem", title: "Lista de tareas", group: BASIC, icon: RiListCheck3 },
  { key: "toggle_list", type: "toggleListItem", title: "Lista desplegable", group: BASIC, icon: RiPlayList2Fill },
  ...headingIcons.slice(0, 3).map((icon, index) => ({
    key: index === 0 ? "toggle_heading" : `toggle_heading_${index + 1}`,
    type: "heading", title: `Encabezado desplegable ${index + 1}`, group: BASIC, icon,
    props: { level: index + 1, isToggleable: true }, aliases: [`toggle h${index + 1}`],
  })),
  { key: "quote", type: "quote", title: "Cita", group: BASIC, icon: RiQuoteText },
  { key: "page", type: "pageLink", title: "Página", group: BASIC, icon: RiFileTextLine, insertOnly: true, aliases: ["page", "pagina", "subpagina", "sub-página"] },
  { key: "divider", type: "divider", title: "Separador", group: BASIC, icon: RiSubtractLine, insertOnly: true },
  { key: "code_block", type: "codeBlock", title: "Bloque de código", group: ADVANCED, icon: RiCodeBlock, props: { language: "text" } },
  { key: "table", type: "table", title: "Tabla simple", group: ADVANCED, icon: RiTable2, insertOnly: true },
  { key: "database", type: "database", title: "Base de datos", group: ADVANCED, icon: RiDatabase2Line, insertOnly: true, aliases: ["database", "db", "tabla", "base de datos"] },
  { key: "image", type: "image", title: "Imagen", group: MEDIA, icon: RiImage2Fill, insertOnly: true },
  { key: "video", type: "video", title: "Vídeo", group: MEDIA, icon: RiFilmLine, insertOnly: true, aliases: ["video"] },
  { key: "audio", type: "audio", title: "Audio", group: MEDIA, icon: RiVolumeUpFill, insertOnly: true },
  { key: "file", type: "file", title: "Archivo", group: MEDIA, icon: RiFile2Line, insertOnly: true },
  { key: "emoji", title: "Emoji", group: MEDIA, icon: RiEmotionFill, insertOnly: true },
];

function blockConfig(editor, type) {
  return editor.schema.blockSchema?.[type] || editor.schema.blockSpecs?.[type]?.config;
}

function supportsItem(editor, item) {
  if (!item.type) return true;
  const config = blockConfig(editor, item.type);
  if (!config) return false;
  return Object.entries(item.props || {}).every(([key, value]) => {
    const prop = config.propSchema?.[key];
    return prop && (!prop.values || prop.values.includes(value));
  });
}

export function BlockCatalogIcon({ item }) {
  const Icon = item.icon;
  return <Icon size={16} aria-hidden="true" />;
}

export function buildInsertBlockItems(editor) {
  const native = new Map(getDefaultReactSlashMenuItems(editor).map(item => [item.key, item]));
  return BLOCK_CATALOG.filter(item => supportsItem(editor, item)).flatMap(item => {
    const original = native.get(item.key);
    let onItemClick = original?.onItemClick;
    if (item.type === "pageLink") {
      onItemClick = () => {
        const block = insertOrUpdateBlockForSlashMenu(editor, {
          type: "pageLink", props: { title: "Nueva página", pageId: "" },
        });
        if (block?.id && typeof window !== "undefined") {
          window._promptPageName?.(block.id, editorDatabaseContext.get(editor));
        }
      };
    } else if (item.type === "database") {
      onItemClick = () => insertOrUpdateBlockForSlashMenu(editor, {
        type: "database", props: { data: newDatabaseData() },
      });
    }
    // A schema extension must supply real insertion behavior before appearing.
    if (!onItemClick) return [];
    return [{
      ...original, key: item.key, title: item.title, group: item.group,
      aliases: [...(original?.aliases || []), ...(item.aliases || [])],
      icon: <BlockCatalogIcon item={item} />, size: "small", onItemClick,
    }];
  });
}

export function buildConversionBlockItems(editor, block) {
  // Tables and non-inline blocks have different content models. Relabelling
  // them would silently discard files, cells, page IDs or database identity.
  if (block && blockConfig(editor, block.type)?.content !== "inline") return [];
  const textOf = content => (content || []).map(run => run.type === "text" ? run.text
    : run.type === "link" ? textOf(run.content) : "").join("");
  const text = block ? textOf(block.content) : "";
  const supportsChildren = item => ["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"].includes(item.type)
    || (item.type === "heading" && item.props?.isToggleable);
  return BLOCK_CATALOG.filter(item => !item.insertOnly && supportsItem(editor, item)
    && blockConfig(editor, item.type)?.content === "inline"
    // Existing Markdown storage supports children for lists and toggles only.
    && (!block?.children?.length || supportsChildren(item))
    // A multiline heading/list would otherwise reopen as multiple blocks.
    && (!text.includes("\n") || ["paragraph", "codeBlock"].includes(item.type))
    // Paragraph indentation is structural in the legacy Markdown dialect.
    // Leave indented code intact until that representation can preserve it.
    && (!(item.type === "paragraph" && block?.type === "codeBlock")
      || (!/(^|\n)[ \t]+/.test(text) && (!text || Boolean(text.trim())))))
    .map(item => ({ ...item, name: item.title }));
}

export function convertCatalogBlock(editor, block, item) {
  if (!buildConversionBlockItems(editor, block).some(candidate => candidate.key === item.key)) return false;
  const props = item.type === "codeBlock"
    ? { language: block.type === "codeBlock" ? (block.props?.language || "text") : "text" }
    : item.props;
  // The explicit target wins, including code → paragraph. Keep the source text
  // literal rather than interpreting it as Markdown and replacing many blocks.
  // updateBlock preserves the block ID, inline content and children; native undo
  // can recover the previous type and its props.
  editor.updateBlock(block, { type: item.type, props });
  return true;
}

export function duplicateCatalogBlock(editor, block) {
  function copyWithoutBlockIds(value) {
    const { id, children, ...copy } = structuredClone(value);
    if (children) copy.children = children.map(copyWithoutBlockIds);
    return copy;
  }
  // Page editor onChange already renews copied database IDs through
  // duplicateIdentityRepairs; existing row ownership is never reassigned.
  return editor.insertBlocks([copyWithoutBlockIds(block)], block, "after")[0];
}
