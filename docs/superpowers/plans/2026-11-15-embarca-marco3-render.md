# Embarca — Marco 3 (render 3D, toque e entrada no portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a Embarca jogável no celular: tabuleiro 3D com veículos, vagas e fila de passageiros, toque para enviar veículos, animações (sair, bater e voltar, estacionar, embarcar, partir) e entrada no portal (cartão, rota, progresso).

**Architecture:** Mesmo molde da Mistura. A decisão de cada jogada é da `logic` (`Session`); o render só anima e depois reconcilia com o estado. Tudo que dá para ser puro (posições no mundo, picking, planos de animação, distância de contato) fica em `render/layout.ts` e `render/plan.ts`, testado sem WebGL. As peças 3D são procedurais (Three.js), com geometrias compartilhadas e liberadas no `destroy`. O `game.ts` orquestra Worker, sessão, tabuleiro e eventos do portal.

**Tech Stack:** TypeScript strict, Three.js 0.187 (via `@recreio/core`), SvelteKit (só o registro no portal), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-embarca-design.md` (seções 3, 7, 8 e 10, marco 3). Marcos 1 e 2 concluídos: `docs/superpowers/plans/2026-11-15-embarca-marco{1-logica,2-gerador}.md`.

## Global Constraints

- `logic/` continua sem Three.js/DOM/Svelte; todo o código novo de render fica em `games/embarca/src/render/` (e `game.ts`, `levelLoader.ts`, `meta.ts`).
- Nenhum texto visível fixo no código: tudo via i18n (pt-BR padrão, en, es), sem "por favor" e sem exclamação excessiva.
- Gráficos procedurais; sons sintetizados do `core` (`click`, `error`, `win`); nada de assets de terceiros.
- Câmera `ortho-top` do `core`, retrato; toque tratado por picking **próprio** em coordenadas do tabuleiro (ver Task 1), com raio de 22 px em volta do toque (alvo efetivo de 44 px).
- 1 unidade do mundo = 1000 milésimos da lógica; mapeamento `X = (x − W/2)/1000`, `Z = −(y − H/2)/1000 + deslocamento` (a câmera `ortho-top` tem `up = −Z`, então o `y` da lógica sobe na tela).
- Dados de teste no canvas (`data-*`) só quando `import.meta.env?.VITE_E2E === '1'`.
- `destroy()` seguro de chamar duas vezes e sem vazamento de geometrias, materiais, texturas e listeners.
- Comentários e mensagens em português do Brasil; identificadores em inglês; commits terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Entradas que a spec implica e nenhuma task testaria sozinha; cada linha tem o teste na task dona:

1. Tocar durante uma animação: ela termina na hora, o toque ainda vale e o visual coincide com o estado. Tasks 5 e 8.
2. Tocar entre dois veículos, na borda do tabuleiro, nas vagas ou na fila: sem erro; vale o veículo certo ou nenhum. Task 1.
3. Redimensionar ou girar a tela no meio da partida: enquadramento e picking usam o tamanho atual. Tasks 1 e 8.
4. Entrar e sair do jogo várias vezes: nenhuma geometria ou textura a mais. Task 8.
5. Trocar de fase ou reiniciar com animação em andamento: callbacks atrasados são descartados e o estado fica consistente. Tasks 6 e 8.

## Decisões do plano (para conferir)

- **Câmera de cima (`ortho-top`), não inclinada.** A spec pedia "ortográfica inclinada", mas o `core` só tem de cima no plano XZ. De cima o picking casa exatamente com a lógica 2D e o visual ainda é 3D (corpo, cabine, rodas, sombras). Inclinar é um acabamento posterior.
- **Alvo de toque de 44 px por picking generoso, não por tamanho.** O menor veículo (carro, 600 de largura num tabuleiro de 6000) fica com ~32–39 px na tela de 390 px; o requisito de 44 px da spec é cumprido pelo raio de 22 px do picking (regra da spec: dentro do retângulo vale; fora, vale o centro mais próximo dentro do raio; empate, o mais à frente). Os tamanhos dos veículos estão fixos desde o marco 1.
- **Vitória e "sem jogadas" mínimos já aqui:** o jogo emite `level-complete` e `no-moves` (só com Reiniciar) para ser jogável de ponta a ponta. HUD de power-ups, dica, tutorial, painel "sem saída" por falta de solução, sons de vitória/derrota, modo daltônico e confete são do marco 4.
- **`levelLoader.ts` e o cliente do Worker duplicados da Mistura** (já registrado em `DECISIONS.md`: extrair para o `core` no terceiro jogo).

---

## File Structure

Em `games/embarca/src/`:

| Arquivo                 | Responsabilidade                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `render/layout.ts`      | Mundo, enquadramento, posições das vagas e da fila, `pickVehicle`, `contactDistance` (puro) |
| `render/plan.ts`        | Plano de animação de uma jogada (puro)                                                      |
| `render/vehicleView.ts` | Veículo 3D procedural (geometrias compartilhadas, cor da paleta, seta)                      |
| `render/queueView.ts`   | Fila de passageiros (`InstancedMesh`) e voo de embarque                                     |
| `render/slotsView.ts`   | Vagas e indicadores de assentos                                                             |
| `render/board.ts`       | Monta a cena, `setState`, `playMove`, `finishAnimations`, `pick`, `dispose`                 |
| `levelLoader.ts`        | Carregador de fases com pré-geração (cópia adaptada da Mistura)                             |
| `meta.ts`               | `meta`, `messages` (3 idiomas), `EMBARCA_ID`                                                |
| `game.ts`               | `embarcaGame: GameModule`                                                                   |
| `index.ts`              | Exporta `embarcaGame`, `meta`, `messages`, `EMBARCA_ID`                                     |
| `*.test.ts`             | Testes ao lado de cada arquivo                                                              |

Fora do pacote: `apps/portal/src/lib/games.ts`, `packages/ui/src/Icon.svelte`, `apps/portal/package.json`, `apps/portal/src/lib/messages.test.ts`, `e2e/embarca.spec.ts`, `e2e/embarca.ts`.

---

### Task 1: Layout puro e picking

**Files:**

- Create: `games/embarca/src/render/layout.ts`
- Test: `games/embarca/src/render/layout.test.ts`

**Interfaces:**

- Consumes: de `../logic`: `Level`, `Vehicle`, `VEHICLE_SPECS`, `rectsOverlap`, `type Rect`, `sin`, `cos`, `TRIG_SCALE`.
- Produces:
  - `const UNIT = 1000`; `const SLOT_HEIGHT = 2.6`; `const QUEUE_SPACING = 0.26`; `const PICK_RADIUS_PX = 22`
  - `interface WorldPoint { x: number; z: number }`
  - `interface Layout { width: number; depth: number; board: { cx: number; cz: number; width: number; depth: number }; slots: { x: number; z: number; width: number }[]; queue: { x0: number; z0: number; cols: number; rows: number; count: number }; toWorld(x: number, y: number): WorldPoint; slotCenter(index: number): WorldPoint; queuePoint(index: number): WorldPoint }`
  - `function computeLayout(level: Level, slotCount?: number): Layout` — pilha vertical centrada em (0,0): tabuleiro (altura `H/1000`), folga 0,5, linha de vagas (altura `SLOT_HEIGHT`, `slotCount` células iguais na largura do tabuleiro), folga 0,4, painel da fila (`cols = floor((W/1000 − 0.4) / QUEUE_SPACING)`, `rows = ceil(count / cols)`, altura `rows × QUEUE_SPACING + 0.3`, fila da esquerda para a direita e de cima para baixo). `width` = largura do tabuleiro + 0,6; `depth` = soma das alturas e folgas. `toWorld(x, y)` aplica o mapeamento `X = (x − W/2)/1000`, `Z = boardCz − (y − H/2)/1000`.
  - `interface PickView { width: number; height: number; halfWidth: number; halfHeight: number }` (tamanho do canvas em px e meio-frustum da câmera em unidades do mundo; `halfWidth/halfHeight` iguais a `fitOrthographic(bounds, width/height)` do `core`)
  - `function pickVehicle(level: Level, onBoard: readonly number[], layout: Layout, view: PickView, px: number, py: number): number | null` — converte o toque em px para coordenadas do tabuleiro; se está dentro do retângulo de algum veículo em `onBoard`, devolve esse; senão, o de centro mais próximo cuja distância em px (convertida pela escala da câmera) seja ≤ `PICK_RADIUS_PX`; empate: o de maior `cz` (mais "à frente", mais embaixo na tela); `null` se nenhum.
  - `function contactDistance(level: Level, vehicleId: number, blockers: readonly number[], onBoard: readonly number[], maxTravel: number): number` — maior deslocamento (milésimos, 0..`maxTravel`) ao longo da seta antes de o retângulo do veículo tocar um bloqueador ou obstáculo (bisecção com `rectsOverlap`, 14 passos, resultado inteiro).

- [ ] **Step 1: Testes (falham).**
  - `computeLayout`: para a fase do cenário (`scenarioLevel()` de `../logic/testkit`): `layout.width` = 10 + 0,6; `toWorld(5000, 5000)` = `{x: 0, z: board.cz}`; `toWorld(0, 10000).x` = −5 e `toWorld(10000, 0).x` = 5; `toWorld(x, y+1000).z` é 1 menor que `toWorld(x, y).z` (y da lógica sobe na tela); `slots` tem 4 itens com larguras iguais e `x` crescente; `queue.cols × queue.rows ≥ queue.count`; `queue.count` = 40; `queuePoint(0)` é o canto superior esquerdo do painel e `queuePoint(1).x − queuePoint(0).x` = `QUEUE_SPACING`; o conteúdo cabe: `board.cz ± board.depth/2`, as vagas e a fila ficam dentro de `±depth/2`, e nada se sobrepõe verticalmente. Com `slotCount = 5` há 5 vagas.
  - `pickVehicle` com `view = { width: 390, height: 800, ...}` calculado para o layout: toque no centro de um veículo livre → esse id; toque 10 px fora da borda do retângulo → o mesmo id (dentro do raio); toque a mais de 22 px de todos (ex.: canto vazio do tabuleiro) → `null`; veículo fora de `onBoard` nunca é devolvido (nem com toque exato); toque entre dois veículos equidistantes → o de maior `cz`; toque nas vagas e na fila (fora do tabuleiro) → `null`; **foco 3:** o mesmo ponto do mundo tocado com `view` de 390×800 e de 800×390 (aspecto trocado, `halfWidth/halfHeight` recalculados) devolve o mesmo veículo.
  - `contactDistance`: carro em `(1000,1000,0°)` com outro carro em `(5000,1000,0°)`: contato em `5000 − 1000 − 1200 = 2800` (frente a frente: metade do comprimento de cada um); com obstáculo `{cx:5000,cy:1000,w:600,h:600}`: `5000 − 300 − 600 − 1000 = 3100`; sem bloqueador até `maxTravel` devolve `maxTravel`; sempre inteiro e `0 ≤ d ≤ maxTravel`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/layout.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `layout.ts`.**
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `pnpm --filter @recreio/game-embarca check`; `pnpm lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: layout puro, picking e distância de contato".

---

### Task 2: Plano de animação puro

**Files:**

- Create: `games/embarca/src/render/plan.ts`
- Test: `games/embarca/src/render/plan.test.ts`

**Interfaces:**

- Consumes: `MoveApplied`, `MoveRejected`, `State` de `../logic`; `Layout`, `WorldPoint`, `contactDistance`, `UNIT` de `./layout`.
- Produces:
  - `interface PathPoint { x: number; z: number; heading: number }` (`heading` = ângulo da lógica em radianos, anti-horário na tela; é o `rotation.y` do veículo; a direção de avanço no mundo é `(cos heading, −sin heading)` em (X, Z))
  - `type Step =
| { kind: 'drive'; vehicle: number; path: PathPoint[]; duration: number; delay: number }
| { kind: 'board'; passenger: number; vehicle: number; slot: number; from: WorldPoint; to: WorldPoint; duration: number; delay: number }
| { kind: 'depart'; vehicle: number; slot: number; path: PathPoint[]; duration: number; delay: number }
| { kind: 'bump'; vehicle: number; forward: number; blockers: number[]; duration: number; delay: number }
| { kind: 'shake'; vehicle: number; duration: number; delay: number }`
  - `interface MovePlan { steps: Step[]; total: number }` (`total` = maior `delay + duration`)
  - `function planMove(before: State, result: MoveApplied | MoveRejected, layout: Layout): MovePlan`
  - Constantes exportadas: `DRIVE_SPEED = 12` (unidades/s na perna reta), `PARK_DURATION = 0.45`, `BOARD_DURATION = 0.22`, `BOARD_STAGGER = 0.06`, `DEPART_DURATION = 0.4`, `BUMP_DURATION = 0.3`, `SHAKE_DURATION = 0.25`, `MAX_BUMP_TRAVEL = 1.2` (unidades).
- Regras: **aplicada** → `drive` (perna reta ao longo da seta até fora do tabuleiro, depois curva suave até o centro da vaga `result.slot` com a frente para cima na tela; `duration = max(0.25, retaLen/DRIVE_SPEED) + PARK_DURATION`, `delay 0`); para cada `Boarding` um `board` do ponto da fila (`layout.queuePoint(passenger)`) ao centro da vaga, com `delay = driveEnd + índice × BOARD_STAGGER` limitado a `driveEnd + 0,6`; para cada `Departure` um `depart` (do centro da vaga até fora da tela pela direita), com `delay` = fim do último `board` daquele veículo. **Recusada** `'blocked'` → `bump` (`forward = min(contactDistance(...)/UNIT, MAX_BUMP_TRAVEL)`, `blockers` = `blockedBy`); `'no-slot'` → `shake`; `'unknown-vehicle'` → plano vazio (`steps: []`, `total: 0`).

- [ ] **Step 1: Testes (falham).** Fase do cenário e `computeLayout`: (a) aplicada com carro cor 0 (4 embarques e partida): 1 `drive` com `path[0]` no centro do veículo (`layout.toWorld`) e último ponto no centro da vaga 0; 4 `board` com `delay` crescente a partir de `drive.duration`, todos de `queuePoint(0..3)` para o centro da vaga 0; 1 `depart` com `delay` ≥ o último `board`; `total` = maior `delay + duration`; (b) sem embarque: só `drive`; (c) **perna reta** sai pela borda: o ponto do fim da reta está fora de `layout.board` na direção do `heading`; (d) bloqueada: um `bump` com `forward ≤ 1,2` e `blockers` = `blockedBy`; `forward` menor que 1,2 quando o contato está mais perto (use um bloqueador a ~0,5 de distância); (e) `no-slot` → `shake`; `unknown-vehicle` → `{ steps: [], total: 0 }`; (f) um ônibus com 10 embarques: `total ≤ 2,2` (o escalonamento é limitado); (g) determinismo (`toEqual` entre duas chamadas).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/plan.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `plan.ts`** (curva: Bézier quadrática ou cúbica amostrada em ≥ 12 pontos, `heading` pela tangente).
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: plano de animação das jogadas".

---

### Task 3: Veículo 3D procedural

**Files:**

- Create: `games/embarca/src/render/vehicleView.ts`
- Test: `games/embarca/src/render/vehicleView.test.ts`

**Interfaces:**

- Consumes: `createToyMaterial`, `PALETTE`/`paletteColor` de `@recreio/core`; `VEHICLE_SPECS` de `../logic`; Three.js (`three`, `three/addons/geometries/RoundedBoxGeometry.js` se disponível, senão `BoxGeometry`).
- Produces:
  - `class VehicleAssets` — fábrica com cache por tipo: `geometry(kind)` devolve as geometrias compartilhadas (corpo arredondado, cabine, roda, seta); `material(color: number, quality)` cacheado por cor; `dispose(): void` libera tudo (idempotente); `readonly stats: { geometries: number; materials: number }`.
  - `function createVehicleView(assets: VehicleAssets, vehicle: Vehicle, quality: Quality): Group` — grupo com o corpo (comprimento `length/UNIT` ao longo de +X local, largura `width/UNIT` em Z, altura 0,45 para carro/0,6 van/0,75 ônibus), cabine e janelas, 4 rodas (6 no ônibus) e uma seta achatada no teto apontando para +X; `userData.vehicleId` e `userData.kind`; **orientação:** `group.rotation.y = vehicle.angle` em radianos (o eixo local +X vira `(cos a, 0, −sin a)` no mundo, que é a direção de avanço).
  - `function setVehicleHeading(group: Group, heading: number): void` (`rotation.y = heading`) e `function placeVehicle(group: Group, p: WorldPoint, heading: number, lift?: number): void` (posição `(p.x, lift ?? 0, p.z)` e rotação).

- [ ] **Step 1: Testes (falham).** Em Node (Three roda sem WebGL): para cada tipo, `Box3` do grupo tem comprimento ≈ `length/1000` (±0,05) em X e largura ≈ `width/1000` em Z (±0,05) com `rotation.y = 0`; `userData.vehicleId`/`kind` corretos; criar 10 carros e 4 vans com o mesmo `VehicleAssets` mantém `assets.stats.geometries` ≤ 4 por tipo (geometrias compartilhadas, não uma por veículo); materiais por cor: duas cores iguais → mesmo material; `assets.dispose()` chama `dispose` em todas as geometrias e materiais (espie `BufferGeometry.prototype.dispose` e `Material.prototype.dispose`) e uma segunda chamada não lança; **orientação:** com `angle = 90°`, `new Vector3(1,0,0).applyEuler(group.rotation)` ≈ `(0, 0, −1)` e com `angle = 0` ≈ `(1, 0, 0)` (a direção de avanço é `(cos a, −sin a)` em XZ); `placeVehicle` coloca em `(x, lift, z)` e define a rotação.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/vehicleView.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `vehicleView.ts`** (visual "brinquedo": cantos arredondados, cores saturadas da paleta; sem texturas).
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: veículos 3D procedurais".

---

### Task 4: Fila e vagas

**Files:**

- Create: `games/embarca/src/render/queueView.ts`, `games/embarca/src/render/slotsView.ts`
- Test: `games/embarca/src/render/queueView.test.ts`, `games/embarca/src/render/slotsView.test.ts`

**Interfaces:**

- Consumes: `Layout`, `WorldPoint` de `./layout`; `Level`, `State`, `Slot` de `../logic`; `createToyMaterial`, `paletteColor`; Three.js.
- Produces:
  - `class QueueView { readonly object: Object3D; constructor(layout: Layout, colors: readonly number[], quality: Quality); setProgress(queueIndex: number): void; flyer(passenger: number): Mesh; recycleFlyer(m: Mesh): void; dispose(): void }` — um `InstancedMesh` de cápsulas (raio ≈ 0,09) com cor por instância; `setProgress(k)` esconde (escala 0) as instâncias `< k`; `flyer` devolve uma cápsula avulsa com a cor do passageiro para a animação de embarque (reutilizável).
  - `class SlotsView { readonly object: Object3D; constructor(layout: Layout, level: Level, quality: Quality); setSlots(slots: readonly (Slot | null)[]): void; pipPoint(slot: number, seat: number): WorldPoint; dispose(): void }` — placas arredondadas planas por vaga e, abaixo de cada vaga, `seats` indicadores (esfera achatada): cheios com a cor do passageiro, vazios cinza; vaga livre mostra só a placa; `setSlots` também recebe vagas extras (`slots.length` maior que o inicial acrescenta uma placa).

- [ ] **Step 1: Testes (falham).** `QueueView`: com `colors` de 40 passageiros e o layout do cenário, a instância `i` está na posição de `layout.queuePoint(i)`; `setProgress(5)` deixa as instâncias 0..4 com escala 0 e as demais com escala 1; `setProgress(0)` restaura todas; a cor de cada instância é a da paleta do passageiro (`InstancedMesh.getColorAt`); `dispose` libera geometria/material e é idempotente; `flyer(3)` tem a cor do passageiro 3. `SlotsView`: 4 placas nas posições `layout.slotCenter(i)`; `setSlots([{vehicle: 0, filled: 2}, null, null, null])` pinta 2 indicadores cheios e `seats − 2` vazios na vaga 0 (assentos do veículo 0 vêm do `level`); `setSlots` com 5 vagas cria a 5ª placa; `pipPoint(0, 0)` está dentro da largura da vaga 0; `dispose` idempotente.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/queueView.test.ts games/embarca/src/render/slotsView.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar os dois arquivos.**
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: fila de passageiros e vagas".

---

### Task 5: Tabuleiro (cena, animações e reconciliação)

**Files:**

- Create: `games/embarca/src/render/board.ts`
- Test: `games/embarca/src/render/board.test.ts`

**Interfaces:**

- Consumes: tudo de `./layout`, `./plan`, `./vehicleView`, `./queueView`, `./slotsView`; `Stage` e `Tweens` de `@recreio/core`; `Level`, `State`, `MoveApplied`, `MoveRejected` de `../logic`; Three.js. Leia `games/mistura/src/render/board.ts` (estrutura, `finishAnimations`, tratamento de `onContextRestored`, `diagnostics`) e `packages/core/src/tween.ts` (API de `Tweens`).
- Produces: `class Board { constructor(opts: BoardOptions); setLevel(level: Level, state: State): void; setState(state: State): void; playMove(before: State, result: MoveApplied | MoveRejected, after: State, onDone: () => void): void; finishAnimations(): void; pick(px: number, py: number): number | null; get animating(): boolean; viewString(): string; screenBoxes(): { id: number; x: number; y: number; w: number; h: number }[]; setQuality(q: Quality): void; dispose(): void }` e `interface BoardOptions { stage: Stage; quality: Quality; diagnostics: boolean; onAnimating?(animating: boolean): void; onLayout?(boxes: { id: number; x: number; y: number; w: number; h: number }[]): void; sfx?(name: 'click' | 'error'): void }`.
- Comportamento: `setLevel` (fase nova) recria veículos/fila/vagas, chama `stage.setBounds({ width: layout.width, depth: layout.depth })` e publica `onLayout`; `setState` sincroniza tudo **sem animar** (posições dos veículos em `onBoard`, vagas e progresso da fila); `playMove` toca o plano de `planMove` com `stage.tweens` (veículo anda ao longo do caminho; `bump` anda `forward` e volta; `shake` balança; `board` voa uma cápsula da fila para a vaga e acende um indicador; `depart` leva o veículo para fora) e, ao fim (`total`), reconcilia com `setState(after)` e chama `onDone` **uma vez**; `finishAnimations()` conclui na hora todos os tweens (estado final visual = `after`) e chama `onDone` pendente; `pick` usa `pickVehicle` com o tamanho atual do canvas (`stage.size`) e o meio-frustum atual; `viewString()` descreve o visual no formato `b:<ids dos veículos visíveis no tabuleiro, crescentes, separados por vírgula>|s:<id do veículo mostrado em cada vaga, ou - se livre, separados por vírgula>|q:<número de passageiros já escondidos da fila>` (por exemplo `b:0,2,3|s:1,-,-,-|q:4`); sem `diagnostics` não publica nada além de `onAnimating`/`onLayout`. `dispose` é idempotente e libera `VehicleAssets`, fila, vagas e listeners; contexto WebGL restaurado refaz o que for de GPU como na Mistura.

- [ ] **Step 1: Testes (falham).** Com um `Stage` falso mínimo (`scene: new Scene()`, `camera: new OrthographicCamera()`, `tweens: new Tweens()` avançado manualmente, `size`, `onResize`/`onFrame`/`setBounds` registrando chamadas, `canvas` simples) e a fase do cenário: `setLevel` cria 6 veículos na cena e chama `setBounds` com o `layout.width/depth`; `setState` do estado inicial coloca cada veículo no centro de `toWorld(cx, cy)` com o heading certo; **foco 1:** `playMove` do carro livre e depois `finishAnimations()` → `viewString()` igual ao de `setState(after)` e `onDone` chamado exatamente uma vez, `animating` falso; tocar de novo durante a animação (`finishAnimations()` antes da próxima jogada) não corrompe o visual; jogada bloqueada (`bump`): depois da animação o veículo está na posição original e `viewString()` igual ao de antes; `pick` devolve o veículo certo para um toque no centro dele (calcule o px com `screenBoxes()`) e `null` num canto vazio; **foco 5:** `setLevel` com animação em andamento descarta `onDone` pendente da fase antiga (não é chamado) e o visual é o da fase nova; `dispose` duas vezes não lança, e o número de geometrias liberadas (espiando `dispose`) cobre as criadas.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/render/board.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `board.ts`.** Iluminação e sombras vêm do palco do `core`; o chão do tabuleiro é uma placa arredondada clara com borda; luz e câmera não são criadas aqui.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: tabuleiro 3D com animações".

---

### Task 6: Jogo (`game.ts`), carregador de fases e metadados

**Files:**

- Create: `games/embarca/src/meta.ts`, `games/embarca/src/levelLoader.ts`, `games/embarca/src/game.ts`, `games/embarca/src/index.ts`
- Test: `games/embarca/src/levelLoader.test.ts`, `games/embarca/src/meta.test.ts`
- Modify: `games/embarca/package.json` (exports `"."` e `"./meta"`)

**Interfaces:**

- Consumes: `Session`, `GeneratedLevel`, `Move`, `State`, `isWin`, `visibleColor` de `./logic`; `createLogicClient`, `CancelledError`, `LogicClient` de `./worker`; `Board` de `./render/board`; `completeLevel`, `GameInstance`, `GameModule`, `HudState` de `@recreio/core`. Leia `games/mistura/src/game.ts` e `games/mistura/src/levelLoader.ts` e siga o mesmo esqueleto (epoch/version para descartar callbacks atrasados, `busy`, `won`, `paused`, `destroyed`, `failedTarget`/`errorKey`).
- Produces:
  - `meta.ts`: `EMBARCA_ID = 'embarca'`; `meta: GameMeta` (`titleKey: 'embarca.title'`, `descriptionKey: 'embarca.description'`, `icon: 'bus'`, `mode: 'levels'`, `orientation: 'portrait'`); `messages: Record<Locale, Dictionary>` com as chaves `embarca.title`, `embarca.description`, `embarca.canvas.label`, `embarca.error.generate` nos três idiomas (pt-BR: "Embarca", "Mande os veículos na ordem certa.", "Tabuleiro de estacionamento com veículos e fila de passageiros", "Não foi possível criar a próxima fase. Toque em Reiniciar para tentar de novo."; en e es equivalentes, sem "por favor" e sem exclamação).
  - `levelLoader.ts`: `createLevelLoader(source: LevelSource, options?)`, `LevelSource`, `LoadResult`, `LevelLoader` — cópia de `games/mistura/src/levelLoader.ts` trocando o tipo `GeneratedLevel` pelo da Embarca (mesma API: `load`, `prefetch`, `invalidate`).
  - `game.ts`: `embarcaGame: GameModule` — `mount` cria o cliente do Worker, o palco (`ctx.createStage(container, { camera: 'ortho-top', bounds: { width: 6.6, depth: 14 } })`), lê o progresso (`ctx.storage.loadLevels()`), gera a fase atual, monta `Board` e `Session`; `onTap` → `board.finishAnimations()` → se `busy`/`won` ignora → `board.pick` → `session.move`; aplicada: `ctx.audio.play('click')`; recusada `blocked`/`no-slot`: `ctx.audio.play('error')` e `ctx.haptics.tap(40)`; `playMove` e, no `onDone`, vitória → grava progresso (`completeLevel` + `saveLevels`) e, depois de 0,8 s, emite `level-complete`; sem jogadas → emite `no-moves { stuck: true, canUndo: false, canAddTube: false, reason: 'stuck' }` (e `stuck: false` ao reiniciar); HUD: `emit('hud', { level, powerUps: [] })`; `restart()`, `next()`, `pause()`, `resume()`, `destroy()` como na Mistura (`usePowerUp` fica sem efeito neste marco); canvas com `role="img"` e `aria-label` traduzido; `data-*` de teste só com `VITE_E2E`: `data-level`, `data-state` no formato `b:<ids no tabuleiro>|s:<veículo:ocupados por vaga, ou ->|q:<índice>/<total>` (por exemplo `b:0,2,3|s:1:2,-,-,-|q:4/40`; **cor de veículo oculto nunca aparece**, use `visibleColor` se a cor entrar no texto), `data-view` (`board.viewString()`), `data-moving`, `data-won`, `data-bumps`, `data-vehicles` (JSON de `board.screenBoxes()` arredondado a 0,1 px).
  - `index.ts`: `export { messages, meta, EMBARCA_ID } from './meta'; export { embarcaGame } from './game';`.

- [ ] **Step 1: Testes (falham).** `meta.test.ts`: as chaves de `messages` são idênticas nos três idiomas; nenhum texto contém `!` nem "por favor"/"please"; `meta.mode === 'levels'`. `levelLoader.test.ts`: portar `games/mistura/src/levelLoader.test.ts` (cliente falso que falha, resultado obsoleto, pré-geração) trocando só o tipo da fase.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/meta.test.ts games/embarca/src/levelLoader.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `meta.ts`, `levelLoader.ts`, `game.ts`, `index.ts` e os `exports` do `package.json`.** O `game.ts` só é exercitado pelo e2e (Task 8), como o da Mistura.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `pnpm --filter @recreio/game-embarca check`; `pnpm lint`.** Expected: PASS e sem erros de tipo.
- [ ] **Step 5: Commit** — "Embarca: jogo, carregador de fases e metadados".

---

### Task 7: Entrada no portal

**Files:**

- Modify: `apps/portal/src/lib/games.ts`, `apps/portal/package.json` (dependência `@recreio/game-embarca: workspace:*`), `packages/ui/src/Icon.svelte` (ícone `bus`), `apps/portal/src/lib/messages.test.ts`
- Test: `apps/portal/src/lib/messages.test.ts`, `apps/portal/src/lib/games.test.ts` (criar se não existir)

**Interfaces:**

- Consumes: `messages`, `meta`, `EMBARCA_ID` de `@recreio/game-embarca/meta`; `embarcaGame` de `@recreio/game-embarca`.
- Produces: segunda entrada em `games` (`id: EMBARCA_ID`, `load: async () => (await import('@recreio/game-embarca')).embarcaGame`); ícone `bus` no `Icon.svelte` (traço simples de ônibus visto de lado, mesmo estilo dos outros: `stroke`, 24×24).

- [ ] **Step 1: Testes (falham).** `messages.test.ts`: a Embarca tem as mesmas chaves nos três idiomas e nenhum texto dela tem `!` (siga o padrão do teste da Mistura). `games.test.ts`: `games` tem 2 entradas com ids únicos (`mistura`, `embarca`); `findGame('embarca')` existe; os `messages` de todo jogo cobrem `titleKey` e `descriptionKey` nos três idiomas.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run apps/portal/src/lib` — Expected: FAIL.
- [ ] **Step 3: Implementar:** `pnpm install` (a dependência nova), registro, ícone.
- [ ] **Step 4: Rodar `pnpm test`; `pnpm check`; `pnpm lint`.** Expected: PASS (os testes do service worker continuam verdes: o novo Worker entra no pré-cache pelo build).
- [ ] **Step 5: Commit** — "Embarca: entrada no portal".

---

### Task 8: Verificação no navegador (Playwright, 390×844)

**Files:**

- Create: `e2e/embarca.ts`, `e2e/embarca.spec.ts`
- Test: `e2e/embarca.spec.ts`

**Interfaces:**

- Consumes: `collectErrors`, `seedLevel` (adaptar para a chave `recreio:progress:embarca`: criar `seedEmbarcaLevel`), `canvasData` de `e2e/helpers.ts`; `generateLevel`, `playOrder` de `@recreio/game-embarca/logic`.
- Produces (`e2e/embarca.ts`): `openEmbarca(page)` (abre pelo `card-embarca`, espera o canvas, o `hud-level` e `data-vehicles` não vazio); `readVehicles(page)` (JSON de `data-vehicles`); `tapVehicle(page, id)` (toque no centro do retângulo em px, via `page.touchscreen.tap` ou `mouse.click` conforme os outros helpers); `playSolution(page, level)` (joga a ordem plantada `generateLevel(level).solution`, esperando `data-moving="0"` entre jogadas); `expectViewMatchesState(page)` (lê `data-state` e `data-view` e confere: mesmos ids em `b`, mesmo veículo em cada vaga de `s`, e `q` do visual = índice do estado).

- [ ] **Step 1: Escrever `e2e/embarca.spec.ts`.** Este spec verifica o que as Tasks 1-7 construíram; a primeira execução é a verificação real (falha = bug a corrigir, não teste vermelho esperado). Casos:
  - o cartão da Embarca aparece na tela inicial e abre o jogo (rota `/jogo/embarca`); o canvas tem `role="img"` e nome acessível; **console sem erros**; screenshot `test-results/embarca-fase1-390x844.png`;
  - `data-vehicles` tem um retângulo por veículo e cada um tem a área de toque ≥ 44 px **efetiva**: um toque a 20 px da borda do retângulo ainda escolhe o veículo (envie esse toque e confira que o estado mudou ou que houve batida);
  - jogar a solução plantada da fase 1 pelo toque: depois de cada jogada `data-view` coincide com `data-state` (**foco 1**: pelo menos um toque é feito **durante** a animação anterior, sem esperar `data-moving="0"`, e o final coincide); ao fim aparece o modal "Fase concluída" e, ao tocar em continuar, o `hud-level` passa a 2 e o progresso persiste depois de recarregar;
  - tocar num veículo bloqueado: `data-bumps` sobe para 1, `data-state` não muda, sem erro no console;
  - **sem jogadas**: usar uma fase e uma sequência que trava (descubra com `playOrder`/`legalMoves` da lógica, determinística, como `e2e/stuck.ts` faz para a Mistura) e conferir o modal "Sem jogadas" com **Reiniciar**; reiniciar volta ao início;
  - **foco 3:** `page.setViewportSize` de 390×844 para 844×390 e de volta no meio da partida: o canvas acompanha, `data-vehicles` é republicado e um toque no centro de um veículo ainda o escolhe;
  - **foco 4:** entrar e sair do jogo 5 vezes mantém o `stats()` (geometrias e texturas, publicado como na Mistura em `leaks.spec.ts`) igual ao da 2ª entrada;
  - **foco 5:** clicar em reiniciar com a animação em andamento deixa o `data-state` igual ao inicial e `data-moving="0"`;
  - fase alta (por exemplo a 41) abre sem erros e com todos os veículos visíveis.
- [ ] **Step 2: Rodar e ver o resultado.** Run: `pnpm test:e2e e2e/embarca.spec.ts` — Expected: PASS ao final; falhas reais viram correções nas Tasks 1-7 (com teste unitário que reproduza, quando couber) antes de seguir.
- [ ] **Step 3: Ajustes** decorrentes (cada correção com seu commit pequeno).
- [ ] **Step 4: Rodar a suíte e2e inteira** (`pnpm test:e2e`) para garantir que Mistura, PWA offline e atualização continuam verdes e que a Embarca entra no pré-cache (o teste de pré-cache do service worker cobre o novo Worker).
- [ ] **Step 5: Commit** — "Embarca: testes e2e no celular (390×844)".

---

### Task 9: Fechamento do marco

**Files:**

- Modify: `docs/DECISIONS.md` (nova seção "Embarca — Marco 3")

- [ ] **Step 1: Registrar em `docs/DECISIONS.md`** a seção "Embarca — Marco 3" com: câmera `ortho-top` e por que (e a nota de que inclinar fica para depois); picking próprio com raio de 22 px e a regra de desempate; o requisito de 44 px cumprido pelo picking e não pelo tamanho (com os pixels reais medidos no e2e); o mapeamento mundo ↔ tabuleiro e a pilha vertical (tabuleiro, vagas, fila) com as constantes do `layout.ts`; durações das animações; o que ficou para o marco 4 (HUD de power-ups, dica, tutorial, sons de vitória, modo daltônico, confete, "sem saída" por falta de solução); desempenho observado (quadros por segundo e tamanho do bundle da Embarca, se o projeto já mede) e qualquer ponto do Worker/PWA que mudou.
- [ ] **Step 2: Verificação completa.** Run: `pnpm test`, `pnpm lint`, `pnpm check`, `pnpm build` e `pnpm test:e2e` — Expected: tudo verde, testes da Mistura e do PWA intactos; o build gera o arquivo do Worker da Embarca; `git status` só com os arquivos do marco.
- [ ] **Step 3: Commit** — "Embarca: decisões do marco 3".
- [ ] **Step 4: Revisão e parada (CLAUDE.md).** Chamar o subagente `revisor` (e o `qa-mobile` para a verificação visual e offline, se útil) sobre o diff do marco; aplicar o que for problema real; **parar** e dizer ao Alex como testar no celular: abrir a prévia da Vercel depois do push, entrar na Embarca pelo cartão, tocar nos veículos livres, ver o bate-e-volta, a fila embarcando e a fase concluída; avisar que HUD de power-ups, dica e tutorial só vêm no marco 4.

---

## Self-Review

- **Spec coverage (seções 7, 8 e 10, marco 3):** câmera e enquadramento (Tasks 1, 5, 6); veículos procedurais com seta (3); fila de passageiros toda visível (4); vagas e assentos (4); animações sair, bater e voltar, estacionar, embarcar, partir, interrompíveis (2, 5); picking generoso com a regra da spec (1); `destroy()` completo e teste de vazamento (5, 8); entrada no portal com cartão e progresso (6, 7); verificação em 390×844 (8). Fora, como a spec manda: HUD de power-ups, dica, tutorial, sons de vitória, daltônico, confete e "sem saída" por falta de solução (marco 4); misterioso, garagem, obstáculos e guindaste visuais (marco 5; obstáculo já funciona no `contactDistance`).
- **Tipos consistentes:** `Layout`, `PickView`, `WorldPoint` (Task 1) usados com os mesmos nomes em 2, 4, 5; `Step`/`MovePlan`/`planMove` (2) em 5; `VehicleAssets`/`createVehicleView` (3), `QueueView`/`SlotsView` (4) e `Board`/`BoardOptions` (5) em 6; `EMBARCA_ID`, `messages`, `meta` (6) em 7; `data-vehicles`/`data-state`/`data-view`/`data-moving`/`data-bumps` (6) em 8.
- **Proporção:** o plano descreve contratos, regras e testes; o código de cada peça 3D e os corpos dos algoritmos ficam com o implementador.
