# Embarca — design

Segundo jogo do portal Recreio (modo `levels`). Estacionamento no estilo "Bus Jam / Car Jam".
Escrito em 2026-11-15, depois de conversa com o Alex. A spec original (um parágrafo) está em
`docs/GAMES.md` item 1 e em `PROMPT-portal-jogos.md` seção 9.

Legenda: **[Alex]** = decidido pelo Alex na conversa. **[Minha decisão]** = proposta minha, com motivo; o
Alex pode corrigir.

## 1. Intenção

Um quebra-cabeça de **planejamento**: o que prende o jogador é escolher **qual veículo mandar sair, e em que
ordem**, para vencer a fase **[Alex]**. A graça está em ver a fila de passageiros inteira, pensar na ordem e
acertar. Jogo pessoal do Alex, offline, sem anúncios, no celular (retrato).

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**

- Toda fase tem pelo menos uma ordem de saída que vence, garantida pelo gerador.
- A decisão é de ordem: não depende de pontaria nem de sorte.
- Mesma base técnica da Mistura: `logic` pura e testável, `render` só anima, gerador e solver em Worker.
- Visual "brinquedo 3D" do portal, cores da paleta comum com símbolo no modo daltônico.

**Não objetivos (primeira versão)**

- Sem física (Rapier), sem multiplayer, sem placar ou estrelas, sem modelos de terceiros (se um dia houver,
  só CC0 registrado em `docs/DECISIONS.md`).
- Sem outros jogos do roadmap.

**Anti-objetivos (falha mesmo que "funcione")**

- Fase que se vence por sorte ou por tentativa e erro às cegas.
- Fase em que acertar o toque num veículo exige precisão de dedo (alvos < 44 px).
- Revelar a cor de um veículo misterioso "?" por `data-state` ou pelo console antes de ele estacionar.

## 3. Regras do jogo

**Tabuleiro.** Retângulo em retrato. Contém veículos (carro 4 lugares, van 6, ônibus 10) com posição e ângulo
livres, cada um com uma seta de saída, e obstáculos fixos. Veículos não se movem, a não ser ao serem enviados.

**Enviar um veículo (toque).** O veículo anda em linha reta na direção da seta.
- Caminho livre até a borda **e** há vaga livre: sai, estaciona na vaga livre de menor índice.
- Caminho bloqueado (outro veículo ou obstáculo): bate e volta, sem mudar o estado. O jogo mostra a batida e
  conta em "batidas" (só informativo, sem penalidade) **[Minha decisão]**.
- Caminho livre mas as 4 vagas ocupadas: não sai (mesma resposta visual da batida).

**Fila de passageiros [Alex: toda a fila visível].** Cada passageiro tem uma cor. Só o primeiro da fila embarca,
e só em um veículo estacionado da mesma cor com assento livre. Se houver mais de um, embarca no de menor índice
de vaga **[Minha decisão]**. O embarque é automático e em cascata: depois de cada jogada, enquanto o primeiro da
fila puder embarcar, ele embarca. Se não houver veículo da cor dele, a fila espera.

**Veículo sem passageiro compatível.** O jogador pode enviar qualquer veículo livre, mesmo que ninguém
embarque agora. Ele estaciona e **ocupa a vaga** até o primeiro da fila ser da cor dele. É isso que cria a
tensão: encher as vagas com veículos que ainda não vão ser atendidos leva à derrota. Não há outro controle
contra "entupir" além do limite de 4 vagas e do Desfazer.

**Veículo cheio** parte e libera a vaga.

**Vitória:** todos os veículos partiram (a soma dos assentos é igual ao número de passageiros, então fila vazia
equivale a tabuleiro vazio) **[Minha decisão]**.

**Derrota ("sem saída"):** depois da cascata, as vagas estão cheias e o primeiro da fila não combina com nenhum
estacionado; ou nenhum veículo está livre para sair e nada pode embarcar. Mesmo painel de opções da Mistura:
Desfazer, power-up de vaga extra (se houver carga), Reiniciar.

**Veículo misterioso "?":** cor escondida até estacionar.

**Garagem:** objeto que solta N veículos em sequência. Detalhes na seção 9.

## 4. Abordagens consideradas **[Alex escolheu A]**

- **A. Geometria livre.** Retângulos girados, varredura até a borda. Como sair um veículo não move os outros,
  o grafo "quem bloqueia quem" é calculado uma vez por fase e a `logic` vira um problema de ordem. Escolhida.
- **B. Grade com 8 direções.** Mais simples, tabuleiro duro. Descartada.
- **C. Física com Rapier.** Não determinística, não dá para garantir solução. Descartada.

## 5. Modelo de lógica (`games/embarca/src/logic`, TS puro)

- **Determinismo da geometria [Minha decisão].** `Math.sin/cos` podem diferir entre motores, e o gerador roda no
  Worker do celular enquanto os testes rodam no Node. Por isso: coordenadas em **inteiros** (milésimos de
  unidade do tabuleiro), ângulos em **graus inteiros**, com tabela de senos/cossenos **precomputada e
  embutida** (inteiros escalados). A colisão usa só aritmética inteira (teste de eixos separadores). O gerador
  exige uma **folga mínima** entre veículos para nenhuma jogada depender de um caso de borda.
- **Bloqueios.** Para cada veículo, o conjunto de veículos/obstáculos que cruzam o seu caminho. Obstáculo fixo
  que bloqueia = veículo que nunca sai (o gerador não cria isso).
- **Estado:** veículos restantes, vagas (veículo, assentos ocupados), posição na fila, contagem de batidas.
  Imutável, como na Mistura. `applyMove` devolve o resultado completo (saiu/bateu/recusado, embarques, partidas)
  para o render apenas animar.
- **Ganchos já no marco 1 [Minha decisão].** Para o marco 5 não reescrever o estado: cada veículo carrega
  `hidden` (cor real guardada, mostrada só depois de estacionar, como as camadas ocultas da Mistura) e uma
  lista `waiting` de veículos de garagem (vazia no início, a lógica de liberar fica para o marco 5).
- **Sem sobreposição inicial.** Nenhum par de veículos ou obstáculos se sobrepõe no início da fase; o gerador
  exige a folga mínima entre eles.
- **Desfazer:** pilha de estados (`UndoStack` do `core`), 5 cargas por fase **[Minha decisão, igual à Mistura]**.

## 6. Gerador e solver (Web Worker)

- **Construção reversa [spec].** Sorteia (PRNG com semente do `core`) uma ordem de saída v1..vn. Coloca os
  veículos do último para o primeiro: cada um é posto de forma que **seu caminho não cruze nenhum veículo já
  posto** (que são os que saem depois dele). Os postos depois (que saem antes) podem ficar na frente dele.
- **Fila e cores [Minha decisão].** Cores e fila saem de uma **simulação da ordem plantada**: o gerador
  simula as saídas v1..vn e, a cada vez que uma vaga fica ocupada, decide quais passageiros embarcam a seguir,
  montando a fila de modo que a ordem plantada vence e a ocupação máxima de vagas dela fica dentro da faixa da
  fase (fases fáceis: 2 a 3 vagas no pico; difíceis: 4 de 4). Uma cor pode ser dividida entre vários veículos
  (de tamanhos iguais ou diferentes); a soma dos assentos de cada cor é igual ao número de passageiros dela.
  Máximo de cores por fase: começa em 3 e sobe até o tamanho da paleta comum do `core` (fases grandes).
- **Medida de dificuldade e anti-objetivo "sorte" [Minha decisão].** O solver amostra ordens de envio
  aleatórias (com semente) e mede a fração que vence, além do pico de vagas da melhor ordem. A fase só é aceita
  se a fração de ordens vencedoras ficar abaixo de um teto por faixa (fases iniciais mais folgadas, avançadas
  bem mais estreitas; valores exatos para o construtor calibrar). Os testes do marco 2 verificam esse teto.
  A batida continua sem penalidade: ela não altera o estado, e enviar um veículo livre é irreversível fora o
  Desfazer (5 cargas), então tentar às cegas já custa.
- **Geração por fase [já é o padrão da Mistura].** Fase N é gerada na hora no Worker a partir de uma semente
  derivada do número da fase (`mixSeed(level, variação)`), com a fase N+1 pré-gerada. Limite de nós
  (determinístico) e não de tempo; "refazer com outra semente" é incrementar a variação.
- **Solver:** busca com chave canônica sobre o estado acima, com limite de nós e de tempo, no mesmo molde do
  `solveSearch` do `core`. Serve para dica e para medir dificuldade. A garantia de solução vem da construção,
  não do solver.
- **Veículo misterioso:** o solver usa a cor real (como a dica da Mistura).

## 7. Render (`games/embarca/src/render`, Three.js)

- Câmera ortográfica inclinada, retrato 390×844, `fitOrthographic` do `core` **[Minha decisão]**.
- Veículos low-poly procedurais (caixa arredondada, rodas, janelas), uma seta no teto. Passageiros: cápsulas
  coloridas na fila, com símbolo no modo daltônico.
- Animações (interrompíveis, nunca corrompem o estado): sair, bater e voltar, estacionar, embarcar, partir.
- Toques ≥ 44 px: veículos pequenos ou muito próximos usam o picking generoso do `core`. Como os
  retângulos não se sobrepõem, o toque dentro de um veículo vale para ele. Se o toque cair fora de todos mas
  dentro do anel generoso, vale o veículo de centro mais próximo; empate: o mais à frente na tela
  **[Minha decisão]**. O tamanho do veículo e a folga do gerador são escolhidos para que o menor veículo
  tenha pelo menos 44 px na tela de 390 px de largura.
- `destroy()` libera geometrias, materiais, texturas e listeners; teste de vazamento no e2e, como na Mistura.

## 8. Power-ups e HUD

Barra do HUD configurável por jogo, como na Mistura. Primeira versão **[Minha decisão]**: **Desfazer** (5),
**Vaga extra** (1: uma 5ª vaga na fase), **Dica** (1: destaca o próximo veículo a enviar; se a busca estoura o
tempo ou não acha, avisa e não gasta a carga, como na Mistura).

## 9. Fora da primeira versão (marcos posteriores)

Definições propostas, a confirmar quando chegar a vez:
- **Obstáculos fixos:** retângulos que só bloqueiam.
- **Garagem:** caixa com uma fila de N veículos; quando a "boca" da garagem fica livre, o próximo veículo
  aparece ali. O gerador trata cada veículo da garagem como posto na ordem dela.
- **Guindaste:** leva um veículo qualquer do tabuleiro (mesmo bloqueado) direto a uma vaga livre.
- **Embaralhar cores:** troca, com semente, as cores entre veículos restantes do mesmo tamanho (mantém o total de
  assentos por cor) e só vale se o solver ainda achar solução.

## 10. Marcos propostos

Cada marco termina com testes, lint e check verdes, Playwright em 390×844, `revisor`, commit e parada.

1. **Lógica:** geometria inteira, colisão, bloqueios, estado, jogadas, vagas, fila, cascata, vitória e derrota,
   desfazer. TDD.
2. **Gerador e solver:** construção reversa, solver, Worker, testes de 200 fases (todas com solução, folga mínima
   respeitada, determinismo).
3. **Render 3D e toque:** tabuleiro, veículos, fila, vagas, animações, picking, entrada no portal (cartão e
   progresso).
4. **Jogabilidade:** HUD e power-ups (desfazer, vaga extra, dica), painel "sem saída", vitória, tutorial, sons,
   modo daltônico, i18n pt-BR/en/es.
5. **Extras:** misterioso, garagem, obstáculos, guindaste, embaralhar, curva de dificuldade até fases grandes.
6. **Fechamento:** pré-cache PWA do novo jogo, orçamentos de tamanho, teste de vazamento, 60 fps na maior fase,
   publicação.

## 11. Restrições herdadas (CLAUDE.md)

`logic/` sem Three.js, DOM ou Svelte; aleatoriedade só com PRNG com semente; gerador e solver em Worker;
`GameModule` com `destroy()` completo; todo texto visível via i18n; gráficos e sons procedurais; sem backend,
analytics ou segredos; scripts multiplataforma (Windows, Git Bash).

## 12. Deixado para o construtor

Tamanho e proporção do tabuleiro, dimensões exatas de cada veículo, constante da folga mínima, número de fases
por faixa de dificuldade, nomes de arquivos, easing e duração das animações, sons, textos finais.
