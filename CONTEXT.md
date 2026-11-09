# Contexto do projeto FinanSys

Resumo técnico para retomar o desenvolvimento em uma conversa nova (com uma IA ou com outra pessoa), sem precisar reexplicar tudo. Para a apresentação geral do projeto, veja o [README](README.md).

## O que é

Plataforma web de simulação e gestão de operações de crédito, feita como projeto de portfólio de Ciência da Computação. Não concede crédito real, não movimenta dinheiro e usa taxas fictícias.

## Tecnologias

- **Frontend:** React 18, TypeScript, Vite, CSS (um único componente grande em `frontend/src/App.tsx`).
- **Backend:** Node.js, Express 5, TypeScript, `mysql2`, `bcryptjs`, `jsonwebtoken`.
- **Banco:** MySQL 8, com migrações SQL em `backend/database/migrations`.
- **Testes:** `node:test` executado com `tsx`, mais `supertest`.
- **Organização:** monorepo com npm workspaces (`frontend` e `backend`), repositório no GitHub, branch `main`.
- **Ambiente de desenvolvimento:** Windows, PowerShell e VS Code.

## Como rodar

Na raiz do projeto: `npm install`, criar o banco `finansys`, copiar `backend/.env.example` para `backend/.env` e preencher, `npm run db:migrate`, e então `npm run dev:backend` e `npm run dev:frontend` em dois terminais. O site abre em `http://localhost:5173` e a API roda na porta 3000. O passo a passo completo está no README.

Verificações antes de cada commit: `npm test`, `npm run typecheck`, `npm run build`, `git status` e `git diff --check`.

## Mapa do código

**Backend (`backend/src`)**

- `app.ts`: monta o Express e registra as rotas; no final há a resposta `404` em JSON.
- `config.ts`, `database.ts`, `server.ts`, `migrate.ts`: configuração, conexão, inicialização e executor das migrações.
- `database-options.ts`: opções do pool do MySQL. `DB_SSL=true` liga o TLS com conferência do certificado. O pool fecha conexões paradas há mais de 60 segundos (o TiDB derruba as paradas por cerca de 340 s); para isso `maxIdle` precisa ficar menor que `connectionLimit`. Essa limpeza usa um temporizador: todo teste que importar `app.ts` ou `database.ts` precisa de `after(() => pool.end())`, senão não termina. As conexões trabalham sempre em UTC (`timezone: "Z"` no mysql2 e `SET time_zone = '+00:00'` em cada conexão nova, em `database.ts`), então as datas ficam certas qualquer que seja o fuso do servidor ou do banco.
- `domain/credit-calculator.ts`: cálculo exato da Tabela Price com `BigInt` (parcela arredondada ao centavo, total = parcela x prazo com juros, total = valor pedido sem juros, juros nunca negativos, prazo até 1.200 meses). Os testes usam valores de referência calculados à parte, em Python (`Fractions`).
- `domain/rate-range-rules.ts`: validação e sobreposição das faixas de juros.
- `middleware/require-auth.ts` e `require-admin.ts`: autenticação por JWT e exigência do papel `ADMIN`.
- `middleware/auth-rate-limit.ts`: limite de tentativas do login e do cadastro.
- `middleware/error-handler.ts` e `security-headers.ts`: respostas de erro em JSON e cabeçalhos de segurança (ordem no `app.ts`: cabeçalhos antes do `express.json`, tratador de erros por último).
- `domain/admin-queries.ts`: paginação e filtros das consultas administrativas.
- `domain/attempt-limiter.ts`: contador de tentativas por chave e janela de tempo.
- `domain/account-rules.ts`: regras de nome e senha, compartilhadas entre o cadastro e a edição da conta.
- `domain/credentials.ts`: confere a senha e, quando o e-mail não existe, compara com um hash fictício para igualar o tempo do login.
- `routes/`: `auth.ts`, `modalities.ts`, `simulations.ts`, `admin-modalities.ts`, `admin-rate-ranges.ts`, `admin-reports.ts`, `account.ts`.

**Frontend**

- `frontend/src/App.tsx`: login e cadastro, simulador, histórico, Minha conta e o painel administrativo, com as abas Modalidades (e faixas de juros), Usuários, Métricas e Auditoria.
- `frontend/css/styles.css`: estilos e regras responsivas. A cor de texto secundário é a variável `--muted` (`#5f6b7e`, escolhida pelo contraste); use a variável em vez de repetir a cor.
- `frontend/public/favicon.svg`: ícone do site.
- O Vite encaminha `/api` para `http://localhost:3000`.
- Em produção (`NODE_ENV=production`), `backend/src/frontend.ts` faz o backend entregar `frontend/dist`: `/assets` com cache longo, `index.html` sempre revalidado, rotas da página sem extensão recebem o `index.html`, e `/api` e arquivos inexistentes terminam no 404 em JSON. Sem o site compilado, o servidor não inicia.

**Banco:** tabelas `users`, `credit_modalities`, `interest_rate_ranges`, `simulations`, `audit_logs` e `schema_migrations`. Modalidades iniciais de demonstração: `PERSONAL`, `VEHICLE` e `HOME`, cada uma com três faixas de juros fictícias.

## Estado atual

**Pronto e testado**

- Cadastro, login, JWT com validade de 15 minutos e `GET /auth/me`.
- Simulador, com cálculo exato, salvamento e histórico das 50 simulações mais recentes.
- API administrativa de modalidades e de faixas de juros (criar, editar, ativar/desativar), com auditoria e bloqueio de faixas sobrepostas.
- Interface administrativa com abas: Modalidades (e faixas de juros), Usuários, Métricas e Auditoria, com paginação e filtros.
- Reutilização de simulações: o botão "Ver detalhes" do histórico reabre a simulação no simulador.
- Comparação de simulações no histórico: seleção de 2 a 3 itens e tabela lado a lado, com o menor valor de cada linha destacado (valor solicitado e prazo nunca são destacados).
- Lista de modalidades do simulador atualizada sozinha depois de mudanças no admin.
- Sessão expirada: o site volta ao login com a mensagem "Sua sessão expirou. Entre novamente.".
- API administrativa de consulta, só de leitura: `GET /admin/users`, `GET /admin/metrics` e `GET /admin/audit-logs` (paginação com `page` e `pageSize`, e filtros `entity` e `action` na auditoria).
- Limite de tentativas: login (5 erros por conta e 20 por IP a cada 15 minutos) e cadastro (10 por IP por hora), em memória, com `429` e `Retry-After`; `TRUST_PROXY` para hospedagem atrás de proxy (na Render está `2`; veja a seção Publicação abaixo).
- Endurecimento da API: erros sempre em JSON e sem stack trace (`400`, `413`, `500` genérico), corpo limitado a 10 KB, cabeçalhos de segurança e login com o mesmo tempo de resposta quando o e-mail não existe.
- Edição da conta: `PATCH /auth/me` (nome) e `PATCH /auth/me/password` (exige a senha atual; limite de 5 erros por usuário a cada 15 minutos), com os formulários em Minha conta. E-mail e papel não são editáveis.
- 135 testes automatizados passando no backend.
- Revisão final do código (09/11/2026): `npm audit` sem vulnerabilidades, contraste dos textos melhorado, favicon, aviso de projeto educacional (taxas fictícias) no login, no simulador e no rodapé, mensagens de falha de conexão pensadas para o visitante (não para o desenvolvedor), detalhes da auditoria traduzidos, README atualizado e licença MIT (`LICENSE`).

**Publicação (concluída em 09/11/2026)**

O projeto está completo e publicado em https://proj-finansys.onrender.com. Decidido com o usuário: terminar as funcionalidades primeiro e só depois escolher a hospedagem.

A conferência visual foi feita em 09/11/2026 (todas as telas, em computador e celular); ela achou e corrigiu o resultado da simulação sem destaque (regra `.info-card > p` passando por cima das classes próprias).

**Hospedagem decidida: gratuita.** Banco no **TiDB Cloud** (plano gratuito, compatível com MySQL) e API com o site compilado na **Render** (plano gratuito: dorme após 15 minutos sem visitas e leva cerca de 1 minuto para voltar). O que a documentação do TiDB diz: conta sem cartão; 5 GiB e 50 milhões de unidades de uso por mês (se a cota acabar, recusa conexões até o mês virar); TLS obrigatório no endereço público, porta 4000, com certificado reconhecido pelo Node sem arquivo extra; conexões paradas caem depois de cerca de 340 segundos. Não confirmado: se o banco "dorme" e quanto demora para voltar, e a compatibilidade completa. Plano B: MySQL pago, cerca de US$ 11 a 15 por mês. Aiven, Railway, Fly.io e Cloud Run foram descartados.

1. ~~Preparar o código para produção~~ (feito em 09/11/2026): `DB_SSL` e limpeza do pool; o backend entregando o site compilado; `npm start` na raiz, `engines` com Node 22 ou mais novo, e `backend/src/startup-checks.ts` (o servidor não inicia sem `JWT_SECRET` válido nem, em produção, sem `DB_HOST`). Os comandos e as variáveis da Render estão na seção "Publicação" do README. O build na Render precisa de `npm ci --include=dev`, porque com `NODE_ENV=production` o npm pula as dependências de desenvolvimento (TypeScript e Vite). Isso foi simulado num clone limpo, com build e início funcionando.
2. ~~Conta no TiDB~~ (feito em 09/11/2026): cluster gratuito em **São Paulo (`sa-east-1`)**, TiDB v8.5.3. Os dados de acesso ficam em `backend/.env.tidb` (ignorado pelo Git; a senha nunca vai para o chat). Para rodar algo contra o TiDB a partir do computador local: `npx tsx --env-file=.env.tidb src/migrate.ts` (dentro de `backend`); o `dotenv` não sobrescreve as variáveis que já vieram do arquivo.
   - Decisão sobre a região: a Render não tem servidores no Brasil, então cada consulta ao banco vai e volta entre a Virgínia e São Paulo (estimativa de cerca de 120 ms, não medida). Isso dá cerca de 0,5 s a mais numa simulação. O usuário preferiu manter São Paulo, sabendo disso; trocar depois exigiria exportar e importar os dados.
3. ~~Migrações e testes no TiDB~~ (feito em 09/11/2026): as duas migrações aplicadas (6 tabelas, 3 modalidades, 9 faixas). Chaves estrangeiras ligadas e com `RESTRICT` funcionando. `tidb_enable_check_constraint` está `OFF`: o banco aceita as restrições `CHECK` sem aplicá-las, e a validação fica só na API. O fuso do banco é UTC. O site completo (cadastro, login, simulação, histórico) funcionou ligado ao TiDB, e depois de 400 s sem acesso o pool abriu uma conexão nova sem erro. O banco foi deixado sem dados de teste.
4. ~~Publicar na Render~~ (feito em 09/11/2026): serviço web gratuito na região **Virginia (US East)**, com as variáveis da seção "Publicação" do README. Testado no ar: rotas, cabeçalhos, `http` redirecionando para `https`, cadastro, login, simulações, histórico, comparação, sessão ao recarregar, celular e datas no horário de Brasília. Tempos medidos: cadastro 4,1 s, login 3,6 s e simulação de 1,0 a 1,4 s. O banco de produção foi deixado sem dados de teste.
   - `TRUST_PROXY`: com `1`, o app via o IP de dois proxies internos da Render que se alternavam (os limites por IP valeriam para todos os visitantes juntos). Com `2`, o IP visto muda a cada requisição (limite por IP praticamente desligado, sem bloquear ninguém por engano). Nos dois casos, um `X-Forwarded-For` forjado foi ignorado. Ficou `2`, por decisão do usuário, para terminar o projeto. A documentação da Render sobre isso não foi encontrada.
   - Conta de administrador do site publicado: a conta do usuário (cadastrada pelo site) foi promovida a `ADMIN` no TiDB, e a aba Administração apareceu depois de sair e entrar de novo.

**Melhorias futuras possíveis (não planejadas)**

- Descobrir o IP real do visitante na Render: uma rota de diagnóstico temporária, ligada por variável de ambiente, para ver os cabeçalhos que chegam ao app (`X-Forwarded-For` completo, `CF-Connecting-IP`, `X-Real-IP`) e então ajustar o `TRUST_PROXY` ou ler o cabeçalho certo.
- Login e cadastro mais rápidos no ar: baixar o custo do bcrypt de 12 para 10 (cerca de 4 vezes mais rápido; não foi medido no servidor se o bcrypt é mesmo a causa).
- Banco mais perto da Render: recriar o cluster do TiDB em `us-east-1`, exportando e importando os dados.

Fora do escopo, por decisão: mudança de e-mail (exigiria confirmação por e-mail) e recuperação de senha por e-mail (exigiria um serviço de envio de e-mails, e o projeto é educacional).

## Decisões e convenções

- **Uma etapa por vez, cada uma com testes e um commit.** Mensagens de commit em português do Brasil, no formato `tipo: descrição` (por exemplo `feat: ...`, `fix: ...`, `chore: ...`, `style: ...`).
- **Alterações pontuais:** não refazer o que já funciona. Ao substituir um arquivo, usar o arquivo completo.
- **Sem exclusão de dados:** modalidades e faixas são desativadas, não apagadas (chaves estrangeiras com `RESTRICT`).
- **Regras fora das rotas:** lógica de negócio testável fica em `backend/src/domain`.
- **A identidade vem do token**, nunca do corpo da requisição.
- **Administrador:** não existe tela para criar um. Promove-se uma conta direto no banco com `UPDATE users SET role = 'ADMIN' WHERE email = '...';` e depois sai-se e entra-se de novo no site.

## Cuidados

- **Nunca publicar nem colar o `backend/.env`** (senha do banco e `JWT_SECRET`). Para mostrar a configuração, usar só o `.env.example`.
- **Codificação dos arquivos:** o `App.tsx` já chegou a ficar com os acentos corrompidos (`nÃ£o` em vez de `não`) depois de um script do PowerShell reescrever o arquivo sem informar UTF-8. Prefira editar os arquivos no VS Code, e se usar PowerShell, informe a codificação UTF-8 sem BOM.
- **A pasta `tests` tem o seu próprio `tsconfig.json`.** O `tsconfig.json` do backend só inclui `src`; não adicione arquivos de teste ao `include` dele.
- Mudar o papel de um usuário no banco só vale depois de um novo login, porque o papel vai dentro do token.
- **Arquivos que começam com ponto** (como `backend/.env.example` e `.gitignore`) podem ser baixados sem o ponto (`env.example`). Confira o nome antes de copiar para o projeto, ou o Git vai registrar o arquivo certo como apagado.

## Limitações conhecidas

- O cálculo é exato, mas simplificado (Tabela Price com taxa fixa, sem tarifas, IOF, seguros nem CET). Simulações antigas, gravadas antes do cálculo exato, mantêm os valores da época.
- Sem renovação de sessão; o token fica no `sessionStorage`.
- Sem recuperação de senha nem confirmação de e-mail; o cadastro revela se um e-mail já existe (`409`).
- O papel do usuário vai dentro do token: uma mudança de papel só vale depois de um novo login ou da expiração do token (até 15 minutos).
- Os contadores do limite de tentativas ficam na memória: zeram quando o servidor reinicia e não são compartilhados entre instâncias.
- O simulador carrega a lista de modalidades no login e a atualiza ao voltar do painel administrativo, mas não acompanha mudanças feitas por outro administrador ao mesmo tempo.
