import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.BASE_PATH || env.VITE_BASE || env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      hmr: {
        clientPort: 443,
        protocol: 'wss'
      }
    }
  };
});
