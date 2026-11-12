import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Experience from '@/components/Experience'
import { site } from '@/content/site'

const pad = (n: number) => String(n + 1).padStart(2, '0')

export default function Page() {
  const { projects } = site
  // drop a portrait at public/me.jpg and it appears in the first about chapter
  const hasPhoto = existsSync(join(process.cwd(), 'public', 'me.jpg'))
  const initials = site.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')

  return (
    <>
      <Experience />

      <header className="nav">
        <a href="#top" className="nav-name">
          {site.name}
        </a>
        <a href="#contact" className="nav-link" data-scroll-end>
          Let&rsquo;s talk
        </a>
      </header>

      <main id="top">
        {/* 1. Hero: the name itself is drawn in WebGL so the fluid can smear it */}
        <section className="hero" data-section="hero">
          <h1 className="hero-title">{site.name}</h1>
          <p className="hero-role">
            {site.role}
            <span>Portfolio 2026</span>
          </p>
          <p className="hero-intro">{site.intro}</p>
          <p className="hero-hint" aria-hidden="true">
            Scroll
          </p>
        </section>

        {/* 2. Selected work: cards are WebGL sheets that track these empty frames */}
        <section className="work" data-section="work" id="work">
          <aside className="work-aside">
            <h2>Selected work</h2>
            <ol>
              {projects.map((p, i) => (
                <li key={p.title} data-work-item>
                  <span>{pad(i)}</span>
                  {p.title}
                </li>
              ))}
            </ol>
          </aside>
          <div className="work-list">
            {projects.map((p, i) => (
              <article className="work-card" key={p.slug}>
                <a
                  className="work-frame"
                  data-work-card
                  href={`/work/${p.slug}`}
                  aria-label={`${p.title}: ${p.kind}`}
                />
                <div className="work-caption">
                  <span>{pad(i)}</span>
                  <h3>{p.title}</h3>
                  <span>
                    {p.kind} · {p.year}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 3. Sideways gallery: vertical scroll becomes sideways travel through a 3D room */}
        <section
          className="gallery"
          data-section="gallery"
          style={{ ['--count' as string]: projects.length }}
        >
          <div className="gallery-panel" data-panel>
            <p className="gallery-label">
              Gallery
              <span>Keep scrolling</span>
            </p>
            <div className="gallery-caption" aria-live="polite">
              <span data-g-index>01</span>
              <h3 data-g-title>{projects[0].title}</h3>
              <span data-g-meta>
                {projects[0].kind} · {projects[0].year}
              </span>
              <a className="gallery-open" data-g-link href={`/work/${projects[0].slug}`}>
                Open →
              </a>
            </div>
            <div className="gallery-bar" aria-hidden="true">
              <i data-g-bar />
            </div>
          </div>
        </section>

        {/* 4 + 5. About flythrough, ending on the contact line */}
        <section className="about" data-section="about" id="about">
          <div className="about-panel" data-panel>
            <div className="about-chapters">
              {site.about.map((c, i) => (
                <article
                  className={`chapter${i % 2 ? ' is-flip' : ''}`}
                  key={c.title}
                  data-about-block
                  style={{ ['--c' as string]: c.color }}
                >
                  <div className={`chapter-media chapter-window is-${c.media.kind}`}>
                    <p className="chapter-bar" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <span>{c.media.kind === 'photo' ? 'me.jpg' : c.media.kind === 'shots' ? 'work/' : 'toolkit.json'}</span>
                    </p>
                    {c.media.kind === 'photo' &&
                      (hasPhoto ? (
                        <img className="chapter-photo" src="/me.jpg" alt={`Portrait of ${site.name}`} />
                      ) : (
                        <div className="chapter-photo is-empty" aria-hidden="true">
                          <strong>{initials}</strong>
                          <span>Photo goes here</span>
                        </div>
                      ))}
                    {c.media.kind === 'shots' && (
                      <div className={`chapter-shots n${c.media.images.length}`}>
                        {c.media.images.map((src) => (
                          <img key={src} src={src} alt="" loading="lazy" />
                        ))}
                      </div>
                    )}
                    {c.media.kind === 'tags' && (
                      <ul className="chapter-tags">
                        {c.media.items.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="chapter-text chapter-window">
                    <p className="chapter-bar" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <span>~/anish/{c.title.toLowerCase().replace(/\s+/g, '-')}</span>
                    </p>
                    <div className="chapter-inner">
                    <p className="chapter-index">
                      {pad(i)} / {pad(site.about.length - 1)}
                    </p>
                    <h3 className="about-title">{c.title}</h3>
                    <p className="about-body" data-type={c.body} aria-label={c.body} />
                    {c.facts.length > 0 && (
                      <ul className="chapter-facts">
                        {c.facts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="contact" id="contact" data-contact>
              <h2 className="contact-title">{site.contactLine.join(' ')}</h2>
              <a className="contact-mail" href={`mailto:${site.email}`}>
                {site.email}
              </a>
              <ul>
                {site.socials.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>
          © 2026 {site.name}
        </span>
        <span>{site.location}</span>
      </footer>
    </>
  )
}
