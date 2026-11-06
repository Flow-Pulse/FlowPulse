import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./state";
import { initTheme } from "./lib/theme";
import App from "./App";
import "./index.css";

// Initialize system/stored dark mode preference
initTheme();

// Reveal icon glyphs only once the symbol font is ready (avoids raw ligature text).
document.fonts
  ?.load('20px "Material Symbols Outlined"')
  .then(() => document.documentElement.classList.add("icons-ready"))
  .catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
