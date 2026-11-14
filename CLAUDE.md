# CLAUDE.md — Portal "Recreio" (jogos pessoais offline)

Leia este arquivo em toda sessão. A especificação completa está em `PROMPT-portal-jogos.md` (raiz). Decisões tomadas durante o desenvolvimento ficam em `docs/DECISIONS.md`; o roadmap de jogos em `docs/GAMES.md`.

## O projeto em uma frase

Portal PWA pessoal, sem anúncios e offline, com vários jogos casuais em Three.js. Começa por **um jogo só: "Mistura de cores"** (water sort). Os demais jogos estão em `docs/GAMES.md` e **não devem ser implementados sem pedido explícito**.

## Stack (não trocar sem pedir)

- Monorepo **pnpm** · **TypeScript strict**
- `apps/portal`: **SvelteKit** com `adapter-static` (portal, HUD, menus, modais)
- `packages/core`: base comum (palco 3D, storage, i18n, áudio, configurações, contrato `GameModule`)
- `packages/ui`: componentes Svelte compartilhados
- `games/<id>`: um pacote por jogo, com `src/logic` (TS puro) e `src/render` (Three.js)
- **Three.js** para todos os jogos · **Rapier** só quando um jogo precisar de física (ainda não)
- PWA com `@vite-pwa/sveltekit` · storage em **IndexedDB** · **Vitest** + **Playwright**
- Deploy: **Vercel** (Hobby, uso pessoal) via GitHub; build estático também servível por nginx

## Regras de arquitetura

1. **Lógica separada da renderização.** `logic/` não importa Three.js, DOM nem Svelte. É determinística e 100% testável.
2. A lógica decide o resultado de cada jogada na hora; o render **apenas anima**. Animações interrompíveis nunca corrompem o estado.
3. Tudo aleatório em geração de fase usa **PRNG com semente** do `core`.
4. Gerador e solver rodam em **Web Worker**.
5. Todo jogo implementa `GameModule` e libera recursos em `destroy()` (geometrias, materiais, texturas, listeners). Nada de vazamento ao entrar/sair.
6. Nenhum texto visível fixo no código: tudo via **i18n** (pt-BR padrão, en, es).
7. Gráficos **procedurais**; sons **sintetizados** (Web Audio). Nada de assets de terceiros sem licença CC0 registrada em `docs/DECISIONS.md`.
8. Sem backend, sem analytics, sem chaves/segredos, sem anúncios.

## Ambiente

- Windows nativo com **Git Bash**. Scripts do `package.json` devem ser **multiplataforma** (Node scripts, `cross-env`); nada exclusivo de bash.
- Comandos principais: `pnpm install` · `pnpm dev` · `pnpm test` · `pnpm test:e2e` · `pnpm lint` · `pnpm check` · `pnpm build`.

## Ferramentas

- **Context7**: consulte a documentação atual antes de usar APIs de Three.js, SvelteKit, `@vite-pwa/sveltekit`, Workbox, Rapier. Não confie de memória.
- **Playwright**: valide visualmente cada marco em viewport de celular (390×844); verifique console sem erros.
- **Superpowers**: planeje por marco; TDD na `logic/`. A spec já está decidida — brainstorm curto, só para ambiguidades.

## Subagentes (`.claude/agents/`)

- `logica-puzzle` — regras, gerador, solver, desfazer (TDD).
- `render-3d` — cenas Three.js, materiais, animações, desempenho.
- `qa-mobile` — Vitest, Playwright, verificação visual e offline.
- `pwa-deploy` — service worker, manifest, offline, Vercel/nginx.
- `revisor` — revisão final de cada marco contra a spec.

Delegue a eles quando a tarefa for claramente do escopo de um; o agente principal coordena e integra.

## Fluxo de trabalho

- Trabalhe por **marcos** (seção 11 da spec). Ao fim de cada um: testes + lint + check verdes → verificação com Playwright → `revisor` → commit com mensagem clara → **pare** e diga ao Alex o que testar e como.
- Ambiguidade menor: escolha a opção mais simples, registre em `docs/DECISIONS.md`, siga.
- Ambiguidade que muda escopo ou é difícil de desfazer: pergunte antes.
- Commits pequenos e frequentes; nunca force push na `main`.

## Estilo

- Visual "brinquedo 3D": formas arredondadas, cores saturadas da paleta comum do `core`, animações com easing.
- Retrato, mobile-first, toques ≥ 44 px, modo daltônico (símbolo por cor).
- Mensagens ao usuário (UI) em linguagem simples, sem "por favor" e sem exclamação excessiva.
- Comunicação com o Alex em **português do Brasil**.
