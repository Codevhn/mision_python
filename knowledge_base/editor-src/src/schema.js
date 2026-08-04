import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { pageLink, database } from "./customBlocks.jsx";
import { codeBlock } from "./codeBlock.jsx";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: codeBlock(),
    pageLink: pageLink(),
    database: database(),
  },
});
