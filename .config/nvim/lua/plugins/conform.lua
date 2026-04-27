return {
  {
    "stevearc/conform.nvim",
    event = { "BufWritePre" },
    cmd = { "ConformInfo" },
    opts = {
      formatters = {
        uv_black = {
          command = "uv",
          args = { "run", "--quiet", "black", "--quiet", "-" },
          stdin = true,
          condition = function()
            return vim.fn.executable("uv") == 1
          end,
        },
      },
      formatters_by_ft = {
        python = { "uv_black" },
      },
      format_on_save = {
        timeout_ms = 3000,
        lsp_format = "never",
      },
      notify_on_error = false,
    },
  },
}
