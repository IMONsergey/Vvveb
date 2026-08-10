# Vvveb — IMON GitHub runtime

This repository is prepared to run the upstream **Vvveb CMS** from GitHub infrastructure without requiring a local PHP/MySQL installation.

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

Vvveb is a PHP CMS with a database-backed admin panel and editor. The full application is therefore run in GitHub Codespaces/Docker rather than as a static GitHub Pages site. For a permanent public URL the same compose/runtime can be deployed to a persistent container host while GitHub remains the source of truth.

## Repository materialization

`.github/workflows/bootstrap-vvveb.yml` is a manual-only repository-materialization workflow. When explicitly dispatched in GitHub Actions, it replaces this thin runtime wrapper with a self-contained copy of the pinned upstream Vvveb tree and recursive submodules, then installs CI for the materialized source.
