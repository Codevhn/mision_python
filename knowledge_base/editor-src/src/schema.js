import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { pageLink, database } from "./customBlocks.jsx";
import { codeBlock } from "./codeBlock.jsx";

// Android Chrome spins ProseMirror's selection observer into an infinite loop
// whenever a React node view owns an editable (content "inline") content DOM —
// deterministically freezes the tab while inserting the custom codeBlock from
// the "/" menu (reproduced on a Galaxy S24 / Android UA; desktop unaffected).
// The vanilla codeBlock from @blocknote/core renders the same content as a
// plain DOM (non-React) node view and is proven unaffected, so Android falls
// back to it. It stays fully editable and shiki-highlighted; only the React
// header (language dropdown / run button) is desktop-only.
export function isAndroid() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");
}

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: isAndroid() ? defaultBlockSpecs.codeBlock : codeBlock(),
    pageLink: pageLink(),
    database: database(),
  },
});
