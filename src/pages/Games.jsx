import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Games() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'astro'
    if (sessionStorage.getItem('authenticated') !== 'true') {
      navigate('/igota5070', { replace: true })
    }
  }, [navigate])

  return (
    <iframe
      src="/games.html"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        border: 'none',
      }}
      title="Games"
      allow="fullscreen"
    />
  )
}
