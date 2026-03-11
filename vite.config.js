import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/p': {
        target: 'http://localhost:3001',
        bypass(req) {
          if (req.url === '/p' || req.url.startsWith('/p?')) return;
          return req.url;
        },
      },
    },
  },
})
