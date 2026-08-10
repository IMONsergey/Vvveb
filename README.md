# Vvveb — IMON GitHub runtime

This repository is prepared to run the upstream **Vvveb CMS** from GitHub infrastructure without requiring a local PHP/MySQL installation.

## Free public preview from GitHub Actions

For a temporary public link without any external hosting account:

1. Open **Actions** in this repository.
2. Select **Public Vvveb Preview**.
3. Click **Run workflow**.
4. Choose 30, 60, 180, or 330 minutes.
5. After the tunnel step starts, open the public `*.trycloudflare.com` URL shown in the workflow summary.

The workflow runs the official `vvveb/vvvebcms` Docker image with SQLite and exposes port 8080 through a Cloudflare Quick Tunnel. If the installer appears, select **SQLite** and create a temporary administrator account immediately.

This mode is intentionally ephemeral: its database and edits disappear when the workflow ends. It is useful for evaluating Vvveb without paying for hosting.

## Launch in GitHub Codespaces

[Open Vvveb in GitHub Codespaces](https://codespaces.new/IMONsergey/Vvveb?quickstart=1)

The included `.devcontainer/devcontainer.json` automatically starts Docker Compose.

Ports:

- `8080` — Vvveb CMS
- `8081` — phpMyAdmin

On first launch, Vvveb may show its normal installer. Use the database values below:

- Host: `db`
- Database: `vvveb`
- User: `vvveb`
- Password: `vvveb`
- Engine: `mysqli`

Choose your own administrator email and password during installation.

A Codespaces forwarded port can also be changed to **Public** from the Ports panel, which gives the running CMS a shareable `*.app.github.dev` URL. The URL is available only while the codespace is running.

## Permanent public hosting

For a stable public URL, deploy the same Docker application to a persistent container platform. Railway is a particularly direct fit because it supports GitHub deployments, Docker images/Dockerfiles, Compose import, databases, and persistent volumes. A simple Vvveb setup can also use SQLite with one persistent volume mounted at `/var/www/html`.

Render and other Docker hosts are also possible. On free Render web services the local filesystem is ephemeral, so Vvveb edits/uploads will not survive restarts unless persistence is moved outside the service or a paid persistent disk is used.

## Upstream

- Repository: `givanz/Vvveb`
- Pinned upstream commit: `5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1`
- Submodules are fetched recursively at runtime.
- License: AGPL-3.0-or-later (upstream license applies to Vvveb).

## Run with Docker Compose

```bash
docker compose -f docker-compose.preview.yml up -d
```

The `source` service downloads the pinned Vvveb revision with all recursive Git submodules into a persistent Docker volume. The `app` service uses the official `vvveb/vvvebcms` runtime image and MySQL 8.4.

To reset everything:

```bash
docker compose -f docker-compose.preview.yml down -v
```

## GitHub runtime model

Vvveb is a PHP CMS with a database-backed admin panel and editor. The full application cannot run as a static GitHub Pages site. GitHub can still host the source, CI, temporary Actions/Codespaces previews, and deployment configuration while a persistent container platform serves production traffic.

## Repository materialization

`.github/workflows/bootstrap-vvveb.yml` is a manual-only repository-materialization workflow. When explicitly dispatched in GitHub Actions, it replaces this thin runtime wrapper with a self-contained copy of the pinned upstream Vvveb tree and recursive submodules, then installs CI for the materialized source.
