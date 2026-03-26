import { defineConfig, loadEnv } from 'vite'
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

export default defineConfig(({ mode }) => {
  // 加载环境变量，包括 .env 文件和系统环境变量
  // 第三个参数 '' 表示加载所有变量，不限于 VITE_ 前缀
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // 优先使用 VITE_ 前缀的变量，如果不存在则尝试使用无前缀的系统变量
      'import.meta.env.VITE_XMOV_APP_ID': JSON.stringify(env.VITE_XMOV_APP_ID || env.XMOV_APP_ID || ''),
      'import.meta.env.VITE_XMOV_APP_SECRET': JSON.stringify(env.VITE_XMOV_APP_SECRET || env.XMOV_APP_SECRET || ''),
    },
    build: {
      outDir: 'dist/elderly',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'visitor.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: true, // 允许局域网访问
      open: false,
      https: https, // 如果有证书则启用HTTPS
    },
  }
})
