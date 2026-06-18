import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds a single self-contained IIFE bundle committed into ../static/blocknote/.
// No build step is required on the deploy host: Flask just serves this file
// like any other static asset, exactly as it served the old static/editor.js.
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "../static/blocknote",
    emptyOutDir: true,
    lib: {
      entry: "src/main.jsx",
      name: "KBBlockNoteEditor",
      formats: ["iife"],
      fileName: () => "editor.bundle.js",
    },
    rollupOptions: {
      output: {
        // BlockNoteView pulls in its own CSS; keep it as a single sibling file.
        assetFileNames: "editor.bundle.[ext]",
      },
    },
  },
});
