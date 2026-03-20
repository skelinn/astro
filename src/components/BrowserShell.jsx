import { useState, useRef, useCallback, useEffect } from 'react'
import './BrowserShell.css'

let tabIdCounter = 1

function proxyUrl(url) {
  try {
    const cfg = window.__uv$config
    if (cfg?.encodeUrl) {
      return '/service/' + cfg.encodeUrl(url)
    }
    console.warn('[Astro] __uv$config not ready, serving direct')
  } catch (e) {
    console.warn('[Astro] proxy encode failed:', e)
  }
  // Fallback: serve direct (will be blocked by X-Frame-Options on most sites)
  return url
}

function resolveUrl(input) {
  const trimmed = input.trim()
  if (!trimmed || trimmed === 'astro://new') return { display: 'astro://new', src: '/new.html' }
  if (trimmed === 'astro://games') return { display: 'astro://games', src: '/pages/games.html' }
  if (trimmed === 'astro://apps') return { display: 'astro://apps', src: '/pages/apps.html' }
  if (trimmed === 'astro://settings') return { display: 'astro://settings', src: '/pages/settings.html' }
  if (trimmed.startsWith('astro://')) return { display: trimmed, src: '/new.html' }
  if (trimmed.startsWith('/')) return { display: trimmed, src: trimmed }

  let url = trimmed
  if (!/^https?:\/\//i.test(url)) {
    // Looks like a domain (has a dot and no spaces)
    if (/^[\w-]+(\.[\w-]+)+/.test(url) && !url.includes(' ')) {
      url = 'https://' + url
    } else {
      // Search query — Bing works reliably through UV (server-rendered)
      url = 'https://www.bing.com/search?q=' + encodeURIComponent(url)
    }
  }

  return { display: url, src: proxyUrl(url) }
}

function createTab(url = 'astro://new') {
  const id = tabIdCounter++
  const resolved = resolveUrl(url)
  return { id, title: 'New Tab', favicon: null, url: resolved.display, src: resolved.src }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'space' ? 'space' : '')
  localStorage.setItem('astro-color-theme', theme)
}

export default function BrowserShell() {
  const [tabs, setTabs] = useState(() => [createTab()])
  const [activeTabId, setActiveTabId] = useState(1)
  const [urlBarValue, setUrlBarValue] = useState('astro://new')
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const iframeRefs = useRef({})
  const menuRef = useRef(null)

  // Apply saved theme on mount (default: mono)
  useEffect(() => {
    const saved = localStorage.getItem('astro-color-theme') || 'mono'
    applyTheme(saved)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  // Sync URL bar when switching tabs
  useEffect(() => {
    if (activeTab) setUrlBarValue(activeTab.url)
  }, [activeTabId, activeTab?.url])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const navigate = useCallback(
    (url) => {
      const resolved = resolveUrl(url)
      setLoading(true)
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                url: resolved.display,
                src: resolved.src,
                title: resolved.display.startsWith('astro://') ? 'New Tab' : new URL(resolved.display.startsWith('http') ? resolved.display : 'https://x.com').hostname,
              }
            : t
        )
      )
      setUrlBarValue(resolved.display)
      setTimeout(() => setLoading(false), 800)
    },
    [activeTabId]
  )

  // Listen for postMessage from iframes
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data?.type) return
      if (e.data.type === 'navigate') {
        navigate(e.data.url)
      } else if (e.data.type === 'titleChange') {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId ? { ...t, title: e.data.title } : t
          )
        )
      } else if (e.data.type === 'themeChange') {
        applyTheme(e.data.theme)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate, activeTabId])

  // Patch an iframe after every load: strip target="_blank" and intercept window.open
  // UV makes proxied content same-origin so we can access contentDocument directly
  const patchIframe = useCallback((iframe) => {
    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      if (!win || !doc) return

      // Route window.open() calls (e.g. JS-triggered popups) through our navigate
      win.open = (url) => {
        if (url) window.postMessage({ type: 'navigate', url: String(url) }, '*')
        return null
      }

      // Remove target="_blank" so clicks stay inside the iframe
      function stripBlankTargets() {
        try {
          doc.querySelectorAll('a[target]').forEach((a) => a.removeAttribute('target'))
        } catch {}
      }
      stripBlankTargets()

      // Watch for dynamically injected links (SPAs, lazy-loaded content)
      if (doc.body) {
        new win.MutationObserver(stripBlankTargets).observe(doc.body, {
          childList: true,
          subtree: true,
        })
      }
    } catch {
      // Cross-origin frame or SW not yet active — ignore
    }
  }, [])

  const addTab = useCallback((url = 'astro://new') => {
    const tab = createTab(url)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setUrlBarValue(tab.url)
  }, [])

  const closeTab = useCallback(
    (id) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev
        const idx = prev.findIndex((t) => t.id === id)
        const next = prev.filter((t) => t.id !== id)
        if (id === activeTabId) {
          const newActive = next[Math.min(idx, next.length - 1)]
          setActiveTabId(newActive.id)
          setUrlBarValue(newActive.url)
        }
        return next
      })
    },
    [activeTabId]
  )

  const switchTab = useCallback((id) => {
    setActiveTabId(id)
  }, [])

  const handleUrlBarSubmit = (e) => {
    e.preventDefault()
    navigate(urlBarValue)
  }

  const goHome = () => navigate('astro://new')

  const goBack = () => {
    const iframe = iframeRefs.current[activeTabId]
    try { iframe?.contentWindow?.history.back() } catch {}
  }

  const goForward = () => {
    const iframe = iframeRefs.current[activeTabId]
    try { iframe?.contentWindow?.history.forward() } catch {}
  }

  const reload = () => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t
        // Force iframe reload by re-resolving src
        const resolved = resolveUrl(t.url)
        return { ...t, src: resolved.src }
      })
    )
  }

  const sidebarNavigate = (url) => {
    navigate(url)
    setSidebarHovered(false)
  }

  return (
    <div className="browser-shell" onClick={() => setMenuOpen(false)}>
      {loading && <div className="loading-bar" />}

      {/* Tab bar */}
      <div className="tab-bar" onClick={(e) => e.stopPropagation()}>
        <div className="tab-list">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'tab-active' : ''}`}
              onClick={() => switchTab(tab.id)}
            >
              <span className="tab-title">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button className="tab-add" onClick={() => addTab()}>+</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="toolbar-nav">
          <button className="toolbar-btn" onClick={goBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
          <button className="toolbar-btn" onClick={goForward} title="Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <button className="toolbar-btn" onClick={reload} title="Reload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
          </button>
          <button className="toolbar-btn" onClick={goHome} title="Home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
        </div>

        <form className="url-bar" onSubmit={handleUrlBarSubmit}>
          <svg className="url-lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input
            type="text"
            className="url-input"
            value={urlBarValue}
            onChange={(e) => setUrlBarValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter URL"
            spellCheck={false}
          />
        </form>

        {/* Hamburger menu */}
        <div className="menu-wrapper" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            className={`toolbar-btn menu-btn ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            title="Menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          </button>
          {menuOpen && (
            <div className="menu-dropdown">
              <button className="menu-item" onClick={() => { addTab(); setMenuOpen(false) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                New Tab
              </button>
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => { sidebarNavigate('astro://games'); setMenuOpen(false) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/></svg>
                Games
              </button>
              <button className="menu-item" onClick={() => { sidebarNavigate('astro://apps'); setMenuOpen(false) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                Apps
              </button>
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => { sidebarNavigate('astro://settings'); setMenuOpen(false) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area with sidebar */}
      <div className="content-wrapper">
        {/* Sidebar */}
        <div
          className={`sidebar ${sidebarHovered ? 'sidebar-open' : ''}`}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <div className="sidebar-handle" />
          <div className="sidebar-icons">
            <button className="sidebar-btn" onClick={() => sidebarNavigate('astro://new')} title="Home">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span className="sidebar-label">Home</span>
            </button>
            <button className="sidebar-btn" onClick={() => sidebarNavigate('astro://games')} title="Games">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/></svg>
              <span className="sidebar-label">Games</span>
            </button>
            <button className="sidebar-btn" onClick={() => sidebarNavigate('astro://apps')} title="Apps">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
              <span className="sidebar-label">Apps</span>
            </button>
            <button className="sidebar-btn" onClick={() => sidebarNavigate('astro://settings')} title="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="sidebar-label">Settings</span>
            </button>
          </div>
        </div>

        {/* Iframe container */}
        <div className="content-area">
          {tabs.map((tab) => (
            <iframe
              key={tab.id}
              ref={(el) => { if (el) iframeRefs.current[tab.id] = el }}
              src={tab.src}
              className={`content-iframe ${tab.id === activeTabId ? 'iframe-active' : ''}`}
              allow="fullscreen; autoplay; encrypted-media; clipboard-write; clipboard-read"
              onLoad={(e) => patchIframe(e.target)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-downloads"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
