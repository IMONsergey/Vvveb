# Vvveb — IMON runtime

GitHub is the source of truth for this project. Because the full Vvveb CMS cannot run on GitHub Pages, the hosted runtime is Vercel.

## Primary public preview — preinstalled Vercel container

Stable URL:

`https://vvveb-cdo-2844s-projects.vercel.app`

Admin:

- URL: `https://vvveb-cdo-2844s-projects.vercel.app/admin/`
- Username: `admin`
- Password: `ImonVvveb-2026-7cH9`

The first Vercel experiment allowed the Vvveb installer to run at request time. That failed after installation because Vvveb writes `config/db.php`, SQLite data, media and theme/editor files to local storage while normal Vercel container invocations are stateless.

The primary preview now avoids the installer completely:

1. `Dockerfile.vercel` builds PHP 8.4 with all required Vvveb extensions.
2. It clones pinned Vvveb upstream SHA `5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1` with recursive submodules.
3. Vvveb + SQLite + the admin account are installed during Docker build.
4. On each container cold start the ready CMS is copied to writable `/tmp/vvveb`.
5. The CMS immediately starts on Vercel's `$PORT` with a PHP router; no web installer is involved.

This runtime is optimized for evaluating the full UI/admin/page-builder workflow. Mutations can survive while the same container instance remains warm, but they are not guaranteed to persist across Vercel cold starts.

## Persistent runtime experiment — Vercel Sandbox

Stable launcher:

`https://vvveb-launcher-cdo-2844s-projects.vercel.app`

`vercel-launcher/` uses a named persistent Vercel Sandbox (`vvveb-stateful`). The current launcher no longer tries to run nested Docker. Instead it installs PHP natively in the Sandbox, clones Vvveb, installs SQLite automatically and starts a PHP server on the exposed port. Vercel Sandbox persistence/snapshots are intended to retain CMS files across Sandbox sessions.

The launcher reverse-proxies traffic to the current Sandbox URL and has a `/__warm` cron endpoint for automatic resume.

## Local / Codespaces fallback

The repository also contains `docker-compose.preview.yml` and `.devcontainer/devcontainer.json`.

Ports:

- `8080` — Vvveb CMS
- `8081` — phpMyAdmin

Local start:

```bash
docker compose -f docker-compose.preview.yml up -d
```

## Upstream

- Repository: `givanz/Vvveb`
- Pinned revision: `5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1`
- License: AGPL-3.0-or-later
- Recursive submodules provide the themes, admin UI and plugins used by the full CMS.
