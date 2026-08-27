#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
printf '# Preview\n' > "$tmp/preview.md"

cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$tmp/bin/cmux" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MARK_CMUX_LOG"
if [[ ${1:-} == current-window ]]; then
  printf 'window:focused\n'
fi
EOF

chmod +x "$tmp/bin/curl" "$tmp/bin/cmux"

export MARK_CMUX_LOG="$tmp/cmux.log"
export CMUX_BUNDLED_CLI_PATH="$tmp/bin/cmux"
export CMUX_WORKSPACE_ID='workspace:caller'
PATH="$tmp/bin:$PATH" MARK_LOCATION=local VIV_PORT=31622 "$root/scripts/mark" "$tmp/preview.md" >/dev/null

expected="browser open http://localhost:31622/viewer$(realpath "$tmp/preview.md") --workspace workspace:caller --focus false"
actual=$(cat "$MARK_CMUX_LOG")

if [[ $actual != "$expected" ]]; then
  printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
  exit 1
fi

printf 'PASS: mark opens in the caller cmux workspace without changing focus\n'
