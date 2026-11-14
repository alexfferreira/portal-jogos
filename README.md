# Recreio

Portal pessoal de jogos casuais: sem anúncios, sem login, sem rastreamento, funciona offline (PWA). Primeiro jogo: **Mistura** (ordenar líquidos em tubos).

Especificação completa: [PROMPT-portal-jogos.md](PROMPT-portal-jogos.md) · Regras do projeto: [CLAUDE.md](CLAUDE.md) · Decisões: [docs/DECISIONS.md](docs/DECISIONS.md) · Próximos jogos: [docs/GAMES.md](docs/GAMES.md)

## Requisitos

- Node.js 20.19 ou mais novo
- pnpm (`npm install -g pnpm`)

## Comandos

| Comando         | O que faz                                     |
| --------------- | --------------------------------------------- |
| `pnpm install`  | Instala as dependências                       |
| `pnpm dev`      | Servidor de desenvolvimento do portal         |
| `pnpm build`    | Gera o site estático em `apps/portal/build`   |
| `pnpm preview`  | Serve o build gerado                          |
| `pnpm test`     | Testes unitários (Vitest)                     |
| `pnpm test:e2e` | Testes de ponta a ponta (Playwright, 390×844) |
| `pnpm lint`     | ESLint + Prettier (verificação)               |
| `pnpm format`   | Formata o código com Prettier                 |
| `pnpm check`    | Verificação de tipos (tsc / svelte-check)     |

Na primeira vez, rode também `pnpm exec playwright install chromium`.

## Estrutura

```
apps/portal/      SvelteKit (adapter-static): portal, HUD, menus
packages/core/    base comum: palco 3D, storage, i18n, áudio, configurações
packages/ui/      componentes Svelte compartilhados
games/mistura/    jogo 1 (src/logic em TS puro, src/render em Three.js)
docs/             DECISIONS.md e GAMES.md
e2e/              testes Playwright
```

Observação: `pnpm test:e2e` faz o build sozinho. Se já houver um `preview` na porta 4173, o teste reaproveita esse servidor, que pode estar com build antigo.
