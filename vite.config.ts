import { execSync } from "node:child_process"
import { defineConfig } from "vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import tailwindcss from "@tailwindcss/vite"

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return process.env.VITE_COMMIT ?? ""
  }
})()

export default defineConfig({
  plugins: [
    tailwindcss(),
    basicSsl(),
    {
      name: "inject-commit",
      transformIndexHtml: (html) => html.replaceAll("%COMMIT%", commit),
    },
  ],
  base: "/parley/",
  server: {
    host: "0.0.0.0",
  },
  preview: {
    headers: { "Cache-Control": "no-store" },
  },
})
