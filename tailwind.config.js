/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        litera: {
          ink: "var(--litera-ink)",
          bg: "var(--litera-bg)",
          paper: "var(--litera-paper)",
          panel: "var(--litera-panel)",
          surface: "var(--litera-surface-1)",
          surface2: "var(--litera-surface-2)",
          surface3: "var(--litera-surface-3)",
          line: "var(--litera-line)",
          border: "var(--litera-border)",
          "border-strong": "var(--litera-border-strong)",
          focus: "var(--litera-focus)",
          mute: "var(--litera-mute)",
          text: "var(--litera-text)",
          subtle: "var(--litera-text-subtle)",
          accent: "var(--litera-accent)",
          accent2: "var(--litera-accent2)",
          info: "var(--litera-info)",
          success: "var(--litera-success)",
          warn: "var(--litera-warn)",
          error: "var(--litera-error)",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "Cascadia Code", "Liberation Mono", "ui-monospace", "monospace"],
        serif: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display": ["2rem", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "600" }],
        "heading": ["1.5rem", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "600" }],
        "subheading": ["1.125rem", { lineHeight: "1.4", fontWeight: "500" }],
        "body": ["0.875rem", { lineHeight: "1.6" }],
        "caption": ["0.75rem", { lineHeight: "1.5" }],
        "overline": ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
