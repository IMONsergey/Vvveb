import { Sandbox } from '@vercel/sandbox';

const SANDBOX_NAME = 'vvveb-stateful';
const PORT = 8080;
const TIMEOUT_MS = 40 * 60 * 1000;
const SNAPSHOT_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_DIR = '/vercel/sandbox/vvveb';
const UPSTREAM_SHA = '5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1';
const ADMIN_EMAIL = 'admin@vvveb.local';
const ADMIN_PASSWORD = 'ImonVvveb-2026-7cH9';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shell(sbx, script, { sudo = false, detached = false, cwd } = {}) {
  return sbx.runCommand({ cmd: 'bash', args: ['-lc', script], sudo, detached, cwd });
}

async function ensureRuntime(sbx) {
  const probe = await shell(sbx, `command -v php >/dev/null 2>&1 && php -r 'exit(class_exists("SQLite3") && extension_loaded("mysqli") && extension_loaded("xml") && extension_loaded("curl") && extension_loaded("zip") ? 0 : 1);'`);
  if (probe.exitCode === 0) return;

  let install = await shell(sbx, `
    set -e
    if command -v dnf >/dev/null 2>&1; then
      dnf install -y \
        php8.4 php8.4-cli php8.4-common php8.4-mysqlnd php8.4-pdo \
        php8.4-xml php8.4-zip php8.4-gd php8.4-mbstring php8.4-intl \
        git curl unzip
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y \
        php-cli php-common php-mysql php-sqlite3 php-xml php-curl php-zip \
        php-gd php-mbstring php-intl git curl unzip
    else
      echo 'Unsupported Sandbox base image: no dnf/apt-get' >&2
      exit 2
    fi
  `, { sudo: true });

  if (install.exitCode !== 0) {
    throw new Error(`PHP runtime install failed: ${await install.stderr()}`);
  }

  const diagnostics = await shell(sbx, `
    set -e
    php -v
    php -m
    php -r 'if (!class_exists("SQLite3")) { fwrite(STDERR, "SQLite3 missing\\n"); exit(10); }'
    php -r 'foreach (["mysqli","xml","curl","zip","dom","gettext"] as $e) if (!extension_loaded($e)) { fwrite(STDERR, "$e missing\\n"); exit(11); }'
  `);
  if (diagnostics.exitCode !== 0) {
    throw new Error(`PHP extensions incomplete: ${await diagnostics.stderr()}\n${await diagnostics.stdout()}`);
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
    cat > router.php <<'PHP'
<?php
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$file = __DIR__ . '/public' . $uri;
if ($uri !== '/' && is_file($file)) {
    return false;
}
chdir(__DIR__ . '/public');
require __DIR__ . '/public/index.php';
PHP
  `);
  if (setup.exitCode !== 0) throw new Error(`Vvveb source setup failed: ${await setup.stderr()}`);
}

async function ensureInstalled(sbx) {
  const installed = await shell(sbx, `test -s ${SOURCE_DIR}/config/db.php && test -s ${SOURCE_DIR}/storage/sqlite/vvveb.db`);
  if (installed.exitCode === 0) return;

  const install = await shell(sbx, `
    set -euo pipefail
    cd ${SOURCE_DIR}
    rm -f config/db.php storage/sqlite/vvveb.db
    mkdir -p storage/sqlite
    php cli.php install \
      engine=sqlite \
      admin[email]=${ADMIN_EMAIL} \
      admin[username]=admin \
      admin[password]=${ADMIN_PASSWORD} \
      hostname='*.*.*'
    test -s config/db.php
    test -s storage/sqlite/vvveb.db
  `);
  if (install.exitCode !== 0) {
    throw new Error(`Vvveb CLI install failed: ${await install.stderr()}\n${await install.stdout()}`);
  }
}

async function ensureServer(sbx) {
  const existing = await shell(sbx, `curl -fsS --max-time 2 http://127.0.0.1:${PORT}/ >/dev/null 2>&1`);
  if (existing.exitCode === 0) return;

  await shell(sbx, `pkill -f 'php -S 0.0.0.0:${PORT}' >/dev/null 2>&1 || true`);
  await sbx.runCommand({
    cmd: 'php',
    args: ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `0.0.0.0:${PORT}`, 'router.php'],
    cwd: SOURCE_DIR,
    detached: true,
  });

  for (let i = 0; i < 45; i += 1) {
    await sleep(1000);
    const ready = await shell(sbx, `curl -fsS --max-time 3 http://127.0.0.1:${PORT}/ >/dev/null 2>&1`);
    if (ready.exitCode === 0) return;
  }

  const diag = await shell(sbx, `
    ps aux | grep '[p]hp -S' || true
    tail -n 100 ${SOURCE_DIR}/storage/logs/error_log 2>/dev/null || true
  `);
  throw new Error(`Native Vvveb server did not become ready: ${await diag.stdout()}\n${await diag.stderr()}`);
}

async function ensureVvveb(sbx) {
  await ensureRuntime(sbx);
  await ensureSource(sbx);
  await ensureInstalled(sbx);
  await ensureServer(sbx);
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

    if (req.url.startsWith('/__warm') || req.url.startsWith('/__status')) {
      const status = await shell(sbx, `
        printf 'php='; php -r 'echo PHP_VERSION;' 2>/dev/null || true
        printf '\ninstalled='; test -s ${SOURCE_DIR}/config/db.php && echo yes || echo no
        printf 'db='; test -s ${SOURCE_DIR}/storage/sqlite/vvveb.db && echo yes || echo no
        printf 'server='; curl -fsS --max-time 2 http://127.0.0.1:${PORT}/ >/dev/null 2>&1 && echo yes || echo no
      `);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        sandbox: SANDBOX_NAME,
        upstream: sandboxBase,
        admin: { username: 'admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        diagnostics: await status.stdout(),
      });
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
      hint: 'Native persistent Vvveb Sandbox could not be started or resumed',
    });
  }
}
