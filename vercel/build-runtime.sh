#!/bin/sh
set -eux

VVVEB_SHA="5adb8cde58b74bb95ee1bb07505efb2ff76cdfe1"
VVVEB_ADMIN_EMAIL="admin@vvveb.local"
VVVEB_ADMIN_PASSWORD="ImonVvveb-2026-7cH9"

apk add --no-cache \
  git curl unzip \
  libzip libxml2 libpng libjpeg-turbo freetype gettext icu-libs sqlite-libs oniguruma

apk add --no-cache --virtual .build-deps \
  $PHPIZE_DEPS \
  libzip-dev libxml2-dev libpng-dev libjpeg-turbo-dev freetype-dev \
  gettext-dev icu-dev sqlite-dev oniguruma-dev curl-dev

docker-php-ext-configure gd --with-freetype --with-jpeg
docker-php-ext-install -j"$(nproc)" \
  mysqli pdo_mysql sqlite3 pdo_sqlite xml dom curl zip gd mbstring intl gettext

apk del .build-deps

php -r 'foreach (["mysqli","mysqlnd","xml","libxml","pcre","zip","dom","curl","gettext","sqlite3","pdo_sqlite"] as $ext) { if (!extension_loaded($ext)) { fwrite(STDERR, "Missing PHP extension: $ext\n"); exit(1); } }'

rm -rf /opt/vvveb
git clone --recurse-submodules https://github.com/givanz/Vvveb.git /opt/vvveb
cd /opt/vvveb
git checkout "$VVVEB_SHA"
git submodule update --init --recursive

mkdir -p \
  storage/sqlite \
  storage/cache \
  storage/model \
  storage/compiled-templates \
  storage/logs \
  public/media \
  public/image-cache

chmod -R a+rwX config storage public/media public/themes public/image-cache plugins

php cli.php install \
  engine=sqlite \
  'admin[email]'="$VVVEB_ADMIN_EMAIL" \
  'admin[username]'=admin \
  'admin[password]'="$VVVEB_ADMIN_PASSWORD" \
  'hostname=*.*.*'

test -s config/db.php
test -s storage/sqlite/vvveb.db
test -s public/index.php
test -s public/admin/index.php

cat > /opt/vvveb/router.php <<'PHP'
<?php
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$public = __DIR__ . '/public';

if ($uri === '/__health') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'runtime' => 'vvveb-preinstalled']);
    return true;
}

if (!str_contains($uri, '..')) {
    $candidate = $public . $uri;
    if ($uri === '/' || is_file($candidate) || is_dir($candidate)) {
        return false;
    }
}

chdir($public);
require $public . '/index.php';
PHP

cat > /usr/local/bin/vvveb-start <<'SH'
#!/bin/sh
set -eu
port="${PORT:-80}"
echo "[vvveb] booting on port ${port}" >&2
rm -rf /tmp/vvveb
cp -a /opt/vvveb /tmp/vvveb
cd /tmp/vvveb
exec php \
  -d display_errors=0 \
  -d log_errors=1 \
  -S "0.0.0.0:${port}" \
  -t public \
  router.php
SH
chmod +x /usr/local/bin/vvveb-start

find /opt/vvveb -name .git -prune -exec rm -rf '{}' ';'
