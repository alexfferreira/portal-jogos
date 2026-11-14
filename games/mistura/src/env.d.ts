/** Variáveis de ambiente do Vite usadas pelo jogo (definidas no build/execução de teste). */
interface ImportMeta {
  readonly env?: { readonly VITE_E2E?: string };
}

/** `?worker&url` do Vite: URL final (empacotada) do módulo do Worker. */
declare module '*?worker&url' {
  const url: string;
  export default url;
}
