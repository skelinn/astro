import { Routes, Route } from 'react-router-dom'
import Blank from './pages/Blank.jsx'
import Gate from './pages/Gate.jsx'
import Hub from './pages/Hub.jsx'
import Games from './pages/Games.jsx'
import Videos from './pages/Videos.jsx'
import Browse from './pages/Browse.jsx'
import Plinko from './pages/Plinko.jsx'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Blank />} />
      <Route path="/igota5070" element={<Gate />} />
      <Route path="/hub" element={<Hub />} />
      <Route path="/games" element={<Games />} />
      <Route path="/videos" element={<Videos />} />
      <Route path="/browse" element={<Browse />} />
      <Route path="/inko" element={<Plinko />} />
    </Routes>
  )
}

export default App
