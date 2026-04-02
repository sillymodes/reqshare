# ReqShare — Embeddable, Runnable API Example Pages

## Project Overview

ReqShare lets developers create beautiful, shareable, runnable API request collections and share them via a single URL. Think "CodePen for API calls." Users paste their endpoints, configure requests, and get a public link that anyone can open to **view and execute** those API calls live in the browser — no signup, no install.

**Positioning:** Not an API client. Not a Postman replacement. ReqShare is a **documentation and onboarding tool** — the fastest way to *show* someone how an API works rather than *tell* them. Target users are developer relations teams, API-first startups, open-source maintainers, technical writers, and any dev who's ever pasted a curl command into Slack and wished there was a better way.

---

## Pre-Implementation Setup

### Step 0 — Read External Configuration

Before writing any code, read `../info.txt` which contains:

- **Cloudflare Workers API token** (for deploying and managing Workers, KV namespaces, and DNS)
- **Buy Me a Coffee link** (to embed in the site footer and support page)
- **GitHub username and API token** (for repository creation, Pages deployment, and CI/CD)

Parse these values and use them throughout the project. Never hardcode them. Store references in environment variables or a `.env` file excluded from version control.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│          (Static Site — GitHub Pages)                   │
│                                                         │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐  │
│  │  Landing   │ │ Collection│ │  Viewer  │ │  Stats  │  │
│  │  Page      │ │  Builder  │ │  Page    │ │  Page   │  │
│  │ (SEO hub)  │ │ (create)  │ │ (shared) │ │(public) │  │
│  └───────────┘ └───────────┘ └──────────┘ └─────────┘  │
│                                                         │
│  Tech: Vanilla HTML/CSS/JS (no framework)               │
│  Why: Maximum SEO crawlability, fast load, zero build   │
└──────────────────┬──────────────────────────────────────┘
                   │ fetch()
                   ▼
┌─────────────────────────────────────────────────────────┐
│               BACKEND — Cloudflare Workers               │
│                                                          │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Collections API │  │ CORS Proxy   │  │ Stats API   │  │
│  │ CRUD + short ID │  │ (rate-ltd)   │  │ page views, │  │
│  │                 │  │              │  │ reviews     │  │
│  └───────┬────────┘  └──────────────┘  └──────┬──────┘  │
│          │                                     │         │
│          ▼                                     ▼         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            Cloudflare Workers KV                    │ │
│  │  Namespaces: collections, stats, reviews            │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Protocol

Follow these steps **in order**. Complete each step fully before starting the next.

---

### Step 1 — Project Scaffolding and Repository Setup

1. Read `../info.txt` and extract the Cloudflare API token, Buy Me a Coffee link, GitHub username, and GitHub API token.
2. Create a new GitHub repository named `reqshare` under the user's account using the GitHub API.
3. Initialize the local project with this structure:

```
reqshare/
├── site/                        # Frontend — deployed to GitHub Pages
│   ├── index.html               # Landing page (SEO-optimized)
│   ├── create.html              # Collection builder UI
│   ├── c/                       # Viewer pages (dynamic via JS)
│   │   └── index.html           # Shared collection viewer (reads ID from URL hash)
│   ├── stats.html               # Public visitor stats dashboard
│   ├── css/
│   │   └── style.css            # Single stylesheet, no framework
│   ├── js/
│   │   ├── app.js               # Landing page logic
│   │   ├── builder.js           # Collection builder logic
│   │   ├── viewer.js            # Collection viewer + request runner
│   │   ├── stats.js             # Stats dashboard logic
│   │   └── reviews.js           # Review submission and display logic
│   ├── assets/
│   │   ├── og-image.png         # Open Graph preview image (1200x630)
│   │   └── favicon.svg          # SVG favicon
│   ├── robots.txt
│   └── sitemap.xml
├── worker/                      # Cloudflare Worker
│   ├── index.js                 # Main Worker entry — routes all API paths
│   ├── handlers/
│   │   ├── collections.js       # CRUD for collections
│   │   ├── proxy.js             # CORS proxy with rate limiting
│   │   ├── stats.js             # Page view tracking + retrieval
│   │   └── reviews.js           # Review submission + retrieval
│   └── wrangler.toml            # Worker config with KV namespace bindings
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI: deploy site to GH Pages + Worker via Wrangler
├── .env.example                 # Template for secrets
├── .gitignore
├── LICENSE                      # MIT
└── README.md
```

4. Create `.gitignore` excluding `.env`, `node_modules/`, and `.wrangler/`.
5. Commit the skeleton and push to the repo.

---

### Step 2 — Cloudflare Worker Backend

#### 2a. KV Namespace Setup

Using the Cloudflare API, create three KV namespaces:

| Namespace      | Purpose                                          |
|----------------|--------------------------------------------------|
| `COLLECTIONS`  | Stores collection JSON. Key: short ID (8 chars). |
| `STATS`        | Page view counts and daily visitor logs.          |
| `REVIEWS`      | User reviews keyed by collection ID.              |

#### 2b. Worker Route Design

All API routes are served from the Worker under a single domain (e.g., `api.reqshare.dev` or a `*.workers.dev` subdomain).

```
POST   /api/collections              → Create new collection, return short ID
GET    /api/collections/:id          → Fetch collection by ID
DELETE /api/collections/:id          → Delete (requires creator token)

POST   /api/proxy                    → CORS proxy (forward request to target)

POST   /api/stats/pageview           → Record a page view event
GET    /api/stats/summary            → Return aggregate stats (public)

POST   /api/reviews/:collectionId    → Submit a review (1-5 stars + optional comment)
GET    /api/reviews/:collectionId    → Get reviews for a collection
GET    /api/reviews/site/summary     → Get aggregate site-wide review stats
```

#### 2c. Collections Handler (`handlers/collections.js`)

**Create** (`POST /api/collections`):
- Accept JSON body with `name`, `description`, `requests[]`, and `environment{}`.
- Each request object: `{ name, method, url, headers: {}, body: "", auth: { type, token } }`.
- Validate: max 20 requests per collection, max 50KB total payload.
- Generate an 8-character alphanumeric short ID (collision-check against KV).
- Generate a 32-character creator token (for deletion).
- Store in KV with 30-day TTL (free tier) and metadata `{ createdAt, expiresAt, views: 0 }`.
- Return `{ id, creatorToken, url, expiresAt }`.

**Read** (`GET /api/collections/:id`):
- Fetch from KV. Return 404 if missing/expired.
- Increment view count in STATS namespace (fire-and-forget, don't block response).
- Return the collection JSON (strip creatorToken before returning).

**Delete** (`DELETE /api/collections/:id`):
- Require `Authorization: Bearer <creatorToken>` header.
- Validate token matches stored value. Delete from KV.

#### 2d. CORS Proxy Handler (`handlers/proxy.js`)

This is the most security-sensitive component. Implement carefully:

- Accept `{ method, url, headers, body }` in POST body.
- **Rate limit:** Max 30 requests per IP per minute. Use a KV key of `ratelimit:<IP>` with 60-second TTL.
- **Blocklist:** Reject requests to private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), localhost, and `.local` domains.
- **Size limit:** Max 1MB request body, max 5MB response body.
- **Timeout:** 15-second fetch timeout.
- Forward the request using `fetch()`, collect the response.
- Return `{ status, statusText, headers: {}, body, timing: { ms } }`.
- Set permissive CORS headers on the Worker response so the browser-based viewer can read it.

#### 2e. Stats Handler (`handlers/stats.js`)

**Record pageview** (`POST /api/stats/pageview`):
- Accept `{ page, collectionId? }` in body.
- Increment a daily counter key: `views:<YYYY-MM-DD>` (value is a JSON object mapping page names to counts).
- Increment an all-time counter key: `views:total`.
- Track unique visitors via a hashed IP key: `visitor:<YYYY-MM-DD>:<hash(IP)>` with 24hr TTL. If key already exists, skip unique count increment.

**Summary** (`GET /api/stats/summary`):
- Return `{ totalPageViews, totalUniqueVisitors, totalCollectionsCreated, last30Days: [{ date, views, uniques }] }`.
- Aggregate from the daily counter keys.

#### 2f. Reviews Handler (`handlers/reviews.js`)

**Submit review** (`POST /api/reviews/:collectionId`):
- Accept `{ rating (1-5 integer), comment (optional, max 500 chars), displayName (optional, max 50 chars) }`.
- Validate rating is integer 1-5.
- Rate limit: 1 review per IP per collection (store key `reviewed:<collectionId>:<hash(IP)>` with no TTL).
- Store review in KV: key `review:<collectionId>:<timestamp>`, value is the review JSON.
- Update aggregate: key `reviewagg:<collectionId>` stores `{ count, totalStars }`.
- Also update site-wide aggregate: key `reviewagg:site` stores `{ count, totalStars }`.

**Get collection reviews** (`GET /api/reviews/:collectionId`):
- List all KV keys with prefix `review:<collectionId>:`.
- Return `{ average, count, reviews: [...] }`.

**Get site summary** (`GET /api/reviews/site/summary`):
- Return the site-wide aggregate `{ average, count }`.

#### 2g. Worker Entry Point (`index.js`)

- Route requests based on URL pathname.
- Add CORS headers (`Access-Control-Allow-Origin: *`) to all responses.
- Handle OPTIONS preflight.
- Return JSON `{ error }` with appropriate status codes for all errors.
- Log errors to console (visible in Worker logs).

#### 2h. `wrangler.toml`

```toml
name = "reqshare-api"
main = "index.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "COLLECTIONS"
id = "<created-in-step-2a>"

[[kv_namespaces]]
binding = "STATS"
id = "<created-in-step-2a>"

[[kv_namespaces]]
binding = "REVIEWS"
id = "<created-in-step-2a>"
```

Deploy with: `npx wrangler deploy`

---

### Step 3 — Frontend: Landing Page (`index.html`)

This is the SEO-critical page. Build it with care.

#### 3a. SEO Requirements (apply to ALL pages)

Every page must include:

- `<title>` — Unique, keyword-rich, under 60 characters.
- `<meta name="description">` — Unique, under 155 characters, includes primary keyword.
- `<link rel="canonical">` — Self-referencing canonical URL.
- Open Graph tags: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`.
- Twitter Card tags: `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- Structured data (JSON-LD) — `WebApplication` schema on landing page, `WebPage` on subpages.
- Semantic HTML: use `<header>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<nav>`.
- Heading hierarchy: single `<h1>` per page, logical `<h2>`/`<h3>` nesting.
- `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" ...>`.
- All images have `alt` attributes, all links have descriptive text (no "click here").
- `robots.txt` allowing all crawlers, `sitemap.xml` listing all pages.

#### 3b. Landing Page Content Sections

Design an attractive, modern landing page with these sections:

1. **Hero** — Headline: "Show your API, don't just describe it." Subline: "Create runnable API example pages and share them with a link. No signup. No install." Primary CTA button: "Build a Collection" linking to `/create.html`. Secondary: "See an Example" linking to a pre-made demo collection.

2. **How It Works** — Three-step visual: (1) "Add your requests" — icon + brief text, (2) "Get a share link" — icon + brief text, (3) "Anyone can view and run them" — icon + brief text.

3. **Use Cases** — Four cards: "API Documentation" (embed runnable examples in your docs), "Team Onboarding" (show new devs how your backend works), "Bug Reports" (reproduce issues with exact requests), "Open Source" (provide working examples in your README).

4. **Live Demo Embed** — An iframe or inline embed showing a sample collection (pre-populate with a public API like JSONPlaceholder or PokeAPI). This proves the product and is SEO-rich content.

5. **Site-Wide Reviews** — Display aggregate star rating and recent reviews from users. Show average out of 5 stars, total review count, and the 5 most recent reviews with star ratings and comments.

6. **Footer** — Links to: Stats page, GitHub repo, "Buy Me a Coffee" link (from `../info.txt`), MIT License, and a brief "Built with Cloudflare Workers and GitHub Pages" credit.

#### 3c. Landing Page SEO Targets

Primary keyword: `shareable API examples`
Secondary: `runnable API documentation`, `share curl commands online`, `API request playground`, `embeddable API tester`, `codepen for APIs`

Include these naturally in headings, body text, image alts, and meta tags. Do not keyword-stuff.

---

### Step 4 — Frontend: Collection Builder (`create.html`)

The builder is the core product surface. Implement it as a single-page app with no framework (vanilla JS).

#### 4a. Builder UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ ReqShare Logo                           [View Stats]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Collection Name: [________________________]            │
│  Description:     [________________________]            │
│                                                         │
│  ┌─── Environment Variables ──────────────────────────┐ │
│  │  BASE_URL  = [https://api.example.com ]            │ │
│  │  TOKEN     = [Bearer sk-xxx           ]            │ │
│  │  [+ Add Variable]                                  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─── Requests ───────────────────────────────────────┐ │
│  │                                                     │ │
│  │  ┌─ Request 1 ──────────────────────────────────┐  │ │
│  │  │ Name: [Get All Users        ]                │  │ │
│  │  │ [GET v] [{{BASE_URL}}/users           ]      │  │ │
│  │  │ Headers:  [Authorization: {{TOKEN}}]         │  │ │
│  │  │ Body:     (disabled for GET)                 │  │ │
│  │  │                          [up] [dn] [Remove]  │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │                                                     │ │
│  │  ┌─ Request 2 ──────────────────────────────────┐  │ │
│  │  │ Name: [Create User          ]                │  │ │
│  │  │ [POST v] [{{BASE_URL}}/users          ]      │  │ │
│  │  │ Headers:  [Content-Type: application/json]   │  │ │
│  │  │           [Authorization: {{TOKEN}}]         │  │ │
│  │  │ Body:     [{ "name": "Jane", "role": "dev" }]│  │ │
│  │  │                          [up] [dn] [Remove]  │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │                                                     │ │
│  │  [+ Add Request]                                    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  [Create and Get Share Link]                            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Footer: GitHub · Stats · Buy Me a Coffee · MIT         │
└─────────────────────────────────────────────────────────┘
```

#### 4b. Builder Logic

- Requests are reorderable (up/down arrows).
- Environment variables use `{{VARIABLE_NAME}}` syntax. Show inline hint text.
- Method dropdown: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- Headers: key-value pair editor with "add row" button.
- Body: textarea with JSON syntax highlighting (use a simple CSS class, no library). Disabled when method is GET or HEAD.
- Auth: simple dropdown — None, Bearer Token, Basic Auth. Populate into headers automatically.
- "Create" button:
  - Validate all fields.
  - POST to `/api/collections`.
  - On success, display a modal/panel with the shareable URL and a "Copy Link" button.
  - Also display the creator token with a note: "Save this token — you'll need it to delete this collection."
  - Also offer an "Embed Code" snippet: `<iframe src="https://reqshare.dev/c/#COLLECTION_ID" width="100%" height="600" frameborder="0"></iframe>`

#### 4c. Import from cURL

Add a secondary CTA: "Paste a cURL command" which opens a textarea. On paste, parse the cURL string into method, URL, headers, and body fields and populate a new request. Support the common flags: `-X`, `-H`, `-d`, `--data`, `-u`, `--header`, `--request`.

---

### Step 5 — Frontend: Collection Viewer (`c/index.html`)

This is the page recipients see when they open a shared link. The collection ID comes from the URL hash (e.g., `/c/#x7k9m`).

#### 5a. Viewer UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ ReqShare ·  "My API Examples"  ·  5 requests  ·  28d   │
│ Description: Working examples for the Acme API v2.     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─── 1. Get All Users ────────────────────────────┐   │
│  │ GET https://api.acme.com/users                  │   │
│  │                                                  │   │
│  │ Headers:                                         │   │
│  │   Authorization: Bearer sk-xxx                   │   │
│  │                                                  │   │
│  │ [Run]  [Copy as cURL]  [Copy as fetch]          │   │
│  │                                                  │   │
│  │ ┌─ Response ──────────────────────────────────┐ │   │
│  │ │ 200 OK · 142ms · 1.2KB                     │ │   │
│  │ │                                              │ │   │
│  │ │ [Headers] [Body]                            │ │   │
│  │ │                                              │ │   │
│  │ │ {                                           │ │   │
│  │ │   "users": [                                │ │   │
│  │ │     { "id": 1, "name": "Jane" },            │ │   │
│  │ │     { "id": 2, "name": "Bob" }              │ │   │
│  │ │   ]                                         │ │   │
│  │ │ }                                           │ │   │
│  │ └────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─── 2. Create User ─────────────────────────────┐    │
│  │ POST https://api.acme.com/users                │    │
│  │ ...                                             │    │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─── Rate This Collection ───────────────────────┐    │
│  │  How useful was this?                           │    │
│  │  stars (click to rate 1-5)                      │    │
│  │  Comment: [________________________] [Submit]   │    │
│  │                                                  │    │
│  │  Average: 4.2 stars (17 reviews)                │    │
│  │                                                  │    │
│  │  "Super helpful for onboarding!" — Alex, 5 star │    │
│  │  "Saved me 30 minutes of setup." — Pat, 4 star  │    │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Footer: Create Your Own · GitHub · Buy Me a Coffee     │
└─────────────────────────────────────────────────────────┘
```

#### 5b. Viewer Logic

- On load, extract collection ID from hash, fetch from `/api/collections/:id`.
- Fire a `POST /api/stats/pageview` event (fire-and-forget).
- Render collection name, description, expiry countdown, and request cards.
- **Run button:** When clicked, substitute environment variables into the request, then POST to `/api/proxy` with the request details. Display the response in the response panel with:
  - Status badge (green for 2xx, yellow for 3xx, red for 4xx/5xx).
  - Response time in ms.
  - Response size.
  - Tabs: "Body" (syntax-highlighted JSON/XML/HTML/plain), "Headers" (key-value table).
- **Copy as cURL:** Generate a valid cURL command string and copy to clipboard.
- **Copy as fetch:** Generate a JavaScript `fetch()` snippet and copy to clipboard.
- **Review section:** Display existing reviews and a form to submit a new one. Star rating is interactive (click to select 1-5). After submission, refresh the review display.

#### 5c. Viewer SEO

Even though this is dynamic content, make it crawlable:
- The `<title>` should be set to "ReqShare — {collection name}" via JS after fetch.
- Include a `<noscript>` message: "This page requires JavaScript to display API request collections."
- Use meaningful heading structure even for the JS-rendered content.
- The meta description should be generic but keyword-rich: "View and run API requests live in your browser. Shared via ReqShare — embeddable API documentation."

---

### Step 6 — Frontend: Stats Dashboard (`stats.html`)

A public page showing site usage metrics. Fetches from `/api/stats/summary`.

#### 6a. Stats UI

Display:

- **Total Page Views** — large number with label.
- **Total Unique Visitors** — large number with label.
- **Total Collections Created** — large number with label.
- **Site-Wide Review Score** — large star display with average and count.
- **30-Day Trend Chart** — A simple bar chart showing daily page views and unique visitors over the last 30 days. Use a lightweight CSS-only approach: each bar is a `<div>` with dynamic height based on percentage of max value, inside a flex container. No charting library.
- **Top Collections** — List the 5 most-viewed collections with name, view count, and average rating.

SEO title: "ReqShare Stats — Usage and Visitor Analytics"

---

### Step 7 — Styling (`css/style.css`)

Design a clean, modern, developer-friendly UI. Specific guidelines:

- **Color scheme:** Dark mode default (developers expect this). Off-black background (`#0d1117`), white/light-gray text, accent color: electric blue (`#58a6ff`) for links and interactive elements, green (`#3fb950`) for success states, red (`#f85149`) for errors.
- **Typography:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`). Monospace for code/URLs: `'SF Mono', 'Fira Code', 'Fira Mono', Consolas, monospace`.
- **Layout:** Max-width container (`960px`), centered. Responsive at `768px` and `480px` breakpoints.
- **Components:** Cards with subtle borders (`1px solid #30363d`) and slight border-radius (`8px`). Buttons with filled accent backgrounds and white text. Inputs with dark backgrounds (`#161b22`) and border focus glow.
- **Code blocks:** Syntax-highlighted JSON in the response viewer. Use simple CSS classes: `.string { color: #a5d6ff }`, `.number { color: #79c0ff }`, `.boolean { color: #ff7b72 }`, `.null { color: #8b949e }`, `.key { color: #d2a8ff }`.
- **Animations:** Subtle fade-in on page load. Button hover transitions. Loading spinner (CSS-only) when requests are executing.
- **Star ratings:** Use CSS to render filled/empty stars. Filled: gold (`#f0c000`), empty: muted gray (`#30363d`). Interactive stars on hover should preview the selection.

---

### Step 8 — CI/CD Deployment (`.github/workflows/deploy.yml`)

Create a GitHub Actions workflow that:

1. Triggers on push to `main`.
2. **Deploy site to GitHub Pages:**
   - Uses `actions/configure-pages` and `actions/deploy-pages`.
   - Deploys the `/site` directory.
3. **Deploy Worker to Cloudflare:**
   - Uses `cloudflare/wrangler-action`.
   - Reads the Cloudflare API token from repository secrets.

Repository secrets to set (via GitHub API during setup):
- `CLOUDFLARE_API_TOKEN`

---

### Step 9 — `README.md`

Write a polished README with:

- Project name, one-line description, and badges (license, deploy status).
- Screenshot or GIF of the builder and viewer.
- "Quick Start" section: how to create your first collection.
- "Self-Hosting" section: how to fork, configure, and deploy.
- "Tech Stack" section listing GitHub Pages, Cloudflare Workers, Workers KV.
- "Contributing" section.
- Link to the live site, stats page, and "Buy Me a Coffee."

---

### Step 10 — Pre-Made Demo Collection

After deployment, programmatically create a demo collection via the API containing 3-4 requests against the JSONPlaceholder API (`https://jsonplaceholder.typicode.com`):

1. `GET /posts` — "List all posts"
2. `GET /posts/1` — "Get a single post"
3. `POST /posts` — "Create a new post" (with JSON body)
4. `GET /users/1` — "Get user details"

Use this collection's URL as the "See an Example" link on the landing page.

---

### Step 11 — Final SEO Checklist

Before considering the project complete, verify:

- [ ] Every page has unique `<title>` and `<meta name="description">`.
- [ ] `sitemap.xml` lists: `/`, `/create.html`, `/stats.html`.
- [ ] `robots.txt` allows all, references sitemap.
- [ ] JSON-LD structured data on landing page (`WebApplication` type).
- [ ] All images have `alt` tags.
- [ ] Lighthouse SEO score of 95 or above.
- [ ] Lighthouse Performance score of 90 or above (no heavy libraries).
- [ ] Lighthouse Accessibility score of 90 or above.
- [ ] Open Graph and Twitter Card meta tags render correctly.
- [ ] Heading hierarchy is valid (no skipped levels).
- [ ] Internal links between all pages (landing, builder, stats all cross-linked).
- [ ] External links to GitHub and Buy Me a Coffee have `rel="noopener"`.
- [ ] All pages are mobile-responsive.
- [ ] Page load time under 2 seconds on 3G.

---

## Key Implementation Notes

- **No frameworks.** Use vanilla HTML, CSS, and JavaScript throughout. This keeps the site fast, crawlable, and dependency-free.
- **No build step.** The `site/` directory is deployed directly to GitHub Pages. No Webpack, no Vite, no npm for the frontend.
- **Worker dependencies.** The Worker uses no npm packages — only Cloudflare Workers built-in APIs (`fetch`, `Response`, `Request`, KV bindings, `crypto.subtle` for hashing).
- **Security:** The CORS proxy is the biggest risk. Rate limit aggressively. Block private IPs. Log abusive patterns. Consider adding a simple CAPTCHA or proof-of-work challenge if abuse occurs.
- **Privacy:** Hash IPs (SHA-256, truncated) before storing. Never store raw IP addresses. State this in a brief privacy notice in the footer.
- **Expiry:** Free collections expire after 30 days. Show a clear countdown on the viewer page. Send no notifications (no email collected, no PII stored).

---

## Future Monetization Hooks (do not implement now, but design data model to support)

- Persistent collections (no 30-day expiry) — flag in KV metadata.
- Custom subdomain (`your-api.reqshare.dev`) — Workers route mapping.
- Team collections with multiple editors — auth layer.
- Embed analytics (how many times your embedded collection was viewed) — stats per collection.
- White-label embeds (remove ReqShare branding) — CSS flag.
