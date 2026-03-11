import { useState } from 'react'
import './Blank.css'

export default function Blank() {
  const [showLogin, setShowLogin] = useState(false)
  const [showUnblock, setShowUnblock] = useState(false)

  return (
    <div className="gg-outer">
      <div className="gg-middle" title="This content is blocked">
        <div className="gg-content">
          <h1>
            <strong>Restricted</strong>
          </h1>
          <br />
          This website has been blocked by your administrator.
        </div>

        <div
          className="gg-popspace"
          style={{ display: showLogin ? 'block' : 'none' }}
        >
          <div className="gg-form">
            <div style={{ padding: 10 }}>
              <h3 className="gg-pophead">Enter Password</h3>
              <p className="gg-pophead2">All Attempts are Logged.</p>
            </div>
            <input
              type="password"
              className="gg-password"
              placeholder="Password"
              readOnly
            />
            <br /><br />
            <button className="gg-but" type="button">Bypass</button>
          </div>
        </div>

        <div
          className="gg-popspace"
          style={{ display: showUnblock ? 'block' : 'none', top: 178 }}
        >
          <div className="gg-form">
            <div style={{ padding: 10 }}>
              <h3 className="gg-pophead">Why?</h3>
              <p className="gg-pophead2">Limit to 300 characters.</p>
            </div>
            <textarea
              className="gg-unblockreq"
              placeholder="Explain"
              readOnly
            />
            <button
              className="gg-but"
              type="button"
              style={{ marginLeft: 100, marginTop: 20 }}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
