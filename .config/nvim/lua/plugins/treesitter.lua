return {
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    build = ":TSUpdate",
    config = function()
      local parsers = {
        "markdown", "markdown_inline",
        "lua", "python", "javascript", "typescript",
        "json", "yaml", "toml", "bash",
        "html", "css", "dockerfile",
      }

      local ts = require("nvim-treesitter")
      local installed = ts.get_installed()
      local to_install = {}
      for _, parser in ipairs(parsers) do
        if not vim.list_contains(installed, parser) then
          table.insert(to_install, parser)
        end
      end
      if #to_install > 0 then
        ts.install(to_install)
      end

      -- Enable treesitter highlighting for all filetypes with a parser
      vim.api.nvim_create_autocmd("FileType", {
        callback = function(args)
          local lang = vim.treesitter.language.get_lang(args.match) or args.match
          if pcall(vim.treesitter.language.inspect, lang) then
            vim.treesitter.start()
          end
        end,
      })
    end,
  },
}
