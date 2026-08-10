# Vvveb — IMON GitHub runtime

This repository is prepared to run the upstream **Vvveb CMS** from GitHub infrastructure without requiring a local PHP/MySQL installation.

## Upstream

- Repository: `givanz/Vvveb`
- Pinned upstream commit: `5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1`
- Submodules are fetched recursively at runtime.
- License: AGPL-3.0-or-later (upstream license applies to Vvveb).

## Fastest preview: GitHub Codespaces

Open this repository in GitHub Codespaces. The included `.devcontainer/devcontainer.json` automatically starts Docker Compose.

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

## Run with Docker Compose

```bash
docker compose -f docker-compose.preview.yml up -d
```

The `source` service downloads the pinned Vvveb revision with all recursive Git submodules into a persistent Docker volume. The `app` service uses the official `vvveb/vvvebcms` runtime image and MySQL 8.4.

To reset everything:

```bash
docker compose -f docker-compose.preview.yml down -v
```

## Why not GitHub Pages?

Vvveb is a PHP CMS with a database-backed admin panel and editor. GitHub Pages only serves static files, so the full application cannot execute there. GitHub Codespaces can run the complete Docker stack; for a permanent public URL the same compose/runtime must be deployed to a persistent container host.

## Repository bootstrap

`.github/workflows/bootstrap-vvveb.yml` is also included as a repository-materialization workflow. When GitHub Actions is allowed to execute it, it replaces this thin runtime wrapper with a self-contained copy of the upstream Vvveb tree and its submodules, then installs CI/container workflows.
