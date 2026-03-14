# Neovim Configuration Design

## Goal

Replace VS Code/Cursor as primary editor with a neovim setup optimized for:
- Markdown-heavy editing (documentation, specs)
- Claude Code workflow (multiple Claude sessions alongside editor)
- Ghostty terminal integration (inherit terminal theme)
- Portable to devcontainers (manual setup for now)

## Architecture

tmux as outer session manager, neovim in the left pane, terminal tools on the right.

```
┌─ TMUX session ─────────────────────────────┐
│ ┌─ pane 1 ──────────┐ ┌─ pane 2 ────────┐ │
│ │ NEOVIM             │ │ claude-code      │ │
│ │ ┌────────┬───────┐ │ ├────────────────┤ │
│ │ │ file.md│app.py │ │ │ shell / claude │ │
│ │ │        │       │ │ ├────────────────┤ │
│ │ └────────┴───────┘ │ │ claude-2       │ │
│ └────────────────────┘ └────────────────┘ │
└────────────────────────────────────────────┘
```

**Why this layout:**
- tmux provides session persistence (detach/reattach survives disconnects, useful for SSH and devcontainers)
- neovim manages file splits only — keeps editor concerns clean
- Right-side tmux panes are independent of neovim lifecycle (Claude Code sessions survive neovim restarts)
- vim-tmux-navigator unifies C-h/j/k/l navigation across the neovim↔tmux boundary

## Plugin Manager

**lazy.nvim** — from scratch, one file per plugin. No distro (no kickstart, no lazyvim). Every line is intentional and understandable. Claude Code is available for future modifications.

## Plugins

| Plugin | Purpose | Config file |
|--------|---------|-------------|
| lazy.nvim | Plugin manager, bootstrap | init.lua |
| plenary.nvim | Required dependency for telescope | (loaded by telescope.lua) |
| telescope.nvim | Fuzzy finder: files, grep, buffers | plugins/telescope.lua |
| telescope-fzf-native.nvim | Faster fuzzy matching for telescope (requires C compiler) | plugins/telescope.lua |
| render-markdown.nvim | Inline markdown rendering (headings, lists, code blocks styled in-buffer) | plugins/render-markdown.lua |
| gitsigns.nvim | Git gutter signs, inline blame, hunk navigation/diffs | plugins/gitsigns.lua |
| oil.nvim | File browser as a buffer (replaces netrw) | plugins/oil.lua |
| nvim-treesitter | Syntax highlighting via AST parsing | plugins/treesitter.lua |
| vim-tmux-navigator | Seamless C-h/j/k/l navigation across neovim splits and tmux panes | plugins/tmux-navigator.lua |

### Why each plugin

- **telescope**: Primary VS Code replacement feature — Cmd+P file finding, project-wide grep, buffer switching
- **render-markdown**: Inline rendering avoids leaving the terminal for markdown preview.
- **gitsigns**: Lightweight git integration without a full git UI. Gutter signs, blame, and hunk diffs cover the common cases.
- **oil**: Lighter than nvim-tree, opens as a regular buffer so all normal keybinds work. Good for browsing unfamiliar directories.
- **treesitter**: Major upgrade over regex-based syntax highlighting. Also required by render-markdown. Install `markdown`, `markdown_inline`, and common language parsers.
- **vim-tmux-navigator**: The glue that makes the tmux-outside architecture feel seamless.

### What's NOT included and why

- **No LSP / autocomplete / snippets**: User preference. Claude Code fills this role.
- **No colorscheme**: Inherit Ghostty terminal colors. `termguicolors` is OFF so neovim uses the terminal's 16 ANSI colors. Changing the Ghostty theme changes neovim automatically. (The tmux config's `Tc` true-color override is present but unused by neovim — it is harmless.)
- **No statusline plugin**: Default neovim statusline is sufficient to start.
- **No session/workspace plugin**: tmux handles session persistence.
- **No neovim terminal usage**: Terminals live in tmux panes, not neovim buffers.

## Config Structure

```
~/.config/nvim/
  init.lua              -- bootstrap lazy.nvim, set leader, load modules
  lua/
    options.lua         -- editor settings (port of .vimrc + enhancements)
    keymaps.lua         -- custom key bindings
    plugins/
      telescope.lua     -- fuzzy finder config
      render-markdown.lua -- markdown rendering config
      gitsigns.lua      -- git integration config
      oil.lua           -- file browser config
      treesitter.lua    -- syntax highlighting config
      tmux-navigator.lua -- tmux navigation config
```

Files live in the dotfiles repo at `.config/nvim/` relative to repo root. The repo at `/Users/mshron/code/dotfiles` is a normal git repo (not a bare repo). Files are symlinked to `$HOME/.config/nvim/` or copied by the install script.

Note: `syntax on` and `filetype plugin indent on` from `.vimrc` are neovim defaults and do not need to be ported.

## Key Bindings

### Leader: `<Space>`

### File navigation
| Binding | Action |
|---------|--------|
| `<leader>ff` | Telescope find files |
| `<leader>fg` | Telescope live grep |
| `<leader>fb` | Telescope buffers |
| `<leader>e` | Oil file browser |

### Window/pane navigation
| Binding | Action |
|---------|--------|
| `C-h` | Move left (neovim split or tmux pane) |
| `C-j` | Move down (neovim split or tmux pane) |
| `C-k` | Move up (neovim split or tmux pane) |
| `C-l` | Move right (neovim split or tmux pane) |

### Git
| Binding | Action |
|---------|--------|
| `]c` | Next git hunk |
| `[c` | Previous git hunk |
| `<leader>gp` | Preview hunk |
| `<leader>gb` | Toggle line blame |

### Splits
| Binding | Action |
|---------|--------|
| `<leader>v` | Vertical split |
| `<leader>s` | Horizontal split |

## Tmux Config Changes

Add vim-tmux-navigator bindings to `~/.tmux.conf`:

```tmux
# Smart pane switching with awareness of Vim splits
is_vim="ps -o state= -o comm= -t '#{pane_tty}' \
    | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|l?n?vim?x?|fzf)(diff)?$'"
bind-key -n 'C-h' if-shell "$is_vim" 'send-keys C-h'  'select-pane -L'
bind-key -n 'C-j' if-shell "$is_vim" 'send-keys C-j'  'select-pane -D'
bind-key -n 'C-k' if-shell "$is_vim" 'send-keys C-k'  'select-pane -U'
bind-key -n 'C-l' if-shell "$is_vim" 'send-keys C-l'  'select-pane -R'
```

The existing `prefix + h/j/k/l` pane navigation bindings remain as a fallback.

**Known tradeoff:** `C-l` normally clears the terminal. With vim-tmux-navigator, `C-l` in a non-vim tmux pane will navigate instead of clear. Use `prefix C-l` or type `clear` as a workaround.

## Options (ported from .vimrc + additions)

From .vimrc:
- `number`, `ignorecase`, `smartcase`, `hlsearch`, `incsearch`
- `expandtab`, `tabstop=4`, `shiftwidth=4`
- `wildmenu`, `mouse=a`

New for neovim:
- `relativenumber` (useful with vim motions)
- `signcolumn=yes` (always show, prevents layout shift from gitsigns)
- `scrolloff=8` (keep context around cursor)
- `undofile` (persistent undo across sessions)
- `splitright`, `splitbelow` (more intuitive split defaults)
- `termguicolors=false` (inherit terminal colors)
- `clipboard=unnamedplus` (system clipboard integration — works via pbcopy/pbpaste on macOS; devcontainers will need OSC 52 passthrough or xclip)

## Devcontainers

Deferred. Current plan: manually install neovim and clone dotfiles inside containers. The install.sh script in the dotfiles repo can be extended later to handle this. The `devcontainer` CLI (already installed, v0.77.0) supports `devcontainer up` and `devcontainer exec` for launching and entering containers from the terminal.

## Testing Plan

1. Install the config and run `nvim` — should bootstrap lazy.nvim and install all plugins on first launch
2. Open a markdown file — verify render-markdown shows styled headings, lists, code blocks
3. `<leader>ff` — verify telescope file picker works
4. `<leader>fg` — verify telescope grep works
5. Open neovim inside tmux, create a right pane — verify `C-h`/`C-l` crosses the boundary
6. Open a git-tracked file — verify gitsigns shows gutter markers
7. `<leader>e` — verify oil opens a file browser
8. Open neovim outside tmux — verify `C-h/j/k/l` still works for neovim splits
9. Open a non-git directory — verify gitsigns does not error
10. Generate a tutorial document at `docs/neovim-tutorial.md` covering all features (see below)

## Tutorial Requirements

Generate a hands-on tutorial (`docs/neovim-tutorial.md`) that walks through the full workflow. Should cover:

### Getting started
- Launching tmux + neovim in the recommended layout
- Creating right-side tmux panes for Claude Code sessions
- Detaching/reattaching tmux sessions

### File navigation
- Telescope file finder (`<leader>ff`) — finding files by name
- Telescope live grep (`<leader>fg`) — searching file contents
- Telescope buffers (`<leader>fb`) — switching between open files
- Oil file browser (`<leader>e`) — browsing directories, creating/renaming/deleting files

### Window management
- Creating splits (`<leader>v`, `<leader>s`)
- Navigating between neovim splits (`C-h/j/k/l`)
- Navigating between neovim and tmux panes (`C-h/l`)
- Resizing splits
- Closing splits

### Markdown editing
- How render-markdown displays headings, lists, code blocks, links
- Toggling render-markdown on/off if needed
- Useful vim motions for markdown (paragraph navigation, heading jumping)

### Git workflow
- Reading gutter signs (added/changed/removed lines)
- Navigating between hunks (`]c`, `[c`)
- Previewing a hunk (`<leader>gp`)
- Toggling inline blame (`<leader>gb`)

### tmux integration
- Switching between Claude Code sessions in right-side panes
- The `C-l` clear workaround
- Creating new tmux panes/windows while in a session

### Quick reference card
- All keybindings in a single table for printing/pinning
