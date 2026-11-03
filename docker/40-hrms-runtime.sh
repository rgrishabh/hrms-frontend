#!/bin/sh
# Runs from the nginx image entrypoint (/docker-entrypoint.d) before nginx starts.
# Renders index.html (title, theme colour, favicon), env.js and security headers from
# non-secret environment variables, so one image serves every environment and customer.
set -eu

OUT=/tmp/hrms
mkdir -p "$OUT"
HTML=/usr/share/nginx/html

PRODUCT_NAME=${PRODUCT_NAME:-HRMS}
BRAND_SHORT_NAME=${BRAND_SHORT_NAME:-$PRODUCT_NAME}
BRAND_PRIMARY_COLOR=${BRAND_PRIMARY_COLOR:-#1f4e79}
BRAND_FAVICON_URL=${BRAND_FAVICON_URL:-}
BRAND_LOGO_URL=${BRAND_LOGO_URL:-}
APP_ENVIRONMENT=${APP_ENVIRONMENT:-production}
APP_VERSION=${APP_VERSION:-unknown}
HSTS=${HSTS:-true}

html_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&#39;/g"; }
# JSON string body; also escapes < so the value can never close the <script>.
json_escape() { printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'; }
https_origin() { printf '%s' "$1" | sed -n -E 's#^(https://[A-Za-z0-9.-]+(:[0-9]+)?)(/.*)?$#\1#p'; }

case "$BRAND_PRIMARY_COLOR" in
  \#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]|\#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]) ;;
  *) echo "hrms: BRAND_PRIMARY_COLOR must be #rgb or #rrggbb" >&2; exit 1 ;;
esac
case "$BRAND_FAVICON_URL" in ""|https://*|/branding/*) ;; *) echo "hrms: BRAND_FAVICON_URL must be https://… or /branding/…" >&2; exit 1 ;; esac

title=$(html_escape "$BRAND_SHORT_NAME · $PRODUCT_NAME")
head="<title>$title</title><meta name=\"application-name\" content=\"$(html_escape "$PRODUCT_NAME")\" /><meta name=\"theme-color\" content=\"$BRAND_PRIMARY_COLOR\" />"
[ -n "$BRAND_FAVICON_URL" ] && head="$head<link rel=\"icon\" href=\"$(html_escape "$BRAND_FAVICON_URL")\" />"

# Replace the marked head block (single line in the built index.html).
awk -v head="$head" '{ s=index($0,"<!--hrms:head-->"); e=index($0,"<!--/hrms:head-->");
  if (s && e) { print substr($0,1,s-1) head substr($0,e+17) } else print }' "$HTML/index.html" > "$OUT/index.html"
grep -q '<title>' "$OUT/index.html" || { echo "hrms: index.html head marker missing" >&2; exit 1; }

cat > "$OUT/env.js" <<JS
window.__HRMS_ENV__ = {"environment":"$(json_escape "$APP_ENVIRONMENT")","version":"$(json_escape "$APP_VERSION")","productName":"$(json_escape "$PRODUCT_NAME")","brandShortName":"$(json_escape "$BRAND_SHORT_NAME")","primaryColor":"$BRAND_PRIMARY_COLOR"};
JS

img="'self' data:"
for u in "$BRAND_LOGO_URL" "$BRAND_FAVICON_URL"; do o=$(https_origin "$u"); [ -n "$o" ] && img="$img $o"; done
{
  echo "add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src $img; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\" always;"
  echo 'add_header X-Content-Type-Options "nosniff" always;'
  echo 'add_header X-Frame-Options "DENY" always;'
  echo 'add_header Referrer-Policy "no-referrer" always;'
  echo 'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;'
  echo 'add_header Cross-Origin-Opener-Policy "same-origin" always;'
  [ "$HSTS" = "true" ] && echo 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
} > "$OUT/headers.conf"
echo "hrms: runtime config rendered (environment=$APP_ENVIRONMENT version=$APP_VERSION)"
