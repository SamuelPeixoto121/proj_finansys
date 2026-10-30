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
- `domain/credit-calculator.ts`: cálculo da Tabela Price.
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
- `frontend/css/styles.css`: estilos e regras responsivas.
- O Vite encaminha `/api` para `http://localhost:3000`.

**Banco:** tabelas `users`, `credit_modalities`, `interest_rate_ranges`, `simulations`, `audit_logs` e `schema_migrations`. Modalidades iniciais de demonstração: `PERSONAL`, `VEHICLE` e `HOME`, cada uma com três faixas de juros fictícias.

## Estado atual

**Pronto e testado**

- Cadastro, login, JWT com validade de 15 minutos e `GET /auth/me`.
- Simulador, com cálculo, salvamento e histórico das 50 simulações mais recentes.
- API administrativa de modalidades e de faixas de juros (criar, editar, ativar/desativar), com auditoria e bloqueio de faixas sobrepostas.
- Interface administrativa com abas: Modalidades (e faixas de juros), Usuários, Métricas e Auditoria, com paginação e filtros.
- Reutilização de simulações: o botão "Ver detalhes" do histórico reabre a simulação no simulador.
- Lista de modalidades do simulador atualizada sozinha depois de mudanças no admin.
- Sessão expirada: o site volta ao login com a mensagem "Sua sessão expirou. Entre novamente.".
- API administrativa de consulta, só de leitura: `GET /admin/users`, `GET /admin/metrics` e `GET /admin/audit-logs` (paginação com `page` e `pageSize`, e filtros `entity` e `action` na auditoria).
- Limite de tentativas: login (5 erros por conta e 20 por IP a cada 15 minutos) e cadastro (10 por IP por hora), em memória, com `429` e `Retry-After`; `TRUST_PROXY` opcional para hospedagem atrás de proxy.
- Endurecimento da API: erros sempre em JSON e sem stack trace (`400`, `413`, `500` genérico), corpo limitado a 10 KB, cabeçalhos de segurança e login com o mesmo tempo de resposta quando o e-mail não existe.
- Edição da conta: `PATCH /auth/me` (nome) e `PATCH /auth/me/password` (exige a senha atual; limite de 5 erros por usuário a cada 15 minutos), com os formulários em Minha conta. E-mail e papel não são editáveis.
- 102 testes automatizados passando no backend.

**Pendente, em ordem sugerida**

Decidido com o usuário: terminar as funcionalidades primeiro e só depois escolher a hospedagem.

1. Comparação de simulações: escolher 2 ou 3 do histórico e ver lado a lado.
2. Precisão decimal no cálculo (hoje usa `number` do JavaScript).
3. Revisão final: telas, textos, documentação e conferência geral. Nessa hora, avisar o usuário de que o projeto está pronto para decidir a hospedagem.
4. Publicação. Pesquisa feita em 30/10/2026, a reconfirmar nos sites na hora: banco MySQL gratuito no Aiven (1 GB, exige TLS, pode ser desligado por falta de uso, sem garantia de disponibilidade) e API com o site compilado na Render (o plano gratuito dorme após 15 minutos sem visitas e leva cerca de 1 minuto para voltar; cerca de US$ 7 por mês para ficar sempre ligado). Railway, Fly.io e Cloud Run foram descartados (sem plano gratuito útil ou exigem cartão). O código ainda precisa de: conexão com o banco usando TLS, o backend servindo o site compilado, scripts de build e de início, e a configuração de `NODE_ENV`, `TRUST_PROXY` e das variáveis do banco.

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

## Limitações conhecidas

- Cálculo com o tipo `number` do JavaScript (precisão decimal limitada, adequada para a demonstração).
- Sem renovação de sessão; o token fica no `sessionStorage`.
- Sem recuperação de senha nem confirmação de e-mail; o cadastro revela se um e-mail já existe (`409`).
- O papel do usuário vai dentro do token: uma mudança de papel só vale depois de um novo login ou da expiração do token (até 15 minutos).
- Os contadores do limite de tentativas ficam na memória: zeram quando o servidor reinicia e não são compartilhados entre instâncias.
- O simulador carrega a lista de modalidades no login e a atualiza ao voltar do painel administrativo, mas não acompanha mudanças feitas por outro administrador ao mesmo tempo.
