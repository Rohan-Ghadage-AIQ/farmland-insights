import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_PROXY_TARGET = 'http://127.0.0.1:8000';

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

export default defineConfig(({ mode }) => {
  // The proxy target is a dev-server concern only; it is not exposed to the browser bundle.
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
  // An empty value (as in .env.example when blanked) must fall back to the default.
  const target = blankToUndefined(fileEnv.VITE_API_PROXY_TARGET) ?? DEFAULT_PROXY_TARGET;

  // The backend has no CORS middleware (docs/API_CONTRACT.md), so the browser always
  // calls same-origin relative URLs and the dev server forwards them.
  const proxy = {
    '/api': { target, changeOrigin: true },
    '/health': { target, changeOrigin: true },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      sourcemap: true,
      target: 'es2022',
    },
  };
});
