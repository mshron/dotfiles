return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      { "williamboman/mason.nvim", config = true },
      "williamboman/mason-lspconfig.nvim",
      "saghen/blink.cmp",
    },
    config = function()
      require("mason-lspconfig").setup({
        ensure_installed = { "basedpyright" },
        automatic_enable = false,
      })

      vim.lsp.config("basedpyright", {
        capabilities = require("blink.cmp").get_lsp_capabilities(),
        settings = {
          basedpyright = {
            analysis = {
              typeCheckingMode = "standard",
              autoImportCompletions = true,
            },
          },
        },
      })
      vim.lsp.enable("basedpyright")

      vim.api.nvim_create_autocmd("LspAttach", {
        callback = function(args)
          local bufnr = args.buf
          local map = function(lhs, rhs, desc)
            vim.keymap.set("n", lhs, rhs, { buffer = bufnr, desc = desc })
          end

          map("gd", vim.lsp.buf.definition, "LSP: go to definition")
          map("gD", vim.lsp.buf.declaration, "LSP: go to declaration")
          map("gr", function()
            local ok, telescope = pcall(require, "telescope.builtin")
            if ok then
              telescope.lsp_references()
            else
              vim.lsp.buf.references()
            end
          end, "LSP: references")
          map("gi", vim.lsp.buf.implementation, "LSP: go to implementation")
          map("K", vim.lsp.buf.hover, "LSP: hover")
          map("<leader>rn", vim.lsp.buf.rename, "LSP: rename")
          map("<leader>ca", vim.lsp.buf.code_action, "LSP: code action")
          map("[d", function() vim.diagnostic.jump({ count = -1, float = true }) end, "Diagnostic: prev")
          map("]d", function() vim.diagnostic.jump({ count = 1, float = true }) end, "Diagnostic: next")
          map("<leader>e", vim.diagnostic.open_float, "Diagnostic: open float")
        end,
      })

      vim.diagnostic.config({
        virtual_text = true,
        signs = true,
        underline = true,
        update_in_insert = false,
        severity_sort = true,
      })
    end,
  },
}
