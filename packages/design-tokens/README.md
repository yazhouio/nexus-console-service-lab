# Nexus visual contract v1

`theme.css` is the single source of token values. The Distribution loads it before its first UI execution, on the Host document root; `baseline.css` separately declares only box sizing, document minimum height, and body margin. Plugin artifacts never include either asset.

The public `--nexus-*` properties cover text, muted text, canvas, surface, borders, primary/hover actions, danger, success and focus; spacing; body/code font stacks; small/body/heading sizes; regular/medium/semibold weights; body/heading line heights; radii and card shadow. Colors are CSS colors, spacing/sizes/radii are lengths in **px**, weights and line heights are unitless, families are CSS font lists, and shadow is a complete CSS shadow value. No downloaded fonts or `rem` assumptions are involved.

Plugins consume these properties with `var()`. They must not define or register them. Private variables and all globally registered names use the plugin's namespace. Adding a token is compatible; removing, renaming or changing its meaning requires a contract major release. Value changes are theme changes, not contract version changes. There is no runtime negotiation or theme state service.

The initial publication contains the complete default light theme only. A future complete variant belongs in this same asset under `:root[data-nexus-theme='…']`; changing that Host attribute updates connected Builtin, Restricted Shadow DOM and Overlay consumers through ordinary inheritance. Do not ship incomplete dark-theme defaults. Independent previews load this package's theme in their preview document; integrated Restricted HTML must not include same-name defaults, because Wujie patches `:root` to `:host`.

For the Restricted example, run `pnpm --filter @nexus/example-restricted-plugin dev:preview` on port 3004. That preview includes this theme and is explicitly rejected in production builds; the integration server on port 3001 does not include it.
