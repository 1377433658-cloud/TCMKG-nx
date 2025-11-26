import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // 如果没有配置 Key，这就默认为空字符串，防止程序崩溃
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || ""),
    },
  }
})