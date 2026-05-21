#!/usr/bin/env bash
# Reads a cached DM/group unread count; spawns a background refresh if stale.

CREDS="$HOME/.config/sketchybar-secrets/slack"
COUNT_CACHE="$HOME/.config/sketchybar-secrets/slack-dm-count"
HELPER="$(cd "$(dirname "$0")" && pwd)/slack_count.py"
STALE_AFTER=90

set_cfg() {
  sketchybar --set "$NAME" label="cfg" \
                           label.color=0xfff38ba8 \
                           icon.color=0xfff38ba8
  exit 0
}

[ ! -f "$CREDS" ] && set_cfg
# shellcheck disable=SC1090
source "$CREDS"
[ -z "$SLACK_TOKEN" ] && set_cfg

# Refresh if stale (in background — refresh can take minutes)
needs_refresh=1
if [ -f "$COUNT_CACHE" ]; then
  age=$(( $(date +%s) - $(stat -f %m "$COUNT_CACHE" 2>/dev/null || echo 0) ))
  [ "$age" -lt "$STALE_AFTER" ] && needs_refresh=0
fi
if [ "$needs_refresh" -eq 1 ]; then
  # Touch cache to debounce concurrent refreshes
  touch "$COUNT_CACHE" 2>/dev/null
  export SLACK_TOKEN SLACK_D_COOKIE
  nohup /usr/bin/python3 "$HELPER" dms_groups "$COUNT_CACHE" >/dev/null 2>&1 &
fi

if [ -s "$COUNT_CACHE" ]; then
  COUNT=$(cat "$COUNT_CACHE")
else
  COUNT="…"
fi

case "$COUNT" in
  "0"|"")
    COLOR=0xff45475a
    COUNT="0"
    ;;
  "…")
    COLOR=0xfff9e2af
    ;;
  *)
    COLOR=0xfff38ba8
    ;;
esac

sketchybar --set "$NAME" label="$COUNT" \
                         label.color="$COLOR" \
                         icon.color="$COLOR"
