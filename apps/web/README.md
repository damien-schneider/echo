# Echo website

Marketing site for [Echo](https://echo-app.site), the local, private desktop dictation app. Built with TanStack Start, React 19, and Tailwind CSS v4.

## Development

```bash
bun install          # from the repo root
cd apps/web
bun run dev          # http://localhost:3005
bun run build        # production build into .output/
bun run start        # serve the production build
bun run check-types
```

## Environment

Copy `.env.example` to `.env`:

- `VITE_SITE_URL` — public site URL used for canonical links, `og:url`, `og:image`, and the sitemap (`http://localhost:3005` locally, `https://echo-app.site` in production).

## Tests

Playwright checks live in `e2e/`. They run against the production build, so build first:

```bash
bun run build
bun run test:e2e
```

## Deployment

Deployed with [Railpack](https://railpack.com) using the repo-root `railpack.json` (and `.railpackrc`): it installs with Bun, runs `bun run build` in `apps/web`, and starts `node apps/web/.output/server/index.mjs`.
