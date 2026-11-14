import { initApp } from '#lib/app.svelte.ts';

export const prerender = true;
export const ssr = false;

/** Os serviços (storage, idioma, configurações) ficam prontos antes de qualquer tela. */
export async function load() {
  await initApp();
  return {};
}
