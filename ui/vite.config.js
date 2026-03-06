import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Dev server (npm run dev)
  server: {
    host: '0.0.0.0',   // allow external network access (optional)
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:2024',
        changeOrigin: true,
      }
    }
  },

  // Preview server for production builds (npm run preview)
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['fashion.onelogica.com'],  // Required for production domain
  }
})
