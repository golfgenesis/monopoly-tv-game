import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Phone controller SPA. Built under the "/phone/" base so the single-origin
// server can host it at https://<host>/phone alongside the TV app at "/". In dev
// it runs at the root of its own Vite server (:5174) and proxies Socket.IO.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/phone/" : "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/socket.io": {
        target: process.env.VITE_DEV_SERVER ?? "http://localhost:4000",
        ws: true,
        changeOrigin: true
      }
    }
  }
}));
