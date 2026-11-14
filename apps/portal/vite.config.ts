import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ fallback: '200.html' }),
      // Os e2e sobem `vite build` e `vite dev` ao mesmo tempo; cada um precisa do seu diretório
      // gerado, senão um pisa na saída do outro. Padrão: `.svelte-kit`.
      // O registro do service worker é feito por `src/lib/sw.svelte.ts` (precisa saber de versões
      // novas e ficar desligado no dev); por isso o registro automático do SvelteKit fica off.
      serviceWorker: { register: false },
      outDir: process.env.SVELTEKIT_OUT_DIR ?? '.svelte-kit',
    }),
  ],
  server: {
    fs: {
      // Os jogos (games/*) e os pacotes (packages/*) ficam fora de apps/portal. Sem liberar a
      // raiz do workspace, o dev server responde 403 para arquivos como o Worker da Mistura.
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
});
