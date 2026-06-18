import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { pageLink, database } from "./customBlocks.jsx";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pageLink: pageLink(),
    database: database(),
  },
});
