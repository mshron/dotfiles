#!/usr/bin/env bash
# Refreshes the cached list of channel IDs for the Slack sidebar "Urgent" section.
# Reads display names via AX, maps them to channel IDs via the Slack API,
# writes the resulting CSV to ~/.config/sketchybar-secrets/slack-urgent-channels.
#
# Bails silently (exit 0) if Slack isn't running or AX call fails — the existing
# cache continues to be used by slack_urgent.sh.

CREDS="$HOME/.config/sketchybar-secrets/slack"
CACHE="$HOME/.config/sketchybar-secrets/slack-urgent-channels"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
SECTION="${URGENT_SECTION_NAME:-Urgent}"

[ ! -f "$CREDS" ] && exit 0
# shellcheck disable=SC1090
source "$CREDS"
[ -z "$SLACK_TOKEN" ] && exit 0

# Bail if Slack isn't running
pgrep -x Slack >/dev/null 2>&1 || exit 0

# AX scrape
NAMES_JSON=$(osascript -l JavaScript "$PLUGIN_DIR/urgent_channels.js" "$SECTION" 2>/dev/null)
if [ -z "$NAMES_JSON" ] || echo "$NAMES_JSON" | grep -q '"error"'; then
  exit 0
fi

# Auth setup
if [[ "$SLACK_TOKEN" == xoxc-* ]]; then
  AUTH=(-H "Cookie: d=$SLACK_D_COOKIE")
  TOKEN_ARG=(--data-urlencode "token=$SLACK_TOKEN")
else
  AUTH=(-H "Authorization: Bearer $SLACK_TOKEN")
  TOKEN_ARG=()
fi

# Paginated conversations.list
CURSOR=""
ALL="[]"
while :; do
  ARGS=(--data-urlencode "types=public_channel,private_channel"
        --data-urlencode "limit=200"
        --data-urlencode "exclude_archived=true")
  [ -n "$CURSOR" ] && ARGS+=(--data-urlencode "cursor=$CURSOR")

  RESP=$(curl -s -m 10 "${AUTH[@]}" -G "${TOKEN_ARG[@]}" "${ARGS[@]}" \
    "https://slack.com/api/conversations.list" 2>/dev/null)

  ALL=$(/usr/bin/python3 -c "
import json, sys
e = json.loads(sys.argv[1])
r = json.loads(sys.argv[2])
if r.get('ok'):
    e.extend(r.get('channels', []))
print(json.dumps(e))
" "$ALL" "$RESP" 2>/dev/null)

  CURSOR=$(/usr/bin/python3 -c "
import json, sys
try:
    print(json.loads(sys.argv[1]).get('response_metadata', {}).get('next_cursor', ''))
except Exception:
    pass
" "$RESP" 2>/dev/null)

  [ -z "$CURSOR" ] && break
done

# Map names → IDs
IDS=$(/usr/bin/python3 -c "
import json, sys
names = set(json.loads(sys.argv[1]))
channels = json.loads(sys.argv[2])
ids = [c['id'] for c in channels if c.get('name') in names or c.get('name_normalized') in names]
print(','.join(ids))
" "$NAMES_JSON" "$ALL" 2>/dev/null)

if [ -n "$IDS" ]; then
  echo "$IDS" > "$CACHE"
fi
