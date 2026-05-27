/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        litera: {
          ink: "#0a0a0f",
          paper: "#121218",
          panel: "#1a1a23",
          line: "#26262f",
          mute: "#8e8e9e",
          text: "#e8e8ee",
          accent: "#b49aff",
          accent2: "#8edcff",
          success: "#4ade80",
          warn: "#fbbf24",
          error: "#fb7185",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        serif: ["Cormorant Garamond", "Lora", "ui-serif", "Georgia", "serif"],
      },
      fontSize: {
        "display": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "heading": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "subheading": ["1.125rem", { lineHeight: "1.4", fontWeight: "500" }],
        "body": ["0.875rem", { lineHeight: "1.6" }],
        "caption": ["0.75rem", { lineHeight: "1.5" }],
        "overline": ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
