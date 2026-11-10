import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = `http://localhost:${process.env.API_PORT ?? 8787}`

export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: true, proxy: { '/api': api, '/mcp': api } },
})
