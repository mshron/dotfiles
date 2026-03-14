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
