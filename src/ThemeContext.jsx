import { createContext, useContext } from "react";

export const themes = {
  dark: {
    mode: "dark",
    bg: "#0a0a0c", bgAlt: "#0e0e11", bgCard: "#111114",
    sidebar: "#0a0a0c", sidebarBorder: "#1a1a1f",
    border: "#1a1a1f", borderMid: "#252530",
    text: "#f0f0f5", textSec: "#b0b0c8", textDim: "#7a7a94", textGhost: "#50506a",
    brand: "#a78bfa", brandDim: "#6d5bb5",
    client: "#67e8f9",
    green: "#4ade80", red: "#f87171", yellow: "#fbbf24", orange: "#fb923c",
    heatGreen: "#16a34a", heatYellow: "#ca8a04", heatRed: "#dc2626", heatZero: "#7f1d1d",
    tooltipBg: "#18181b", inputBg: "#18181b", inputBorder: "#2a2a35",
    btnBg: "#f0f0f5", btnText: "#0a0a0c",
    barBg: "#1a1a1f", sectionNum: "#a78bfa", scrollThumb: "#252530",
    badgeTxt: "#000",
  },
  light: {
    mode: "light",
    bg: "#f7f7f8", bgAlt: "#ededf0", bgCard: "#ffffff",
    sidebar: "#ffffff", sidebarBorder: "#e0e0e5",
    border: "#dcdce0", borderMid: "#c8c8d0",
    text: "#111118", textSec: "#3a3a52", textDim: "#5a5a72", textGhost: "#8a8a9e",
    brand: "#7c3aed", brandDim: "#5b21b6",
    client: "#0891b2",
    green: "#16a34a", red: "#dc2626", yellow: "#ca8a04", orange: "#ea580c",
    heatGreen: "#16a34a", heatYellow: "#ca8a04", heatRed: "#dc2626", heatZero: "#991b1b",
    tooltipBg: "#ffffff", inputBg: "#f0f0f3", inputBorder: "#d0d0d8",
    btnBg: "#111118", btnText: "#f7f7f8",
    barBg: "#e0e0e5", sectionNum: "#7c3aed", scrollThumb: "#c8c8d0",
    badgeTxt: "#fff",
  },
};

export const ThemeContext = createContext(themes.dark);
export const useTheme = () => useContext(ThemeContext);
