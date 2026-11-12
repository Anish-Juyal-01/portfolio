import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Typed from '@/components/Typed'
import { site } from '@/content/site'

type Params = { params: Promise<{ slug: string }> }

const pad = (n: number) => String(n + 1).padStart(2, '0')

export function generateStaticParams() {
  return site.projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const p = site.projects.find((x) => x.slug === slug)
  if (!p) return {}
  return { title: `${p.title} — ${site.name}`, description: p.tagline }
}

export default async function ProjectPage({ params }: Params) {
  const { slug } = await params
  const index = site.projects.findIndex((x) => x.slug === slug)
  if (index < 0) notFound()
  const p = site.projects[index]
  const next = site.projects[(index + 1) % site.projects.length]

  // the header types itself out in order: title, tagline, then the description
  const titleMs = p.title.length * 70
  const taglineAt = 250 + titleMs
  const taglineMs = p.tagline.length * 22
  const descAt = taglineAt + taglineMs + 250

  return (
    <div
      className="project"
      style={{ ['--glow-a' as string]: p.palette[0], ['--glow-b' as string]: p.palette[2], ['--chars' as string]: p.title.length }}
    >
      <header className="nav">
        <Link href="/#work" className="nav-name">
          ← {site.name}
        </Link>
        <a href={`mailto:${site.email}`} className="nav-link">
          Let&rsquo;s talk
        </a>
      </header>

      <main>
        <section className="project-head">
          <p className="project-meta">
            <span>{pad(index)}</span>
            <span>{p.kind}</span>
            <span>{p.year}</span>
          </p>
          <Typed as="h1" className="project-title" text={p.title} delay={150} speed={70} />
          <Typed as="p" className="project-tagline" text={p.tagline} delay={taglineAt} speed={22} />
        </section>

        <section className="project-body">
          <div className="project-about">
            <p className="project-label">&gt; What it is</p>
            <Typed as="p" className="project-text" text={p.description} delay={descAt} speed={11} />
          </div>
          <aside className="project-side">
            <p className="project-label">&gt; Built with</p>
            <ul className="project-stack">
              {p.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="project-label">&gt; Links</p>
            <ul className="project-links">
              {p.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="project-points">
          <p className="project-label">&gt; How it works</p>
          <ol>
            {p.highlights.map((h, i) => (
              <li key={h}>
                <span>{pad(i)}</span>
                <Typed as="p" className="project-text" text={h} delay={i * 450} speed={12} />
              </li>
            ))}
          </ol>
        </section>

        <section className="project-media">
          <p className="project-label">&gt; See it</p>
          {p.video && (
            <figure className="project-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${p.video}`}
                title={`${p.title} demo video`}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
              <figcaption>Demo video</figcaption>
            </figure>
          )}
          {p.shots.map((s, i) => (
            <figure key={s.src}>
              <img src={s.src} width={s.width} height={s.height} alt={`${p.title}: ${s.caption}`} loading={i === 0 ? 'eager' : 'lazy'} />
              <figcaption>
                <span>{pad(i)}</span>
                {s.caption}
              </figcaption>
            </figure>
          ))}
        </section>

        <a className="project-next" href={`/work/${next.slug}`}>
          <span>Next project</span>
          <strong>{next.title} →</strong>
        </a>
      </main>

      <footer className="footer">
        <span>© 2026 {site.name}</span>
        <Link href="/#work">Back to all work</Link>
      </footer>
    </div>
  )
}
