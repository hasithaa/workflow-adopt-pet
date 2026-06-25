import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Pet Adoption portal talks to the workflow Management API.
// In dev, /workflow/* is proxied to the workflow runtime (assumed on :8234).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    proxy: {
      '/workflow': 'http://localhost:8234',
    },
  },
})
