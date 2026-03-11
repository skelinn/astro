import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Gate() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'astro'
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (password === 'clairdelune') {
      sessionStorage.setItem('authenticated', 'true')
      navigate('/hub')
    } else {
      setError(true)
      setTimeout(() => setError(false), 600)
    }
  }

  return (
    <div className="gate-page">
      <form className={`gate-form${error ? ' shake' : ''}`} onSubmit={handleSubmit}>
        <input
          type="password"
          className="gate-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
        />
        <button type="submit" className="gate-button">
          Enter
        </button>
      </form>
    </div>
  )
}
