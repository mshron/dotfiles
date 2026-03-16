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

-- Auto-reload files changed outside nvim (e.g. by Claude Code)
opt.autoread = true
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold" }, {
  command = "silent! checktime",
})

-- Disable netrw (oil.nvim replaces it)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
