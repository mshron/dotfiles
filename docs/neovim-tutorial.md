# Neovim Setup Tutorial

For VS Code/Cursor users who already know vim keybindings. Leader key is `Space`.

---

## 1. Getting Started

### Recommended startup sequence

```bash
tmux new -s work        # create a named session
nvim .                  # open neovim in left pane
```

Then from the left pane, split right and start Claude:

```
C-Space |               # split pane vertically
claude                  # run Claude Code in the right pane
C-Space -               # split the right pane horizontally for a second Claude session
```

### Recommended layout

```
┌──────────────────────┬─────────────────────┐
│                      │                     │
│                      │   claude (session 1)│
│   nvim .             │                     │
│                      ├─────────────────────┤
│                      │                     │
│                      │   claude (session 2)│
│                      │                     │
└──────────────────────┴─────────────────────┘
         window: work
```

### Session persistence

| Action | Command |
|--------|---------|
| Detach session | `C-Space d` |
| Reattach session | `tmux attach -t work` |
| List sessions | `tmux ls` |

---

## 2. File Navigation

### Telescope fuzzy finder

| Keybinding | Action |
|------------|--------|
| `<leader>ff` | Find files by name |
| `<leader>fg` | Live grep (search file contents) |
| `<leader>fb` | Switch between open buffers |
| `<leader>fh` | Search help tags |

In any Telescope picker: type to filter, `Enter` to open, `Esc` to cancel, `C-j`/`C-k` to move up/down.

**Examples:**
- Find `config.py`: `Space f f`, type `config`
- Find all uses of `render_frame`: `Space f g`, type `render_frame`
- Jump back to a file you had open: `Space f b`, type part of the filename

### Oil file browser

Open with `<leader>e` or `-`. Oil shows the current directory as a regular buffer.

| Key | Action |
|-----|--------|
| `j` / `k` | Move up/down |
| `Enter` | Open file or directory |
| `-` | Go up to parent directory |
| `a` | Create new file or directory (end name with `/` for directory) |
| `d` | Mark for deletion |
| Rename | Just edit the filename in the buffer, then `:w` to apply |
| `<leader>e` | Open Oil in current file's directory |

Changes in Oil are staged and applied when you save (`:w`). You can rename multiple files at once by editing their names and saving.

---

## 3. Window Management

### Creating splits

| Keybinding | Action |
|------------|--------|
| `<leader>v` | Vertical split |
| `<leader>s` | Horizontal split |

### Navigating

`C-h` / `C-j` / `C-k` / `C-l` moves between neovim splits and tmux panes — no prefix needed, no boundary between them.

### Resizing and closing

| Keybinding | Action |
|------------|--------|
| `C-w >` / `C-w <` | Wider / narrower (neovim splits) |
| `C-w +` / `C-w -` | Taller / shorter (neovim splits) |
| `C-w =` | Equalize all split sizes |
| `C-w q` or `:q` | Close current split |
| `C-Space H/J/K/L` | Resize tmux panes |

---

## 4. Markdown Editing

`render-markdown.nvim` activates automatically on `.md` files. Headings are styled, code blocks get a background, and list markers are replaced with icons. Toggle it off with `:RenderMarkdown toggle` if you need to see raw syntax.

### Useful motions in markdown

| Keybinding | Action |
|------------|--------|
| `{` / `}` | Jump between paragraphs |
| `gx` | Open URL under cursor |
| `]]` / `[[` | Jump between headings (if treesitter-textobjects is configured) |

For long lines (prose, not code), enable soft wrapping:

```vim
:set wrap
:set linebreak
```

Add those to your config if you want them permanently for markdown files.

---

## 5. Git Workflow

Gitsigns adds gutter indicators automatically in any git-tracked file:
- Green `+` — added lines
- Blue `~` — changed lines
- Red `-` — removed lines

| Keybinding | Action |
|------------|--------|
| `]c` | Jump to next changed hunk |
| `[c` | Jump to previous changed hunk |
| `<leader>gp` | Preview hunk diff in a popup |
| `<leader>gb` | Toggle inline git blame per line |

**Workflow example:** Press `]c` to walk through every change in the file. Use `<leader>gp` to review what changed before staging.

---

## 6. tmux Integration

### Seamless navigation

`C-h/j/k/l` crosses the neovim/tmux boundary transparently. From a neovim split on the right edge, `C-l` moves into the next tmux pane. From a tmux pane, `C-h` moves into neovim.

### Known issue: `C-l` in tmux

`C-l` (clear terminal) is captured by vim-tmux-navigator. Use `clear` or `C-Space C-l` to clear a tmux pane's terminal instead.

### tmux pane and window management

| Keybinding | Action |
|------------|--------|
| `C-Space \|` | Split pane vertically |
| `C-Space -` | Split pane horizontally |
| `C-Space c` | New window |
| `C-Space 1/2/3` | Switch to window N |
| `C-Space n` / `C-Space p` | Next / previous window |
| `C-Space d` | Detach session |

---

## 7. Quick Reference Card

### Navigation

| Key | Action |
|-----|--------|
| `C-h/j/k/l` | Move between neovim splits and tmux panes |
| `C-w =` | Equalize split sizes |
| `C-w q` | Close split |

### Files

| Key | Action |
|-----|--------|
| `<leader>ff` | Telescope: find file by name |
| `<leader>fg` | Telescope: live grep |
| `<leader>fb` | Telescope: open buffers |
| `<leader>fh` | Telescope: help tags |
| `<leader>e` or `-` | Oil: file browser |

### Splits

| Key | Action |
|-----|--------|
| `<leader>v` | Vertical split |
| `<leader>s` | Horizontal split |
| `C-w > / <` | Resize width |
| `C-w + / -` | Resize height |

### Git

| Key | Action |
|-----|--------|
| `]c` / `[c` | Next / previous hunk |
| `<leader>gp` | Preview hunk |
| `<leader>gb` | Toggle git blame |

### Misc

| Key | Action |
|-----|--------|
| `<Esc>` | Clear search highlight |
| `gx` | Open URL under cursor |
| `:RenderMarkdown toggle` | Toggle markdown rendering |

### tmux (prefix = `C-Space`)

| Key | Action |
|-----|--------|
| `C-Space \|` | Split pane vertically |
| `C-Space -` | Split pane horizontally |
| `C-Space c` | New window |
| `C-Space 1/2/3` | Switch window |
| `C-Space n/p` | Next/previous window |
| `C-Space H/J/K/L` | Resize pane |
| `C-Space d` | Detach session |
