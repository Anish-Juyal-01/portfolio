// All site copy lives here. Edit this file and the site updates everywhere.

export type Motif = 'orb' | 'stripes' | 'dots' | 'rings'

export interface Shot {
  src: string
  width: number
  height: number
  caption: string
}

export interface Project {
  /** URL of the project page: /work/<slug> */
  slug: string
  title: string
  kind: string
  year: string
  /** Card image in /public. Without one, the card shows generated artwork in the palette below. */
  image?: string
  /** [background start, background end, shape colour, text colour] */
  palette: [string, string, string, string]
  motif: Motif

  // ----- project page -----
  tagline: string
  description: string
  highlights: string[]
  stack: string[]
  links: { label: string; href: string }[]
  shots: Shot[]
  /** YouTube video id, shown above the screenshots. */
  video?: string
}

export type AboutMedia =
  | { kind: 'photo' }
  | { kind: 'shots'; images: string[] }
  | { kind: 'tags'; items: string[] }

export interface AboutChapter {
  title: string
  /** This chapter's colour: its card, its gate and the tunnel around it. */
  color: string
  body: string
  facts: string[]
  /** What slides in opposite the text. 'photo' shows public/me.jpg when that file exists. */
  media: AboutMedia
}

export const site = {
  name: 'Anish Juyal',
  role: 'Software Developer',
  intro: 'I build desktop apps, AI agents and 3D websites, and I ship them.',
  location: 'Building in public on GitHub',
  email: 'anishjuyal6@gmail.com',
  socials: [
    { label: 'GitHub', href: 'https://github.com/Anish-Juyal-01' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/anish-juyal-a8a8763a6/' },
    { label: 'Instagram', href: 'https://www.instagram.com/anish.x07/' },
  ],
  projects: [
    {
      slug: 'kraken',
      title: 'Kraken',
      kind: 'AI agent crew',
      year: '2026',
      image: '/projects/kraken-card.jpg',
      palette: ['#021a2b', '#0b5a6e', '#7cf0d8', '#eafff9'],
      motif: 'rings',
      tagline: 'Your team decides in chat. Kraken turns the decision into a tested pull request.',
      description:
        'Kraken is a crew of AI agents that lives in your team chat. You ask for a feature in a channel. Agents bid for the job, one builds it, the others review it, chaos agents attack the running app, and a person approves the pull request. I built it for the Flip the Switch hackathon, along with a scrolling 3D website that dives from the sea surface down to the kraken itself.',
      highlights: [
        'People get the first word at every step. If nobody answers in two minutes, an agent takes over so work never stalls.',
        'Agents compete: several models bid on each job and the winner builds while the rest review.',
        'Chaos agents stress-test the running app before any pull request is opened.',
        'The last step is always a person: nothing merges without a thumbs-up.',
      ],
      stack: ['Python', 'Discord', 'Switch', 'TypeScript', '3D web'],
      links: [
        { label: 'GitHub', href: 'https://github.com/Anish-Juyal-01/Kraken' },
        { label: 'Website code', href: 'https://github.com/Anish-Juyal-01/kraken-site' },
        { label: 'Demo video', href: 'https://youtu.be/o_IiLbg4gio' },
      ],
      video: 'o_IiLbg4gio',
      shots: [{ src: '/projects/kraken-full.jpg', width: 1900, height: 968, caption: 'The Kraken website: ask at the surface, and the kraken gets to work' }],
    },
    {
      slug: 'shelf',
      title: 'Shelf',
      kind: 'Windows app',
      year: '2026',
      image: '/projects/shelf-site-card.jpg',
      palette: ['#2a1055', '#ff7a3d', '#ffe9c7', '#fff6ea'],
      motif: 'orb',
      tagline: 'Every game on your Windows PC, in one place. Even the ones you forgot.',
      description:
        'Shelf finds what Steam, Epic, Xbox and nine other launchers installed, and also the games you downloaded as a zip and unpacked into some folder. It keeps track of what you play and shows you what is quietly filling up your drives.',
      highlights: [
        'Twelve launchers, read straight from their files on disk. No sign-ins.',
        'Loose games too: every folder gets a score out of 100, and the uncertain ones wait in Review for a yes or no.',
        'New downloads show up on their own, about a minute after the folder goes quiet.',
        'Playtime tracking for every game, with Steam hours imported on day one.',
      ],
      stack: ['Rust', 'TypeScript'],
      links: [
        { label: 'Website', href: 'https://shelf-anish.vercel.app' },
        { label: 'Download', href: 'https://github.com/Anish-Juyal-01/Shelf/releases/latest' },
        { label: 'GitHub', href: 'https://github.com/Anish-Juyal-01/Shelf' },
      ],
      shots: [
        { src: '/projects/shelf.jpg', width: 1680, height: 1050, caption: 'Library: recent games in a 3D arc' },
        { src: '/projects/shelf-game.jpg', width: 1440, height: 900, caption: 'A single game' },
        { src: '/projects/shelf-activity.jpg', width: 1440, height: 900, caption: 'Activity: what you actually played' },
        { src: '/projects/shelf-storage.jpg', width: 1440, height: 900, caption: 'Storage: what is filling your drives' },
        { src: '/projects/shelf-site-full.jpg', width: 1900, height: 968, caption: 'The website' },
      ],
    },
    {
      slug: 'neurosync',
      title: 'NeuroSync',
      kind: 'Group project',
      year: '2026',
      image: '/projects/neurosync-card.jpg',
      palette: ['#0b0c0a', '#1b1f14', '#c8ff3d', '#f3ffd6'],
      motif: 'dots',
      tagline: 'Every idle GPU on Earth, turned into one network you can train on.',
      description:
        'NeuroSync is a group project: a platform for fine-tuning AI models on graphics cards that would otherwise sit idle. A scheduler picks the fastest reliable GPUs online, splits the job across them, and each one trains its slice and syncs as often as its connection allows.',
      highlights: [
        'If a GPU drops out mid-job, its slice moves to another machine from the last sync. Nothing is lost.',
        'Bring your own GPU, or fine-tune without owning one.',
        'Open models out of the box: Llama, Mistral, Gemma, Phi-3 and Qwen, with LoRA and QLoRA.',
        'Live monitoring: loss curves, GPU utilisation and streaming logs while training runs.',
      ],
      stack: ['Team project', 'Distributed training', 'Web platform'],
      links: [{ label: 'Live site', href: 'https://neurosync-beikmn85.manus.space/' }],
      shots: [{ src: '/projects/neurosync-full.jpg', width: 1900, height: 967, caption: 'The landing page: every idle GPU, one network' }],
    },
    {
      slug: 'waypoint',
      title: 'Waypoint',
      kind: 'Windows app',
      year: '2026',
      image: '/projects/waypoint.jpg',
      palette: ['#ffcf3d', '#ff5a8a', '#22113a', '#22113a'],
      motif: 'stripes',
      tagline: 'Your sound follows your headset.',
      description:
        'Waypoint is an audio priority manager for Windows. You rank your earbuds, headphones, speakers and monitors once, and it keeps the best one that is connected as the Windows default, switching on its own when devices come and go.',
      highlights: [
        'Real-time device detection through the Windows Core Audio API.',
        'Three modes: Off just watches, Balanced respects your manual changes, Strict always enforces the ranking.',
        'Profiles such as Work and Gaming each keep their own rankings, and each gets a pixel creature as a pal.',
        'Microphones get their own priority list, and global shortcuts jump between outputs.',
      ],
      stack: ['TypeScript', 'Rust', 'Windows Core Audio'],
      links: [
        { label: 'Website', href: 'https://waypoint-anish.vercel.app' },
        { label: 'GitHub', href: 'https://github.com/Anish-Juyal-01/waypoint' },
      ],
      shots: [
        { src: '/projects/waypoint-app.jpg', width: 1467, height: 968, caption: 'The app: what is playing now, and your ranked setlist' },
        { src: '/projects/waypoint-full.jpg', width: 1900, height: 971, caption: 'The website in its light theme' },
        { src: '/projects/waypoint-dark.jpg', width: 1680, height: 1050, caption: 'And after dark' },
      ],
    },
  ] as Project[],
  about: [
    {
      title: 'Who I am',
      color: '#6fb6ff',
      body: "I'm Anish Juyal, a software developer. I like taking a thing the whole way: the idea, the design, the code and the release. If it runs on a desktop, talks to an AI model or moves in 3D, I probably want to build it.",
      facts: ['4 projects shipped in 2026', 'Desktop apps · AI agents · 3D web', 'Everything open on GitHub'],
      media: { kind: 'photo' },
    },
    {
      title: 'What I build',
      color: '#5dffa0',
      body: 'Three kinds of things. Desktop apps for Windows, like Shelf and Waypoint. AI agent systems, like Kraken, where several models bid, build and review each other. And websites with real 3D in them, like the Kraken site and this portfolio.',
      facts: ['Shelf: every game on your PC in one place', 'Waypoint: your sound follows your headset', 'Kraken: an AI crew inside team chat', 'NeuroSync: training on idle GPUs'],
      media: { kind: 'shots', images: ['/projects/shelf-site-card.jpg', '/projects/waypoint.jpg', '/projects/kraken-card.jpg', '/projects/neurosync-card.jpg'] },
    },
    {
      title: 'My toolkit',
      color: '#b48cff',
      body: 'The tools I reach for most. Rust when it has to be fast and close to the system, TypeScript for interfaces, Python for anything involving AI models, and shaders when a page should feel alive.',
      facts: [],
      media: { kind: 'tags', items: ['Rust', 'TypeScript', 'Python', 'React', 'Next.js', 'Three.js', 'GLSL', 'Windows APIs', 'AI agents', 'Git'] },
    },
    {
      title: 'Lately',
      color: '#ffc94d',
      body: "Kraken, built for the Flip the Switch hackathon: an AI crew that turns a team's chat decisions into tested pull requests. And NeuroSync, a group project that splits model training across idle GPUs around the world.",
      facts: ['Flip the Switch hackathon · November 2026', 'Track 01: Best Business Workflow', 'NeuroSync: built as a team'],
      media: { kind: 'shots', images: ['/projects/kraken-card.jpg', '/projects/neurosync-card.jpg'] },
    },
  ] as AboutChapter[],
  /** Tunnel colour for the final stretch, behind the contact line. */
  contactColor: '#ff6a2a',
  contactLine: ["Let's talk about", 'your next', 'project'],
  /** Lettering on the gallery's back wall. */
  wallText: 'Selected work 2026',
}

export type Site = typeof site
