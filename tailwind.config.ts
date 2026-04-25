import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zoca: {
          "bg-0": "#0a0422",
          "bg-1": "#13063a",
          "bg-2": "#1a0b4a",
          "bg-3": "#24125c",
          "bg-nav": "rgba(10, 4, 34, 0.7)",
          "text-primary": "#ffffff",
          "text-muted": "#c8cafe",
          "text-soft": "rgba(243, 237, 253, 0.55)",
          "pink-1": "#ffa8cd",
          "pink-2": "#ff86e1",
          "pink-text": "#ff4fa8",
          "pink-hover": "#f695be",
          "primary-active": "#b0045d",
          "light-pink": "#ffe6e6",
          purple: "#7868f4",
          "light-lavender": "#c8cafe",
          "light-purple-2": "#e5ccff",
          "dark-purple-1": "#1f0843",
          "dark-purple-2": "#0b051d",
          border: "rgba(200, 202, 254, 0.10)",
          "border-2": "rgba(200, 202, 254, 0.18)",
          "border-3": "rgba(200, 202, 254, 0.28)",
          ok: "#4ade80",
          warn: "#fbbf24",
          bad: "#f87171",
        },
      },
      borderRadius: {
        "zoca-xl": "1.25rem",
        "zoca-2xl": "2rem",
        "zoca-pill": "9999px",
      },
    },
  },
  plugins: [],
};
export default config;
