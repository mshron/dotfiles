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
