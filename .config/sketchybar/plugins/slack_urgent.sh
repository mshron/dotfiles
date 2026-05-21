#!/usr/bin/env bash
# Reads a cached urgent-channel unread count; spawns background refreshes for
# both the channel-ID list (via AX) and the count (via API) when stale.

CREDS="$HOME/.config/sketchybar-secrets/slack"
ID_CACHE="$HOME/.config/sketchybar-secrets/slack-urgent-channels"
COUNT_CACHE="$HOME/.config/sketchybar-secrets/slack-urgent-count"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
ID_REFRESH="$PLUGIN_DIR/refresh_urgent.sh"
HELPER="$PLUGIN_DIR/slack_count.py"
ID_STALE_AFTER=3600    # 1h — refresh channel-ID list hourly
COUNT_STALE_AFTER=90  # refresh count every ~90s (lock prevents overlap)

set_dim() {
  sketchybar --set "$NAME" label="0" \
                           label.color=0xff45475a \
                           icon.color=0xff45475a
  exit 0
}

[ ! -f "$CREDS" ] && set_dim
# shellcheck disable=SC1090
source "$CREDS"
[ -z "$SLACK_TOKEN" ] && set_dim

# Refresh channel-ID list if stale (the AX scraper bails silently if Slack inaccessible)
if [ -x "$ID_REFRESH" ]; then
  needs=1
  if [ -f "$ID_CACHE" ]; then
    age=$(( $(date +%s) - $(stat -f %m "$ID_CACHE" 2>/dev/null || echo 0) ))
    [ "$age" -lt "$ID_STALE_AFTER" ] && needs=0
  fi
  [ "$needs" -eq 1 ] && "$ID_REFRESH" >/dev/null 2>&1 &
fi

[ ! -s "$ID_CACHE" ] && set_dim

# Refresh count if stale
needs_refresh=1
if [ -f "$COUNT_CACHE" ]; then
  age=$(( $(date +%s) - $(stat -f %m "$COUNT_CACHE" 2>/dev/null || echo 0) ))
  [ "$age" -lt "$COUNT_STALE_AFTER" ] && needs_refresh=0
fi
if [ "$needs_refresh" -eq 1 ]; then
  touch "$COUNT_CACHE" 2>/dev/null
  export SLACK_TOKEN SLACK_D_COOKIE
  nohup bash -c "cat '$ID_CACHE' | /usr/bin/python3 '$HELPER' channel_list '$COUNT_CACHE'" >/dev/null 2>&1 &
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
    COLOR=0xfffab387
    ;;
esac

sketchybar --set "$NAME" label="$COUNT" \
                         label.color="$COLOR" \
                         icon.color="$COLOR"
