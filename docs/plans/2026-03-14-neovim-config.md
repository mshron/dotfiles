# Neovim Configuration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a complete neovim config optimized for markdown editing and Claude Code workflows, with tmux integration.

**Architecture:** lazy.nvim plugin manager, one Lua file per plugin, config lives in dotfiles repo at `/Users/mshron/code/dotfiles/.config/nvim/` and symlinks to `~/.config/nvim/`. tmux config updated with vim-tmux-navigator bindings.

**Tech Stack:** Neovim 0.11.6, Lua, lazy.nvim, tmux

**Spec:** `/Users/mshron/code/dotfiles/docs/specs/2026-03-14-neovim-config-design.md`

---

## Chunk 1: Core Config

### Task 1: Bootstrap init.lua

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/init.lua`

- [ ] **Step 1: Create init.lua with lazy.nvim bootstrap and module loading**

```lua
-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

-- Set leader before loading plugins
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- Load core config
require("options")
require("keymaps")

-- Load plugins
require("lazy").setup({
  spec = {
    { import = "plugins" },
  },
  install = { colorscheme = { "default" } },
  checker = { enabled = false },
})
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/init.lua
git commit -m "feat(nvim): add init.lua with lazy.nvim bootstrap"
```

### Task 2: Options (port .vimrc + enhancements)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/options.lua`

- [ ] **Step 1: Create options.lua**

```lua
local opt = vim.opt

-- Ported from .vimrc
opt.number = true
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = true
opt.incsearch = true
opt.expandtab = true
opt.tabstop = 4
opt.shiftwidth = 4
opt.wildmenu = true
opt.mouse = "a"

-- New for neovim
opt.relativenumber = true
opt.signcolumn = "yes"
opt.scrolloff = 8
opt.undofile = true
opt.splitright = true
opt.splitbelow = true
opt.termguicolors = false
opt.clipboard = "unnamedplus"

-- Disable netrw (oil.nvim replaces it)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/options.lua
git commit -m "feat(nvim): add options.lua porting .vimrc settings"
```

### Task 3: Keymaps

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/keymaps.lua`

- [ ] **Step 1: Create keymaps.lua**

```lua
local map = vim.keymap.set

-- Splits
map("n", "<leader>v", "<cmd>vsplit<cr>", { desc = "Vertical split" })
map("n", "<leader>s", "<cmd>split<cr>", { desc = "Horizontal split" })

-- Clear search highlight with Escape
map("n", "<Esc>", "<cmd>nohlsearch<cr>", { desc = "Clear search highlight" })
```

Note: `C-h/j/k/l` navigation is handled by vim-tmux-navigator plugin (Task 7). Git keymaps are in gitsigns config (Task 6). Telescope keymaps are in telescope config (Task 4).

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/keymaps.lua
git commit -m "feat(nvim): add keymaps.lua with split and search bindings"
```

- [ ] **Step 3: Verify core config loads**

```bash
ln -sfn /Users/mshron/code/dotfiles/.config/nvim ~/.config/nvim
nvim --headless -c 'echo "OK"' -c 'qa'
```

Expected: exits cleanly (lazy.nvim will bootstrap on first run). If errors, fix before proceeding.

---

## Chunk 2: Plugins

### Task 4: Telescope (fuzzy finder)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/telescope.lua`

- [ ] **Step 1: Create telescope.lua plugin spec**

```lua
return {
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      {
        "nvim-telescope/telescope-fzf-native.nvim",
        build = "make",
      },
    },
    keys = {
      { "<leader>ff", "<cmd>Telescope find_files<cr>", desc = "Find files" },
      { "<leader>fg", "<cmd>Telescope live_grep<cr>", desc = "Live grep" },
      { "<leader>fb", "<cmd>Telescope buffers<cr>", desc = "Buffers" },
      { "<leader>fh", "<cmd>Telescope help_tags<cr>", desc = "Help tags" },
    },
    config = function()
      require("telescope").setup({
        defaults = {
          file_ignore_patterns = { "node_modules", ".git/" },
        },
      })
      -- Load fzf extension for better performance
      pcall(require("telescope").load_extension, "fzf")
    end,
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/telescope.lua
git commit -m "feat(nvim): add telescope fuzzy finder"
```

### Task 5: Treesitter (syntax highlighting)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/treesitter.lua`

- [ ] **Step 1: Create treesitter.lua plugin spec**

```lua
return {
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter.configs").setup({
        ensure_installed = {
          "markdown",
          "markdown_inline",
          "lua",
          "python",
          "javascript",
          "typescript",
          "json",
          "yaml",
          "toml",
          "bash",
          "html",
          "css",
          "dockerfile",
        },
        highlight = { enable = true },
      })
    end,
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/treesitter.lua
git commit -m "feat(nvim): add treesitter syntax highlighting"
```

### Task 6: Gitsigns (git integration)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/gitsigns.lua`

- [ ] **Step 1: Create gitsigns.lua plugin spec**

```lua
return {
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
      on_attach = function(bufnr)
        local gs = require("gitsigns")
        local map = vim.keymap.set

        map("n", "]c", function()
          if vim.wo.diff then return "]c" end
          vim.schedule(function() gs.next_hunk() end)
          return "<Ignore>"
        end, { expr = true, buffer = bufnr, desc = "Next hunk" })

        map("n", "[c", function()
          if vim.wo.diff then return "[c" end
          vim.schedule(function() gs.prev_hunk() end)
          return "<Ignore>"
        end, { expr = true, buffer = bufnr, desc = "Previous hunk" })

        map("n", "<leader>gp", gs.preview_hunk, { buffer = bufnr, desc = "Preview hunk" })
        map("n", "<leader>gb", gs.toggle_current_line_blame, { buffer = bufnr, desc = "Toggle blame" })
      end,
    },
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/gitsigns.lua
git commit -m "feat(nvim): add gitsigns git integration"
```

### Task 7: vim-tmux-navigator

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/tmux-navigator.lua`
- Modify: `/Users/mshron/code/dotfiles/.tmux.conf`

- [ ] **Step 1: Create tmux-navigator.lua plugin spec**

```lua
return {
  {
    "christoomey/vim-tmux-navigator",
    lazy = false,
    keys = {
      { "<C-h>", "<cmd>TmuxNavigateLeft<cr>", desc = "Move to left pane" },
      { "<C-j>", "<cmd>TmuxNavigateDown<cr>", desc = "Move to below pane" },
      { "<C-k>", "<cmd>TmuxNavigateUp<cr>", desc = "Move to above pane" },
      { "<C-l>", "<cmd>TmuxNavigateRight<cr>", desc = "Move to right pane" },
    },
  },
}
```

- [ ] **Step 2: Add vim-tmux-navigator bindings to .tmux.conf**

Append to the end of `/Users/mshron/code/dotfiles/.tmux.conf`:

```tmux
# === Vim-Tmux Navigator ===
# Smart pane switching with awareness of Vim splits
is_vim="ps -o state= -o comm= -t '#{pane_tty}' \
    | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|l?n?vim?x?|fzf)(diff)?$'"
bind-key -n 'C-h' if-shell "$is_vim" 'send-keys C-h'  'select-pane -L'
bind-key -n 'C-j' if-shell "$is_vim" 'send-keys C-j'  'select-pane -D'
bind-key -n 'C-k' if-shell "$is_vim" 'send-keys C-k'  'select-pane -U'
bind-key -n 'C-l' if-shell "$is_vim" 'send-keys C-l'  'select-pane -R'
# Note: C-l no longer clears terminal in tmux panes. Use 'prefix C-l' or type 'clear'.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/tmux-navigator.lua .tmux.conf
git commit -m "feat(nvim): add vim-tmux-navigator with tmux config"
```

### Task 8: Oil (file browser)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/oil.lua`

- [ ] **Step 1: Create oil.lua plugin spec**

```lua
return {
  {
    "stevearc/oil.nvim",
    keys = {
      { "<leader>e", "<cmd>Oil<cr>", desc = "File browser" },
      { "-", "<cmd>Oil<cr>", desc = "File browser" },
    },
    opts = {
      view_options = {
        show_hidden = true,
      },
    },
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/oil.lua
git commit -m "feat(nvim): add oil.nvim file browser"
```

### Task 9: render-markdown (inline markdown rendering)

**Files:**
- Create: `/Users/mshron/code/dotfiles/.config/nvim/lua/plugins/render-markdown.lua`

- [ ] **Step 1: Create render-markdown.lua plugin spec**

```lua
return {
  {
    "MeanderingProgrammer/render-markdown.nvim",
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
    },
    ft = { "markdown" },
    opts = {},
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add .config/nvim/lua/plugins/render-markdown.lua
git commit -m "feat(nvim): add render-markdown inline rendering"
```

---

## Chunk 3: Symlink, Verify, and Tutorial

### Task 10: Symlink and verify installation

- [ ] **Step 1: Create symlink from dotfiles to ~/.config/nvim**

```bash
ln -sfn /Users/mshron/code/dotfiles/.config/nvim ~/.config/nvim
```

- [ ] **Step 2: Run neovim headless to bootstrap lazy.nvim and install plugins**

```bash
nvim --headless "+Lazy! sync" +qa
```

Expected: lazy.nvim clones itself, installs all plugins, exits cleanly.

- [ ] **Step 3: Run neovim headless to install treesitter parsers**

```bash
nvim --headless "+TSUpdateSync" +qa
```

Expected: treesitter parsers download and compile.

- [ ] **Step 4: Verify plugin count**

```bash
nvim --headless -c 'lua print("Plugins: " .. #require("lazy").plugins())' -c 'qa'
```

Expected: prints a number >= 7 (the 7 plugins + plenary + telescope-fzf-native).

- [ ] **Step 5: Copy updated tmux.conf to home**

```bash
cp /Users/mshron/code/dotfiles/.tmux.conf ~/.tmux.conf
tmux source-file ~/.tmux.conf 2>/dev/null || true
```

- [ ] **Step 6: Commit any fixups**

If any changes were needed during verification, commit them.

### Task 11: Write tutorial

**Files:**
- Create: `/Users/mshron/code/dotfiles/docs/neovim-tutorial.md`

- [ ] **Step 1: Write the tutorial document**

Create a hands-on tutorial covering all features per the spec's Tutorial Requirements section. Include:

1. Getting started (tmux session, neovim launch, creating Claude Code panes)
2. File navigation (telescope find_files, live_grep, buffers; oil file browser)
3. Window management (splits, navigation across neovim and tmux, resizing, closing)
4. Markdown editing (render-markdown features, toggling, markdown vim motions)
5. Git workflow (gutter signs, hunk navigation, preview, blame)
6. tmux integration (switching panes, C-l workaround, new panes/windows)
7. Quick reference card (all keybindings in one table)

- [ ] **Step 2: Commit**

```bash
cd /Users/mshron/code/dotfiles
git add docs/neovim-tutorial.md
git commit -m "docs: add neovim tutorial and quick reference"
```

### Task 12: Final commit and push

- [ ] **Step 1: Verify clean state**

```bash
cd /Users/mshron/code/dotfiles
git status
git log --oneline -10
```

- [ ] **Step 2: Push to remote**

```bash
cd /Users/mshron/code/dotfiles
git push
```
