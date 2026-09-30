import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// .env lives at the repo root, shared with the server
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  // same-origin API in dev: /api/* -> Node on :8787, so no CORS
  server: { proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } } },
})
