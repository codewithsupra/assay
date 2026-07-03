import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8001',
      '/socket.io': { target: 'http://localhost:8001', ws: true },
      '/r': 'http://localhost:8001',
    },
  },
})
