# Roadmap de jogos

Só a **Mistura** está em desenvolvimento. Os demais **não devem ser implementados sem pedido explícito**. A base (`packages/core`) precisa suportar: modo `score`, física própria por jogo, modelos glTF pré-cacheados, câmera ortográfica e perspectiva, input de toque e arrastar, HUD com power-ups configurável por jogo.

1. **Embarca** (estacionamento, estilo "Bus Jam/Car Jam") — modo levels. Veículos (carro 4 lugares, van 6, ônibus 10) em ângulos livres num tabuleiro, cada um com uma seta; tocar faz o veículo andar em linha reta na direção da seta; se o caminho estiver livre ele sai e estaciona numa de 4 vagas; se bater, volta ("bate e volta"). Uma fila de passageiros coloridos embarca no veículo estacionado da mesma cor; veículo cheio parte e libera a vaga. Perde se as vagas lotarem sem combinar com a fila. Extras: veículo misterioso "?", garagem que solta N veículos, obstáculos fixos, power-ups (desfazer, embaralhar cores, guindaste, vaga extra). Fases geradas por construção reversa + solver para garantir solução. Veículos em 3D low-poly (procedurais ou modelos CC0 recoloridos).
2. **Parafusos 2D** — modo levels. Tábuas coloridas presas por parafusos numa placa; tocar num parafuso livre o move para um furo vazio; tábuas sem parafusos caem (física 2D com **Rapier**). Objetivo: derrubar todas as tábuas. Power-ups: dica, desfazer, furo extra, remover parafuso.
3. **Pilhas hexagonais** — modo levels. Grade hexagonal; o jogador coloca pilhas de hexágonos coloridos; pilhas vizinhas trocam/fundem camadas da mesma cor em cadeia; 10 da mesma cor somem. Objetivo: atingir a meta de peças.
4. **Snake** — modo score.
5. **Blocos** (estilo Tetris, com nome próprio — "Tetris" é marca registrada) — modo score.
6. **Parafusos 3D** — modo levels. Cenas 3D (casa, sala) cobertas de parafusos coloridos; tirar parafusos e encaixá-los em caixas da mesma cor com 3 furos.
7. **Sniper** — ação 3D; o mais complexo; por último.
