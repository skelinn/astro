import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Hub.css'

export default function Hub() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('astro-theme')
    return saved !== 'light'
  })

  useEffect(() => {
    document.title = 'astro'
    if (sessionStorage.getItem('authenticated') !== 'true') {
      navigate('/igota5070', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    localStorage.setItem('astro-theme', dark ? 'dark' : 'light')
  }, [dark])

  const darkRef = useRef(dark)
  useEffect(() => {
    darkRef.current = dark
  }, [dark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)
    let animId

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      o: Math.random() * 0.8 + 0.2,
    }))

    function animate() {
      ctx.clearRect(0, 0, w, h)
      const rgb = darkRef.current ? '255,255,255' : '0,0,0'
      stars.forEach((s) => {
        s.x += s.vx
        s.y += s.vy
        if (s.x < 0 || s.x > w) s.vx *= -1
        if (s.y < 0 || s.y > h) s.vy *= -1
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${s.o + Math.sin(Date.now() / 1000 + s.x) * 0.1})`
        ctx.fill()
      })
      animId = requestAnimationFrame(animate)
    }

    function onResize() {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }

    window.addEventListener('resize', onResize)
    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className={`hub-root${dark ? ' dark' : ' light'}`}>
      <canvas ref={canvasRef} className="hub-stars" />

      <button
        className="hub-theme-toggle"
        onClick={() => setDark((d) => !d)}
        aria-label="Toggle dark/light theme"
        title="Toggle dark/light theme"
      >
        {dark ? '\u2600' : '\u263E'}
      </button>

      <div className="hub-header-group">
        <div className="hub-katakana">アストロ</div>
        <div className="hub-japanese">astro</div>
        <div className="hub-site-name">welcome back.</div>
      </div>

      <p className="hub-tagline">your launchpad for games and more.</p>

      <nav className="hub-button-group">
        <Link to="/games" className="hub-btn">
          <i className="fa-solid fa-gamepad" /> games
        </Link>
        <Link to="/inko" className="hub-btn">
          <i className="fa-solid fa-circle-dot" /> inko
        </Link>
        <Link to="/videos" className="hub-btn">
          <i className="fa-brands fa-youtube" /> videos
        </Link>
        <Link to="/browse" className="hub-btn">
          <i className="fa-solid fa-globe" /> browse
        </Link>
      </nav>

      <div className="hub-credit">made by skelin</div>
    </div>
  )
}
