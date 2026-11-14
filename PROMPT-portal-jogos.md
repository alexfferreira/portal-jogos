# Prompt para o Claude Code — Portal pessoal de jogos (começando pela "Mistura de cores")

> Este documento é autossuficiente. Você (agente) não tem acesso à conversa em que ele foi planejado; tudo o que foi decidido está aqui, com o motivo. A especificação **já está decidida**: não refaça a fase de brainstorm do zero. Pergunte apenas o que for realmente ambíguo; se for detalhe menor, escolha a opção mais simples, registre em `DECISIONS.md` e siga.

---

## 0. Contexto

Sou o Alex, desenvolvedor (TypeScript, SvelteKit, Docker). Gosto de jogos casuais de puzzle no celular, mas a quantidade de anúncios nesses apps estraga a experiência. Quero um **portal pessoal de jogos**:

- **Sem anúncios**, sem compras, sem login, sem rastreamento.
- **Funciona offline** depois de instalado no celular (PWA).
- **Vários jogos** no mesmo app, cada um com seu progresso.
- Para uso pessoal agora; o código deve ser organizado o bastante para, no futuro, um jogo virar app de loja (via Capacitor) sem reescrever.

O projeto **começa por um jogo só: "Mistura de cores"** (water sort / ordenar líquidos em tubos). A base comum precisa nascer preparada para os próximos jogos (seção 9), mas **não implemente os outros jogos agora**.

Nomes provisórios: portal **"Recreio"**, jogo **"Mistura"**. Podem mudar; mantenha nomes visíveis em i18n e no `package.json`, fáceis de trocar.

Não copie nome, marca ou arte de jogos existentes. A mecânica é referência; a identidade visual é original.

---

## 1. Decisões já tomadas (e por quê)

| Decisão | Motivo |
|---|---|
| **Three.js para todos os jogos** (inclusive os "2D", com câmera de cima) | Haverá jogos 3D (parafusos 3D, sniper). Uma engine só = um aprendizado, visual consistente "brinquedo 3D" em todo o portal. |
| **Rapier** (`@dimforge/rapier2d`/`rapier3d-compat`) para física | Só será necessário em jogos futuros (parafusos, sniper). **Não adicione agora**, apenas deixe a base preparada para um jogo trazer sua própria física. |
| **SvelteKit** com `adapter-static` para portal e telas (menus, HUD, modais em HTML sobre o canvas) | O Alex já domina SvelteKit; build 100% estático. |
| **TypeScript strict**, **pnpm** workspaces (monorepo) | Base compartilhada entre jogos. |
| **PWA offline** (`@vite-pwa/sveltekit` / Workbox) | Requisito central: jogar sem internet. |
| **Sem backend**. Progresso local (IndexedDB) com exportar/importar | Simplicidade; nada a manter em servidor. |
| **Hospedagem na Vercel (plano Hobby)**, deploy automático pelo GitHub | Grátis para uso pessoal não comercial, preview HTTPS por branch (necessário para testar PWA no celular). O build deve ser **independente de hospedagem**: documente também como servir os arquivos estáticos em uma VPS com nginx. |
| **Gráficos procedurais** (geometria gerada em código) | Sem orçamento para arte. Tubos, líquidos, parafusos, tábuas, hexágonos são formas simples. Modelos prontos (glTF, licença CC0) só quando inevitável, em jogos futuros. |
| **Sons sintetizados** (Web Audio) no início; serviço de áudio que aceite arquivos depois (Howler.js) | Sem assets de áudio por enquanto. |
| Idiomas: **pt-BR (padrão), en, es** | Requisito. |
| Orientação **retrato**, mobile-first | Uso principal no celular. |

---

## 2. Ambiente de desenvolvimento

- **Windows nativo** com **Git Bash** (Claude Code rodando no Windows, não no WSL).
- Todos os scripts do `package.json` devem ser **multiplataforma**: nada de comandos exclusivos de bash; use scripts Node (`.ts`/`.mjs`) quando precisar de lógica, e `cross-env` se precisar de variáveis.
- Node.js LTS, pnpm.
- Repositório Git no GitHub pessoal do Alex.

### Ferramentas do agente (plugins instalados no Claude Code)

- **Superpowers**: use para planejar e executar com disciplina (plano por marco, TDD na lógica, revisão ao fim). A especificação está pronta; o brainstorm deve ser curto, só para esclarecer ambiguidades.
- **Playwright (MCP)**: ao fim de cada marco, abra o app no navegador em viewport de celular (390×844), tire screenshots, verifique se renderiza, se os toques funcionam e se não há erros no console. Mostre-me os screenshots relevantes.
- **Context7 (MCP)**: **consulte a documentação atual** antes de usar APIs de Three.js, SvelteKit, `@vite-pwa/sveltekit`, Workbox e (futuramente) Rapier. Essas APIs mudam entre versões; não confie de memória.

---

## 3. Estrutura do repositório

```
/
  apps/
    portal/                  # SvelteKit (adapter-static): tela inicial, rotas dos jogos, configurações, PWA
  packages/
    core/                    # base comum (seção 4) — TS puro + Three.js, sem Svelte
    ui/                      # componentes Svelte compartilhados (HUD, modais, botões, ícones)
  games/
    mistura/                 # jogo 1 (seção 6)
      src/logic/             # regras, gerador, solver — TS puro, sem Three.js, 100% testado
      src/render/            # cena Three.js, animações, input
      src/index.ts           # exporta o GameModule
  docs/
    DECISIONS.md
    GAMES.md                 # roadmap dos próximos jogos (seção 9), copiado deste prompt
  README.md
```

Cada jogo é um pacote do workspace, **carregado sob demanda** (import dinâmico) pelo portal, e ainda assim **pré-cacheado** pelo service worker para funcionar offline.

---

## 4. Base comum (`packages/core`)

### 4.1 Contrato do jogo

```ts
interface GameModule {
  id: string;                         // 'mistura'
  meta: {
    titleKey: string;                 // chave i18n
    descriptionKey: string;
    icon: string;                     // nome de ícone ou SVG inline
    mode: 'levels' | 'score';         // progresso por fases ou por recorde
    orientation: 'portrait';
  };
  mount(container: HTMLElement, ctx: GameContext): Promise<GameInstance>;
}

interface GameInstance {
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;                    // libera geometrias, materiais, texturas, listeners
}
```

`GameContext` fornece: `storage`, `audio`, `i18n`, `settings`, `haptics`, `events` (emitir `level-complete`, `game-over`, `score`), e helpers 3D (abaixo). O portal desenha o HUD comum e reage aos eventos; o jogo cuida do tabuleiro.

### 4.2 Palco 3D (`createStage`)
- Cria `WebGLRenderer` (antialias, `devicePixelRatio` limitado a 2), cena, luzes padrão (ambiente + direcional suave com sombra opcional), fundo.
- Presets de câmera: **ortográfica de cima** e **perspectiva inclinada**, com ajuste automático para caber o conteúdo na tela (fit-to-bounds) em qualquer proporção retrato.
- **Materiais "brinquedo"**: paleta comum (seção 7), aparência plástica/lisa, leve brilho.
- **Picking** por raycast a partir de toque/clique, com área de toque generosa.
- **Tweens/animações** (biblioteca leve ou implementação própria) com easing.
- Loop com pausa automática quando a aba/app fica oculta (`visibilitychange`).
- Redimensionamento responsivo.
- Opção de **qualidade** (alta/baixa: sombras, antialias, pixel ratio) nas configurações.
- `dispose` completo para não vazar memória ao trocar de jogo.

### 4.3 Progresso
- Modo **levels**: fase atual, fases concluídas, estrelas opcionais, power-ups restantes por fase.
- Modo **score**: recorde e histórico curto.
- Persistência em **IndexedDB** (ex.: `idb-keyval`), schema versionado com migrações, tolerante a dados corrompidos.
- Pedir `navigator.storage.persist()` para reduzir risco de o navegador apagar os dados.
- **Exportar/importar** todo o progresso em um arquivo JSON (backup manual).

### 4.4 Ferramentas para puzzles
- **Desfazer**: pilha de estados imutáveis (ou comandos reversíveis).
- **PRNG com semente** (ex.: mulberry32) — tudo que é aleatório em gerador de fase deve ser determinístico pela semente.
- **Execução em Web Worker** para gerador/solver, para não travar a interface.
- Interface genérica `Solver<State, Move>` (busca com memoização de estados canônicos, limite de nós/tempo).

### 4.5 Serviços
- **i18n**: biblioteca leve (ex.: Paraglide) ou implementação simples; detecta `navigator.language` na primeira vez; troca sem recarregar. Nenhum texto fixo no código.
- **Áudio**: Web Audio com sons **sintetizados** em código (clique, despejar líquido, tubo completo, vitória, erro); estrutura para trocar por arquivos (Howler.js) depois. Volume de efeitos e música separados; só inicia após a primeira interação.
- **Vibração** (`navigator.vibrate`) curta e configurável.
- **Configurações globais**: idioma, som, música, vibração, qualidade gráfica, modo daltônico.

---

## 5. Portal (`apps/portal`)

- **Início**: grade de cards dos jogos (ícone, nome, progresso: "Fase 37" ou "Recorde 1200"). Por enquanto só a Mistura; deixe o layout pronto para vários.
- **Rota do jogo** (`/jogo/[id]`): monta o jogo em tela cheia; HUD comum (voltar, título/fase, pausar, reiniciar) + barra de power-ups fornecida pelo jogo.
- **Configurações**: as globais (4.5) + backup (exportar/importar) + resetar progresso de um jogo (com confirmação dentro do app, nunca `window.confirm`).
- **Instalação**: aviso discreto ensinando a instalar (Android: prompt nativo; iPhone: "Compartilhar → Adicionar à Tela de Início"), explicando que no iPhone isso é importante para o progresso não ser apagado.
- **PWA**: manifest (nome, ícones gerados por código/SVG, cor de tema, `display: standalone`, retrato), service worker com **pré-cache de tudo** (portal + todos os jogos), funcionamento 100% offline, aviso de "nova versão disponível — atualizar".
- Transições suaves, visual alegre e limpo, consistente com o estilo dos jogos.

---

## 6. Jogo 1 — "Mistura de cores" (`games/mistura`)

### 6.1 Regras
- Há **tubos**, cada um com **capacidade de 4 unidades** de líquido (configurável por fase; fases avançadas podem usar 5).
- Cada unidade tem uma cor. Unidades adjacentes de mesma cor formam um bloco.
- **Jogada**: tocar um tubo de origem (ele sobe destacado) e depois um tubo de destino.
  - Válida se o destino estiver **vazio** ou se a **cor do topo** do destino for igual à do topo da origem, e houver espaço.
  - Transfere o máximo possível do bloco do topo da origem (limitado ao espaço livre).
  - Tocar a própria origem de novo cancela a seleção. Jogada inválida: tubo treme + som de erro.
- **Vitória**: todo tubo está vazio ou cheio com uma única cor. Um tubo completo ganha uma "tampa"/brilho de celebração.
- **Sem saída**: se não houver nenhuma jogada válida, mostre o aviso com opções (desfazer, tubo extra, reiniciar).

### 6.2 Fases
- **Fases infinitas**, geradas pela semente = número da fase, com curva de dificuldade:
  - Fases 1–5: 3–4 cores, 2 tubos vazios (tutorial nas 1–2 com mãozinha e texto curto).
  - Até a 30: 5–7 cores.
  - Até a 100: 8–10 cores.
  - Depois: 11–14 cores; ocasionalmente tubos de capacidade 5; **camadas ocultas** ("?" — a cor de uma unidade só aparece quando ela chega ao topo) a partir da fase 40, em parte das fases.
  - Fases grandes (muitos tubos) devem caber na tela com layout automático em grade (2 colunas de blocos com espaço no meio, ou grade simples), sempre com área de toque confortável.
- **Gerador**: distribui `cores × capacidade` unidades embaralhadas entre os tubos, mais N tubos vazios. Evite estados triviais (tubo já completo no início, muitos blocos já agrupados).
- **Solver**: valida que a fase é resolvível **sem power-ups** antes de entregá-la; se não for, tenta a próxima variação da semente (determinístico). Roda no Web Worker. Usa estado canônico (ordenação dos tubos) para memoização.
- Gere e verifique as **primeiras 200 fases** em teste automatizado (todas resolvíveis, tempo de geração aceitável no celular).

### 6.3 Power-ups (quantidade por fase, reabastece a cada fase)
- **Desfazer**: 5 por fase.
- **Tubo extra**: 1 por fase (adiciona um tubo vazio).
- **Reiniciar**: ilimitado (botão do HUD).
- Uma **dica** opcional (usa o solver para indicar a próxima jogada): 1 por fase.

### 6.4 Visual (Three.js, procedural)
- Câmera ortográfica frontal levemente inclinada; fundo com gradiente suave e partículas discretas.
- **Tubos de vidro**: cilindro com fundo arredondado, material transparente com reflexo suave (barato o suficiente para celular — evite transmissão física cara; ofereça versão simples na qualidade baixa).
- **Líquido**: segmentos cilíndricos coloridos empilhados dentro do tubo, com topo levemente brilhante.
- **Animação de despejar**: o tubo de origem sobe, vai até acima do destino, inclina; um filete de líquido (geometria fina animada) desce; o nível da origem baixa e o do destino sobe em sincronia; o tubo volta ao lugar. Rápida (~0,6–0,9 s) e interrompível sem corromper o estado (a lógica decide na hora; a animação só representa).
- Tubo completo: tampa/rolha aparece + brilho + som.
- Vitória: confete 3D + modal "Fase concluída" (próxima fase, voltar).
- **Modo daltônico**: símbolo pequeno em cada unidade de cor.

### 6.5 Arquitetura do jogo
- `logic/` puro e determinístico: `State`, `applyMove`, `legalMoves`, `isWin`, `generateLevel(seed)`, `solve(state)`.
- `render/` só reflete o estado e anima transições; entradas viram `Move`s enviados à lógica.

---

## 7. Estilo visual comum

- Estética **"brinquedo 3D"**: formas arredondadas, cores saturadas, aparência de plástico/vidro liso, sombras suaves, animações com "juice" (easing, pequenos quiques).
- **Paleta global** de ~12 cores bem distinguíveis entre si (inclusive em telas pequenas), definida em `core` e usada por todos os jogos, cada uma com um símbolo para o modo daltônico.
- Tipografia arredondada e legível (fonte livre, embutida no build para funcionar offline).
- UI (HUD, modais) em Svelte, com botões grandes, cantos arredondados e ícones simples.

---

## 8. Qualidade, testes e desempenho

- **Vitest**: lógica da Mistura (jogadas, vitória, sem saída, desfazer, camadas ocultas), gerador e solver (200 fases), migrações do storage, export/import.
- **Playwright**: teste e2e mínimo — abrir o portal, entrar na Mistura, fazer jogadas, completar a fase 1 (usando o solver para guiar o teste), verificar persistência após recarregar e funcionamento offline (simulando rede desligada).
- ESLint + Prettier; `pnpm check` (svelte-check) sem erros.
- **60 fps** em celular médio na maior fase; sem vazamento de memória ao entrar e sair do jogo várias vezes.
- Acessibilidade básica: contraste, tamanhos de toque ≥ 44 px, modo daltônico.

---

## 9. Próximos jogos (NÃO implementar agora — apenas registrar em `docs/GAMES.md` e garantir que a base suporta)

1. **Embarca** (estacionamento, estilo "Bus Jam/Car Jam") — modo levels. Veículos (carro 4 lugares, van 6, ônibus 10) em ângulos livres num tabuleiro, cada um com uma seta; tocar faz o veículo andar em linha reta na direção da seta; se o caminho estiver livre ele sai e estaciona numa de 4 vagas; se bater, volta ("bate e volta"). Uma fila de passageiros coloridos embarca no veículo estacionado da mesma cor; veículo cheio parte e libera a vaga. Perde se as vagas lotarem sem combinar com a fila. Extras: veículo misterioso "?", garagem que solta N veículos, obstáculos fixos, power-ups (desfazer, embaralhar cores, guindaste, vaga extra). Fases geradas por construção reversa + solver para garantir solução. Veículos em 3D low-poly (procedurais ou modelos CC0 recoloridos).
2. **Parafusos 2D** — modo levels. Tábuas coloridas presas por parafusos numa placa; tocar num parafuso livre o move para um furo vazio; tábuas sem parafusos caem (física 2D com **Rapier**). Objetivo: derrubar todas as tábuas. Power-ups: dica, desfazer, furo extra, remover parafuso.
3. **Pilhas hexagonais** — modo levels. Grade hexagonal; o jogador coloca pilhas de hexágonos coloridos; pilhas vizinhas trocam/fundem camadas do mesmo cor em cadeia; 10 da mesma cor somem. Objetivo: atingir a meta de peças.
4. **Snake** — modo score.
5. **Blocos** (estilo Tetris, com nome próprio — "Tetris" é marca registrada) — modo score.
6. **Parafusos 3D** — modo levels. Cenas 3D (casa, sala) cobertas de parafusos coloridos; tirar parafusos e encaixá-los em caixas da mesma cor com 3 furos.
7. **Sniper** — ação 3D; o mais complexo; por último.

Requisitos que isso impõe à base (garanta agora): suporte a modo `score`; jogo pode trazer física própria; jogo pode carregar modelos glTF pré-cacheados; câmera ortográfica e perspectiva; input de toque e arrastar; HUD com power-ups configurável por jogo.

---

## 10. Publicação

- `pnpm build` gera o site estático em `apps/portal/build`.
- **Vercel**: projeto conectado ao repositório do GitHub; documente no README as configurações (diretório raiz, comando de build com pnpm, diretório de saída) e inclua `vercel.json` com cabeçalhos corretos (service worker e manifest sem cache agressivo; assets com hash com cache longo).
- Cada branch gera um **preview HTTPS** — é como o Alex testa no celular (instalação PWA exige HTTPS).
- Documente também a alternativa: servir `build/` com nginx numa VPS (exemplo de configuração com fallback SPA e cabeçalhos do service worker).
- Nada de chaves, segredos ou analytics.

---

## 11. Marcos

Trabalhe em marcos. Ao fim de **cada** um: rode testes e lint, verifique com Playwright (screenshots em viewport de celular), faça commit com mensagem clara e **pare**, dizendo exatamente o que eu devo testar e como.

1. **Fundação**: monorepo pnpm, TS strict, lint/format, Vitest, Playwright, estrutura de pastas, `README.md`, `docs/DECISIONS.md`, `docs/GAMES.md`.
2. **Core**: contrato `GameModule`, palco 3D, picking, tweens, storage (IndexedDB + migrações + export/import), i18n, áudio sintetizado, configurações. Uma cena de demonstração simples para validar.
3. **Portal**: tela inicial, rota de jogo com HUD comum, configurações, backup, tema visual.
4. **Mistura — lógica**: regras, desfazer, gerador, solver em Web Worker, camadas ocultas, testes das 200 fases.
5. **Mistura — 3D e jogabilidade**: tubos, líquidos, animação de despejar, power-ups, tutorial, vitória/sem saída, sons, modo daltônico, layout de fases grandes.
6. **PWA e offline**: manifest, ícones, pré-cache, atualização de versão, aviso de instalação, teste offline.
7. **Publicação**: `vercel.json`, README com passo a passo da Vercel (para quem nunca usou) e da alternativa em VPS, verificação final de desempenho.

Ao terminar o marco 7, me entregue um resumo do que ficou pronto, decisões tomadas por conta própria (de `DECISIONS.md`) e sugestão de próximo passo (provavelmente iniciar o Embarca).
