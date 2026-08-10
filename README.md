# Vvveb — IMON runtime

GitHub is the source of truth for this project. Because the full Vvveb CMS cannot run on GitHub Pages, the primary hosted runtime is Vercel.

## Primary runtime: Vercel Sandbox

Stable launcher URL:

`https://vvveb-launcher-cdo-2844s-projects.vercel.app`

Vvveb is a stateful PHP CMS. Its installer and visual editor write database/configuration data, uploaded media, theme templates, backups, plugins and generated files to the local filesystem. A normal Vercel Container Function is stateless, so it can display the installer but is not a valid runtime for the installed CMS.

The `vercel-launcher/` project solves this by using a **named persistent Vercel Sandbox**:

1. `vvveb-launcher` receives the browser request.
2. It creates or resumes the named `vvveb-stateful` Sandbox.
3. The Sandbox installs/starts Docker when needed.
4. It clones the pinned upstream Vvveb source with recursive submodules into the persistent Sandbox filesystem.
5. It runs the official Vvveb image with the source directory bind-mounted into `/var/www/html`.
6. Vvveb uses SQLite inside that persistent source tree.
7. The launcher reverse-proxies browser traffic to the Sandbox, so the public launcher URL remains stable across Sandbox sessions.
8. Vercel Cron calls `/__warm` periodically to start or resume the environment without requiring a manual launch.

Pinned upstream revision:

`5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1`

## Why the first direct Vercel deployment failed

The first experiment ran `vvveb/vvvebcms` directly as a Vercel container service. The installer loaded, but installation writes `config/db.php`, SQLite data and other state to `/var/www/html`. The editor also edits/deletes/copies theme files and stores media on disk. Those mutations are incompatible with stateless function invocations, causing the post-install flow to fail.

The direct `Dockerfile.vercel` / root `vercel.json` files are retained only as a record of that experiment. `vercel-launcher/` is the supported Vercel path.

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
- License: AGPL-3.0-or-later
- Full upstream includes recursive submodules for themes, admin UI and plugins.
