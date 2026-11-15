# Embarca — Marco 1 (lógica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o pacote `games/embarca` só com a `logic/` pura: geometria inteira, colisão por varredura, grafo de bloqueios, estado, jogadas, vagas, fila com embarque em cascata, vitória/derrota e sessão com desfazer.

**Architecture:** Pacote novo `@recreio/game-embarca` no monorepo, seguindo a Mistura (`src/logic`, TS puro, imutável, serializável para o Worker). A fase (`Level`) é estática e traz o grafo "quem bloqueia quem", calculado uma vez em `createLevel`; o `State` guarda só o que muda (veículos no tabuleiro, vagas, posição na fila). O render e o gerador ainda não existem (marcos 2 e 3).

**Tech Stack:** TypeScript strict, Vitest, `@recreio/core/puzzle` (`UndoStack`). Sem Three.js, DOM ou Svelte.

**Spec:** `docs/superpowers/specs/2026-11-15-embarca-design.md` (seções 3, 5 e 10, marco 1).

## Global Constraints

- `logic/` não importa Three.js, DOM nem Svelte; sem `Math.random`, `navigator`, `localStorage`, `indexedDB` (regra de ESLint já existente para `games/*/src/logic`).
- Geometria em **inteiros**: coordenadas em milésimos de unidade do tabuleiro, ângulos em **graus inteiros**, tabela de seno/cosseno embutida (inteiros × 10000), colisão só com aritmética inteira (eixos separadores).
- Veículos: carro 4 lugares, van 6, ônibus 10; 4 vagas por padrão.
- Todo estado e resultado é objeto/array simples, imutável e serializável (`postMessage`).
- Comunicação e comentários em português do Brasil; identificadores de tipos/funções em inglês, como na Mistura.
- Commits pequenos, mensagem clara, terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Scripts multiplataforma; nada exclusivo de bash.

## Review Focus

Entradas que a spec implica e nenhuma task testaria sozinha; cada linha tem o teste na task dona:

1. Retângulos que só se **encostam** (borda com borda) não bloqueiam. Task 2.
2. Ângulo negativo ou ≥ 360 (`-90`, `450`): normalizado para 0..359, sem quebrar. Task 3.
3. Fase inválida (assentos por cor ≠ passageiros por cor, cor de passageiro sem veículo, fase sem veículos, veículos sobrepostos, centro fora do tabuleiro) lança `RangeError` com mensagem clara. Task 3.
4. Jogar um veículo que já partiu, ou jogar depois da vitória: rejeição `unknown-vehicle` com o estado inalterado. Task 4.
5. Veículo bloqueado por obstáculo fixo nunca fica livre e a derrota é detectada quando só sobram veículos assim. Task 4.

---

## File Structure

Todos em `games/embarca/` (pacote novo). Cada arquivo tem uma responsabilidade:

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `tsconfig.json` | Pacote do workspace (copiar o molde de `games/mistura`, só `./logic` exportado) |
| `src/logic/types.ts` | Tipos públicos (veículo, fase, estado, jogadas, resultados) |
| `src/logic/trig.ts` | Tabela inteira de seno/cosseno e `normalizeAngle` |
| `src/logic/geometry.ts` | Retângulo girado, sobreposição (SAT inteiro), varredura |
| `src/logic/level.ts` | `VEHICLE_SPECS`, `createLevel` (validação + grafo de bloqueios) |
| `src/logic/state.ts` | Estado inicial, `applyMove`, `legalMoves`, vitória/derrota, vaga extra |
| `src/logic/session.ts` | `Session`: estado + desfazer + power-ups + batidas |
| `src/logic/testkit.ts` | Helpers de teste (não exportado no `index.ts`) |
| `src/logic/index.ts` | Exportações públicas |
| `*.test.ts` ao lado de cada arquivo | Testes |

---

### Task 1: Pacote, tipos e tabela trigonométrica

**Files:**
- Create: `games/embarca/package.json`, `games/embarca/tsconfig.json`, `games/embarca/src/logic/types.ts`, `games/embarca/src/logic/trig.ts`
- Test: `games/embarca/src/logic/trig.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type VehicleKind = 'car' | 'van' | 'bus'`
  - `interface Vehicle { readonly id: number; readonly kind: VehicleKind; readonly seats: number; readonly color: number; readonly hidden: boolean; readonly cx: number; readonly cy: number; readonly angle: number }` (`color` = índice na `PALETTE` do core; `angle` em 0..359 = direção da seta e do bico do veículo, anti-horário a partir de +x, y para cima)
  - `interface Obstacle { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number; readonly angle: number }` (`w` ao longo de `angle`, `h` perpendicular)
  - `interface Level { readonly board: { readonly width: number; readonly height: number }; readonly vehicles: readonly Vehicle[]; readonly obstacles: readonly Obstacle[]; readonly queue: readonly number[]; readonly slotCount: number; readonly blockers: readonly (readonly number[])[]; readonly obstructed: readonly boolean[] }` (`blockers[i]` = ids dos veículos que cruzam o caminho do veículo `i`; `obstructed[i]` = um obstáculo cruza o caminho)
  - `interface Slot { readonly vehicle: number; readonly filled: number }`
  - `interface State { readonly level: Level; readonly onBoard: readonly number[]; readonly slots: readonly (Slot | null)[]; readonly queueIndex: number; readonly waiting: readonly number[] }` (`onBoard`: ids em ordem crescente; `waiting`: gancho da garagem do marco 5, sempre `[]` agora)
  - `interface Move { readonly vehicle: number }`
  - `interface Boarding { readonly slot: number; readonly vehicle: number; readonly passenger: number; readonly color: number }` (`passenger` = índice na fila)
  - `interface Departure { readonly slot: number; readonly vehicle: number }`
  - `type RejectReason = 'unknown-vehicle' | 'blocked' | 'no-slot'`
  - `interface MoveApplied { readonly ok: true; readonly state: State; readonly move: Move; readonly slot: number; readonly boardings: readonly Boarding[]; readonly departures: readonly Departure[]; readonly revealed: boolean }`
  - `interface MoveRejected { readonly ok: false; readonly reason: RejectReason; readonly state: State; readonly blockedBy: readonly number[]; readonly byObstacle: boolean }` (`blockedBy`/`byObstacle` só valem para `'blocked'`; senão `[]` e `false`)
  - `type MoveResult = MoveApplied | MoveRejected`
- Produces (`trig.ts`): `export const TRIG_SCALE = 10000`; `export function sin(deg: number): number` e `cos(deg: number): number` (inteiros em −10000..10000; `deg` inteiro qualquer); `export function normalizeAngle(deg: number): number` (devolve 0..359).

- [ ] **Step 1: Criar o pacote.** `package.json` com `name: "@recreio/game-embarca"`, `version: "0.1.0"`, `private: true`, `type: "module"`, `exports: { "./logic": "./src/logic/index.ts" }`, script `check: "tsc --noEmit"`, `dependencies: { "@recreio/core": "workspace:*" }`, `sideEffects: false`. `tsconfig.json` idêntico ao da Mistura. Rodar `pnpm install` na raiz; esperado: o workspace reconhece `@recreio/game-embarca` sem erro.
- [ ] **Step 2: Escrever `trig.test.ts` (falha).** Casos, todos com os valores exatos:
  - `sin(0)=0`, `sin(30)=5000`, `sin(45)=7071`, `sin(60)=8660`, `sin(90)=10000`, `sin(180)=0`, `sin(270)=-10000`
  - `cos(0)=10000`, `cos(60)=5000`, `cos(90)=0`, `cos(180)=-10000`, `cos(270)=0`
  - para todo `d` de 0 a 359: `Math.abs(sin(d)**2 + cos(d)**2 - 1e8) <= 20000`
  - `normalizeAngle(-90)=270`, `normalizeAngle(450)=90`, `normalizeAngle(360)=0`, `normalizeAngle(0)=0`
  - `sin(-90) === sin(270)` e `cos(450) === cos(90)` (a função normaliza internamente)
- [ ] **Step 3: Rodar o teste e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/trig.test.ts` — Expected: FAIL (módulo não existe).
- [ ] **Step 4: Escrever `types.ts` (tipos acima, com comentários em português) e `trig.ts`.** A tabela `SIN_0_90` é **literal embutida** (91 inteiros, `sin(d)×10000` arredondado, de `d=0` a `90`):
  `0, 175, 349, 523, 698, 872, 1045, 1219, 1392, 1564, 1736, 1908, 2079, 2250, 2419, 2588, 2756, 2924, 3090, 3256, 3420, 3584, 3746, 3907, 4067, 4226, 4384, 4540, 4695, 4848, 5000, 5150, 5299, 5446, 5592, 5736, 5878, 6018, 6157, 6293, 6428, 6561, 6691, 6820, 6947, 7071, 7193, 7314, 7431, 7547, 7660, 7771, 7880, 7986, 8090, 8192, 8290, 8387, 8480, 8572, 8660, 8746, 8829, 8910, 8988, 9063, 9135, 9205, 9272, 9336, 9397, 9455, 9511, 9563, 9613, 9659, 9703, 9744, 9781, 9816, 9848, 9877, 9903, 9925, 9945, 9962, 9976, 9986, 9994, 9998, 10000`.
  Os demais quadrantes saem por simetria (`sin(180−d)=sin(d)`, `sin(180+d)=−sin(d)`, `sin(360−d)=−sin(d)`); `cos(d)=sin(d+90)`. Nada de `Math.sin`/`Math.cos` no módulo.
- [ ] **Step 5: Rodar o teste e ver passar; rodar `pnpm --filter @recreio/game-embarca check` e `pnpm lint`.** Expected: tudo verde.
- [ ] **Step 6: Commit** — `git add games/embarca pnpm-lock.yaml` · "Embarca: pacote, tipos e tabela trigonométrica inteira".

---

### Task 2: Geometria (retângulo girado, sobreposição, varredura)

**Files:**
- Create: `games/embarca/src/logic/geometry.ts`
- Test: `games/embarca/src/logic/geometry.test.ts`

**Interfaces:**
- Consumes: `sin`, `cos`, `TRIG_SCALE` de `./trig`.
- Produces:
  - `interface Rect { readonly cx: number; readonly cy: number; readonly hl: number; readonly hw: number; readonly angle: number }` (`hl` = meio-comprimento ao longo de `angle`, `hw` = meia-largura; tudo inteiro, em milésimos; `angle` já normalizado)
  - `function rectsOverlap(a: Rect, b: Rect): boolean` — **estrito**: só encostar (distância 0) devolve `false`.
  - `function sweepRect(r: Rect, distance: number): Rect` — o retângulo que `r` varre ao andar `distance` (inteiro **par**, > 0) na direção de `angle`: mesma largura, `hl' = hl + distance/2`, centro deslocado `Math.round(distance * cos(angle) / (2 * TRIG_SCALE))` em x e o análogo com `sin` em y.

- [ ] **Step 1: Escrever `geometry.test.ts` (falha).** Retângulo auxiliar `r(cx, cy, hl, hw, angle)`. Casos:
  - alinhados e separados: `rectsOverlap(r(0,0,600,300,0), r(2000,0,600,300,0))` = `false`
  - **encostados** (foco 1): `r(0,0,600,300,0)` e `r(1200,0,600,300,0)` (bordas em x=600) = `false`; com `r(1199,0,600,300,0)` = `true`
  - encostados na lateral: `r(0,0,600,300,0)` e `r(0,600,600,300,0)` = `false`
  - girado 90° (`r(0,0,600,300,90)` ocupa x de −300 a 300 e y de −600 a 600): sobrepõe `r(0,800,600,300,0)` (y de 500 a 1100) = `true`; não sobrepõe `r(0,1200,600,300,0)` (y de 900 a 1500) = `false`
  - diagonal 45°: `r(0,0,600,300,45)` e `r(900,900,600,300,45)` = `false` (distância grande ao longo do eixo e lateral); `r(0,0,600,300,45)` e `r(300,300,600,300,0)` = `true`
  - simetria: `rectsOverlap(a,b) === rectsOverlap(b,a)` para os pares acima
  - `sweepRect(r(1000,1000,600,300,0), 4000)` = `{cx:3000,cy:1000,hl:2600,hw:300,angle:0}`
  - `sweepRect(r(1000,1000,600,300,90), 4000)` = `{cx:1000,cy:3000,hl:2600,hw:300,angle:90}`
  - varredura bloqueia à frente e não atrás nem na faixa ao lado: veículo `r(1000,1000,600,300,0)` varrendo 10000: sobrepõe `r(5000,1000,600,300,0)`; não sobrepõe `r(−2000,1000,600,300,0)` (atrás); não sobrepõe `r(5000,1700,600,300,0)` (faixa vizinha com folga de 100)
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/geometry.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `rectsOverlap` e `sweepRect`.** Teste dos eixos separadores com os 4 eixos (`u` e `v` de cada retângulo, onde `u=(cos,sin)` e `v=(−sin,cos)`, escala 10⁴). Para cada eixo `a`: `|(centroB−centroA)·a| × 10⁴ < rA + rB`, com raio `rX = hlX·|a·uX| + hwX·|a·vX|` (escala 10⁸). Se **algum** eixo não satisfaz a desigualdade estrita, não há sobreposição. Só inteiros, sem divisão (todas as grandezas cabem em `Number.MAX_SAFE_INTEGER` para tabuleiros de até ~10⁵ milésimos).
- [ ] **Step 4: Rodar e ver passar; `pnpm lint`.**
- [ ] **Step 5: Commit** — "Embarca: geometria inteira (sobreposição e varredura)".

---

### Task 3: Fase (`createLevel`) e grafo de bloqueios

**Files:**
- Create: `games/embarca/src/logic/level.ts`, `games/embarca/src/logic/testkit.ts`
- Test: `games/embarca/src/logic/level.test.ts`

**Interfaces:**
- Consumes: `Rect`, `rectsOverlap`, `sweepRect` de `./geometry`; `normalizeAngle` de `./trig`; tipos de `./types`.
- Produces (`level.ts`):
  - `const VEHICLE_SPECS: Record<VehicleKind, { seats: number; length: number; width: number }>` = `car {4, 1200, 600}`, `van {6, 1600, 700}`, `bus {10, 2400, 800}` (milésimos; `length` ao longo da seta)
  - `const DEFAULT_SLOT_COUNT = 4`
  - `interface VehicleInput { kind: VehicleKind; color: number; cx: number; cy: number; angle: number; hidden?: boolean }`
  - `interface LevelInput { board: { width: number; height: number }; vehicles: readonly VehicleInput[]; obstacles?: readonly Obstacle[]; queue: readonly number[]; slotCount?: number }`
  - `function createLevel(input: LevelInput): Level` — lança `RangeError` (mensagem em português) se: não há veículos; algum centro está fora de `[0,width]×[0,height]`; dois retângulos (veículo×veículo ou veículo×obstáculo) se sobrepõem no início; para alguma cor, soma de assentos ≠ número de passageiros na fila; cor da fila sem nenhum veículo; `slotCount < 1`; qualquer número não inteiro. Normaliza ângulos com `normalizeAngle` (inclui obstáculos). `id` do veículo = índice no array. Distância de varredura: `width + height + length` arredondado para cima ao próximo par.
  - `blockers[i]` = ids (ordem crescente) dos outros veículos cujo retângulo sobrepõe a varredura do veículo `i`; `obstructed[i]` = algum obstáculo sobrepõe a varredura.
- Produces (`testkit.ts`, só para testes): `function veh(kind: VehicleKind, color: number, cx: number, cy: number, angle: number, hidden?: boolean): VehicleInput`; `function level(vehicles: VehicleInput[], queue: number[], extra?: Partial<LevelInput>): Level` (tabuleiro padrão `{width: 10000, height: 10000}`).

- [ ] **Step 1: Escrever `level.test.ts` (falha).** Casos:
  - ids por índice e `seats`: carro→4, van→6, ônibus→10
  - carro cor 0 em `(1000,1000,0°)` e outro carro cor 0 em `(5000,1000,0°)`, fila `[0×8]`: `blockers[0]=[1]`, `blockers[1]=[]`, `obstructed` todo `false`
  - mesmos dois carros mas o segundo apontando para `180°`: `blockers[0]=[1]` e `blockers[1]=[0]` (um bloqueia o outro)
  - dois carros em faixas vizinhas com folga (`cy` 1000 e 1700) a 0°: ambos sem bloqueios
  - **obstáculo** `{cx:5000,cy:1000,w:600,h:600,angle:0}` à frente do carro em `(1000,1000,0°)`: `obstructed[0]=true`, `blockers[0]=[]`
  - **ângulo normalizado (foco 2):** veículo com `angle:-90` e outro com `angle:450` ficam com `270` e `90`; ângulo `360` vira `0`
  - **fase inválida (foco 3):** cada um lança `RangeError` (`toThrow(RangeError)`): vetor de veículos vazio; centro fora do tabuleiro (`cx:-1`); dois carros sobrepostos no início (`(1000,1000)` e `(1500,1000)`, ambos 0°); carro de cor 0 (4 assentos) com fila `[0,0,0]`; fila com cor 5 sem veículo dessa cor; `slotCount: 0`; `cx: 10.5`
  - `slotCount` padrão = 4 e respeita `slotCount: 5`
  - **serialização:** `JSON.parse(JSON.stringify(level))` é igual (`toEqual`) ao original
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/level.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `createLevel` e `testkit.ts`.** Retângulo do veículo: `{cx, cy, hl: length/2, hw: width/2, angle}`; do obstáculo: `{cx, cy, hl: w/2, hw: h/2, angle}`.
- [ ] **Step 4: Rodar e ver passar; `check`; `lint`.**
- [ ] **Step 5: Commit** — "Embarca: fase, validação e grafo de bloqueios".

---

### Task 4: Estado, jogadas, fila e derrota

**Files:**
- Create: `games/embarca/src/logic/state.ts`
- Test: `games/embarca/src/logic/state.test.ts`

**Interfaces:**
- Consumes: `Level`, `State`, `Move`, `MoveResult`, `Slot` de `./types`; `level`/`veh` de `./testkit` (testes).
- Produces:
  - `function createState(level: Level): State` — todos os veículos em `onBoard`, `slots` com `slotCount` posições `null`, `queueIndex: 0`, `waiting: []`.
  - `function isFree(state: State, vehicleId: number): boolean` — `true` se o veículo está em `onBoard`, não `obstructed` e **nenhum** de seus `blockers` está em `onBoard`.
  - `function applyMove(state: State, move: Move): MoveResult` — ordem de decisão: (1) veículo fora de `onBoard` ou id inexistente → rejeita `'unknown-vehicle'`; (2) não está livre → `'blocked'` com `blockedBy` = blockers ainda em `onBoard` (crescente) e `byObstacle = obstructed[i]`; (3) sem vaga livre → `'no-slot'`; (4) senão estaciona na vaga livre de **menor índice**, remove de `onBoard` e roda a **cascata**: enquanto o primeiro da fila (`queue[queueIndex]`) combinar com a cor **real** de um veículo estacionado com assento livre (menor índice de vaga primeiro), ele embarca (`filled+1`, `queueIndex+1`, registra `Boarding`); veículo que enche parte (vaga volta a `null`, registra `Departure`, na mesma cascata). `revealed` = o veículo estacionado era `hidden`. Em toda rejeição, `state` é o mesmo objeto recebido.
  - `function legalMoves(state: State): Move[]` — veículos livres, em ordem crescente de id, **só se houver vaga livre**; senão `[]`.
  - `function isWin(state: State): boolean` — `onBoard.length === 0 && waiting.length === 0 && queueIndex === level.queue.length`.
  - `function isStuck(state: State): boolean` — `!isWin(state) && legalMoves(state).length === 0`.
  - `function addSlot(state: State): State` — uma vaga `null` a mais no fim.
  - `function visibleColor(state: State, vehicleId: number): number | null` — cor do veículo, ou `null` se é `hidden` e não está numa vaga (privacidade do "?").

- [ ] **Step 1: Escrever `state.test.ts` (falha).** Todos com `level(...)` do testkit; carros a 0° em faixas sem bloqueio salvo quando dito. Casos:
  - `createState`: `onBoard=[0,1,…]`, 4 vagas `null`, `queueIndex 0`
  - estacionar na menor vaga livre: depois da vaga 0 ocupada e partida do seu veículo, o próximo estaciona na vaga 0 (menor índice livre)
  - **embarque em cascata:** carro cor 0 e carro cor 1; fila `[0,0,0,0,1,1,1,1]`; enviar o carro 0 → `boardings` com 4 passageiros (`passenger` 0..3, `color` 0), `departures=[{slot:0,vehicle:0}]`, vaga 0 volta a `null`, `queueIndex=4`
  - **sem combinar espera:** mesmo nível, enviar primeiro o carro 1 → `boardings=[]`, a vaga 0 guarda `{vehicle:1, filled:0}`, `queueIndex=0`
  - **dois estacionados da mesma cor, menor vaga primeiro:** carros A e B cor 0 e C cor 1, em `(1000,1000)`, `(1000,3000)`, `(1000,5000)`, todos 0°; fila `[1,1,1,1,0,0,0,0,0,0,0,0]`. Enviar A (vaga 0), B (vaga 1), C (vaga 2): na última jogada, C embarca os 4 passageiros cor 1 e parte; depois os 8 passageiros cor 0 embarcam nesta ordem: os 4 primeiros em `slot: 0` (A) e os 4 seguintes em `slot: 1` (B); `isWin=true`
  - **posições das vagas:** carros A cor 0, B cor 1, C cor 2 (mesmas posições), fila `[2,2,2,2,0,0,0,0,1,1,1,1]`; enviar A e depois B deixa `slots[0].vehicle=0` e `slots[1].vehicle=1`
  - **vitória:** nível de um carro cor 0 e fila `[0,0,0,0]`; depois da jogada `isWin=true`, `isStuck=false`
  - **bate e volta:** carro A em `(1000,1000,0°)` com carro B à frente em `(5000,1000,0°)`: `applyMove(A)` → `{ok:false, reason:'blocked', blockedBy:[1], byObstacle:false}` e `result.state === state`
  - **bloqueado por obstáculo (foco 5):** obstáculo à frente → `reason:'blocked'`, `blockedBy:[]`, `byObstacle:true`; `isFree=false`
  - **obstáculo permanente → derrota (foco 5):** nível com um único carro obstruído: `legalMoves=[]` e `isStuck=true`
  - **sem vaga:** `slotCount:1`; carro A cor 0 em `(1000,1000)` e carro B cor 1 em `(1000,3000)`, 0°, fila `[1,1,1,1,0,0,0,0]`: enviar A → estaciona e não embarca ninguém; enviar B → `reason:'no-slot'`; `legalMoves=[]`; `isStuck=true`
  - **derrota com vagas cheias e fila que não combina:** `slotCount:2`; carros A e B cor 0 e C cor 1 (posições do caso acima), fila `[1,1,1,1,0,0,0,0,0,0,0,0]`: enviar A e B enche as 2 vagas sem embarque; C continua livre, mas `legalMoves=[]` e `isStuck=true`
  - **veículo que já partiu / depois da vitória (foco 4):** repetir a jogada do carro que partiu → `{ok:false, reason:'unknown-vehicle'}` com o mesmo `state`; id `99` → idem
  - `addSlot` aumenta `slots.length` em 1 e abre jogadas que `no-slot` negava
  - **`revealed` e privacidade:** veículo `hidden` cor 2: `visibleColor(estadoInicial,id)=null`; depois de estacionar `visibleColor(...)=2` e `revealed=true`; veículo normal: `revealed=false`
  - `applyMove` não altera o `state` recebido (comparar `JSON.stringify` antes e depois) e o novo estado sobrevive a `JSON.parse(JSON.stringify(...))` com `toEqual`
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/state.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `state.ts`.** Sem mutar entradas (arrays e objetos novos).
- [ ] **Step 4: Rodar e ver passar; `check`; `lint`.**
- [ ] **Step 5: Commit** — "Embarca: jogadas, vagas, fila em cascata e derrota".

---

### Task 5: Sessão (desfazer, vaga extra, dica, batidas)

**Files:**
- Create: `games/embarca/src/logic/session.ts`, `games/embarca/src/logic/index.ts`
- Test: `games/embarca/src/logic/session.test.ts`

**Interfaces:**
- Consumes: `UndoStack` de `@recreio/core/puzzle`; `applyMove`, `addSlot`, `createState`, `isStuck`, `isWin` de `./state`.
- Produces (`session.ts`), no molde de `games/mistura/src/logic/session.ts`:
  - `type PowerUpKind = 'undo' | 'extraSlot' | 'hint'`; `interface PowerUps { readonly undo: number; readonly extraSlot: number; readonly hint: number }`; `const POWERUPS_PER_LEVEL: PowerUps = { undo: 5, extraSlot: 1, hint: 1 }`
  - `function createPowerUps(): PowerUps`, `canUsePowerUp(p, kind): boolean`, `consumePowerUp(p, kind): PowerUps | null`
  - `type UndoOutcome = { ok: true; state: State } | { ok: false; reason: 'none-left' | 'empty' }`; `type ExtraSlotOutcome = { ok: true; state: State } | { ok: false; reason: 'none-left' }`
  - `class Session { constructor(level: Level); get state(): State; get remaining(): PowerUps; get won(): boolean; get stuck(): boolean; get canUndo(): boolean; get bumps(): number; move(move: Move): MoveResult; undo(): UndoOutcome; addSlot(): ExtraSlotOutcome; spendHint(): boolean; restart(): State }`
  - Regras: só jogadas **aplicadas** entram no histórico; rejeição `'blocked'` ou `'no-slot'` incrementa `bumps` e não muda o estado; `'unknown-vehicle'` não incrementa nada. `undo()` gasta uma carga, restaura o estado anterior **mantendo** a vaga extra se ela foi adicionada depois da jogada desfeita (completa `slots` com `null` até o tamanho atual). `restart()` volta ao estado inicial, limpa o histórico, zera `bumps` e devolve todas as cargas.
- Produces (`index.ts`): reexporta tudo de `types`, `level` (`createLevel`, `VEHICLE_SPECS`, `DEFAULT_SLOT_COUNT`, tipos de entrada), `state`, `session`, e `sin`/`cos`/`normalizeAngle`/`TRIG_SCALE` e `rectsOverlap`/`sweepRect` (o gerador do marco 2 precisa deles). **Não** exporta `testkit`.

- [ ] **Step 1: Escrever `session.test.ts` (falha).** Casos:
  - cargas iniciais `{undo:5, extraSlot:1, hint:1}`
  - jogada aplicada: `canUndo=true`; `undo()` devolve o estado inicial (`toEqual`) e `remaining.undo=4`
  - `undo()` sem histórico → `{ok:false, reason:'empty'}` e **não** gasta carga
  - seis jogadas desfeitas sucessivas: a sexta falha com `'none-left'` (usar nível com ≥ 6 veículos sem bloqueio)
  - **bate e volta:** jogada `blocked` → `bumps=1`, `canUndo=false`, estado inalterado, `remaining` inalterado; `no-slot` também conta; `unknown-vehicle` não conta
  - **vaga extra:** com 1 vaga ocupada e `no-slot`, `addSlot()` → `slots.length` 2, `remaining.extraSlot=0`, segunda chamada → `{ok:false, reason:'none-left'}`; depois a jogada antes recusada funciona
  - **desfazer mantém a vaga extra:** jogada, `addSlot()`, `undo()` → `state.slots.length` continua 2
  - `spendHint()` → `true` uma vez, depois `false`
  - `restart()` → estado inicial, `bumps=0`, cargas cheias, `canUndo=false`
  - `won` e `stuck` acompanham `isWin`/`isStuck`
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/session.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `session.ts` e `index.ts`.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — "Embarca: sessão com desfazer, vaga extra e dica".

---

### Task 6: Fechamento do marco (determinismo, decisões, verificação)

**Files:**
- Create: `games/embarca/src/logic/scenario.test.ts`
- Modify: `docs/DECISIONS.md` (nova seção "Embarca — Marco 1")

**Interfaces:**
- Consumes: tudo de `games/embarca/src/logic/index.ts`.

- [ ] **Step 1: Escrever `scenario.test.ts`.** Fase (tabuleiro 10000×10000, 4 vagas), veículos por id: `0` carro cor 0 em `(1500,1500)` 0°; `1` carro cor 0 em `(6000,1500)` 0° (bloqueia o 0); `2` van cor 1 em `(2000,4000)` 90°; `3` van cor 1 em `(2000,7000)` 90° (bloqueia o 2); `4` ônibus cor 2 em `(7000,5000)` 135°; `5` ônibus cor 2 em `(8500,8500)` 30°. Fila: 8×cor 0, depois 12×cor 1, depois 20×cor 2. Casos:
  - `blockers` esperados: `[1]`, `[]`, `[3]`, `[]`, `[]`, `[]` e nenhum `obstructed`
  - **ordem vencedora** `[1,0,3,2,4,5]`: todas as jogadas aplicadas e `isWin=true` no fim
  - **ordem perdedora** `[4,5,3,2]`: todas aplicadas e `isStuck=true` no fim (4 vagas cheias, fila começa em cor 0, o carro 1 está livre mas sem vaga)
  - **determinismo:** jogar `[1,0,3,2,4,5]` duas vezes, e uma terceira vez reconstruindo o estado a cada passo com `JSON.parse(JSON.stringify(state))`, dá resultados `toEqual` idênticos em cada passo (`slot`, `boardings`, `departures`)
  - **exploração completa:** busca em profundidade por `legalMoves` a partir de `createState` (com memória de estados por `JSON.stringify`) encontra pelo menos um estado final com `isWin` e pelo menos um com `isStuck`
- [ ] **Step 2: Rodar e ver passar.** Run: `pnpm vitest run games/embarca` — Expected: PASS. Se um caso falhar, investigar antes de mexer: a fase acima foi conferida à mão (as duas ordens e os bloqueios), então uma falha aponta para a lógica ou para um erro de digitação no teste.
- [ ] **Step 3: Registrar em `docs/DECISIONS.md`** a seção "Embarca — Marco 1" com: dimensões dos veículos (`VEHICLE_SPECS`, definidas aqui e **fixas** daqui em diante; o render do marco 3 escala, não muda a lógica); tabela de seno/cosseno embutida e por quê; colisão estrita (encostar não bloqueia); varredura pelo eixo do veículo; `bumps` fica na `Session`, não no `State`; `waiting` é só o gancho da garagem; lembrete de que "sem saída" por falta de jogadas **não** detecta beco sem solução (como na Mistura, isso virá do solver nos marcos 2 e 4).
- [ ] **Step 4: Verificação completa do marco.** Run: `pnpm test` (tudo verde, os testes da Mistura continuam passando), `pnpm lint`, `pnpm check`. Expected: sem falhas; `git status` só com os arquivos do marco.
- [ ] **Step 5: Commit** — "Embarca: cenário de ponta a ponta e decisões do marco 1".
- [ ] **Step 6: Revisão e parada (CLAUDE.md).** Chamar o subagente `revisor` sobre o diff do marco; aplicar o que for problema real; **parar** e dizer ao Alex o que testar. Como o marco 1 não tem tela, o "teste" dele é rodar `pnpm test` e ler o resumo; o primeiro teste no celular só vem no marco 3.

---

## Self-Review

- **Spec coverage:** geometria inteira, tabela embutida, colisão estrita (Tasks 1-2); bloqueios estáticos e obstáculos fixos (3); jogadas, vagas de menor índice, cascata, veículo cheio parte, vitória, derrota nas duas formas (4); desfazer 5, vaga extra, dica, batidas (5); ganchos `hidden` e `waiting` (3-4); sem sobreposição inicial (3); determinismo e serialização para o Worker (3, 4, 6). Gerador, solver, render, dica real e "sem saída" por falta de solução ficam para os marcos 2-4, conforme a spec.
- **Tipos consistentes:** `Level`, `State`, `Move`, `MoveResult`, `Slot`, `Boarding`, `Departure` definidos na Task 1 e usados com os mesmos nomes nas Tasks 3-6; `PowerUpKind` usa `'extraSlot'` (não `'extraTube'`) em toda a Task 5.
- **Proporção:** plano menor que o código resultante; os blocos de código são só a tabela literal da spec trig e valores de teste.
