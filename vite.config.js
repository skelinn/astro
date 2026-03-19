import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'uv-sw-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/uv/sw.js')) {
            res.setHeader('Service-Worker-Allowed', '/')
          }
          next()
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        browser: 'browser.html',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/bare/': {
        target: 'http://localhost:3001',
        changeOrigin: false,
        ws: true,
      },
    },
  },
})
