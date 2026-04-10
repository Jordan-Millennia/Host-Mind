# HostMind

Marketing site for **HostMind** — the autonomous AI co-host that manages guest communication, access, and operations across every rental platform.

Built with **React + Vite + Tailwind CSS + Framer Motion**. Static build, deploys to GitHub Pages in one command.

---

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

### Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local preview with hot reload |
| `npm run build` | Production build into `/dist` |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Push `/dist` to the `gh-pages` branch and go live |

---

## Configure the waitlist form (Formspree)

The waitlist form uses [Formspree](https://formspree.io) so there's zero backend.

1. Create a free account at **formspree.io**.
2. Create a new form and copy its endpoint (e.g. `https://formspree.io/f/abcd1234`).
3. Open `src/components/Waitlist.jsx` and replace `YOUR_FORM_ID`:

```js
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/abcd1234'
```

That's it — submissions will land in your Formspree inbox. No API keys, no env vars.

---

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `hostmind`).
2. Push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Initial HostMind site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hostmind.git
   git push -u origin main
   ```
3. Update the `base` in `vite.config.js` to match your repo name:
   ```js
   base: '/hostmind/'
   ```
   (If your repo is called something different, change it to `/your-repo-name/`.)
4. Deploy:
   ```bash
   npm run deploy
   ```
5. In your repo on GitHub, go to **Settings → Pages** and set the source to the `gh-pages` branch.
6. The site will be live at: `https://<your-username>.github.io/hostmind`

### Custom domain

To use a custom domain like `hostmind.ai`:

1. Create a file at `public/CNAME` containing your domain:
   ```
   hostmind.ai
   ```
2. Point your DNS A record at GitHub Pages IPs:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
3. Set `base: '/'` in `vite.config.js` (since the site will live at the domain root, not in a subdirectory).
4. Re-run `npm run deploy`.

---

## Project structure

```
src/
├── App.jsx                 Top-level layout
├── main.jsx                Entry point
├── index.css               Tailwind + global styles
└── components/
    ├── Navbar.jsx          Sticky nav w/ mobile menu
    ├── Hero.jsx            Headline + animated dashboard mock
    ├── LogoBar.jsx         Platform logos
    ├── Features.jsx        Six-up feature grid
    ├── HowItWorks.jsx      3-step process
    ├── UseCases.jsx        Tabbed rental types
    ├── Testimonials.jsx    Stat-driven proof cards
    ├── Pricing.jsx         3-tier pricing
    ├── Waitlist.jsx        Formspree-powered lead capture
    ├── CTA.jsx             Bottom banner
    └── Footer.jsx
```

---

## Customization

- **Brand colors**: `tailwind.config.js` → `theme.extend.colors.brand`
- **Copy**: everything lives in the component files under `src/components/`
- **Contact email**: search for `hello@hostmind.ai` and replace
