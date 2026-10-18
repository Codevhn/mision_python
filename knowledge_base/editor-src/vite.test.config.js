import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// Node render contracts use development React and its matching JSX runtime.
// The production bundle keeps its independent vite.config.js settings.
export default defineConfig({plugins:[react()]});
