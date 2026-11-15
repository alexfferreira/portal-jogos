# Embarca — Marco 2 (gerador, solver e Worker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar fases da Embarca por construção reversa, sempre vencíveis, com solver (dica e medida de dificuldade) e tudo rodando num Web Worker, validado em 200 fases.

**Architecture:** O gerador sorteia (PRNG com semente) uma **ordem de saída plantada** e posiciona os veículos do último para o primeiro, de modo que o caminho de cada um não cruze quem sai depois dele (assim a ordem plantada é sempre jogável). Cores e fila de passageiros saem de uma simulação dessa ordem **dirigida pelo motor real** (`applyMove` e um novo `settle`), então a fila nunca contradiz as regras. O solver (`solveSearch` do `core`) valida e dá dicas; uma amostra de partidas aleatórias mede a dificuldade. O Worker espelha o da Mistura.

**Tech Stack:** TypeScript strict, Vitest, `@recreio/core/puzzle` (`createRng`, `PALETTE`, `solveSearch`). Sem Three.js, DOM ou Svelte em `logic/`.

**Spec:** `docs/superpowers/specs/2026-11-15-embarca-design.md` (seções 5, 6 e 10, marco 2). Base já pronta: `docs/superpowers/plans/2026-11-15-embarca-marco1-logica.md` (concluído).

## Global Constraints

- `logic/` não importa Three.js, DOM nem Svelte; sem `Math.random`, `navigator`, `localStorage`, `indexedDB`. Toda aleatoriedade vem de `createRng(seed)` do `core`.
- Gerador e solver rodam em **Web Worker**; a geração usa **limite de nós** (determinístico), nunca tempo. Só a dica usa teto de tempo (`HINT_MAX_MILLIS = 2000`).
- Geometria inteira, folga mínima do gerador **`CLEARANCE = 40`** milésimos (a lógica exige ≥ 5; ver `docs/DECISIONS.md`, marco 1); 4 vagas por padrão; veículos com `VEHICLE_SPECS` fixos.
- Tabuleiro em retrato: largura 6000, altura `8000 + 150 × veículos`.
- Fase `N` é gerada a partir da semente `mixSeed(N, variação)`; "refazer" = próxima variação (máximo 64).
- Estado e fase são JSON puro (vão e voltam por `postMessage`).
- Comentários e mensagens em português do Brasil; identificadores em inglês, como no marco 1.
- Commits pequenos terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; scripts multiplataforma.

## Review Focus

Entradas que a spec implica e nenhuma task testaria sozinha; cada linha tem o teste na task dona:

1. Geometria impossível (tabuleiro minúsculo, veículos demais): a colocação falha, a geração tenta outras variações e termina com `Error` claro, sem laço infinito. Tasks 5 e 7.
2. Dois estacionados da mesma cor: o motor enche a vaga de menor índice, não a que o plano imaginava, e o pico de vagas pode estourar. A fila é construída **com o motor real** e a ordem plantada é reproduzida com `applyMove` antes de aceitar a fase. Tasks 6 e 7.
3. Solver estoura o limite de nós numa fase: a variação é rejeitada, e a dica de toda fase gerada nunca devolve `limit`. Task 7.
4. Determinismo: mesma fase, mesmas opções, mesma saída; e idêntica depois de `JSON.parse(JSON.stringify(...))`. Task 7.
5. A ordem dos ids não pode revelar a solução (ids embaralhados em relação à ordem de saída). Task 7.

---

## File Structure

Em `games/embarca/`:

| Arquivo                                                                      | Responsabilidade                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/logic/state.ts` (modificar)                                             | Extrair e exportar `settle` (cascata de embarque)    |
| `src/logic/level.ts` (modificar)                                             | Extrair e exportar `buildGeometry` e `sweepFor`      |
| `src/logic/solver.ts`                                                        | Problema de busca, `solve`, `hint`                   |
| `src/logic/difficulty.ts`                                                    | `playOrder`, `randomPlayoutWinRate`                  |
| `src/logic/seed.ts`                                                          | `mixSeed`                                            |
| `src/logic/config.ts`                                                        | `levelConfig` (curva de dificuldade)                 |
| `src/logic/placement.ts`                                                     | `placeVehicles` (geometria por construção reversa)   |
| `src/logic/queue.ts`                                                         | `buildColorsAndQueue` (cores e fila, via motor real) |
| `src/logic/generator.ts`                                                     | `generateLevel` (junta tudo e valida)                |
| `src/worker/{protocol,handler,client,logic.worker,index}.ts`, `src/env.d.ts` | Worker, no molde de `games/mistura/src/worker`       |
| `*.test.ts` ao lado de cada arquivo                                          | Testes                                               |

---

### Task 1: Reaproveitar o motor (`settle`, `buildGeometry`, `sweepFor`)

**Files:**

- Modify: `games/embarca/src/logic/state.ts`, `games/embarca/src/logic/level.ts`, `games/embarca/src/logic/index.ts`
- Test: `games/embarca/src/logic/state.test.ts`, `games/embarca/src/logic/level.test.ts` (acrescentar)

**Interfaces:**

- Produces (`state.ts`): `interface Settled { readonly state: State; readonly boardings: readonly Boarding[]; readonly departures: readonly Departure[] }` e `function settle(state: State): Settled` — roda a cascata de embarque sobre a fila atual do estado (o mesmo laço que `applyMove` usa depois de estacionar); sem passageiro que combine, devolve o mesmo estado e listas vazias. `applyMove` passa a chamar `settle`.
- Produces (`level.ts`): `type GeometryInput = Omit<LevelInput, 'queue' | 'slotCount'>`; `type Geometry = Pick<Level, 'board' | 'vehicles' | 'obstacles' | 'blockers' | 'obstructed'>`; `function buildGeometry(input: GeometryInput): Geometry` (todas as validações de geometria de `createLevel`, sem as de fila/assentos); `function sweepFor(board: { width: number; height: number }, kind: VehicleKind, cx: number, cy: number, angle: number): Rect` (o retângulo varrido de um veículo, exatamente o usado para `blockers`). `createLevel` passa a usar `buildGeometry` + as validações de fila/vagas; o comportamento e as mensagens de erro atuais não mudam.
- Exporta em `index.ts`: `settle`, `buildGeometry`, `sweepFor`, `type Geometry`, `type GeometryInput`, `type Settled`.

- [ ] **Step 1: Testes (falham).** Em `state.test.ts`: dois carros cor 0 e cor 1 com fila inicial vazia `[]` (use `buildGeometry` + objeto `Level` montado à mão com `queue: []`), estacionar o carro 0 com `applyMove` (nada embarca), depois `settle({ ...state, level: { ...state.level, queue: [0,0,0,0] } })` → `boardings` com 4 passageiros em `slot: 0`, `departures: [{ slot: 0, vehicle: 0 }]`, `state.queueIndex = 4`; e `settle` de um estado sem passageiro compatível devolve o **mesmo objeto** `state` e listas vazias. Em `level.test.ts`: `buildGeometry` de um nível válido tem `blockers`/`obstructed` iguais aos de `createLevel` para o mesmo nível; `buildGeometry` lança `RangeError` para veículos sobrepostos; `sweepFor(board, 'car', 1000, 1000, 0)` sobrepõe (`rectsOverlap`) um retângulo de carro em `(5000,1000)` e não sobrepõe um em `(-2000,1000)`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/state.test.ts games/embarca/src/logic/level.test.ts` — Expected: FAIL (exports não existem).
- [ ] **Step 3: Implementar a extração** (refatoração pura: nenhum teste do marco 1 pode mudar de resultado).
- [ ] **Step 4: Rodar tudo da Embarca; `check`; `lint`.** Run: `pnpm vitest run games/embarca` — Expected: PASS (inclui os 85 testes anteriores).
- [ ] **Step 5: Commit** — "Embarca: extrai settle, buildGeometry e sweepFor para o gerador".

---

### Task 2: Solver e dica

**Files:**

- Create: `games/embarca/src/logic/solver.ts`
- Test: `games/embarca/src/logic/solver.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: `solveSearch`, `SearchLimits`, `SearchProblem`, `SearchStatus` de `@recreio/core/puzzle`; `applyMove`, `isWin`, `legalMoves` de `./state`.
- Produces:
  - `function canonicalKey(state: State): string` — `onBoard`, `slots` (na ordem, `veículo:ocupados` ou `-`) e `queueIndex` separados por `|`. **Não** canonicaliza a ordem das vagas (a vaga de menor índice embarca primeiro, então ela importa).
  - `const embarcaProblem: SearchProblem<State, Move>` — `legalMoves` do estado, `apply` (lança `Error` em jogada inválida), `isGoal: isWin`, `canonicalKey`, `heuristic: (s) => s.onBoard.length * 4 + s.slots.filter((x) => x !== null).length`.
  - `interface SolveResult { status: SearchStatus; moves: Move[]; nodes: number }`; `function solve(state: State, limits?: SearchLimits): SolveResult`
  - `interface HintResult { state: State; status: SearchStatus; move: Move | null; moves: Move[]; nodes: number }`; `function hint(state: State, limits?: SearchLimits): HintResult` — `state` é o estado de origem (para descartar dica velha); `move` é a primeira jogada da solução ou `null` (já venceu, sem saída, limite estourado).

- [ ] **Step 1: Testes (falham).** Com a **fase do cenário** do marco 1 (a mesma de `scenario.test.ts`: 6 veículos, ordens `[1,0,3,2,4,5]` vencedora e `[4,5,3,2]` perdedora; copie a definição para um helper `scenarioLevel()` em `testkit.ts`):
  - `solve(createState(scenarioLevel()))` → `status: 'solved'` e **reproduzir** `moves` com `applyMove` termina em `isWin`
  - `solve` do estado depois de `[4,5,3,2]` (sem saída) → `status: 'unsolvable'`, `moves: []`
  - `solve` de um estado já vencido → `solved` e `moves: []`
  - `solve(state, { maxNodes: 3 })` na fase inicial → `status: 'limit'`
  - `hint` da fase inicial → `move` não nulo e igual a `moves[0]`; `hint(...).state` é o mesmo objeto recebido; `hint` do estado vencido → `move: null`; `hint` do estado sem saída → `status: 'unsolvable'` e `move: null`
  - `canonicalKey` igual para estados iguais e diferente quando só a ordem das vagas muda (duas vagas ocupadas por veículos diferentes, trocadas de lugar)
  - determinismo: `solve` duas vezes devolve `toEqual` iguais
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/solver.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `solver.ts`** (molde: `games/mistura/src/logic/solver.ts`), mover `scenarioLevel` para `testkit.ts` e fazer `scenario.test.ts` usá-lo (sem mudar suas asserções), exportar em `index.ts`: `solve`, `hint`, `embarcaProblem`, `canonicalKey`, `type SolveResult`, `type HintResult`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: solver e dica".

---

### Task 3: Dificuldade (`playOrder`, `randomPlayoutWinRate`)

**Files:**

- Create: `games/embarca/src/logic/difficulty.ts`
- Test: `games/embarca/src/logic/difficulty.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: `createRng` de `@recreio/core/puzzle`; `applyMove`, `createState`, `isStuck`, `isWin`, `legalMoves` de `./state`; `scenarioLevel` de `./testkit`.
- Produces:
  - `interface PlayOutcome { won: boolean; stuck: boolean; applied: number; peakParked: number }`; `function playOrder(level: Level, order: readonly number[]): PlayOutcome` — joga os ids em ordem com o motor real; para na primeira recusa (`applied` = quantas foram aplicadas, `won`/`stuck` do estado final); `peakParked` = maior número de vagas ocupadas logo depois de estacionar.
  - `function randomPlayoutWinRate(level: Level, seed: number, samples: number): number` — fração (0..1) de `samples` partidas jogadas escolhendo **uniformemente** (PRNG semeado) entre `legalMoves` até vencer ou travar que terminam em vitória.

- [ ] **Step 1: Testes (falham).** Fase do cenário: `playOrder(level, [1,0,3,2,4,5])` → `{ won: true, stuck: false, applied: 6, peakParked: 1 }` (cada veículo estaciona, embarca e parte na hora); `playOrder(level, [4,5,3,2])` → `won: false`, `stuck: true`, `applied: 4`, `peakParked: 4`; `playOrder(level, [0])` (bloqueado) → `applied: 0`; `randomPlayoutWinRate(level, 1, 200)` está em `(0, 1)` (nem todas vencem, nem todas perdem), é determinístico (mesma semente, mesmo valor), e muda com outra semente em pelo menos uma de 5 sementes testadas; `randomPlayoutWinRate` de uma fase de um só carro sem obstáculo → `1`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/difficulty.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `difficulty.ts`** e exportar `playOrder`, `randomPlayoutWinRate`, `type PlayOutcome` em `index.ts`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: medidas de dificuldade (ordem jogada e partidas aleatórias)".

---

### Task 4: Semente e curva de dificuldade

**Files:**

- Create: `games/embarca/src/logic/seed.ts`, `games/embarca/src/logic/config.ts`
- Test: `games/embarca/src/logic/seed.test.ts`, `games/embarca/src/logic/config.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: `PALETTE` de `@recreio/core/puzzle`; `VehicleKind` de `./types`.
- Produces:
  - `function mixSeed(level: number, variation: number): number` — **idêntica** à de `games/mistura/src/logic/generator.ts` (variação 0 devolve `level >>> 0`; senão mistura de 32 bits). Duplicada de propósito (8 linhas); anotar em `DECISIONS.md` que sobe para o `core` quando o terceiro jogo precisar.
  - `interface LevelConfig { level: number; vehicles: number; colors: number; mix: Record<VehicleKind, number>; angleStep: 90 | 45 | 15 | 1; peakTarget: number; blockBias: number; winRateCap: number; board: { width: number; height: number } }`
  - `function levelConfig(level: number): LevelConfig` — lança `RangeError` se `level` não é inteiro ≥ 1. Fórmulas **fixas**: `vehicles = min(24, 4 + floor(level × 0.4))`; `colors = min(vehicles, PALETTE.length, 2 + floor(level / 6))`; `mix`: níveis ≤ 3 `{car:1, van:0, bus:0}`, ≤ 10 `{car:0.7, van:0.3, bus:0}`, acima `{car:0.5, van:0.3, bus:0.2}`; `angleStep`: ≤ 6 → 90, ≤ 20 → 45, ≤ 50 → 15, acima 1; `peakTarget = min(4, 2 + floor(level / 15))`; `blockBias = min(1, 0.4 + level / 100)`; `winRateCap`: ≤ 5 → 1, ≤ 20 → 0.6, ≤ 60 → 0.35, acima 0.15; `board = { width: 6000, height: 8000 + 150 × vehicles }`.

- [ ] **Step 1: Testes (falham).** `seed.test.ts`: `mixSeed(5, 0) = 5`; `mixSeed(5, 1) !== mixSeed(5, 0)`; determinística; valores todos em `[0, 2³²)`; sem colisões entre `mixSeed(l, v)` para `l` de 1 a 50 e `v` de 0 a 7. `config.test.ts`: nível 1 → `{ vehicles: 4, colors: 2, mix: {car:1,van:0,bus:0}, angleStep: 90, peakTarget: 2, winRateCap: 1, board: {width: 6000, height: 8600} }` e `blockBias ≈ 0.41`; nível 30 → `vehicles: 16`, `colors: 7`, `mix: {car:0.5,van:0.3,bus:0.2}`, `angleStep: 15`, `peakTarget: 4`, `winRateCap: 0.35`, `board.height: 10400`, `blockBias ≈ 0.7`; nível 200 → `vehicles: 24`, `colors: PALETTE.length`, `angleStep: 1`, `peakTarget: 4`, `blockBias: 1`, `winRateCap: 0.15`; para os níveis 1..200: `vehicles` não decresce, `colors ≤ vehicles`, soma de `mix` = 1; `levelConfig(0)`, `levelConfig(1.5)` e `levelConfig(-3)` lançam `RangeError`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/seed.test.ts games/embarca/src/logic/config.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `seed.ts` e `config.ts`**; exportar em `index.ts`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: semente e curva de dificuldade".

---

### Task 5: Colocação dos veículos (construção reversa)

**Files:**

- Create: `games/embarca/src/logic/placement.ts`
- Test: `games/embarca/src/logic/placement.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: `Rng` e `createRng` de `@recreio/core/puzzle`; `sweepFor`, `buildGeometry`, `VEHICLE_SPECS` de `./level`; `rectsOverlap`, `Rect` de `./geometry`; `LevelConfig`, `levelConfig` de `./config`; `normalizeAngle`, `sin`, `cos`, `TRIG_SCALE` de `./trig`.
- Produces:
  - `const CLEARANCE = 40`
  - `interface PlacedVehicle { kind: VehicleKind; cx: number; cy: number; angle: number }`
  - `function placeVehicles(config: LevelConfig, rng: Rng, options?: { attemptsPerVehicle?: number }): PlacedVehicle[] | null` — devolve os veículos **na ordem de saída plantada** (o índice `i` sai na posição `i`); `null` se algum não couber. Regras: os tipos saem de `config.mix` (sorteados antes das posições); a colocação é do **último** para o **primeiro**; cada candidato tem `angle = angleStep × rng.int(0, floor(359 / angleStep))`, centro inteiro sorteado de modo que o retângulo inteiro fique dentro do tabuleiro com margem `CLEARANCE`; é válido se (a) mantém folga ≥ `CLEARANCE` de todos os já colocados (testar `rectsOverlap` com o candidato inflado em `CLEARANCE`) e (b) o seu `sweepFor` **não** sobrepõe nenhum já colocado (os já colocados saem depois dele); entre até 24 candidatos válidos (no máximo `attemptsPerVehicle` sorteios, padrão 300) escolhe, com probabilidade `config.blockBias`, o que **mais bloqueia** os já colocados (conta de varreduras deles que ele sobrepõe; empate: o primeiro) e, senão, o primeiro válido; sem candidato válido devolve `null`.

- [ ] **Step 1: Testes (falham).** Para `config = levelConfig(n)` com `n ∈ {1, 10, 30, 100}` e 5 sementes cada (`createRng(mixSeed...)` basta `createRng(seed)` com sementes 1..5): resultado não nulo com `config.vehicles` veículos e tipos só entre os de peso > 0; ângulos múltiplos de `angleStep`; **dentro do tabuleiro com margem**: os 4 cantos de cada retângulo em `[CLEARANCE, largura−CLEARANCE] × [CLEARANCE, altura−CLEARANCE]` (calcule os cantos no teste com `sin`/`cos`); **folga**: nenhum par se sobrepõe quando um deles é inflado em `CLEARANCE` (`hl + CLEARANCE`, `hw + CLEARANCE`); **ordem plantada** (foco): `buildGeometry({ board: config.board, vehicles: <colocados com color 0> }).blockers[i].every((j) => j < i)` para todo `i`; **determinismo**: mesma semente, mesmo resultado (`toEqual`); **viés**: a soma dos tamanhos de `blockers` com `blockBias: 1` é estritamente maior que com `blockBias: 0` somando 5 sementes no nível 30 (passe `{ ...levelConfig(30), blockBias }`); **geometria impossível (foco 1)**: `placeVehicles({ ...levelConfig(30), board: { width: 1500, height: 1500 } }, createRng(1))` devolve `null` e termina rápido.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/placement.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `placement.ts`**; exportar `placeVehicles`, `CLEARANCE`, `type PlacedVehicle` em `index.ts`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: colocação dos veículos por construção reversa".

---

### Task 6: Cores e fila (dirigidas pelo motor real)

**Files:**

- Create: `games/embarca/src/logic/queue.ts`
- Test: `games/embarca/src/logic/queue.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: `Rng`; `buildGeometry`, `VEHICLE_SPECS`, `DEFAULT_SLOT_COUNT` de `./level`; `applyMove`, `createState`, `settle` de `./state`; `PlacedVehicle`, `placeVehicles` de `./placement`; `LevelConfig`, `levelConfig` de `./config`; `createLevel` de `./level`; `playOrder` de `./difficulty`.
- Produces: `interface ColorPlan { colors: number[]; queue: number[]; peakParked: number }` e `function buildColorsAndQueue(placed: readonly PlacedVehicle[], config: LevelConfig, rng: Rng): ColorPlan | null` — `colors[i]` é a cor do veículo `i` (ordem de saída); `queue` é a fila; `peakParked` o pico de vagas ocupadas depois de estacionar.
- Procedimento (fixo): (1) **cores:** embaralha os índices com `rng.shuffle`; os `config.colors` primeiros recebem as cores `0..colors−1` (uma cada) e os demais uma cor sorteada em `[0, colors)`. (2) monta a geometria com `buildGeometry` e um `Level` provisório com `queue: []` e `slotCount: DEFAULT_SLOT_COUNT`; `state = createState(provisório)`. (3) para `i` de `0` a `n−1`: `applyMove(state, { vehicle: i })` (se recusar, devolve `null`); depois, **enquanto** o número de vagas ocupadas for `≥ config.peakTarget` (ou, depois do último veículo, enquanto houver vaga ocupada): escolhe com `rng.pick` um veículo estacionado `P`, acrescenta à fila `P.seats − P.filled` passageiros da cor de `P`, e roda `settle` sobre o estado com a fila acrescida (o motor decide em quem embarcam). (4) devolve `colors`, `queue` e o pico observado.

- [ ] **Step 1: Testes (falham).** Para `n ∈ {1, 10, 30, 100}` e sementes 1..5: `placed = placeVehicles(levelConfig(n), createRng(seed))` (se `null`, tente a semente seguinte, mas pelo menos 3 sementes por nível devem render plano) e `plan = buildColorsAndQueue(placed, config, createRng(seed + 100))`: `plan` não nulo; `createLevel({ board, vehicles: placed com as cores, queue })` **não lança**; `playOrder(level, [0..n−1])` → `won: true` e `applied: n` (**foco 2**: reproduz com o motor real); `plan.peakParked ≤ config.peakTarget` e `=== config.peakTarget` quando `n ≥ config.peakTarget`; `queue.length` = soma dos assentos; `new Set(colors).size === config.colors` quando `n ≥ config.colors`; **determinismo** (`toEqual` entre duas chamadas com a mesma semente). Caso do foco 2: dois carros da mesma cor estacionados e um terceiro de outra cor com `peakTarget: 3` (monte `placed` e `config` à mão, posições em faixas livres): o plano reproduzido pelo motor vence e `peakParked ≤ 3`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/queue.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `queue.ts`**; exportar `buildColorsAndQueue`, `type ColorPlan` em `index.ts`.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `check`; `lint`.** Expected: PASS.
- [ ] **Step 5: Commit** — "Embarca: cores e fila de passageiros pelo motor real".

---

### Task 7: `generateLevel` e as 200 fases

**Files:**

- Create: `games/embarca/src/logic/generator.ts`
- Test: `games/embarca/src/logic/generator.test.ts`
- Modify: `games/embarca/src/logic/index.ts`

**Interfaces:**

- Consumes: tudo de `./config`, `./seed`, `./placement`, `./queue`, `./level` (`createLevel`), `./state` (`createState`), `./solver` (`solve`), `./difficulty` (`playOrder`, `randomPlayoutWinRate`); `createRng` do `core`.
- Produces:
  - `interface GenerateOptions { maxNodes?: number; maxVariations?: number; samples?: number }` (padrões: `60_000`, `64`, `200`; **sem** limite de tempo)
  - `interface GeneratedLevel { level: number; variation: number; seed: number; config: LevelConfig; state: State; solution: Move[]; solverNodes: number; winRate: number; peakParked: number }`
  - `function generateLevel(level: number, options?: GenerateOptions): GeneratedLevel` — para cada variação `v` de 0 a `maxVariations−1`: `seed = mixSeed(level, v)`, `rng = createRng(seed)`; `placeVehicles` → `buildColorsAndQueue` → **embaralha os ids** (`rng.shuffle` de `0..n−1`: o veículo que sai em `e` recebe o id `perm[e]`; o array de veículos é reordenado de acordo, e `solution` = `[{vehicle: perm[0]}, …]`) → `createLevel` → aceita só se (a) `playOrder` da solução vence com `applied === n`, (b) `solve(state, { maxNodes })` dá `'solved'`, (c) `randomPlayoutWinRate(level, seed ^ 0x9e3779b9, samples) ≤ config.winRateCap`; qualquer falha passa à próxima variação (um `null` ou um `RangeError` interno também). Esgotadas as variações lança `Error` com o número da fase e `maxVariations`. Lança `RangeError` para fase inválida (via `levelConfig`). `solution` é a ordem plantada; `state` é o estado inicial.

- [ ] **Step 1: Testes (falham).** (a) para as fases **1 a 200** (um `it` com timeout de 180 s): cada uma gera sem erro e: `state.level.vehicles.length === config.vehicles`; `playOrder(state.level, solution.map(m => m.vehicle))` vence com `applied === n`; `hint(state)` (do Task 2) devolve `status: 'solved'` com `move` não nulo (**foco 3**); `winRate ≤ config.winRateCap`; folga: nenhum par de veículos sobreposto quando um deles é inflado em `CLEARANCE`; `peakParked ≤ 4`; acumular as variações usadas e afirmar que **pelo menos 95%** das fases usam `variation < 8`. (b) **determinismo (foco 4):** `generateLevel(7)` duas vezes é `toEqual`, e `JSON.parse(JSON.stringify(g))` é `toEqual` ao original. (c) **ids não revelam a solução (foco 5):** nas fases 10..200, em pelo menos 80% delas `solution.map(m => m.vehicle)` não é crescente. (d) **sem variações (foco 1):** `generateLevel(30, { maxVariations: 0 })` lança `Error` (não `RangeError`) cuja mensagem cita a fase 30 e `0`, sem laço infinito; `generateLevel(0)` e `generateLevel(1.5)` lançam `RangeError`. (A geometria impossível em si já é coberta no Task 5.) (e) `solverNodes > 0` e `solution.length === vehicles`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/logic/generator.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar `generator.ts`**; exportar `generateLevel`, `type GeneratedLevel`, `type GenerateOptions` em `index.ts`.
- [ ] **Step 4: Rodar o teste das 200 fases e a suíte.** Run: `pnpm vitest run games/embarca` — Expected: PASS.
- [ ] **Step 5: Calibração (se algo do Step 4 falhar ou ficar lento).** Escrever um teste temporário que imprime, por fase, `variation`, `solverNodes`, `winRate`, `peakParked` e o tempo, e ajustar **apenas** estas válvulas, nesta ordem, registrando cada mudança em `DECISIONS.md`: (1) se mais de 5% das fases esgotam variações por causa do solver, subir `maxNodes` até no máximo `400_000`; (2) se a colocação falha muito, reduzir `blockBias` ou `vehicles` do nível alto (nunca `CLEARANCE`); (3) se persistir, aceitar o solver só até a fase 60 e registrar um `Ruling` (a ordem plantada continua sendo a garantia). Apagar o teste temporário. O tempo de gerar as 200 fases no Node não deve passar de 60 s.
- [ ] **Step 6: `check`; `lint`; commit** — "Embarca: gerador por construção reversa e 200 fases validadas".

---

### Task 8: Worker

**Files:**

- Create: `games/embarca/src/worker/protocol.ts`, `games/embarca/src/worker/handler.ts`, `games/embarca/src/worker/client.ts`, `games/embarca/src/worker/logic.worker.ts`, `games/embarca/src/worker/index.ts`, `games/embarca/src/env.d.ts`
- Test: `games/embarca/src/worker/worker.test.ts`
- Modify: `games/embarca/package.json` (adicionar `"./worker": "./src/worker/index.ts"` em `exports`)

**Interfaces:**

- Consumes: `generateLevel`, `hint`, `GeneratedLevel`, `HintResult`, `State` de `../logic`.
- Produces: o mesmo contrato do Worker da Mistura, trocando só os tipos: `LogicRequest = { id: number; type: 'generate'; level: number } | { id: number; type: 'hint'; state: State }`; `LogicResponse` (generate → `GeneratedLevel`, hint → `HintResult`, error → `{ id, type: 'error', message }`); `LogicRequestBody`; `handleRequest(req: LogicRequest): LogicResponse` (nunca lança; `HINT_MAX_MILLIS = 2000` na dica); `createLogicClient(options?)` com `generateLevel(level, options?)`, `hint(state, options?)`, `dispose()`; `CancelledError`, `describeWorkerError`, `formatWorkerError`, `WorkerLike` e demais tipos de `client.ts`, reexportados por `worker/index.ts`.

- [ ] **Step 1: Testes (falham).** Portar `games/mistura/src/worker/worker.test.ts` para a Embarca, **mantendo todos os casos de `createLogicClient` e de diagnóstico** (fila de um pedido por vez, substituição da mesma chave, abort, messageerror, onerror, dispose, fallback, handler real em Node, `describeWorkerError`) e trocando só os casos do `handleRequest`: `generate` devolve a fase idêntica a `generateLevel(3)` e o mesmo `id`; `hint` de um estado gerado devolve `result.move` não nulo e `result.state` igual ao enviado; `generate` com `level: 0` vira `{ type: 'error' }` sem lançar; as respostas sobrevivem a `structuredClone` (`toEqual`).
- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm vitest run games/embarca/src/worker/worker.test.ts` — Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implementar copiando** `protocol.ts`, `handler.ts`, `client.ts`, `logic.worker.ts`, `index.ts` e `env.d.ts` de `games/mistura/src/worker` e `games/mistura/src`, trocando: tipos importados de `../logic`; o prefixo dos logs de `[mistura]` para `[embarca]`; o handler para chamar o `generateLevel` e o `hint` da Embarca. O `client.ts` fica duplicado de propósito (309 linhas): registrar em `DECISIONS.md` que a extração para o `core` fica para quando o terceiro jogo precisar.
- [ ] **Step 4: Rodar `pnpm vitest run games/embarca`; `pnpm --filter @recreio/game-embarca check`; `pnpm lint`.** Expected: PASS e sem erros de tipo.
- [ ] **Step 5: Commit** — "Embarca: Worker de geração e dica".

---

### Task 9: Fechamento do marco

**Files:**

- Modify: `docs/DECISIONS.md` (nova seção "Embarca — Marco 2")

- [ ] **Step 1: Registrar em `docs/DECISIONS.md`** a seção "Embarca — Marco 2" com: a curva de dificuldade final (as fórmulas de `levelConfig` e os valores de `CLEARANCE`, `maxNodes`, `samples`, `winRateCap`, **exatamente como ficaram depois da calibração**); a estatística das 200 fases (variação máxima usada, `solverNodes` máximo, tempo total no Node, `winRate` máximo por faixa); o motivo de dirigir a fila pelo motor real (`settle`); a decisão de duplicar `mixSeed` e o cliente do Worker; o limite conhecido de que a dificuldade é medida por partidas aleatórias, não por solução ótima; o lembrete de que o "beco sem saída" de posição sem solução será detectado com `hint(...).status === 'unsolvable'` (marco 4).
- [ ] **Step 2: Verificação completa.** Run: `pnpm test`, `pnpm lint`, `pnpm check` — Expected: tudo verde, testes da Mistura intactos; `git status` só com os arquivos do marco.
- [ ] **Step 3: Commit** — "Embarca: decisões do marco 2".
- [ ] **Step 4: Revisão e parada (CLAUDE.md).** Chamar o subagente `revisor` sobre o diff do marco; aplicar o que for problema real; **parar** e dizer ao Alex o que testar. Como o marco 2 não tem tela, o teste dele é `pnpm test`; o primeiro teste no celular só vem no marco 3.

---

## Self-Review

- **Spec coverage (seção 6 e marco 2):** construção reversa com ordem plantada (Tasks 5-7); fila e cores por simulação com ocupação máxima por faixa (6); medida de dificuldade por partidas aleatórias com teto por faixa (3, 4, 7); solver com chave canônica e limites no molde do `solveSearch` (2); geração por fase com semente `mixSeed(fase, variação)` e limite de nós (4, 7); Worker (8); testes de 200 fases com solução, folga e determinismo (7). Fora deste marco, como pede a spec: render (marco 3), tutorial e "sem saída" por falta de solução (4), misterioso e garagem (5).
- **Tipos consistentes:** `LevelConfig` (Task 4) é consumido com os mesmos campos em 5, 6 e 7; `PlacedVehicle` (5) em 6 e 7; `ColorPlan` (6) em 7; `GeneratedLevel.state` e `solution: Move[]` (7) em 8; `HintResult` (2) em 7 e 8.
- **Proporção:** o plano descreve contratos, procedimentos e testes; os corpos dos algoritmos ficam com o implementador, exceto o procedimento da fila (6), que o contrato não determina.
