import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Set VITE_BASE=/repo-name/ when hosting under a sub-path (GitHub Pages).
  base: loadEnv(mode, ".", "").VITE_BASE || "/",
  test: { environment: "node", globals: true },
}));
