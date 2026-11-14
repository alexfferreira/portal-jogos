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

## Marco 3 — Portal

- **2026-11-14 · Perda de contexto WebGL:** o palco chama `preventDefault()` no `webglcontextlost` (sem isso o navegador não restaura), pausa o loop e, ao voltar, retoma. O three.js recria sozinho geometrias, texturas, programas e render targets (`onContextRestore`); o palco só marca os materiais para recompilar e redesenha. O `GameContext` converte isso nos eventos `graphics-lost` e `graphics-restored`. Se o contexto não voltar em 4 s, o portal oferece "Recarregar jogo" (remonta o jogo; o estado da fase em andamento se perde, o progresso salvo não). Validado no e2e com `WEBGL_lose_context`.
- **2026-11-14 · Limpeza automática do `GameContext`:** `settings.subscribe` e `i18n.subscribe` do contexto são rastreados, e os palcos criados por `ctx.createStage` também. `ctx.dispose()` (chamado pelo `destroy` da instância devolvida por `Core.mountGame`) desfaz tudo na ordem inversa, limpa `events` e é idempotente. `ctx.onDestroy(fn)` registra limpezas extras. Falha no `mount` ou no `destroy` do jogo também limpa. Jogos devem ser montados por `core.mountGame`, não chamando `module.mount` direto.
- **2026-11-14 · `ctx.createStage` agora é assíncrono** (`Promise<Stage>`): o Three.js é importado sob demanda e fica fora do bundle inicial (início: ~118 KB de JS; ao abrir o jogo carregam ~559 KB). Exige `sideEffects: false` em `core` e `games/*`.
- **2026-11-14 · Metadados leves por jogo** (`@recreio/game-mistura/meta`): o portal lista cartões e traduções sem carregar o código do jogo; o módulo vem por `import()` ao abrir a rota. Registro de jogos em `apps/portal/src/lib/games.ts`.
- **2026-11-14 · Contrato do HUD:** o jogo descreve `hud` (fase e power-ups) por evento; o portal desenha a barra e chama `instance.usePowerUp(id)`. `instance.next()` avança a fase depois do modal "Fase concluída".
- **2026-11-14 · Mistura provisória:** `games/mistura` reaproveita a cena de demonstração do core (12 cubos; a fase "termina" com 12 toques) só para validar HUD, power-ups, modal e progresso. Será substituída nos marcos 4 e 5. A rota `/demo` foi removida.
- **2026-11-14 · Fonte Nunito (Variable)** via `@fontsource-variable/nunito`, licença SIL OFL 1.1 (livre, arredondada, embutida no build para funcionar offline).
- **2026-11-14 · UI compartilhada (`@recreio/ui`):** Svelte 5 com fontes `.svelte` exportadas direto (condição `svelte`), tokens em `theme.css`. Botões "brinquedo" com sombra inferior; o interruptor tem o botão inteiro com 44 px de altura (a área de toque é o próprio botão, não um pseudo-elemento).
- **2026-11-14 · Instalação:** aviso discreto na tela inicial. Android usa `beforeinstallprompt` (só aparece com PWA instalável, marco 6); iPhone mostra "Compartilhar → Adicionar à Tela de Início" explicando o risco de apagarem o progresso. "Agora não" persiste no storage.
- **2026-11-14 · Importar backup recarrega a página** depois de 1,2 s para aplicar configurações e serviços já carregados (pendência do marco 2 resolvida pelo caminho simples).
- **2026-11-14 · Confirmação de reset é um modal do app** (nunca `window.confirm`); o e2e garante que nenhum diálogo nativo abre.
- **2026-11-14 · Rotas:** `/`, `/jogo/[id]` (uma página pré-renderizada por jogo, ids desconhecidos mostram aviso) e `/configuracoes`.
- **2026-11-14 · Qualidade ao vivo e materiais:** `setQuality` muda pixel ratio e sombras e recompila os materiais, mas **não troca** `MeshPhysicalMaterial` por `MeshStandardMaterial`; a versão simples dos materiais só vale no próximo mount (como o antialias). Se um jogo precisar trocar ao vivo, ele refaz os materiais ao ouvir `ctx.settings`.
- **2026-11-14 · Aviso de gráficos presos só conta com a aba visível** e recomeça a contagem ao voltar: no celular o contexto cai em segundo plano e só volta quando o app reaparece.
- **2026-11-14 · Modal:** o fundo fica `inert` enquanto aberto, o foco inicial é configurável (`initialFocus`) e os modais destrutivos (apagar progresso, importar backup) abrem com o foco em "Cancelar". Importar backup também pede confirmação, porque substitui o progresso.
- **2026-11-14 · Seletor segmentado** usa botões com `aria-pressed` (não `role=radio`, que exigiria navegação por setas).
- **2026-11-14 · Estado entregue ao IndexedDB não pode ser proxy do Svelte:** dados que vão para o storage usam `$state.raw` (bug achado pelo e2e do backup).
- **2026-11-14 · Nome do jogo:** o título visível é "Mistura" (provisório, conforme a seção 0 da spec); "Mistura de cores" fica como descrição da mecânica.

## Marco 4 — Mistura: lógica

- **2026-11-14 · Paleta limita as cores a 12.** A spec (6.2) pede 11–14 cores nas fases tardias, mas a `PALETTE` tem 12 cores e não inventamos novas. `levelConfig` usa `min(cores, 12)`: fases 101–150 têm 11 cores e da 151 em diante 12. **Ponto para o Alex decidir:** ampliar a paleta para 14 cores bem distinguíveis (com símbolos) ou manter 12.
- **2026-11-14 · Modelo de estado:** `State = { capacity, tubes }`, cada tubo é uma lista de `Unit { color, hidden }` da base ao topo. Estado imutável e serializável (JSON/structured clone). A cor real de unidades ocultas fica no estado; a UI deve escondê-la enquanto `hidden` for verdadeiro. Invariante: o topo de cada tubo é sempre revelado (`createState` e `applyMove` garantem).
- **2026-11-14 · `applyMove` não lança:** devolve `{ ok: true, state, moved, color, revealed, completed }` ou `{ ok: false, reason, state }`. `revealed` e `completed` servem de dica para o render animar. O render nunca recalcula regra.
- **2026-11-14 · Camadas ocultas:** o bloco do topo é formado só por unidades visíveis de mesma cor; para no primeiro "?" (o jogador não sabe a cor dele). Ao tirar o bloco, a unidade exposta é revelada. Um tubo que se completa (cheio de uma cor) revela todas as suas unidades. `isWin` considera a cor real, ignorando o flag `hidden`.
- **2026-11-14 · Dica e solver usam o estado completo** (cores reais das camadas ocultas), não só o que o jogador vê. É a opção mais simples; as jogadas sugeridas respeitam as regras reais (por exemplo, nunca tratam um "?" como parte do bloco). Consequência aceita: a dica pode sugerir uma jogada que "adivinha" a cor oculta certa. É só 1 dica por fase.
- **2026-11-14 · Solver:** `solveSearch` no core é best-first guloso (heap com desempate LIFO ≈ DFS), memoização por chave canônica (tubos ordenados), limite de nós e de tempo (relógio injetável). Não garante solução mínima, só uma válida; esgotar o espaço prova que é insolúvel. Heurística da Mistura: unidades acima do prefixo uniforme da base + camadas ocultas. Poda: tubo puro → vazio, saída de tubo completo, e entre puros da mesma cor só do menor para o maior.
- **2026-11-14 · Determinismo vs. tempo:** o gerador limita a validação **só por nós** (60 000 por tentativa), nunca por tempo, para a mesma fase dar a mesma fase em qualquer aparelho. O limite de tempo existe apenas na dica (2 s) e como opção de `generateLevel`.
- **2026-11-14 · Variação de semente:** variação 0 usa semente = número da fase; a variação k usa `mixSeed(fase, k)` (hash de 32 bits). O resultado traz `variation`, `seed` e a `solution` encontrada. Máximo de 64 variações; depois disso lança erro. A configuração da fase (cores, capacidade, ocultas) depende só da fase, não da variação.
- **2026-11-14 · Curva:** 1–2: 3 cores; 3–5: 4; 6–30: 5→7 (a cada 9 fases); 31–100: 8→10 (a cada 24); 101+: 11→12. Sempre 2 tubos vazios. Capacidade 5 em ~25% das fases acima de 100. Camadas ocultas em ~50% das fases a partir da 40, com 30%→70% das unidades não-topo ocultas (sobe 1 ponto percentual a cada 4 fases). Capacidade é única por fase.
- **2026-11-14 · Estado trivial:** o embaralhamento é refeito se algum tubo ficar uniforme ou se houver mais pares adjacentes iguais que 1,6× o esperado.
- **2026-11-14 · Power-ups (`Session`):** desfazer 5, tubo extra 1, dica 1 por fase. Só jogadas válidas entram na pilha; desfazer sem histórico não gasta carga. O tubo extra não entra na pilha e **sobrevive ao desfazer** (se o estado restaurado tem menos tubos, completa com vazios). Reiniciar é ilimitado, volta ao estado inicial e devolve todas as cargas.
- **2026-11-14 · Worker:** `handleRequest` (puro, nunca lança) é compartilhado pelo Worker (`logic.worker.ts`) e pelo fallback. O cliente `createLogicClient` descarta pedidos obsoletos do mesmo tipo (rejeita com `CancelledError` e ignora a resposta tardia), aceita `AbortSignal`, recria o worker após falha e usa o handler na thread principal (import dinâmico) quando não há `Worker`. O worker não é interrompido no meio de uma busca; só o resultado é descartado. Vite empacota o worker (verificado com build isolado); como o portal ainda não importa o cliente, o `pnpm build` do portal não o inclui.
- **2026-11-14 · Orçamento medido (200 primeiras fases, máquina de desenvolvimento):** média ~2 ms, pior ~40 ms (fase 197, ~2 200 nós), média ~210 nós; todas na variação 0. O teste usa tetos folgados (pior < 1,5 s, média < 300 ms) para não ser instável.

### Correções do review do marco 4

- **2026-11-14 · Subpath `@recreio/core/puzzle`** (`src/puzzle/index.ts`): exporta só `createRng`, `PALETTE`/`paletteColor`, `UndoStack` e `solveSearch` com tipos, sem three, idb-keyval, áudio, palco nem demo. `games/mistura/src/logic` e `src/worker` importam só dele. Build isolado do worker: o chunk `logic.worker` tem ~7,1 KB (o `handler`, carregado sob demanda no fallback, ~7,0 KB) e não contém three nem idb.
- **2026-11-14 · Cliente do Worker com fila própria:** só um pedido vai ao worker por vez. Cancelar/substituir um pedido na fila apenas o descarta; cancelar o pedido em execução chama `worker.terminate()` e o próximo pedido recria o worker (uma busca obsoleta não bloqueia as seguintes). `messageerror` rejeita o pedido em voo e recria o worker; `onerror` rejeita tudo. Fallback sem Worker: o pedido em voo cancelado só tem o resultado descartado.
- **2026-11-14 · Contrato de cancelamento:** pedido novo com a mesma chave cancela o anterior, que rejeita com `CancelledError` (o chamador deve tratar). Chave: `hint` para dicas e `generate:<fase>` para geração; gerar a fase N+1 não cancela a N.
- **2026-11-14 · `HintResult.state`:** a dica traz o estado de origem; o chamador a descarta se o estado atual mudou.
- **2026-11-14 · `Session.undo` devolve `rehidden`:** unidades que voltaram a "?" (restaurado oculto e atual visível na mesma posição), para o render animar. Vale também ao desfazer a jogada que completou um tubo (as unidades reveladas por ele voltam a "?").
- **2026-11-14 · Entradas do jogo:** `@recreio/game-mistura` (index) exporta só meta/messages/misturaGame; a lógica fica em `@recreio/game-mistura/logic` e o cliente do worker em `@recreio/game-mistura/worker`. O portal segue importando `/meta` e o index por `import()`.
- **2026-11-14 · `solveSearch` só lê o relógio quando há `maxMillis`.** O teste das 200 fases agora afirma que nenhuma precisou de variação > 0, que há capacidade 5 e camadas ocultas nas fases 101–200 e camadas ocultas em parte das 40–100.

### Paleta de 14 cores (decisão do Alex, 2026-11-14)

- A paleta global passou de 12 para **14 cores** (acrescentadas `charcoal` `#2f3640` ♣ e `sky` `#6ecbf5` ✦), para a Mistura chegar às 11–14 cores da spec. Teste novo exige distância RGB ≥ 60 entre quaisquer duas cores.
- Curva final de cores: 101–150 → 11; 151–200 → 12; 201–250 → 13; **251 em diante → 14**. Fases 201–300 (amostra) validadas pelo solver com replay independente.
- Os símbolos do modo daltônico são caracteres Unicode; no marco 5 serão desenhados como formas vetoriais (não dependem de fonte do aparelho).
