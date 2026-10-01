import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// .env lives at the repo root, shared with the server
export default defineConfig({
  plugins: [react()],
  // pre-bundle what the lazy routes use, so a first visit never triggers a mid-session re-optimise (504 on chunks)
  optimizeDeps: { include: ['recharts', 'motion/react', 'lucide-react', '@supabase/supabase-js'] },
  envDir: '..',
  // same-origin API in dev: /api/* -> Node on :8787, so no CORS
  server: { proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } } },
})
