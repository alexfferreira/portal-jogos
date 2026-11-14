# Decisões

Registro de decisões tomadas durante o desenvolvimento. Formato: data · decisão · motivo.

## Marco 1 — Fundação

- **2026-11-14 · pnpm instalado via `npm install -g pnpm`** (v12.18.0). `corepack enable` falhou com EPERM em `C:\Program Files\nodejs` (exige administrador). O campo `packageManager` do `package.json` raiz fixa a versão.
- **2026-11-14 · TypeScript fixado em `~6.0`** (não 7.x). `typescript-eslint` ainda declara suporte só até `<6.1`; subir quando houver suporte.
- **2026-11-14 · Esqueleto mínimo do SvelteKit no marco 1** (uma página "Recreio"). Necessário para `pnpm build`, `pnpm check` e o teste e2e de fumaça terem o que verificar. O portal de verdade é o marco 3.
- **2026-11-14 · Pacotes do workspace exportam TS direto** (`exports: ./src/index.ts`), sem etapa de build. O Vite do portal compila tudo; evita build duplo.
- **2026-11-14 · Regra de ESLint barra `three`, `svelte` e `window`/`document` em `games/*/src/logic`**, para impor a regra 1 do CLAUDE.md (lógica pura).
- **2026-11-14 · Playwright usa Chromium com emulação Pixel 7 e viewport 390×844**; o servidor de teste é `build` + `preview` na porta 4173.
- **2026-11-14 · Repositório Git iniciado localmente** (`main`). O remoto no GitHub fica por conta do Alex.
- **2026-11-14 · Configuração do SvelteKit dentro do `vite.config.ts`** (adapter-static e `fallback: '200.html'` passados a `sveltekit({...})`). O SvelteKit 3 recusa `svelte.config.js` (erro `config_file_unsupported`); confirmado no código instalado e no JSDoc de `@sveltejs/kit/vite`.
- **2026-11-14 · Context7 indisponível nesta sessão.** A consulta de documentação do marco 1 foi feita lendo o código e os tipos instalados em `node_modules`. Nos marcos seguintes, usar o Context7 quando disponível.
- **2026-11-14 · Fim de linha LF forçado** (`.gitattributes` + `endOfLine` no Prettier) para o `prettier --check` não falhar no Windows com `autocrlf`.
- **2026-11-14 · Lógica proíbe `Math.random`, `navigator`, `localStorage`, `indexedDB`** além de DOM/Three/Svelte (determinismo e pureza).
- **2026-11-14 · Pendências aceitas para depois:** `tsconfig` restrito (`lib: ES2022`) para `logic/` no marco 4; `check` cobrindo `e2e` e configs da raiz.

## Marco 2 — Core

- **2026-11-14 · Dependências:** `three` 0.187 e `idb-keyval` 6 em `packages/core`. Imports de addons via `three/addons/...`. `PCFSoftShadowMap` foi removido do three; o palco usa `PCFShadowMap`.
- **2026-11-14 · Storage:** chaves com prefixo `recreio:`; cada documento é um envelope `{ v, data }` com migrações `n → n+1`. Dado corrompido, sem migração ou de versão futura devolve os padrões. Backup é JSON `{ app: 'recreio', format: 1, entries }`; a importação grava o novo conteúdo antes de remover o que sobrou.
- **2026-11-14 · Idioma:** `navigator.language` com prefixo `pt`, `es` ou `en`; qualquer outro cai em pt-BR.
- **2026-11-14 · Qualidade gráfica:** muda ao vivo (pixel ratio, sombras, materiais), exceto o **antialias**, que é atributo do contexto WebGL e só muda ao reabrir o jogo.
- **2026-11-14 · Áudio:** o volume de música é guardado, mas não há música ainda (sem assets); o barramento de música entra quando houver. `unlock()` precisa ser chamado pelo portal no primeiro gesto.
- **2026-11-14 · Picking generoso:** 9 raycasts por toque (centro + anel de 22 px). Não filtra `visible`.
- **2026-11-14 · `$lib` virou `#lib` no SvelteKit 3** (campo `imports` do `package.json` do portal). Links usam `resolve()` de `$app/paths`, exigido pelo lint.
- **2026-11-14 · Rota `/demo`** valida o core no navegador (palco, toque, i18n, persistência, liberação do WebGL). Sai quando o portal real (marco 3) existir.

### Pendências aceitas (do review do marco 2)

- Recarregar configurações e serviços depois de importar um backup (portal, marco 3: recarregar a página).
- Falha de IndexedDB em modo privado: salvar rejeita; falta fallback para memória com aviso.
- Perda em downgrade: dado de versão futura é lido como padrão e o próximo `save` o sobrescreve.
- `webglcontextlost/restored` e mensagem amigável quando não há WebGL.
- Escopo de limpeza no `GameContext` (`ctx.dispose` para inscrições e `events.clear()`); `addMessages` não notifica a UI.
- `demoGame` entra no bundle de quem importa `@recreio/core`; mover para subpath `@recreio/core/demo` quando a demo sair.
- Fila de gravação em `settings.set` (hoje duas gravações seguidas não têm ordem garantida).
