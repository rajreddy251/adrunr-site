import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "#1A73E8",
        },
        ink: {
          950: "#0b0e0c",
          900: "#121714",
          800: "#1a211d",
          700: "#24302a",
        },
        moss: {
          300: "#b7c4b8",
          400: "#8a9a90",
          500: "#5f7266",
          600: "#3d4a42",
          700: "#2a332e",
        },
        paper: {
          50: "#f4f5f0",
          100: "#ffffff",
        },
        lime: {
          400: "#c8f542",
          500: "#a8d42a",
        },
        amber: {
          400: "#f5b942",
        },
        coral: {
          400: "#f26b4d",
        },
      },
      fontFamily: {
        sans: ["var(--font-ibm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
