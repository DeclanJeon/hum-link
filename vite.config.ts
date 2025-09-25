import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  define: {
    global: "globalThis",
  },
  worker: {
    format: 'es' as const, // ES 모듈 형식으로 워커를 번들링합니다.
    plugins: () => [react()], // 워커 내부에서 React 구문 등을 사용해야 할 경우를 대비합니다.
  },
  optimizeDeps: {
    include: ['simple-peer'],
  },
}));
