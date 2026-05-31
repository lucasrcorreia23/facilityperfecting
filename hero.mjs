import { heroui } from "@heroui/theme";

// Espelha o tema da Perfecting (small-mvp/hero.mjs).
export default heroui({
  defaultTheme: "light",
  layout: {
    radius: {
      small: "2px",
      medium: "4px",
      large: "8px",
    },
    borderWidth: {
      small: "1px",
      medium: "1px",
      large: "1px",
    },
    hoverOpacity: 0.95,
  },
  themes: {
    light: {
      colors: {
        primary: {
          DEFAULT: "#2E63CD",
          foreground: "#FFFFFF",
        },
        danger: {
          DEFAULT: "#dc2626",
          foreground: "#FFFFFF",
        },
        focus: "#2E63CD",
      },
    },
  },
});
