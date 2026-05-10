import { defineConfig } from "vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [tailwindcss(), basicSsl()],
  base: "/translate/",
  server: {
    host: "0.0.0.0",
  },
})
