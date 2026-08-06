/**
 * Curated token sets for the four stock VS Code themes (U1). Values are
 * hand-carried from the built-in theme definitions — close enough for
 * regression screenshots; determinism matters more than pixel-exact
 * fidelity. Tokens a theme does not define are deliberately OMITTED so the
 * `var()` fallback (or lack of one) behaves exactly as it would in VS Code —
 * high-contrast screenshots reveal real HC gaps, not harness charity.
 *
 * Font stacks are pinned (not the OS default) so screenshots are stable
 * per-platform across runs.
 */

const FONTS = {
  "font-size": "13px",
  "font-family": `-apple-system, "Segoe UI", Ubuntu, "Helvetica Neue", sans-serif`,
  "editor-font-family": `Menlo, Consolas, "DejaVu Sans Mono", monospace`,
};

export interface ThemeSpec {
  name: string;
  bodyClass: string;
  tokens: Record<string, string>;
}

export const THEMES: ThemeSpec[] = [
  {
    name: "dark-modern",
    bodyClass: "vscode-dark",
    tokens: {
      ...FONTS,
      foreground: "#cccccc",
      "editor-background": "#1f1f1f",
      descriptionForeground: "#9d9d9d",
      "widget-border": "#313131",
      focusBorder: "#0078d4",
      "button-secondaryBackground": "#313131",
      "button-secondaryForeground": "#cccccc",
      "toolbar-hoverBackground": "#5a5d5e50",
      "input-background": "#313131",
      "input-foreground": "#cccccc",
      "input-border": "#3c3c3c",
      "list-activeSelectionBackground": "#04395e",
      "list-activeSelectionForeground": "#ffffff",
      "list-hoverBackground": "#2a2d2e",
      "charts-orange": "#d18616",
      "charts-green": "#89d185",
      "charts-blue": "#3794ff",
      "charts-lines": "#cccccc80",
      errorForeground: "#f48771",
      "textCodeBlock-background": "#101010",
      "symbolIcon-propertyForeground": "#75beff",
    },
  },
  {
    name: "light-modern",
    bodyClass: "vscode-light",
    tokens: {
      ...FONTS,
      foreground: "#3b3b3b",
      "editor-background": "#ffffff",
      descriptionForeground: "#717171",
      "widget-border": "#e5e5e5",
      focusBorder: "#005fb8",
      "button-secondaryBackground": "#e5e5e5",
      "button-secondaryForeground": "#3b3b3b",
      "toolbar-hoverBackground": "#b8b8b850",
      "input-background": "#ffffff",
      "input-foreground": "#3b3b3b",
      "input-border": "#cecece",
      "list-activeSelectionBackground": "#e8e8e8",
      "list-activeSelectionForeground": "#000000",
      "list-hoverBackground": "#f2f2f2",
      "charts-orange": "#d18616",
      "charts-green": "#388a34",
      "charts-blue": "#2b7cd3",
      "charts-lines": "#61616180",
      errorForeground: "#a1260d",
      "textCodeBlock-background": "#f5f5f5",
      "symbolIcon-propertyForeground": "#007acc",
    },
  },
  {
    name: "hc-dark",
    bodyClass: "vscode-high-contrast",
    tokens: {
      ...FONTS,
      foreground: "#ffffff",
      "editor-background": "#000000",
      descriptionForeground: "#ffffff",
      "widget-border": "#6fc3df",
      focusBorder: "#f38518",
      "input-background": "#000000",
      "input-foreground": "#ffffff",
      "input-border": "#6fc3df",
      "charts-orange": "#d18616",
      "charts-green": "#89d185",
      "charts-blue": "#3794ff",
      "charts-lines": "#ffffff80",
      errorForeground: "#f48771",
    },
  },
  {
    name: "hc-light",
    bodyClass: "vscode-high-contrast vscode-high-contrast-light",
    tokens: {
      ...FONTS,
      foreground: "#292929",
      "editor-background": "#ffffff",
      descriptionForeground: "#292929",
      "widget-border": "#0f4a85",
      focusBorder: "#006bbd",
      "input-background": "#ffffff",
      "input-foreground": "#292929",
      "input-border": "#0f4a85",
      "charts-orange": "#a95f00",
      "charts-green": "#374e06",
      "charts-blue": "#0f4a85",
      "charts-lines": "#29292980",
      errorForeground: "#b5200d",
    },
  },
];

export function themeCss(theme: ThemeSpec): string {
  const vars = Object.entries(theme.tokens)
    .map(([name, value]) => `--vscode-${name}: ${value};`)
    .join(" ");
  return `:root { ${vars} }`;
}
