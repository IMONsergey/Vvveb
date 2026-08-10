import { Sandbox } from '@vercel/sandbox';

const SANDBOX_NAME = 'vvveb-stateful';
const PORT = 8080;
const TIMEOUT_MS = 40 * 60 * 1000;
const SNAPSHOT_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_DIR = '/vercel/sandbox/vvveb';
const UPSTREAM_SHA = '5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shell(sbx, script, { sudo = false, detached = false } = {}) {
  return sbx.runCommand({ cmd: 'bash', args: ['-lc', script], sudo, detached });
}

async function ensureDocker(sbx) {
  let result = await shell(sbx, 'command -v docker >/dev/null 2>&1');
  if (result.exitCode !== 0) {
    result = await shell(sbx, `
      set -e
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y docker git curl
      elif command -v apt-get >/dev/null 2>&1; then
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io git curl
      else
        echo 'No supported package manager found' >&2
        exit 2
      fi
    `, { sudo: true });
    if (result.exitCode !== 0) throw new Error(`Docker install failed: ${await result.stderr()}`);
  }

  result = await shell(sbx, 'docker info >/dev/null 2>&1', { sudo: true });
  if (result.exitCode !== 0) {
    await sbx.runCommand({
      cmd: 'dockerd',
      args: ['--host=unix:///var/run/docker.sock'],
      sudo: true,
      detached: true,
    });
    let ready = false;
    for (let i = 0; i < 45; i += 1) {
      await sleep(1000);
      const probe = await shell(sbx, 'docker info >/dev/null 2>&1', { sudo: true });
      if (probe.exitCode === 0) { ready = true; break; }
    }
    if (!ready) throw new Error('Docker daemon did not become ready');
  }
}

async function ensureSource(sbx) {
  const exists = await shell(sbx, `test -f ${SOURCE_DIR}/public/index.php`);
  if (exists.exitCode === 0) return;

  const setup = await shell(sbx, `
    set -euo pipefail
    rm -rf ${SOURCE_DIR}
    git clone --recurse-submodules https://github.com/givanz/Vvveb.git ${SOURCE_DIR}
    cd ${SOURCE_DIR}
    git checkout ${UPSTREAM_SHA}
    git submodule update --init --recursive
    mkdir -p storage/sqlite storage/cache storage/model storage/compiled-templates public/media public/image-cache
    chmod -R a+rwX config storage public/media public/themes public/image-cache plugins
  `);
  if (setup.exitCode !== 0) throw new Error(`Vvveb source setup failed: ${await setup.stderr()}`);
}

async function ensureVvveb(sbx) {
  await ensureDocker(sbx);
  await ensureSource(sbx);

  const inspect = await shell(sbx, 'docker inspect vvveb >/dev/null 2>&1', { sudo: true });
  if (inspect.exitCode === 0) {
    await shell(sbx, 'docker start vvveb >/dev/null 2>&1 || true', { sudo: true });
  } else {
    const run = await shell(sbx, `
      docker run -d \\
        --name vvveb \\
        --restart unless-stopped \\
        -p 0.0.0.0:${PORT}:80 \\
        -e DB_ENGINE=sqlite \\
        -v ${SOURCE_DIR}:/var/www/html \\
        vvveb/vvvebcms:php8.5-fpm-alpine
    `, { sudo: true });
    if (run.exitCode !== 0) throw new Error(`Vvveb container start failed: ${await run.stderr()}`);
  }

  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const probe = await shell(sbx, `curl -fsS --max-time 3 http://127.0.0.1:${PORT}/ >/dev/null 2>&1`);
    if (probe.exitCode === 0) { ready = true; break; }
    await sleep(1000);
  }
  if (!ready) {
    const logs = await shell(sbx, 'docker logs --tail 120 vvveb 2>&1', { sudo: true });
    throw new Error(`Vvveb did not become ready: ${await logs.stdout()}`);
  }
}

async function getSandbox() {
  return Sandbox.getOrCreate({
    name: SANDBOX_NAME,
    runtime: 'node24',
    ports: [PORT],
    timeout: TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: SNAPSHOT_MS,
    resume: true,
    onCreate: ensureVvveb,
    onResume: ensureVvveb,
  });
}

function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    const sbx = await getSandbox();
    const sandboxBase = sbx.domain(PORT).replace(/\/$/, '');

    if (req.url.startsWith('/__warm')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, sandbox: SANDBOX_NAME, upstream: sandboxBase });
    }

    const body = await readRequestBody(req);
    const incoming = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const target = `${sandboxBase}${incoming.pathname}${incoming.search}`;

    const headers = new Headers();
    for (const [key, raw] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower) || raw == null) continue;
      if (Array.isArray(raw)) raw.forEach((value) => headers.append(key, value));
      else headers.set(key, String(raw));
    }
    headers.set('x-forwarded-host', req.headers.host || '');
    headers.set('x-forwarded-proto', 'https');

    let upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    if (upstream.status >= 500) {
      await ensureVvveb(sbx);
      upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    }

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (['content-length', 'transfer-encoding', 'connection'].includes(lower)) return;
      if (lower === 'location') {
        const launcherBase = `https://${req.headers.host}`;
        value = value.replace(sandboxBase, launcherBase);
      }
      res.setHeader(key, value);
    });
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      hint: 'Persistent Vvveb Sandbox could not be started or resumed',
    });
  }
}
