import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#13131c",
        surfaceAlt: "#1c1c2a",
        border: "#2a2a3a",
        accent: "#f5b301",
        accentDark: "#c89400",
        muted: "#8a8aa3",
        danger: "#e15252",
        success: "#41c96d",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(245,179,1,0.3), 0 0 40px -10px rgba(245,179,1,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
