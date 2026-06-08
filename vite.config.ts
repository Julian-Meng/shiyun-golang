import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 诗云 — static SPA. All index↔poem math runs client-side; no backend, ever.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
});
