import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: 'all',
    // ↓ Important: mai puțină presiune pe watcher
    watch: {
      ignored: ['**/node_modules/**', '**/.pnpm-store/**'],
      usePolling: true,
      interval: 300,
    },
    // Dacă rulezi printr-un proxy HTTPS, poți activa:
    // hmr: { clientPort: 443 },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      jsbarcode: 'jsbarcode/dist/JsBarcode.all.js',
    },
  },
})
