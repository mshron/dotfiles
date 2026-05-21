#!/usr/bin/env python3
"""
Count distinct Slack conversations with 1+ unread message and write to a cache file.

Modes:
  dms_groups <count_cache>    — count DMs + group DMs with unread
  channel_list <count_cache>  — read channel IDs from stdin (CSV), count unread

Reads SLACK_TOKEN, SLACK_D_COOKIE from env.

Optimizations:
 - last_read per channel is cached in a side file with 1-hour TTL
 - per-cycle work is only conversations.history?limit=1 (one call per channel)
 - rate-limit 429s are retried with Retry-After backoff
 - uses flock to prevent concurrent runs
"""
import fcntl
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

TOKEN = os.environ.get("SLACK_TOKEN", "")
D_COOKIE = os.environ.get("SLACK_D_COOKIE", "")

SECRETS_DIR = os.path.expanduser("~/.config/sketchybar-secrets")
LAST_READ_CACHE = os.path.join(SECRETS_DIR, "slack-last-reads.json")
LAST_READ_TTL = 21600  # 6h — bulk last_read refresh; candidate channels re-verify on every cycle


def call(path, **p):
    if TOKEN.startswith("xoxc-"):
        p.setdefault("token", TOKEN)
    qs = urllib.parse.urlencode(p)
    url = f"https://slack.com/api/{path}?{qs}"
    for attempt in range(3):
        req = urllib.request.Request(url)
        if TOKEN.startswith("xoxc-"):
            req.add_header("Cookie", f"d={D_COOKIE}")
        else:
            req.add_header("Authorization", f"Bearer {TOKEN}")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", "5"))
                time.sleep(retry_after + 1)
                continue
            return None
        except Exception:
            return None
    return None


def list_conversations(types):
    ids = []
    cursor = ""
    while True:
        p = {"types": types, "limit": 200, "exclude_archived": "true"}
        if cursor:
            p["cursor"] = cursor
        r = call("users.conversations", **p)
        if not r or not r.get("ok"):
            break
        for c in r.get("channels", []):
            if c.get("is_user_deleted"):
                continue
            if c.get("properties", {}).get("is_dormant"):
                continue
            ids.append(c["id"])
        cursor = r.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            break
    return ids


def load_last_read_cache():
    try:
        with open(LAST_READ_CACHE) as f:
            d = json.load(f)
        if time.time() - d.get("_ts", 0) > LAST_READ_TTL:
            return None
        return d.get("data", {})
    except Exception:
        return None


def save_last_read_cache(data):
    os.makedirs(SECRETS_DIR, exist_ok=True)
    tmp = LAST_READ_CACHE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"_ts": time.time(), "data": data}, f)
    os.replace(tmp, LAST_READ_CACHE)


def fetch_last_read(channel_id):
    info = call("conversations.info", channel=channel_id)
    if not info or not info.get("ok"):
        return None
    return info.get("channel", {}).get("last_read", "")


def latest_message_ts(channel_id):
    """Most recent message ts in the channel (or '' if none/error)."""
    hist = call("conversations.history", channel=channel_id, limit=1)
    if not hist or not hist.get("ok"):
        return ""
    msgs = hist.get("messages", [])
    if not msgs:
        return ""
    return msgs[0].get("ts", "")


def count_unread(channel_ids, workers=4):
    if not channel_ids:
        return 0

    # last_read cache: warm whatever's already cached; fetch only missing entries.
    last_reads = load_last_read_cache() or {}
    missing = [c for c in channel_ids if c not in last_reads]
    if missing:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for cid, lr in zip(missing, pool.map(fetch_last_read, missing)):
                if lr is not None:
                    last_reads[cid] = lr
        save_last_read_cache(last_reads)

    # Hot path: get latest message ts per channel
    with ThreadPoolExecutor(max_workers=workers) as pool:
        latest = list(pool.map(latest_message_ts, channel_ids))

    # First pass: identify candidates where latest_ts > cached last_read
    candidates = []
    for cid, latest_ts in zip(channel_ids, latest):
        if not latest_ts:
            continue
        lr = last_reads.get(cid, "")
        if not lr or float(lr) == 0:
            continue  # orphan DM, skip
        if float(latest_ts) > float(lr):
            candidates.append((cid, latest_ts))

    if not candidates:
        return 0

    # Second pass: re-fetch fresh last_read for candidates so we don't keep
    # counting things the user has just read.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        fresh = list(pool.map(fetch_last_read, [c for c, _ in candidates]))

    n_unread = 0
    for (cid, latest_ts), lr in zip(candidates, fresh):
        if lr is None:
            # API hiccup — fall back to cached state (counted as unread)
            n_unread += 1
            continue
        last_reads[cid] = lr  # refresh cache opportunistically
        if not lr or float(lr) == 0:
            continue
        if float(latest_ts) > float(lr):
            n_unread += 1
    save_last_read_cache(last_reads)
    return n_unread


def write_cache(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(str(value) + "\n")
    os.replace(tmp, path)


def main():
    if not TOKEN or len(sys.argv) < 3:
        sys.exit(1)
    mode = sys.argv[1]
    cache_path = sys.argv[2]

    # Lockfile so concurrent runs don't double-up
    lock_path = cache_path + ".lock"
    lock_f = open(lock_path, "w")
    try:
        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(0)  # another refresh in progress

    try:
        if mode == "dms_groups":
            ids = list_conversations("im,mpim")
            n = count_unread(ids)
            write_cache(cache_path, n)
        elif mode == "channel_list":
            raw = sys.stdin.read().strip()
            ids = [x.strip() for x in raw.split(",") if x.strip()]
            n = count_unread(ids)
            write_cache(cache_path, n)
        else:
            sys.exit(1)
    finally:
        try:
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass

if __name__ == "__main__":
    main()
