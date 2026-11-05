import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [react()], optimizeDeps: { include: ['react-markdown', 'remark-gfm', '@xyflow/react'] }, server: { host: '127.0.0.1', proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000', changeOrigin: true } } }, preview: { host: '127.0.0.1' } });
