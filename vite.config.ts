import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Em desenvolvimento a tela roda em :5173 e conversa com o servidor de salas em :3001.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
