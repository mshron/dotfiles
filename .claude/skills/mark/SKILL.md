---
name: mark
description: The default way to show a markdown file to the user — a live browser preview via Vivify (live reload, KaTeX, syntax highlighting) with click-to-comment review that writes reader feedback to a .comments.md file beside the doc. Use whenever the user should read a markdown doc you wrote or edited, whenever they ask to see/preview/render/review one, whenever they mention mark/markb/vivify, whenever they ask to review/address/handle comments or feedback, and whenever a .comments.md review file (full filename + suffix, e.g. spec.md.comments.md) exists next to a markdown doc you are editing. Prefer mark over dumping markdown to the terminal or macOS `open`.
author: "Max Shron"
version: "1.4.3"
version_date: "2026-07-30"
keywords: [markdown, preview, vivify, review, comments, feedback, katex, live-reload]
---

# mark — markdown preview with inline review

Two halves: a `mark <file.md>` command that opens a live-reloading browser
preview, and a review loop where the human clicks any paragraph in the
preview to leave a comment, which lands in `<file>.comments.md` for the
agent to address.

**This is the default markdown viewer.** When you finish writing or
editing a markdown doc the user will want to read — a memo, a plan, a
report — open it with `mark` unprompted. Don't paste the rendered
content into the terminal, and don't hand the file to macOS `open` or
another previewer.

## Quick start

Ask your agent to preview a markdown file — it runs `mark` itself. A
typical round-trip:

```text
User:   Write up the migration plan in docs/memos/migration.md and open a preview.
Agent:  [writes the doc, runs `mark docs/memos/migration.md`]
User:   [reads the preview, clicks two paragraphs, leaves comments, then:]
        Address my comments.
Agent:  [reads docs/memos/migration.md.comments.md, edits the doc, deletes the
         resolved blocks — the preview and its comment sidebar update live]
```

This loads a live preview in the browser: it reloads on save, renders
KaTeX and syntax highlighting, and stays alive for 24h idle so the URL
survives suspended terminal panes.

`mark` can also be launched manually, two ways. It is a shell command
(installed to `~/.local/bin/`), so from a terminal:

```bash
mark docs/memos/proposal.md   # opens http://localhost:31622/viewer/<abs-path>
```

Or inside a coding agent, prefix it with `!` to run it from the prompt
without leaving the conversation:

```text
! mark docs/memos/proposal.md
```

### Choose where the preview opens

**Codex — choose from the host app, not from available tools:**

- In Codex CLI — no desktop app-context message in the session — run plain
  `mark <file.md>` immediately. It opens the default system browser.
  **Do not** run `mark --no-open`, read or invoke the Browser skill, or
  probe the Browser MCP. Browser tools can be listed in a CLI session even
  though no in-app browser exists.
- Only when the session context says you are inside a desktop app — a
  "Codex desktop context" message ("You are running inside the Codex
  (desktop) app"), or the ChatGPT desktop app equivalent — run
  `mark --no-open <file.md>`, then use the in-app Browser MCP to open the
  printed URL and mark the tab as a deliverable:

```js
const browser = await agent.browsers.get("iab");
const tab = await browser.tabs.new();
await tab.goto(url);               // the URL mark printed
await tab.markDeliverable();       // keep the tab open after the turn ends
```

  `markDeliverable()` matters: without it the harness's tab cleanup closes
  the preview when the turn finishes. If the in-app browser fails in the
  desktop app, fall back to plain `mark <file.md>`.

**Claude Code with the Browser pane (mcp__Claude_Browser tools):**

Run `mark --no-open <file.md>`, then:

```
mcp__Claude_Browser__preview_start({ url: "<the URL mark printed>" })
```

`preview_start` opens the pane and navigates to the URL in one call — no
separate `navigate` call needed. The pane stays live-reloading like any
other `mark` preview.

For other agents, if no in-app browser is available, plain
`mark <file.md>` opens the default system browser as usual.

## First-run setup

Works on macOS and Linux. If `mark` is not on PATH or
`~/.config/vivify/comments-server.mjs` is missing, run setup:

1. Dependencies: `vivify-server` and `node`. On macOS both come via
   Homebrew — **ask the user before installing anything**
   (`brew install vivify node`). On Linux, `setup.sh` downloads Vivify's
   own release binary itself; only `node` needs installing up front
   (e.g. `sudo apt-get install -y nodejs`) — ask first, same as macOS.
2. Run `scripts/setup.sh` from this skill's directory. It is idempotent:
   copies config files to `~/.config/vivify/` (never overwrites existing
   files, including `mark.conf` — see below), installs `mark` to
   `~/.local/bin/`, adds a zsh tab-completion override to `~/.zshrc` on
   macOS (zsh otherwise binds `mark` to the MH mail system's completion,
   so tab produces nothing), and warns about PATH or shadowing problems
   (e.g. an old `alias mark='open -a "Marked 2"'`).

## Running on a remote host

`~/.config/vivify/mark.conf` (written by `setup.sh`, then yours to edit)
controls where `mark` thinks it's running:

```bash
MARK_LOCATION=local   # default: opens a browser here, preview on localhost
MARK_LOCATION=remote  # headless host, reached over Tailscale
```

In `remote` mode, `mark` never tries to open a browser — there's no local
display — and builds the preview URL from this host's Tailscale address
(`tailscale ip -4`) instead of `localhost`, so it's ready to paste into a
browser on your own machine. This requires Tailscale installed and the
host already joined to your tailnet (https://tailscale.com/download) —
set that up yourself; it's independent of `mark` and not part of
`setup.sh`. `mark` refuses to run in `remote` mode if `tailscale ip -4`
returns nothing.

Both of `mark`'s servers (`vivify-server` and the comments sidecar) bind
every network interface on the host, not just Tailscale's, and neither
checks who's calling — the comments sidecar in particular accepts
unauthenticated writes. If the host also has a public IP, firewall ports
`$VIV_PORT` (default 31622) and `$VIV_COMMENTS_PORT` (default 31623) down
to the Tailscale interface and loopback only, or Tailscale won't actually
be your access control.

## Review workflow: <file>.comments.md

When working on a markdown document, check for a comments file next to it,
named by appending `.comments.md` to the **full filename** — `proposal.md` →
`proposal.md.comments.md`, never `proposal.comments.md`. It holds the
reader's inline review comments, one block per comment, headed:

```markdown
## <name>:<line> — "<quoted passage>" (<timestamp>)
```

Treat each block as a change request against the quoted passage.

**“Review the comments,” “handle the feedback,” and “address my comments”
are edit requests in this workflow.** Read the comments and source document,
apply every clear requested change, and resolve its comment block. Do not
stop after summarizing the comments. Only use read-only behavior when the
user explicitly asks to summarize, list, or report the comments without
making edits. If one request is unclear, leave that block open and explain
the ambiguity after applying the clear requests.

**The quote is the anchor, not the line number.** Comments are written
against a snapshot of the doc, so line numbers drift as it is edited —
locate the passage by searching for the quote, and use the line number
only as a tiebreaker when the quote appears more than once. If the quoted
passage has been deleted or rewritten beyond recognition, say so in your
response rather than guessing. (The preview sidebar resolves anchors the
same way: exact line first, then first block starting with the quote.)

- **After addressing a comment, delete its block.** Comments left in the
  file render as open feedback in the reader's preview.
- **If no comment blocks remain after your edits, delete the
  `.comments.md` file itself** — don't leave an empty file behind. (The
  preview handles a missing file fine; it just shows no comments.)
- **If the resolution is worth recording** (e.g. you disagreed and left the
  text as-is), instead append ` [resolved]` to the end of its heading and
  add your response to the block body.
- **Never touch comments you haven't addressed** — they must stay open.

The comment sidebar in the preview updates live as you edit the file, so
the reader sees resolutions as they happen. The reader can also click an
open comment in the preview to edit its text in place or delete it.

## How it works

- `vivify-server` (port `$VIV_PORT`, default 31622) serves the preview;
  `~/.config/vivify/config.json` points it at `theme.css` (Anthropic-style
  theme) and injects `comments.js` (the click-to-comment UI). Vivify reads
  and inlines these at **startup** — after editing them, restart
  `vivify-server` (and reload the page), or the browser keeps getting the
  old code.
- `comments-server.mjs` (port `$VIV_COMMENTS_PORT`, default 31623) is a
  zero-dependency node sidecar that accepts comment POSTs — new comments
  are appended to `<file>.comments.md`, edits rewrite the matching block in
  place, deletes remove it (and remove the file itself when no blocks
  remain). It polls Vivify's `/health` and exits when the preview server
  is gone.
- Vivify's own live-reload watches the file inode, which dies when a file
  is saved by rename (atomic replace — how Claude Code and many editors
  write). `comments.js` covers this: it polls the sidecar's `/mtimes` and
  reloads the page itself when the doc changed but Vivify didn't redraw;
  a changed (or deleted) comments file just re-renders the notes.
- `mark` auto-starts both servers if they are down — detached into their
  own sessions, so agent harnesses that kill the command's process group
  on completion (e.g. Codex) don't take the servers down — then opens the
  URL (via cmux's browser when running inside cmux, else the default
  browser; `--no-open` skips this and just prints the URL).
