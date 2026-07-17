---
name: mark
description: Live browser preview of markdown files via Vivify (live reload, KaTeX, syntax highlighting) with click-to-comment review that writes reader feedback to a .comments.md file beside the doc. Use when the user wants to preview or render a markdown file, mentions mark/markb/vivify, asks you to address review comments, or when a .comments.md review file (full filename + suffix, e.g. spec.md.comments.md) exists next to a markdown doc you are editing.
author: "Max Shron"
version: "1.1.2"
version_date: "2026-07-17"
keywords: [markdown, preview, vivify, review, comments, feedback, katex, live-reload]
---

# mark — markdown preview with inline review

Two halves: a `mark <file.md>` command that opens a live-reloading browser
preview, and a review loop where the human clicks any paragraph in the
preview to leave a comment, which lands in `<file>.comments.md` for the
agent to address.

## Quick start

```bash
mark docs/memos/proposal.md   # opens http://localhost:31622/viewer/<abs-path>
```

The preview live-reloads on save, renders KaTeX and syntax highlighting,
and stays alive for 24h idle so the URL survives suspended terminal panes.

A typical Claude Code round-trip:

```text
User:   Write up the migration plan in docs/memos/migration.md and open a preview.
Agent:  [writes the doc, runs `mark docs/memos/migration.md`]
User:   [reads the preview, clicks two paragraphs, leaves comments, then:]
        Address my comments.
Agent:  [reads docs/memos/migration.md.comments.md, edits the doc, deletes the
         resolved blocks — the preview and its comment sidebar update live]
```

## First-run setup

If `mark` is not on PATH or `~/.config/vivify/comments-server.mjs` is
missing, run setup:

1. Dependencies: `vivify-server` and `node`, both via Homebrew. **Ask the
   user before installing anything** (`brew install vivify node`).
2. Run `scripts/setup.sh` from this skill's directory. It is idempotent:
   copies config files to `~/.config/vivify/` (never overwrites existing
   files), installs `mark` to `~/.local/bin/`, and warns about PATH or
   shadowing problems (e.g. an old `alias mark='open -a "Marked 2"'`).

macOS only as written (`open`, Homebrew).

## Review workflow: <file>.comments.md

When working on a markdown document, check for a comments file next to it,
named by appending `.comments.md` to the **full filename** — `proposal.md` →
`proposal.md.comments.md`, never `proposal.comments.md`. It holds the
reader's inline review comments, one block per comment, headed:

```markdown
## <name>:<line> — "<quoted passage>" (<timestamp>)
```

Treat each block as a change request against the quoted passage.

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
the reader sees resolutions as they happen.

## How it works

- `vivify-server` (port `$VIV_PORT`, default 31622) serves the preview;
  `~/.config/vivify/config.json` points it at `theme.css` (Anthropic-style
  theme) and injects `comments.js` (the click-to-comment UI).
- `comments-server.mjs` (port `$VIV_COMMENTS_PORT`, default 31623) is a
  zero-dependency node sidecar that accepts comment POSTs and appends them
  to `<file>.comments.md`. It polls Vivify's `/health` and exits when the
  preview server is gone.
- `mark` auto-starts both servers if they are down, then opens the URL
  (via cmux's browser when running inside cmux, else the default browser).
