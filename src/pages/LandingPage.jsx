import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANDING, SITE } from '../config'
import { REPO_CONFIG, rawFileUrl } from '../utils/github'

// The out-of-universe front door. It sits outside <Layout> on purpose, so
// none of the in-universe framing (sidebar, Troli Ustaras masthead) shows
// here. All the text lives in LANDING in config.js.

const LICENSE_PAGE =
  `https://github.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/blob/${REPO_CONFIG.branch}/LICENSE`

// Reads LICENSE straight from dripwiki.
// undefined = still loading, null = not found, string = the text
function useLicenseText() {
  const [text, setText] = useState(undefined)
  useEffect(() => {
    fetch(rawFileUrl('LICENSE'))
      .then(res => (res.ok ? res.text() : null))
      .then(setText)
      .catch(() => setText(null))
  }, [])
  return text
}

// Highlights unfinished placeholder text from config.js
const todo = text => (text.startsWith('TODO') ? 'landing-todo' : undefined)

export default function LandingPage() {
  const license = useLicenseText()

  useEffect(() => {
    document.title = LANDING.pageTitle
    return () => { document.title = SITE.name }
  }, [])

  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>{LANDING.title}</h1>
        <p className={'landing-byline ' + (todo(LANDING.byline) || '')}>{LANDING.byline}</p>
        <Link to="/wiki" className="landing-cta">{LANDING.cta}</Link>
      </header>

      {LANDING.sections.map(section => (
        <section key={section.heading} className="landing-section">
          <h2>{section.heading}</h2>
          {section.paragraphs.map((p, i) => <p key={i} className={todo(p)}>{p}</p>)}
          {section.links && (
            <ul className="landing-links">
              {section.links.map(l => (
                <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="landing-section">
        <h2>{LANDING.licenseHeading}</h2>
        {license && <pre className="landing-license">{license}</pre>}
        {license === null && (
          <p className="landing-todo">
            No LICENSE file found in {REPO_CONFIG.repo} yet. Once it exists, its text shows up here.
          </p>
        )}
        {license && <p className="landing-license-link"><a href={LICENSE_PAGE}>View the LICENSE file on GitHub</a></p>}
      </section>
    </div>
  )
}
