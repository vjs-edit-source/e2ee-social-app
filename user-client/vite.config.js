import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// User Version - Port 5000, connects to main E2EE Engine backend on Port 4000
export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
