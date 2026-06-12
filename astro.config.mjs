// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// facturamea-app — frontend that consumes the facturamea API (headless).
// Static output: this is a token-auth SPA-style frontend; all data is fetched
// client-side from PUBLIC_API_URL with a Bearer token.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: vercel(),
});
