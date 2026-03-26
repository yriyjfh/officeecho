import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// 尝试加载本地证书（用于HTTPS）
const loadCertificates = () => {
  const certPath = path.resolve(__dirname, 'certs/localhost.pem')
  const keyPath = path.resolve(__dirname, 'certs/localhost-key.pem')

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }
  }
  return undefined
}

const https = loadCertificates()

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/family',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 3001,
    host: true, // 允许局域��访问
    open: '/admin.html',
    https: https, // 如果有证书则启用HTTPS
  },
})
