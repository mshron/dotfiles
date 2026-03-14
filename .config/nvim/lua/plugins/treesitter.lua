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
