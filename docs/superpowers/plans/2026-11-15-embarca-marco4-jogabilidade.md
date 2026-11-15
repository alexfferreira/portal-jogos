# Embarca — Marco 4 (jogabilidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a jogabilidade da Embarca: barra de power-ups (Desfazer, Vaga extra, Dica), aviso de "sem saída" por falta de solução, tutorial nas fases 1 e 2, sons nos momentos certos, confete na vitória e modo daltônico (símbolos nos veículos e na fila), nos três idiomas.

**Architecture:** Mesmo molde da Mistura: o `game.ts` orquestra `Session`, Worker e `Board`; o `Board` só anima. Tudo que dá para ser puro (roteiro do tutorial, pulso da mãozinha, posição dos símbolos) fica em módulos sem Three, testados em Node. O que depende de GL (mãozinha, anel da dica, confete, símbolos) é desenhado **deitado no plano XZ** (a câmera é de cima), com recursos liberados no `dispose`. O painel de "sem jogadas" do portal deixa de ser fixo no "tubo extra" e passa a receber do jogo qual é a ação extra.

**Tech Stack:** TypeScript strict, Three.js, SvelteKit (só o painel genérico), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-embarca-design.md` (seções 3, 7, 8 e 10, marco 4). Marcos 1 a 3 concluídos.

## Global Constraints

- `logic/` continua intocado (sem Three, DOM, Svelte, `Math.random`); tudo de tela fica em `games/embarca/src/render/`, `game.ts`, `meta.ts`.
- Nenhum texto visível fixo no código: tudo via i18n (pt-BR, en, es), sem "por favor" e sem exclamação.
- Sons só os do `core` (`click`, `pour`, `complete`, `win`, `error`); gráficos procedurais; nada de assets de terceiros.
- Power-ups por fase: Desfazer 5, Vaga extra 1, Dica 1 (`POWERUPS_PER_LEVEL`, já na `Session`).
- Dados de teste (`data-*`) só com `import.meta.env?.VITE_E2E === '1'`; nenhuma cor de veículo oculto aparece neles.
- Toda animação continua interrompível; `destroy()` seguro duas vezes e sem vazamento (geometrias, materiais, **texturas**, listeners).
- Usar um power-up durante a animação da última jogada **não** altera a fase vencida (como na Mistura): primeiro `board.finishAnimations()`, depois decidir.
- Comentários e mensagens em português do Brasil; identificadores em inglês; commits terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Entradas que a spec implica e nenhuma task testaria sozinha; cada linha tem o teste na task dona:

1. Usar Desfazer, Vaga extra ou Dica durante a animação da jogada vencedora: a fase continua vencida e o modal de conclusão aparece. Task 7.
2. Dica pedida e o jogador joga antes de a resposta chegar: a dica velha é descartada **sem gastar a carga**. Task 8.
3. Vaga extra seguida de Reiniciar, Desfazer ou próxima fase: o número de vagas do visual é sempre o do estado. Tasks 5 e 7.
4. Ligar ou desligar o modo daltônico no meio da partida, inclusive durante uma animação: símbolos aparecem e somem na hora, sem vazamento de textura. Task 10.
5. Tutorial: o jogador sai do roteiro (joga outro veículo): a mãozinha se refaz pelo Worker; a fase 3 não tem tutorial; "Próxima fase" antes de o confete acabar não deixa lixo nem callback atrasado. Tasks 9 e 11.

## Decisões do plano (para conferir)

- **A ação extra do painel de "sem jogadas" vem do jogo.** O evento `no-moves` ganha `extraId` e `extraLabelKey` (opcionais; sem eles vale o antigo "tubo extra" da Mistura). A Embarca manda `extraSlot` / "Vaga extra".
- **Modo daltônico:** o símbolo de cada cor aparece **no teto de todo veículo** (desenhado deitado, fora da seta) e **sobre cada passageiro da fila**, um pouco maiores que no modo normal. A fila continua toda visível.
- **Dica:** destaca com um anel pulsante sob o veículo sugerido e a mãozinha apontando para ele. Se não houver solução, abre o painel "sem saída"; se a busca estourar o tempo, avisa no HUD; nos dois casos não gasta a carga.
- **"Sem saída" por falta de solução:** depois de cada mudança de estado o jogo pergunta ao Worker (mesma chamada da dica); só `unsolvable` abre o painel (mesmo critério da Mistura). Não roda nas fases do tutorial.
- **Sons:** `click` ao tocar e ao estacionar, `complete` quando um veículo enche e parte, `error` na batida (no momento do impacto) e no balanço sem vaga, `win` na vitória. Não há som novo.
- **Confete** é um estouro que sai do centro do tabuleiro e se espalha **no plano** (de cima não se vê queda), com peças girando e sumindo.
- **Tutorial** só nas fases 1 e 2, com três textos curtos e a mãozinha no próximo veículo da solução (refeita pelo Worker se o jogador sair do roteiro).
- **`levelLoader`/cliente do Worker/`mixSeed` continuam duplicados** (extrair para o `core` no terceiro jogo). A mãozinha, o confete e os símbolos também são cópias adaptadas (deitadas) das da Mistura, pelo mesmo motivo.

---

## File Structure

| Arquivo                                                               | Responsabilidade                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/core/src/events.ts` (modificar)                             | `no-moves` com `extraId?` e `extraLabelKey?`                                             |
| `apps/portal/src/lib/noMoves.ts` (criar)                              | `noMovesExtraAction(e)` (padrão "tubo extra")                                            |
| `apps/portal/src/lib/GameHost.svelte` (modificar)                     | Painel usa a ação extra do evento                                                        |
| `games/embarca/src/meta.ts` (modificar)                               | Novos textos (3 idiomas)                                                                 |
| `games/embarca/src/render/effects.ts` (criar)                         | `handPulse` (puro), `Hand`, `HintRing`, `Confetti`                                       |
| `games/embarca/src/render/tutorial.ts` (criar)                        | Roteiro do tutorial (puro)                                                               |
| `games/embarca/src/render/symbols.ts` (criar)                         | Posição dos símbolos (puro) e atlas de símbolos                                          |
| `games/embarca/src/render/board.ts` (modificar)                       | `setHint`, `setHand`, `celebrate`, `setColorblind`, `sfx`, reconstrução com vagas extras |
| `games/embarca/src/render/vehicleView.ts`, `queueView.ts` (modificar) | Símbolos no modo daltônico                                                               |
| `games/embarca/src/game.ts` (modificar)                               | HUD, power-ups, dica, sem saída, tutorial, sons, confete                                 |
| `e2e/embarca.ts`, `e2e/embarca.spec.ts` (modificar)                   | Casos novos e achados `findDeadEndSequence`                                              |

---

### Task 1: Ação extra configurável no painel de "sem jogadas"

**Files:**

- Modify: `packages/core/src/events.ts`, `apps/portal/src/lib/GameHost.svelte`
- Create: `apps/portal/src/lib/noMoves.ts`
- Test: `apps/portal/src/lib/noMoves.test.ts`

**Interfaces:**

- Produces (`events.ts`): em `'no-moves'`, campos opcionais `extraId?: string` (id do power-up que o botão aciona) e `extraLabelKey?: string` (chave i18n do rótulo do botão). `canAddTube` continua significando "a ação extra está disponível".
- Produces (`noMoves.ts`): `interface NoMovesAction { id: string; labelKey: string }`; `function noMovesExtraAction(e: { extraId?: string; extraLabelKey?: string }): NoMovesAction` — sem campos devolve `{ id: 'extraTube', labelKey: 'nomoves.extraTube' }` (a Mistura); com campos devolve os do jogo; com só um dos dois, usa o padrão para o que faltar.

- [ ] **Step 1: Testes (falham).** `noMoves.test.ts`: sem campos → `{ id: 'extraTube', labelKey: 'nomoves.extraTube' }`; com `extraId: 'extraSlot'` e `extraLabelKey: 'embarca.powerup.extraSlot'` → esses dois; só `extraId` → `labelKey` padrão; só `extraLabelKey` → `id` padrão.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run apps/portal/src/lib/noMoves.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** `noMoves.ts`, os campos em `events.ts` e, no `GameHost.svelte`, guardar `extraId`/`extraLabelKey` no estado `noMoves` e usá-los no botão (`instance?.usePowerUp?.(action.id)` e `t(action.labelKey)`), mantendo o comportamento da Mistura.
- [ ] **Step 4: Rodar `pnpm test`; `pnpm check`; `pnpm lint`.** Expected: PASS (os e2e da Mistura cobrem que o painel antigo continua igual).
- [ ] **Step 5: Commit** — "Portal: ação extra configurável no painel de sem jogadas".

---

### Task 2: Textos novos (3 idiomas)

**Files:**

- Modify: `games/embarca/src/meta.ts`
- Test: `games/embarca/src/meta.test.ts` (acrescentar)

**Interfaces:**

- Produces: as chaves, em pt-BR, en e es (sem "por favor", sem exclamação):
  `embarca.powerup.undo` ("Desfazer"), `embarca.powerup.extraSlot` ("Vaga extra"), `embarca.powerup.hint` ("Dica"), `embarca.hint.limit` ("Não achei uma dica agora. Tente de novo."), `embarca.tutorial.tap` ("Toque em um veículo livre para mandá-lo para uma vaga."), `embarca.tutorial.queue` ("Os passageiros embarcam no veículo da mesma cor, na ordem da fila."), `embarca.tutorial.blocked` ("Um veículo com outro na frente bate e volta. Mande primeiro o que está livre.").

- [ ] **Step 1: Teste (falha).** Em `meta.test.ts`: as 7 chaves acima existem e são não vazias nos três idiomas (a igualdade de chaves e a regra de exclamação/"por favor" já são testadas).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/meta.test.ts` — Expected: FAIL.
- [ ] **Step 3: Escrever os textos** nos três idiomas (en e es equivalentes aos de pt-BR).
- [ ] **Step 4: Rodar `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: textos dos power-ups, da dica e do tutorial".

---

### Task 3: Mãozinha, anel da dica e confete (efeitos deitados)

**Files:**

- Create: `games/embarca/src/render/effects.ts`
- Test: `games/embarca/src/render/effects.test.ts`

**Interfaces:**

- Consumes: Three.js; `WorldPoint` de `./layout`; `Quality` não é necessário (materiais simples).
- Produces:
  - `const HAND_CYCLE = 1.6` (segundos) e `function handPulse(time: number): { press: number; alpha: number }` — puro: o ciclo aparece (alpha 0→1), pressiona (`press` cai a ~0,8 e volta) e some; `press` em `[0.7, 1]`, `alpha` em `[0, 1]`; periódico em `HAND_CYCLE`.
  - `class Hand { readonly object: Group; set(point: WorldPoint, press: number, alpha: number): void; hide(): void; dispose(): void }` — plano deitado (XZ) com a mãozinha desenhada num canvas (copiar o desenho de `games/mistura/src/render/effects.ts`, função `drawHand`), a **ponta do dedo** na posição `point`, altura 1,2 (acima dos veículos), `depthTest` desligado.
  - `class HintRing { readonly object: Mesh; show(center: WorldPoint, radius: number): void; update(time: number): void; hide(): void; dispose(): void }` — anel achatado (`RingGeometry` deitado) sob o veículo, que pulsa em escala e opacidade com `update(time)`.
  - `class Confetti { readonly object: Object3D; constructor(count: number); start(center: WorldPoint, colors: readonly number[]): void; update(dt: number): void; readonly done: boolean; dispose(): void }` — `InstancedMesh` de pedacinhos planos que saem do `center` em direções aleatórias **semeadas** (PRNG `createRng` do `core`, sem `Math.random`), giram, sobem um pouco em Y e somem; `done` é verdadeiro 2,2 s depois de `start`.

- [ ] **Step 1: Testes (falham).** `handPulse`: para `time` de 0 a 5 s em passos de 0,05, `press ∈ [0.7, 1]` e `alpha ∈ [0, 1]`; `handPulse(t)` igual a `handPulse(t + HAND_CYCLE)`; em algum instante do ciclo `press < 0.9` e em outro `alpha === 0`. `HintRing`: depois de `show({x: 2, z: 3}, 0.8)` o objeto está visível na posição; `hide()` esconde; `update(0)` e `update(0.5)` dão escalas diferentes e positivas; `dispose` idempotente (espie `BufferGeometry.prototype.dispose`/`Material.prototype.dispose`). `Confetti`: `start` deixa `done === false`; depois de `update` somando 2,3 s, `done === true` e o objeto invisível; com as mesmas entradas o estado de uma peça (posição depois de `update(0.5)`) é igual em duas instâncias (determinismo); `dispose` idempotente e libera geometria e material. `Hand`: `set({x:1,z:1}, 0.9, 1)` torna visível; `set(…, 0.9, 0)` esconde; `dispose` idempotente (a textura de canvas só existe no navegador: em Node o desenho do canvas fica atrás de `typeof document !== 'undefined'` e a mãozinha usa material liso).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/effects.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `effects.ts`.**
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: mãozinha, anel da dica e confete deitados".

---

### Task 4: Roteiro do tutorial (puro)

**Files:**

- Create: `games/embarca/src/render/tutorial.ts`
- Test: `games/embarca/src/render/tutorial.test.ts`

**Interfaces:**

- Consumes: `Move` de `../logic`.
- Produces:
  - `const TUTORIAL_LEVELS = 2`; `function hasTutorial(level: number): boolean` (`1 ≤ level ≤ 2`).
  - `interface TutorialStep { hand: number | null; message: string | null }` — `hand` = id do veículo para apontar; `message` = chave i18n.
  - `function tutorialStep(level: number, next: Move | null, parked: number): TutorialStep` — `next` = próxima jogada da solução a partir do estado atual (ou `null` se desconhecida/terminada); `parked` = quantos veículos estão estacionados esperando passageiros. Regras: fora do tutorial → `{ hand: null, message: null }`; fase 1: `message = 'embarca.tutorial.tap'` enquanto `parked === 0`, e `'embarca.tutorial.queue'` quando `parked > 0`; fase 2: `message = 'embarca.tutorial.blocked'`; `hand = next?.vehicle ?? null` nas duas.
  - `function followRoute(route: readonly Move[], played: Move): Move[] | null` — se `played` é a primeira jogada do roteiro devolve o resto; senão `null` (o jogador saiu do roteiro: recalcular pelo Worker).

- [ ] **Step 1: Testes (falham).** `hasTutorial`: 0 → falso, 1 e 2 → verdadeiro, 3 → falso. `tutorialStep`: fase 3 → `{ hand: null, message: null }`; fase 1 com `next = {vehicle: 4}` e `parked = 0` → `{ hand: 4, message: 'embarca.tutorial.tap' }`; fase 1 com `parked = 2` → mensagem `'embarca.tutorial.queue'`; fase 1 com `next = null` → `hand: null` e a mensagem mantida; fase 2 → `'embarca.tutorial.blocked'` com a mão no `next`. `followRoute`: `[{vehicle:1},{vehicle:0}]` com `{vehicle:1}` → `[{vehicle:0}]`; com `{vehicle:3}` → `null`; rota vazia → `null`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/tutorial.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `tutorial.ts`.**
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: roteiro do tutorial".

---

### Task 5: Board — dica, mãozinha, confete, sons e vagas extras

**Files:**

- Modify: `games/embarca/src/render/board.ts`
- Test: `games/embarca/src/render/board.test.ts` (acrescentar)

**Interfaces:**

- Consumes: `Hand`, `HintRing`, `Confetti`, `handPulse`, `HAND_CYCLE` de `./effects`; `paletteColor` do `core`.
- Produces (em `Board`): `setHint(vehicleId: number | null): void` (anel sob o veículo; `null` esconde); `setHand(vehicleId: number | null): void` (mãozinha tocando no centro do veículo, animada por `handPulse`; `null` esconde); `celebrate(): void` (estouro de confete no centro do tabuleiro, com as cores dos veículos da fase; some sozinho e se descarta no `dispose`/`setLevel`); `get hasHint(): boolean`; `get slotCount(): number` (vagas mostradas no momento).
- `BoardOptions` ganha `sfx?(name: 'click' | 'complete' | 'error'): void` e `BoardStage` passa a incluir `'onFrame'` (para animar mão, anel e confete a cada quadro).
- Comportamento: `sfx('click')` quando um veículo termina de estacionar (fim do `drive`); `sfx('complete')` no começo de cada `depart`; `sfx('error')` no instante do impacto do `bump` (em `forwardDuration`) e no começo do `shake`. `setState` e `setLevel` apagam dica e mão. `setState` com **número de vagas diferente do visual** reconstrói a cena (como `setLevel` com `computeLayout(level, state.slots.length)`), para a vaga extra e o reinício voltarem a 4.

- [ ] **Step 1: Testes (falham)** com o `FakeStage` do teste atual (acrescentar `onFrame` guardando os callbacks, avançados por `stage.frame(dt)` que também chama `tweens.update(dt)`):
  - `setHint(2)` torna visível um anel na posição de `toWorld` do veículo 2 (`board.hasHint === true`); `setHint(null)` esconde; depois de `playMove` terminado, `hasHint === false` (qualquer mudança de estado apaga a dica);
  - `setHand(2)` mostra a mão no centro do veículo e, após `stage.frame(0.4)` a pose muda (`alpha`/`press` do `handPulse`); `setHand(null)` esconde;
  - `celebrate()` adiciona um objeto à cena; depois de 2,5 s de `frame()` o objeto sai da cena (`scene.children` volta ao número anterior); `celebrate()` seguido de `setLevel` ou `dispose` não deixa objetos nem lança;
  - **sons:** `playMove` do carro cor 0 que embarca e parte: o `sfx` registra `click` e depois `complete`, nessa ordem, cada um uma vez; bate-e-volta longe: `sfx('error')` **não** toca antes de `forwardDuration` e toca uma vez depois; `no-slot` toca `error` uma vez;
  - **vaga extra:** `setState` com `addSlot(state)` (5 vagas) reconstrói: `stage.boundsCalls` ganha uma chamada e `board.slotCount` passa de 4 para 5; `setState` do estado inicial (4 vagas) volta a 4; os veículos continuam nas posições certas e `viewString()` mostra 5 vagas e depois 4 (`s:-,-,-,-,-` e `s:-,-,-,-`);
  - `dispose` libera os efeitos (geometrias espiadas ≥ criadas) e `scene.children` fica vazio.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/board.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** em `board.ts`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: dica, mãozinha, confete, sons e vagas extras no tabuleiro".

---

### Task 6: Símbolos do modo daltônico (posição pura e atlas)

**Files:**

- Create: `games/embarca/src/render/symbols.ts`
- Test: `games/embarca/src/render/symbols.test.ts`

**Interfaces:**

- Consumes: `VEHICLE_SPECS`, `VehicleKind` de `../logic`; `PALETTE` do `core`.
- Produces:
  - `interface SymbolSpot { x: number; z: number; y: number; size: number }` e `function vehicleSymbolSpot(kind: VehicleKind): SymbolSpot` — posição do símbolo no teto, em coordenadas locais do veículo (X ao longo do comprimento, Z na largura, Y a altura do teto), **dentro** do retângulo do veículo e **fora** da área da seta (a seta ocupa de −0,22 a 0,26 em X no centro da cabine, largura 0,3 em Z; o símbolo não pode sobrepor essa caixa), com `size ≥ 0.3`. A altura `y` fica acima da superfície que está sob o símbolo: a da cabine se a caixa do símbolo estiver sobre a cabine, a do corpo (capô ou porta-malas) se estiver fora dela.
  - `const QUEUE_SYMBOL_SIZE = 0.3` (maior que a bolinha, que é de 0,24 de diâmetro).
  - `interface SymbolAtlas { geometries: PlaneGeometry[]; texture: CanvasTexture; dispose(): void }` e `function createSymbolAtlas(cell = 128): SymbolAtlas` — um plano (UV recortado) por símbolo da `PALETTE` (índice = cor); desenho em canvas **copiado de `games/mistura/src/render/symbols.ts`** (as formas e o contorno); só existe no navegador (usa `document`).

- [ ] **Step 1: Testes (falham).** `vehicleSymbolSpot` para `car`, `van` e `bus`: `|x| ≤ length/2/1000 − size/2` e `|z| ≤ width/2/1000 − size/2` (dentro do veículo); a caixa do símbolo (`x ± size/2`, `z ± size/2`) **não sobrepõe** a caixa da seta (centro da cabine `cabinShift × length`, ver `LOOKS` em `vehicleView.ts`: exporte `LOOKS` e `ARROW_BOX` para o teste, com `ARROW_BOX = { halfLength: 0.24, halfWidth: 0.15 }` somados ao centro da cabine); `size ≥ 0.3`; `y` acima da cabine se a caixa do símbolo sobrepõe a cabine (centro `cabinShift × length`, comprimento `cabinLength × length`) e acima do corpo caso contrário; `QUEUE_SYMBOL_SIZE ≥ 0.3`. O atlas só é verificado no e2e (Task 11).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/symbols.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `symbols.ts`** (copiando de `games/mistura/src/render/symbols.ts` o desenho das formas e adaptando a API; `LOOKS` e `ARROW_BOX` exportados de `vehicleView.ts`).
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: posição e atlas dos símbolos do modo daltônico".

---

### Task 7: Jogo — HUD, Desfazer e Vaga extra

**Files:**

- Modify: `games/embarca/src/game.ts`
- Test: `e2e/embarca.spec.ts` (acrescentar; o `game.ts` só é exercitado pelo e2e, como na Mistura)

**Interfaces:**

- Consumes: `Session` (`undo`, `addSlot`, `remaining`, `canUndo`, `stuck`), `Board` (`setState`, `finishAnimations`), `sfx` do `Board`.
- Produces: `emitHud` com `powerUps: [{ id: 'undo', labelKey: 'embarca.powerup.undo', icon: 'undo', count, disabled: locked || !session.canUndo }, { id: 'extraSlot', labelKey: 'embarca.powerup.extraSlot', icon: 'plus', count, disabled: locked }, { id: 'hint', labelKey: 'embarca.powerup.hint', icon: 'bulb', count, disabled: locked || hintPending }]` (`locked = won || busy`); `usePowerUp(id)`: `board.finishAnimations()`; ignora se `busy || won`; `'undo'`: `session.undo()` → `board.setState(out.state)`; `'extraSlot'`: `session.addSlot()` → `board.setState(out.state)`; ambos chamam `stateChanged()` (versão + HUD + dados) e `updateStuck()`; `no-moves` passa a mandar `canUndo: session.canUndo && remaining.undo > 0`, `canAddTube: remaining.extraSlot > 0`, `extraId: 'extraSlot'`, `extraLabelKey: 'embarca.powerup.extraSlot'`. O `Board` toca os sons (`sfx: (n) => ctx.audio.play(n)`); o `game.ts` toca `click` ao tocar num veículo e `win` na vitória, e **não** toca mais `error` (agora é do `Board`, no impacto). `data-slots` publica o número de vagas.

- [ ] **Step 1: e2e (falham).** Em `e2e/embarca.spec.ts`: (a) a barra mostra três botões `powerup-undo` (5), `powerup-extraSlot` (1), `powerup-hint` (1) com os rótulos "Desfazer", "Vaga extra", "Dica"; Desfazer começa desabilitado; (b) jogar um veículo e usar Desfazer: `data-state` volta ao anterior, o contador cai para 4, `data-view` coincide com o estado; (c) Vaga extra: `data-slots` passa de 4 para 5, o contador vai a 0 e o botão desabilita; Reiniciar volta a `data-slots = 4` e devolve a carga; (d) **foco 3:** Vaga extra, depois Desfazer de uma jogada anterior mantém 5 vagas (a carga já foi gasta); (e) **foco 1:** usar Desfazer, Vaga extra e Dica (um por teste) **durante** a animação da última jogada da fase 1 não impede o modal "Fase concluída" e `data-won` continua `true`; (f) o painel "Sem jogadas" (sequência de `findStuckSequence`) mostra os botões **Desfazer** e **Vaga extra** (nessa ordem, com esses nomes) e, ao usar "Vaga extra", o painel fecha e `data-slots` é 5.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm test:e2e e2e/embarca.spec.ts --project=build` — Expected: os casos novos FALHAM.
- [ ] **Step 3: Implementar** em `game.ts` (e a leitura de `ctx.audio.play` para o `sfx` do `Board`).
- [ ] **Step 4: Rodar o e2e da Embarca e `pnpm test`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: barra de power-ups com Desfazer e Vaga extra".

---

### Task 8: Jogo — Dica e "sem saída" por falta de solução

**Files:**

- Modify: `games/embarca/src/game.ts`, `e2e/embarca.ts`
- Test: `e2e/embarca.spec.ts` (acrescentar)

**Interfaces:**

- Consumes: `client.hint(state)` (`status`, `move`), `CancelledError`, `Board.setHint`, `Board.setHand`.
- Produces: no `game.ts`, o mesmo esqueleto da Mistura (`games/mistura/src/game.ts`: `requestHint`, `checkDeadEnd`, `showNoMoves`, `closeNoMoves`, `stuckReason`, `hintNoteKey`, `version`/`epoch`). `requestHint`: ignora se `hintPending` ou sem carga; descarta a resposta se `version`/`epoch` mudaram **sem gastar a carga**; `move` nulo com `unsolvable` abre o painel "sem saída", com `limit` mostra `embarca.hint.limit` no HUD (apagado na próxima mudança de estado); com `move`, gasta a carga, chama `board.setHint(move.vehicle)` e `data-hint`. `checkDeadEnd` roda depois de cada mudança de estado fora do tutorial e fora de uma dica pendente; só `unsolvable` abre o painel (`reason: 'unsolvable'`, com Desfazer e Vaga extra conforme as cargas); o painel fica aberto enquanto a nova checagem responde (sem piscar) e fecha em `solved`/`limit`; fase nova e reinício fecham. `data-hint` = id do veículo da dica ou vazio.
- Produces (`e2e/embarca.ts`): `findDeadEndSequence(from = 3, to = 40, playouts = 300, maxMoves = 14): StuckSetup | null` — igual a `findStuckSequence`, mas procura uma sequência de jogadas legais que termina numa posição **não travada e sem solução** (`!isStuck(state) && hint(state).status === 'unsolvable'`), a mais curta, fases a partir da 3 (o tutorial não checa).

- [ ] **Step 1: e2e (falham).** (a) **Dica:** clicar em `powerup-hint`: `data-hint` vira o id do primeiro veículo de `generateLevel(level).solution` e o contador cai a 0; jogar qualquer veículo apaga `data-hint`; (b) **foco 2:** clicar na dica e tocar num veículo **antes** de a resposta chegar (rápido, sem esperar) não gasta a carga se a dica for descartada (`powerup-hint-count` continua 1 quando `data-hint` está vazio); (c) **sem saída:** com `findDeadEndSequence`, depois da última jogada o painel "Sem saída" abre sozinho com **Desfazer**, **Vaga extra** e **Reiniciar** (nessa ordem); "Vaga extra" fecha o painel sem piscar (ou reabre sem o botão "Vaga extra" se a posição continuar sem solução); (d) pedir **Dica** numa posição sem solução abre o mesmo painel e não gasta a carga; (e) nas fases 1 e 2 nenhuma checagem abre o painel.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm test:e2e e2e/embarca.spec.ts --project=build` — Expected: os casos novos FALHAM.
- [ ] **Step 3: Implementar** `game.ts` e `findDeadEndSequence`.
- [ ] **Step 4: Rodar o e2e da Embarca e `pnpm test`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: dica e aviso de sem saída por falta de solução".

---

### Task 9: Jogo — Tutorial

**Files:**

- Modify: `games/embarca/src/game.ts`
- Test: `e2e/embarca.spec.ts` (acrescentar)

**Interfaces:**

- Consumes: `hasTutorial`, `tutorialStep`, `followRoute` de `./render/tutorial`; `Board.setHand`; `client.hint(state)` para refazer o roteiro.
- Produces: no `game.ts`: `route: Move[] | null` (a solução de `GeneratedLevel.solution` nas fases 1 e 2, `null` nas demais); a cada mudança de estado, `route = followRoute(route, move)` e, se `null` nas fases de tutorial, `ensureRoute()` refaz pelo Worker (`client.hint(session.state)` → `res.moves`, descartado se a versão mudou); `currentStep = tutorialStep(level, route?.[0] ?? null, parkedWaiting)` define `board.setHand(step.hand)` e a mensagem do HUD (`hud.message`); a dica (`activeHint`) tem prioridade sobre a mãozinha; vitória e fase de tutorial acabada apagam a mão; `data-hand` = id apontado ou vazio.

- [ ] **Step 1: e2e (falham).** (a) **Fase 1:** `hud-message` mostra "Toque em um veículo livre para mandá-lo para uma vaga." e `data-hand` é o primeiro veículo da solução; (b) depois da primeira jogada da solução, `data-hand` passa ao segundo; quando houver veículo estacionado esperando, a mensagem passa a ser "Os passageiros embarcam no veículo da mesma cor, na ordem da fila."; (c) **foco 5:** jogar um veículo **fora** da solução faz `data-hand` mudar para o próximo veículo de uma solução recalculada (espere com `expect.poll`), sem erro no console; (d) **fase 2** mostra "Um veículo com outro na frente bate e volta. Mande primeiro o que está livre."; (e) **fase 3** não mostra mensagem nem mão (`data-hand` vazio, `hud-message` vazio); (f) a mão some quando a dica é pedida (a dica tem prioridade) e na vitória.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm test:e2e e2e/embarca.spec.ts --project=build` — Expected: os casos novos FALHAM.
- [ ] **Step 3: Implementar** no `game.ts`.
- [ ] **Step 4: Rodar o e2e da Embarca e `pnpm test`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: tutorial das fases 1 e 2".

---

### Task 10: Modo daltônico no tabuleiro

**Files:**

- Modify: `games/embarca/src/render/vehicleView.ts`, `games/embarca/src/render/queueView.ts`, `games/embarca/src/render/board.ts`, `games/embarca/src/game.ts`
- Test: `e2e/embarca.spec.ts` (acrescentar), `games/embarca/src/render/queueView.test.ts` e `board.test.ts` (acrescentar o que roda em Node)

**Interfaces:**

- Consumes: `createSymbolAtlas`, `vehicleSymbolSpot`, `QUEUE_SYMBOL_SIZE` de `./symbols`; `ctx.settings` (`colorblind`).
- Produces: `Board.setColorblind(on: boolean): void` e `Board.visibleSymbols(): number` (veículos no tabuleiro e nas vagas + passageiros ainda na fila, **só** quando ligado; senão 0); `VehicleAssets`/`createVehicleView` aceitam um símbolo opcional no teto (plano deitado, dentro de `vehicleSymbolSpot`); `QueueView.setColorblind(on)` desenha um símbolo (plano deitado, `QUEUE_SYMBOL_SIZE`) sobre cada passageiro, um `InstancedMesh` por símbolo, escondendo os que já embarcaram como a cápsula. O atlas é criado só na primeira vez que o modo liga (não custa nada desligado), liberado no `dispose`/`setLevel`; em Node (sem `document`) `setColorblind(true)` não faz nada e não lança. O `game.ts` chama `board.setColorblind(ctx.settings.get().colorblind)` no início e a cada mudança (`ctx.settings.subscribe`); `data-symbols` publica `visibleSymbols()`.

- [ ] **Step 1: Testes (falham).** Node (`board.test.ts`): `setColorblind(true)` sem `document` não lança e `visibleSymbols()` é 0; `setColorblind(false)` idem. e2e: (a) ligar "Modo daltônico" em Configurações e abrir a Embarca: `data-symbols` = nº de veículos da fase + nº de passageiros (por exemplo, fase 1: 4 + 16); desligado: 0; (b) **foco 4:** com o jogo aberto, ligar e desligar o modo (pela página de Configurações e voltando) e, depois de ligar, jogar um veículo: `data-symbols` cai pelos passageiros que embarcaram e o veículo que partiu; (c) entrar e sair do jogo com o modo ligado 3 vezes mantém `data-textures` igual da 2ª entrada em diante (o atlas é liberado).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render` e `pnpm test:e2e e2e/embarca.spec.ts --project=build` — Expected: os casos novos FALHAM.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar o e2e da Embarca e `pnpm test`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: modo daltônico com símbolos nos veículos e na fila".

---

### Task 11: Vitória com confete, vazamentos e verificação final

**Files:**

- Modify: `games/embarca/src/game.ts`, `e2e/embarca.spec.ts`, `docs/DECISIONS.md`

**Interfaces:**

- Consumes: `Board.celebrate`.
- Produces: `win()` chama `board.celebrate()` e toca `win`; o `level-complete` continua 0,8 s depois; "Próxima fase" ou Reiniciar antes de o confete acabar não deixa lixo (o `Board` descarta o confete em `setLevel`/`setState`/`dispose`).

- [ ] **Step 1: e2e (falham).** (a) completar a fase 1: o modal "Fase concluída" aparece sem erros no console e `data-won` é `true` (o confete não bloqueia o toque do botão); (b) **foco 5:** clicar em "Próxima fase" imediatamente (antes de 2,2 s) e depois de 3 s `data-moving` é `0`, sem erros; (c) **vazamento dentro da mesma montagem** (resolve o menor adiado do marco 3): jogar Vaga extra e Reiniciar 5 vezes seguidas na mesma partida e conferir que `data-geometries` e `data-textures` a partir da 2ª volta são iguais à da 1ª (reconstruir a cena não vaza), repetindo com o modo daltônico ligado; (d) o screenshot final em 390×844 de cada situação nova: `embarca-dica`, `embarca-tutorial`, `embarca-daltonico`, `embarca-sem-saida` (em `test-results/`).
- [ ] **Step 2: Rodar e ver o resultado.** Run: `pnpm test:e2e e2e/embarca.spec.ts --project=build` — Expected: os casos novos falham até `win()` chamar o confete e o resto estar correto; depois PASS.
- [ ] **Step 3: Implementar** o que faltar (chamada do confete na vitória) e olhar os screenshots (legibilidade da fila, da mãozinha, do anel, dos símbolos).
- [ ] **Step 4: Registrar em `docs/DECISIONS.md`** a seção "Embarca — Marco 4": a ação extra configurável do painel (`extraId`/`extraLabelKey`); o critério da dica e do "sem saída" (iguais aos da Mistura, só `unsolvable` avisa); os sons e em que instante tocam; o confete deitado e semeado; o tutorial (textos, roteiro, mãozinha refeita pelo Worker); o modo daltônico (símbolo no teto e na fila, atlas sob demanda); o leak test dentro da mesma montagem; as cópias adaptadas da mãozinha/confete/símbolos (extrair para o `core` no terceiro jogo); o que ficou **fora** do marco 4 (veículo misterioso, garagem, obstáculos, guindaste e embaralhar são do marco 5; medir fps no celular real continua pendente).
- [ ] **Step 5: Verificação completa.** Run: `pnpm test`, `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm test:e2e` (suíte inteira) — Expected: tudo verde; testes da Mistura, do PWA e do orçamento de tamanho intactos (ajustar o orçamento se o jogo passar do teto, com `Ruling`).
- [ ] **Step 6: Commit** — "Embarca: vitória com confete, vazamentos e decisões do marco 4".
- [ ] **Step 7: Revisão e parada (CLAUDE.md).** Chamar o subagente `revisor` sobre o diff do marco; aplicar o que for problema real; **parar** e dizer ao Alex como testar no celular: abrir a prévia da Vercel, jogar as fases 1 e 2 seguindo a mãozinha, usar Desfazer, Vaga extra e Dica, provocar um beco sem saída, ligar o modo daltônico em Configurações e completar uma fase vendo o confete.

---

## Self-Review

- **Spec coverage (seções 7, 8 e 10, marco 4):** HUD e power-ups Desfazer, Vaga extra e Dica com cargas (Tasks 5, 7, 8); painel "sem saída" por falta de solução (8) e por falta de jogadas com Vaga extra (1, 7); tutorial (4, 9); sons (5, 7, 11); modo daltônico com símbolo nos veículos e na fila (6, 10); i18n nos três idiomas (2); vitória com confete (3, 5, 11); verificação em 390×844 e vazamentos (11). Fora, como a spec manda: veículo misterioso, garagem, obstáculos, guindaste e embaralhar (marco 5).
- **Tipos consistentes:** `no-moves.extraId/extraLabelKey` (Task 1) usados em 7 e 8; `Hand`/`HintRing`/`Confetti`/`handPulse` (3) usados em 5; `TutorialStep`/`tutorialStep`/`followRoute` (4) em 9; `SymbolSpot`/`vehicleSymbolSpot`/`createSymbolAtlas`/`QUEUE_SYMBOL_SIZE` (6) em 10; `Board.setHint/setHand/celebrate/setColorblind/visibleSymbols/sfx` (5 e 10) em 7 a 11; ids de power-up `undo`, `extraSlot`, `hint` iguais no HUD (7), no painel (1, 7) e nos testes.
- **Proporção:** o plano descreve contratos, regras e testes; o código de cada efeito 3D e do `game.ts` fica com o implementador, exceto o que os contratos não determinam.
