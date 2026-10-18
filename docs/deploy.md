# Deploying the web app

The app in `app/` is a static Vite build plus Vercel functions in `app/api/`. The main site
(raghavkohli.xyz) stays on GitHub Pages and links to the app.

## Vercel project

- Project: `permutation-city` (team `raghav-6207's projects`), with **Root Directory** set to
  `app`. The CLI link lives in `.vercel/` at the repo root (not committed).
- Build: `npm run build` (type-check, then `vite build`), output `dist/`. See `app/vercel.json`.
- Git deploys: the GitHub repo is connected. Every push to a branch gives a preview, and
  `main` goes to production.
- CLI deploys run from the **repo root**, not from `app/` (with Root Directory set, a deploy
  from `app/` looks for `app/app` and fails). `.vercelignore` uploads only `app/` and `test/`:

  ```bash
  npx vercel deploy          # preview (behind Vercel login by default)
  npx vercel deploy --prod   # production
  ```

- Environment variables:
  - `OPENROUTER_API_KEY` (secret). Set it with `npx vercel env add OPENROUTER_API_KEY`
    for Production and Preview (and Development if you run functions locally with
    `npx vercel dev`).
  - `OPENROUTER_MODEL` (optional), the OpenRouter model id for the brief compiler. It
    defaults to Claude Sonnet 5.5.
  - `BLOB_READ_WRITE_TOKEN` and `GITHUB_DISPATCH_TOKEN`: building drawn sites on GitHub
    Actions (see `docs/service.md`, "Building on GitHub Actions"). Without them `new.html`
    says new sites can't be built yet and still opens the ready-made ones.
  - `VITE_SERVICE_URL` (optional), the address of a self-hosted layer service. If set, the
    page calls it directly instead of `/api/sites`. It is public (Vite builds it into the
    page). In `npm run dev` it defaults to `http://localhost:8765`.

  The OpenRouter variables are read only inside `app/api/`, never in the client. For local work,
  `npx vercel env pull app/.env.local` copies them down (run from the repo root). `.env*` files are not committed.

## Production name

For now the app lives at **https://permutationcity.vercel.app** (`permutation-city.vercel.app` was taken; a project domain, so every
production deploy moves it):

```bash
npx vercel domains add permutationcity.vercel.app permutation-city
```

## permutation.raghavkohli.xyz (later)

1. Add the domain to the project:

   ```bash
   npx vercel domains add permutation.raghavkohli.xyz
   ```

   (or Project → Settings → Domains → Add.)
2. At whoever serves DNS for raghavkohli.xyz, add one record:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `permutation` | `cname.vercel-dns.com` |

   Use the exact target Vercel shows on the Domains page if it differs. If the DNS is on
   Cloudflare, set the record to **DNS only** (grey cloud), so Vercel can issue the
   certificate.
3. If Vercel asks to verify ownership (it does when the domain is used in another Vercel
   account), add the `TXT` record it shows, at `_vercel.raghavkohli.xyz`.
4. Wait for the Domains page to show the certificate as issued, then open the subdomain.

This only touches the `permutation` subdomain. The apex and `www` records that point at
GitHub Pages stay as they are.

## Checks after a deploy

```bash
npx vercel curl <deployment-url>/api/health        # {"ok":true,...}
npx vercel curl <deployment-url>/sites/sites.json  # the site list
```

`vercel curl` gets through deployment protection on previews.
