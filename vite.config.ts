import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'  // 新增这一行

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],  // 在 plugins 里加 tailwindcss()
})