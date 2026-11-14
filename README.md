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
| `pnpm preview`  | Preview do Vite (sem fallback SPA)            |
| `pnpm serve`    | Serve o build com fallback SPA e cabeçalhos   |
| `pnpm test`     | Testes unitários (Vitest)                     |
| `pnpm test:e2e` | Testes de ponta a ponta (Playwright, 390×844) |
| `pnpm lint`     | ESLint + Prettier (verificação)               |
| `pnpm format`   | Formata o código com Prettier                 |
| `pnpm check`    | Verificação de tipos (tsc / svelte-check)     |
| `pnpm icons`    | Regenera ícones e manifest (`brand.json`)     |

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

Observação: `pnpm test:e2e` faz o build sozinho e nunca reaproveita um servidor já aberto na porta 4173.

## Testes e2e

`pnpm test:e2e` sobe o site estático (porta 4173) e o dev server (porta 5174) e roda dois projetos do Playwright: `build` (suíte completa) e `dev` (smoke do Worker contra o `vite dev`). Para rodar só um: `pnpm exec playwright test --project=dev`.

## PWA e offline

O portal é um PWA: depois da primeira visita (com internet) tudo funciona sem conexão. O service worker (`apps/portal/src/service-worker/`) guarda o portal inteiro e todos os jogos; uma versão nova só entra quando o jogador toca em **Atualizar** no aviso.

- **Nome, cores e ícones:** edite `apps/portal/brand.json` e rode `pnpm icons` (usa o Chromium do Playwright; sem arte externa). Isso regrava os PNGs, o favicon e o `manifest.webmanifest` em `apps/portal/static/`; commite o resultado.
- **`pnpm serve` é só para teste local, não para produção.**
- **Testar offline no desktop:** `pnpm build && pnpm serve`, abra http://127.0.0.1:4173 no Chrome e espere carregar (não use `pnpm preview` para isso: o preview do Vite não serve o `200.html`, e o service worker não instala). Em DevTools > Application > Service Workers o status deve ser "activated". Marque "Offline" (ou desligue a rede) e recarregue. Para instalar, use o ícone de instalar na barra de endereço.
- **Hospedagem:** o app assume a RAIZ do domínio (Vercel/nginx); subcaminho não é suportado.
- **Dev:** o service worker fica desligado em `pnpm dev` para não confundir o cache. Para ligá-lo, suba com `VITE_SW_DEV=1 pnpm dev` (em dev o pré-cache fica vazio; para testar offline de verdade use `pnpm serve`).
- **Testar no celular:** instalar um PWA exige HTTPS; use o preview HTTPS da hospedagem (veja docs/DECISIONS.md, Marco 6). No iPhone, use Compartilhar > Adicionar à Tela de Início.
- Os e2e (`e2e/pwa-offline.spec.ts`) cobrem registro do SW, jogo offline, aba nova offline, progresso, manifest, instalabilidade e o aviso de nova versão.
