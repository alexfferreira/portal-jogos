# Recreio

Portal pessoal de jogos casuais: sem anúncios, sem login, sem rastreamento, funciona offline (PWA). Primeiro jogo: **Mistura** (ordenar líquidos em tubos).

Especificação completa: [PROMPT-portal-jogos.md](PROMPT-portal-jogos.md) · Regras do projeto: [CLAUDE.md](CLAUDE.md) · Decisões: [docs/DECISIONS.md](docs/DECISIONS.md) · Próximos jogos: [docs/GAMES.md](docs/GAMES.md)

## Requisitos

- Node.js 20.19 ou mais novo
- pnpm (`npm install -g pnpm`)

## Comandos

| Comando            | O que faz                                      |
| ------------------ | ---------------------------------------------- |
| `pnpm install`     | Instala as dependências                        |
| `pnpm dev`         | Servidor de desenvolvimento do portal          |
| `pnpm build`       | Gera o site estático em `apps/portal/build`    |
| `pnpm preview`     | Preview do Vite (sem fallback SPA)             |
| `pnpm serve`       | Serve o build com fallback SPA e cabeçalhos    |
| `pnpm test`        | Testes unitários (Vitest)                      |
| `pnpm test:e2e`    | Testes de ponta a ponta (Playwright, 390×844)  |
| `pnpm lint`        | ESLint + Prettier (verificação)                |
| `pnpm format`      | Formata o código com Prettier                  |
| `pnpm check`       | Verificação de tipos (tsc / svelte-check)      |
| `pnpm icons`       | Regenera ícones e manifest (`brand.json`)      |
| `pnpm report:size` | Tamanho bruto e gzip do build (inicial x jogo) |

Na primeira vez, rode também `pnpm exec playwright install chromium`.

`pnpm build` é pré-requisito dos testes que leem o build (`pré-cache`, orçamentos de tamanho, `pnpm report:size`): sem `apps/portal/build` eles são PULADOS pelo `pnpm test` (não falham), então rode `pnpm build` antes de `pnpm test` para valerem.

## Estrutura

```
apps/portal/      SvelteKit (adapter-static): portal, HUD, menus
packages/core/    base comum: palco 3D, storage, i18n, áudio, configurações
packages/ui/      componentes Svelte compartilhados
games/mistura/    jogo 1 (src/logic em TS puro, src/render em Three.js)
docs/             DECISIONS.md e GAMES.md
e2e/              testes Playwright
deploy/           nginx.conf de exemplo (VPS)
scripts/          ícones, servidor local do build, relatório de tamanho
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

## Teste local do build

```
pnpm build
pnpm serve            # http://127.0.0.1:4173, com fallback SPA e os cabeçalhos do vercel.json
pnpm report:size      # tamanho bruto e gzip: tela inicial x jogo x worker
```

`pnpm serve` lê o `vercel.json`: o que você vê nele é o que a Vercel deve entregar. É só para teste local, não para produção.

## Publicação

O build é um site estático (`apps/portal/build`) e funciona em qualquer servidor estático na RAIZ de um domínio. Há dois caminhos: Vercel (recomendado, grátis para uso pessoal) e uma VPS com nginx. Não há variáveis de ambiente, chaves nem analytics.

### Vercel, passo a passo (para quem nunca usou)

A Vercel pega o código do GitHub, roda o build e publica em um endereço `https://...vercel.app`. A cada `push` ela publica de novo sozinha. O plano **Hobby** é grátis e vale para uso pessoal e não comercial, que é o caso deste projeto.

1. **Crie a conta.** Acesse vercel.com, clique em "Sign Up", escolha o plano **Hobby** e entre com **Continue with GitHub** usando sua conta pessoal do GitHub. Autorize o acesso.
2. **Deixe a Vercel ver o repositório.** Na primeira importação a Vercel pede para instalar o app dela no GitHub. Você pode liberar só o repositório `alexfferreira/portal-jogos` (github.com/alexfferreira/portal-jogos).
3. **Importe o projeto.** No painel, clique em **Add New... > Project**, ache `portal-jogos` na lista e clique em **Import**.
4. **Preencha a tela de configuração.** Quase tudo vem do arquivo `vercel.json` do repositório:
   - **Framework Preset:** `Other`.
   - **Root Directory:** a raiz do repositório (`./`). **Atenção:** a Vercel costuma detectar o SvelteKit sozinha e preencher `apps/portal` (e Application Preset `SvelteKit`). Clique em **Edit** ao lado do Root Directory e troque para a raiz (`./`), e troque o preset para `Other`. Com `apps/portal` ela não lê o `vercel.json` da raiz, e o projeto é um monorepo pnpm cujo build precisa da raiz.
   - **Build Command, Install Command e Output Directory:** o `vercel.json` já define (`pnpm build`, `pnpm install --frozen-lockfile`, `apps/portal/build`). Se a tela mostrar esses campos, não precisa mudar nada: o `vercel.json` prevalece sobre eles (para mudar um comando, edite o `vercel.json`).
   - **Environment Variables:** nenhuma (a única exceção possível está em "Contorno se o pnpm não instalar").
5. Clique em **Deploy**. O primeiro build leva de 1 a 2 minutos (estimativa). Ao terminar a Vercel mostra o endereço de produção (algo como `portal-jogos.vercel.app`).
6. **Abra o endereço no celular** e jogue uma fase. Essa é a "primeira visita": é nela que o app baixa tudo para funcionar offline.

**Previews por branch.** Cada branch (e cada pull request) que você enviar ao GitHub ganha seu próprio endereço `https://...vercel.app` e fica listado na aba **Deployments** do projeto. É o jeito de testar no celular antes de ir para a produção. Só a branch `main` vai para o endereço de produção.

**Instalar o app (PWA).** A instalação exige HTTPS, que a Vercel já entrega.

- **Android (Chrome):** abra o endereço, espere carregar, toque no aviso "Instalar" do app ou no menu do Chrome (três pontos) > **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o endereço no **Safari**, toque em **Compartilhar** > **Adicionar à Tela de Início**. No iPhone isso também evita que o sistema apague o progresso.

**Como saber que está pronto para offline.** Depois da primeira visita com internet: ative o modo avião, abra o app (pela tela inicial, se instalado) e jogue uma fase. Se abrir e jogar, está offline-ready. No Chrome do computador: DevTools > Application > Service Workers deve mostrar "activated".

**Como atualizar.** Faça `git push` na `main`. A Vercel publica sozinha. Quem já tem o app aberto vê o aviso "Nova versão disponível" na tela inicial e toca em **Atualizar** (nunca recarrega no meio de uma partida).

**Como reverter.** No painel da Vercel, aba **Deployments**, escolha um deploy anterior que funcionava, abra o menu (três pontos) e use **Promote to Production** (ou "Instant Rollback"). O nome exato do botão pode variar na interface.

#### Checklist do primeiro deploy

- [ ] `pnpm lint && pnpm check && pnpm test && pnpm build && pnpm test:e2e` passam na sua máquina.
- [ ] O repositório está no GitHub e o `vercel.json` está na raiz (commitado).
- [ ] Projeto importado com Framework Preset `Other` e Root Directory na raiz; nenhuma variável de ambiente.
- [ ] O build terminou sem erro e o endereço de produção abre a tela inicial.
- [ ] No celular: o jogo abre, a fase 1 é jogável, e `/manifest.webmanifest` e `/service-worker.js` respondem (abra no navegador).
- [ ] Modo avião: o app instalado ainda abre e joga.
- [ ] No preview/produção (DevTools > Network): `service-worker.js` volta com `cache-control: no-cache`, e arquivos em `/_app/immutable/` com `max-age=31536000, immutable`.
- [ ] Abrir direto `/jogo/mistura` e `/configuracoes` (atualizando a página) funciona; um endereço inexistente como `/_app/xyz.js` dá 404, não uma página.
- [ ] Um segundo `push` mostra o aviso "Nova versão disponível" no app já instalado.

#### O que NÃO foi confirmado sem a Vercel real (confirmar no primeiro deploy)

- Redirecionamentos: o `vercel.json` desliga `cleanUrls` e `trailingSlash` para que `/200.html` e os arquivos do pré-cache do service worker nunca sofram redirecionamento. Confirme no primeiro deploy que `/200.html` responde 200 (sem 308) e que `/jogo/mistura` abre a mesma tela.
- Os cabeçalhos de `rewrites` e `headers` foram validados apenas pelo servidor local (`pnpm serve`) e por testes; confirme com `curl -I https://SEU-ENDERECO/service-worker.js`.

#### Contorno se o pnpm não instalar (confirmar no primeiro deploy)

O que está nos arquivos do repositório: o `package.json` declara `packageManager: pnpm@12.18.0` e `engines.node: >=20.19`. Não há como confirmar localmente quais versões do pnpm e do Node a Vercel aceita; **confira no primeiro build** (o log da etapa "Install" mostra a versão usada). Se a instalação falhar por causa do pnpm, há duas saídas (nenhuma foi testada, confirmar):

- **Preferida:** edite o campo `installCommand` **no próprio `vercel.json`** (ele prevalece sobre os campos da tela do projeto, então editar o "Install Command" na interface não adianta). Exemplo: `"installCommand": "npm i -g pnpm@12.18.0 && pnpm install --frozen-lockfile"`. Faça commit e envie.
- **Alternativa (única exceção em que este projeto usa variável de ambiente):** em Settings > Environment Variables crie `ENABLE_EXPERIMENTAL_COREPACK` com valor `1`, para a Vercel usar a versão do campo `packageManager`. Confirmar se esse recurso ainda existe e como se comporta.

Se o erro for de versão do Node, a versão pode ser escolhida em Settings > General > Node.js Version; confira no primeiro build qual versão satisfaz o `engines`.

#### Solução de problemas

- **Build falha com erro de pnpm ou de versão do Node:** veja "Contorno se o pnpm não instalar" acima (`installCommand` no `vercel.json`, Corepack, versão do Node). Rode `pnpm install --frozen-lockfile && pnpm build` local para ver se é problema do projeto ou da Vercel.
- **`ERR_PNPM_OUTDATED_LOCKFILE`:** o `pnpm-lock.yaml` não bate com os `package.json`. Rode `pnpm install` local e commite o lockfile.
- **Página em branco:** abra DevTools > Console. Se houver 404 em arquivos de `/_app/`, o Output Directory está errado (deve ser `apps/portal/build`) ou o deploy é de outra branch. Se o app for servido de um subcaminho, não funciona: ele precisa estar na raiz do domínio.
- **Service worker velho (a tela não muda depois de um deploy):** feche todas as abas e abra de novo; ou DevTools > Application > Service Workers > "Unregister" e recarregue. O aviso "Nova versão disponível" deve aparecer na tela inicial.
- **"Instalar" não aparece:** só aparece em HTTPS (ou localhost), no Chrome/Edge do Android ou desktop, depois de carregar a página uma vez, e se o app ainda não estiver instalado nem tiver sido dispensado ("Agora não"). No iPhone não existe esse botão: use Compartilhar > Adicionar à Tela de Início. Em DevTools > Application > Manifest o Chrome lista o que falta.

### VPS com nginx

Serve o mesmo `build/` com a mesma política de cache (arquivos prontos em `deploy/`). Os comandos abaixo são um **exemplo para Debian/Ubuntu**; em outras distribuições mude o gerenciador de pacotes e os caminhos. O fluxo do HTTPS tem duas etapas, porque o certificado só pode ser emitido com o site já respondendo na porta 80: primeiro um nginx só com HTTP (`deploy/nginx-http.conf`), depois o definitivo (`deploy/nginx.conf`).

1. **Prepare a VPS.** Aponte o DNS do domínio para o IP da VPS e libere as portas 80 e 443 no firewall. Instale: `sudo apt update && sudo apt install nginx certbot`. Confira `nginx -v`: o `nginx.conf` usa `http2 on;` (nginx 1.25.1 ou mais novo); em versão mais antiga troque por `listen 443 ssl http2;`. No Debian/Ubuntu remova o site padrão, que disputa a porta 80: `sudo rm -f /etc/nginx/sites-enabled/default`.
2. **Crie as pastas e dê permissão.**
   ```
   sudo mkdir -p /var/www/recreio /var/www/certbot /etc/nginx/snippets
   sudo chown -R $USER:www-data /var/www/recreio
   sudo chmod -R u=rwX,g=rX,o=rX /var/www/recreio
   ```
   O nginx roda como `www-data` e só precisa LER; quem copia os arquivos é o seu usuário.
3. **Gere o build e copie.** Na sua máquina: `pnpm install --frozen-lockfile && pnpm build`, depois `rsync -av --delete apps/portal/build/ usuario@servidor:/var/www/recreio/`.
4. **Etapa A, só HTTP.** Copie `deploy/recreio-headers.conf` para `/etc/nginx/snippets/recreio-headers.conf` e `deploy/nginx-http.conf` para `/etc/nginx/conf.d/recreio.conf`. Troque o domínio: `sudo sed -i 's/recreio.example.com/SEU-DOMINIO/g' /etc/nginx/conf.d/recreio.conf`. Depois `sudo nginx -t && sudo systemctl reload nginx`. O site já abre em `http://SEU-DOMINIO` (sem HTTPS ainda).
5. **Emita o certificado**, já com o gancho de renovação:
   `sudo certbot certonly --webroot -w /var/www/certbot -d SEU-DOMINIO --deploy-hook "systemctl reload nginx"`
6. **Etapa B, HTTPS.** Copie `deploy/nginx.conf` por cima de `/etc/nginx/conf.d/recreio.conf`, troque o domínio de novo (mesmo `sed` do passo 4) e rode `sudo nginx -t && sudo systemctl reload nginx`.
7. **Confira a RENOVAÇÃO do certificado (não pule).** O Let's Encrypt vale por cerca de 90 dias e o certbot renova sozinho, mas o nginx só passa a usar o certificado novo quando é recarregado. Sem o gancho `--deploy-hook "systemctl reload nginx"` (passo 5; o certbot o guarda em `/etc/letsencrypt/renewal/SEU-DOMINIO.conf`) o site cai com certificado vencido. Confira:
   - `systemctl list-timers | grep certbot` deve listar um timer ativo (`certbot.timer`; em alguns sistemas a renovação é um cron em `/etc/cron.d/certbot`);
   - `sudo certbot renew --dry-run` deve terminar sem erro.
8. **Teste:** `curl -I https://SEU-DOMINIO/service-worker.js` (deve mostrar `cache-control: no-cache`), `curl -I http://SEU-DOMINIO/` (deve redirecionar para HTTPS) e abra o endereço no celular.
9. **Atualizar:** gere o build de novo e repita o `rsync` do passo 3. Não precisa reiniciar o nginx.

Brotli é opcional e exige o módulo `ngx_brotli` (linhas comentadas no arquivo); o gzip já funciona. A sintaxe dos arquivos de `deploy/` não foi validada com `nginx -t` (não há nginx na máquina de desenvolvimento); os testes (`scripts/deploy.test.ts`) conferem as diretivas essenciais. Rode `sudo nginx -t` na VPS antes de recarregar.
