import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// base 默认相对路径 './'，供 Netlify 根路径部署使用（保持原有行为不变）。
// GitHub Pages 的项目站点挂在 /<repo>/ 子路径下，且 404.html 回退需要绝对资源路径，
// 因此由 CI 传入 VITE_BASE=/pet-punch-card/ 覆盖。
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? './',
})
