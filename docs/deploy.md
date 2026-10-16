# Deploying the web app

The app in `app/` is a static Vite build plus Vercel functions in `app/api/`. The main site
(raghavkohli.xyz) stays on GitHub Pages and links to the app.

## Vercel project

- Project: `permutation-city` (team `raghav-6207's projects`). The local link lives in
  `app/.vercel/` (not committed).
- Build: `npm run build` (type-check, then `vite build`), output `dist/`. See `app/vercel.json`.
- Deploy a preview from the command line:

  ```bash
  cd app
  npx vercel deploy          # preview (behind Vercel login by default)
  npx vercel deploy --prod   # production
  ```

- Git deploys (optional): in the Vercel dashboard, connect the GitHub repo and set **Root
  Directory** to `app`. Then every push to a branch gives a preview, and `main` goes to
  production.
- Environment variables (Phase 4):
  - `OPENROUTER_API_KEY` (secret). Set it with `npx vercel env add OPENROUTER_API_KEY`
    for Production and Preview (and Development if you run functions locally with
    `npx vercel dev`).
  - `OPENROUTER_MODEL` (optional), the OpenRouter model id for the brief compiler. It
    defaults to Claude Sonnet 5.5.

  Both are read only inside `app/api/`, never in the client. For local work,
  `npx vercel env pull .env.local` copies them down. `.env*` files are not committed.

## Production name

For now the app lives at **https://permutationcity.vercel.app** (`permutation-city.vercel.app` was taken; a project domain, so every
production deploy moves it):

```bash
cd app && npx vercel domains add permutationcity.vercel.app permutation-city
```

## permutation.raghavkohli.xyz (later)

1. Add the domain to the project:

   ```bash
   cd app && npx vercel domains add permutation.raghavkohli.xyz
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
cd app
npx vercel curl <deployment-url>/api/health        # {"ok":true,...}
npx vercel curl <deployment-url>/sites/sites.json  # the site list
```

`vercel curl` gets through deployment protection on previews.
