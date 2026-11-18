// Theme colors are CSS variables holding complete colors (oklch), so Tailwind
// cannot inject an alpha channel on its own. Routing them through color-mix
// makes opacity modifiers such as `bg-litera-accent/15` produce real output.
const token = (name) => `color-mix(in srgb, var(--litera-${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        litera: {
          ink: token("ink"),
          bg: token("bg"),
          paper: token("paper"),
          panel: token("panel"),
          surface: token("surface-1"),
          surface2: token("surface-2"),
          surface3: token("surface-3"),
          line: token("line"),
          border: token("border"),
          "border-strong": token("border-strong"),
          focus: token("focus"),
          mute: token("mute"),
          text: token("text"),
          subtle: token("text-subtle"),
          accent: token("accent"),
          "accent-strong": token("accent-strong"),
          "accent-contrast": token("accent-contrast"),
          accent2: token("accent2"),
          info: token("info"),
          success: token("success"),
          warn: token("warn"),
          error: token("error"),
        },
      },
      fontFamily: {
        sans: ["var(--litera-font-sans)"],
        serif: ["var(--litera-font-serif)"],
        mono: ["var(--litera-font-mono)"],
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
