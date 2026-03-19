import { createRoot } from 'react-dom/client'
import { BareMuxConnection } from '@mercuryworkshop/bare-mux'
import BrowserShell from './components/BrowserShell.jsx'

async function init() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/uv/sw.js', { scope: '/service/' })
      // Wait for SW to be active before mounting so first navigation is always proxied
      if (reg.installing || reg.waiting) {
        await new Promise((resolve) => {
          const sw = reg.installing || reg.waiting
          sw.addEventListener('statechange', function handler(e) {
            if (e.target.state === 'activated') {
              sw.removeEventListener('statechange', handler)
              resolve()
            }
          })
          // Timeout fallback — mount after 2s regardless
          setTimeout(resolve, 2000)
        })
      }
      const conn = new BareMuxConnection('/bare-mux-worker.js')
      await conn.setTransport('/bare-transport.js', ['/bare/'])
    } catch (err) {
      console.warn('[SW] Setup failed:', err)
    }
  }

  createRoot(document.getElementById('root')).render(<BrowserShell />)
}

init()
