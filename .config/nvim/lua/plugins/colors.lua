return {
  {
    "jan-warchol/selenized",
    lazy = false,
    priority = 1000,
    rtp = "editors/vim",
    config = function()
      vim.opt.rtp:append(vim.fn.stdpath("data") .. "/lazy/selenized/editors/vim")
      vim.o.background = "dark"
      vim.cmd.colorscheme("selenized")
    end,
  },
}
