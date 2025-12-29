import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        emerald: {
          "50": "#f9f9f9",
          "100": "#f2f2f2",
          "200": "#e5e5e5",
          "300": "#d8d8d8",
          "400": "#bfbfbf",
          "500": "#a6a6a6",
          "600": "#8c8c8c",
          "700": "#737373",
          "800": "#595959",
          "900": "#404040",
        },
        hotPink: "#000000", // pink
        orangeSunset: "#ffffff", // orange
        synthwaveBlue: "#ffffff", // sky blue typical of synthwave
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
export default config;
