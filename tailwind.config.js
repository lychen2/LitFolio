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
          mute: "#6b6b78",
          text: "#e8e8ee",
          accent: "#a78bfa",
          accent2: "#7dd3fc",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        serif: ["Lora", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
