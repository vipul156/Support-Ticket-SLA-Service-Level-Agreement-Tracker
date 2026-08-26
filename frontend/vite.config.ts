import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev proxy forwards /graphql to the local backend so the browser never
// needs CORS configuration; in preview we serve the same relative path.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/graphql': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
