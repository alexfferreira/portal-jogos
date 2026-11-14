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
