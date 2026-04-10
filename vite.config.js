import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// NOTE: Update `base` to match your GitHub Pages repo name.
// If deploying to https://<user>.github.io/hostmind, leave as '/hostmind/'.
// If using a custom domain or deploying to the root, set to '/'.
export default defineConfig({
  plugins: [react()],
  base: '/hostmind/',
})
