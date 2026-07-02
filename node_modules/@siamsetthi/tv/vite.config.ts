import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// TV board SPA. In dev, proxy the Socket.IO endpoint to the game server so the
// client can talk to the server same-origin (matching the single-origin prod
// gateway). In prod the server serves this build directly.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": {
        target: process.env.VITE_DEV_SERVER ?? "http://localhost:4000",
        ws: true,
        changeOrigin: true
      }
    }
  }
});
