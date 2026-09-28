import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The backend serves this build at its base URL (see backend/src/app/app.ts).
  build: { outDir: '../backend/public', emptyOutDir: true },
  server: { port: 5173 },
});
