# ReqShare

**Show your API, don't just describe it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy](https://github.com/sillymodes/reqshare/actions/workflows/deploy.yml/badge.svg)](https://github.com/sillymodes/reqshare/actions/workflows/deploy.yml)

Create runnable API example pages and share them with a link. No signup, no install.

---

## What Is ReqShare?

ReqShare lets you build shareable, runnable API request collections that anyone can open and execute in the browser. Think "CodePen for API calls."

Instead of pasting cURL commands into Slack or writing static docs that go stale, give people a live link where they can read your requests and hit **Run**.

Built for developer relations teams, API-first startups, open-source maintainers, and anyone who's ever wished there was a better way to show someone how an API works.

---

## Quick Start

1. Visit [**reqshare**](https://sillymodes.github.io/reqshare/create.html) and click **Build a Collection**.
2. Add your requests -- set the method, URL, headers, and body for each one.
3. Optionally define environment variables (e.g. `{{BASE_URL}}`) to keep things DRY.
4. Click **Create and Get Share Link**.
5. Share the link. Recipients can view and run every request right in the browser.

---

## Features

- **CORS Proxy** -- Run requests against any public API directly from the browser, no backend setup needed.
- **Environment Variables** -- Define `{{VARIABLE}}` placeholders and reuse them across requests.
- **cURL Import** -- Paste a cURL command and it auto-populates into a new request.
- **Copy as cURL / fetch** -- One-click export of any request as a cURL command or JavaScript `fetch()` snippet.
- **Reviews & Ratings** -- Viewers can rate collections 1-5 stars and leave comments.
- **Public Stats Dashboard** -- See site-wide page views, unique visitors, and collection counts.
- **30-Day Expiry** -- Collections auto-expire after 30 days. No stale links cluttering the web.
- **No Signup Required** -- Create and share without an account.

---

## Self-Hosting

1. **Fork** this repository.
2. **Create Cloudflare resources:**
   - Create a Cloudflare account and generate an API token with Workers and KV permissions.
   - Create three KV namespaces: `COLLECTIONS`, `STATS`, `REVIEWS`.
   - Update `worker/wrangler.toml` with your KV namespace IDs.
3. **Configure secrets:**
   - Copy `.env.example` to `.env` and fill in your Cloudflare API token and account ID.
   - Add `CLOUDFLARE_API_TOKEN` as a repository secret in GitHub Settings > Secrets.
4. **Deploy:**
   - The GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys the frontend to GitHub Pages and the Worker to Cloudflare on every push to `main`.
   - Or deploy manually: push `site/` to GitHub Pages and run `npx wrangler deploy` from the `worker/` directory.

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | Vanilla HTML, CSS, JavaScript     |
| Hosting    | GitHub Pages                      |
| Backend    | Cloudflare Workers                |
| Storage    | Cloudflare Workers KV             |
| CI/CD      | GitHub Actions                    |

No frameworks, no build step, no npm for the frontend.

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repo and create a feature branch.
2. Make your changes -- keep things vanilla (no frameworks or heavy dependencies).
3. Test locally by opening `site/index.html` in a browser.
4. Submit a pull request with a clear description of what you changed and why.

Please open an issue first for large changes so we can discuss the approach.

---

## Links

- **Live Site:** [sillymodes.github.io/reqshare](https://sillymodes.github.io/reqshare/)
- **Stats Dashboard:** [sillymodes.github.io/reqshare/stats.html](https://sillymodes.github.io/reqshare/stats.html)
- **Buy Me a Coffee:** [buymeacoffee.com/timtian](https://buymeacoffee.com/timtian)
- **GitHub:** [github.com/sillymodes/reqshare](https://github.com/sillymodes/reqshare)

---

## License

[MIT](LICENSE)
