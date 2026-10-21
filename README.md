# FinanSys

Plataforma web de **simulação e gestão de operações de crédito**, desenvolvida como projeto de portfólio de Ciência da Computação. O usuário simula empréstimos e financiamentos, guarda o histórico das simulações e acompanha tudo em um painel pessoal. Uma área administrativa permite gerenciar as modalidades de crédito e as faixas de juros.

> **Projeto educacional.** O FinanSys não concede crédito, não movimenta dinheiro, não consulta Serasa nem qualquer serviço real de análise de crédito. As taxas cadastradas são **fictícias** e servem apenas para demonstração.

Para retomar o desenvolvimento, veja o resumo técnico em [CONTEXT.md](CONTEXT.md).

## Funcionalidades

**Já implementado**

- Cadastro e login, com senha protegida por hash (bcrypt) e autenticação por token JWT.
- Simulador de crédito: escolha da modalidade, valor e prazo, com cálculo de parcela, total e juros pela Tabela Price.
- Histórico com as 50 simulações mais recentes de cada usuário.
- Painel pessoal com as telas Simular crédito, Histórico e Minha conta.
- Área administrativa (apenas para o papel `ADMIN`):
  - cadastro, edição e ativação/desativação de modalidades;
  - cadastro, edição e ativação/desativação de faixas de juros, com bloqueio de faixas sobrepostas;
  - registro das ações administrativas na tabela de auditoria.
- Sessão expirada tratada em todo o site: o usuário volta ao login com um aviso.
- Testes automatizados do cálculo, da autenticação, das permissões, das regras das faixas de juros e das rotas.

**Planejado**

- Consulta de usuários, métricas e histórico de auditoria na área administrativa.
- Reutilização e comparação de simulações.
- Edição dos dados da conta.
- Preparação para produção e publicação.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, CSS |
| Backend | Node.js, Express 5, TypeScript |
| Banco de dados | MySQL 8 (driver `mysql2`) |
| Autenticação | JWT (`jsonwebtoken`) e `bcryptjs` |
| Testes | Test runner nativo do Node (`node:test`), `supertest` e `tsx` |
| Organização | Monorepo com npm workspaces |

## Arquitetura

```text
Frontend React  ──►  API REST (Express)  ──►  MySQL
 telas, formulários    validação, regras        usuários, modalidades,
 e resultados          de negócio, permissões   taxas, simulações, auditoria
```

O frontend nunca acessa o banco de dados diretamente: ele conversa com a API, que valida os dados, confere a identidade e as permissões do usuário e só então consulta o banco. A API usa o prefixo `/api/v1/`. Em desenvolvimento, o Vite encaminha as chamadas `/api` para o backend, na porta 3000.

## Estrutura de pastas

```text
proj_finansys/
├── package.json              scripts da raiz (workspaces)
├── backend/
│   ├── database/migrations/  migrações SQL (estrutura e dados iniciais)
│   ├── src/
│   │   ├── app.ts            montagem do Express e das rotas
│   │   ├── server.ts         inicialização do servidor
│   │   ├── config.ts         leitura das variáveis de ambiente
│   │   ├── database.ts       conexão com o MySQL
│   │   ├── migrate.ts        executor das migrações
│   │   ├── domain/           regras puras (cálculo de crédito, faixas de juros)
│   │   ├── middleware/       autenticação e permissão de administrador
│   │   └── routes/           auth, modalities, simulations e rotas admin
│   └── tests/                testes automatizados
└── frontend/
    ├── css/styles.css
    └── src/                  App.tsx e main.tsx
```

## Como rodar localmente

**Pré-requisitos:** Node.js (versão LTS recente; o projeto foi verificado com a 22), npm e MySQL 8.

**1. Instalar as dependências**, na raiz do projeto:

```powershell
npm install
```

**2. Criar o banco de dados:**

```powershell
mysql -u root -p -e "CREATE DATABASE finansys CHARACTER SET utf8mb4;"
```

**3. Configurar as variáveis de ambiente.** Copie o arquivo de exemplo e edite o novo `backend/.env` com os seus dados:

```powershell
Copy-Item backend\.env.example backend\.env
```

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=finansys
DB_USER=root
DB_PASSWORD=sua_senha
JWT_SECRET=um_segredo_com_pelo_menos_32_caracteres
```

Para gerar um `JWT_SECRET` forte:

```powershell
node -p "require('crypto').randomBytes(48).toString('hex')"
```

O arquivo `.env` fica fora do Git e nunca deve ser publicado.

**4. Criar as tabelas e os dados iniciais:**

```powershell
npm run db:migrate
```

**5. Iniciar o sistema**, cada comando em um terminal:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Abra `http://localhost:5173`. Em Linux ou macOS, os comandos são os mesmos, trocando `Copy-Item` por `cp`.

**6. (Opcional) Criar um administrador.** Cadastre uma conta pelo site e promova-a no MySQL:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'seu@email.com';
```

Depois, saia do site e entre de novo: o papel vai dentro do token de login.

## Scripts

Todos rodam na raiz do projeto.

| Comando | O que faz |
| --- | --- |
| `npm run dev:backend` | Inicia a API em modo de desenvolvimento |
| `npm run dev:frontend` | Inicia o frontend em modo de desenvolvimento |
| `npm run build` | Compila o backend e o frontend |
| `npm test` | Executa os testes do backend |
| `npm run typecheck` | Verifica os tipos do backend |
| `npm run db:migrate` | Aplica as migrações pendentes no banco |

## API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Público | Verifica se a API está no ar |
| POST | `/api/v1/auth/register` | Público | Cria uma conta (papel `USER`) |
| POST | `/api/v1/auth/login` | Público | Autentica e devolve o token |
| GET | `/api/v1/auth/me` | Logado | Dados do usuário autenticado |
| GET | `/api/v1/modalities` | Público | Lista as modalidades ativas |
| GET | `/api/v1/modalities/:code` | Público | Detalha uma modalidade e suas faixas ativas |
| POST | `/api/v1/simulations/calculate` | Logado | Calcula e salva uma simulação |
| GET | `/api/v1/simulations` | Logado | Histórico (50 mais recentes) |
| GET | `/api/v1/admin/modalities` | Admin | Lista todas as modalidades |
| POST | `/api/v1/admin/modalities` | Admin | Cria uma modalidade |
| PATCH | `/api/v1/admin/modalities/:code` | Admin | Edita uma modalidade |
| PATCH | `/api/v1/admin/modalities/:code/status` | Admin | Ativa ou desativa uma modalidade |
| GET | `/api/v1/admin/modalities/:code/rates` | Admin | Lista as faixas de juros |
| POST | `/api/v1/admin/modalities/:code/rates` | Admin | Cria uma faixa de juros |
| PATCH | `/api/v1/admin/modalities/:code/rates/:rateId` | Admin | Edita uma faixa |
| PATCH | `/api/v1/admin/modalities/:code/rates/:rateId/status` | Admin | Ativa ou desativa uma faixa |

Rotas inexistentes respondem `404` em JSON. Todas as ações administrativas exigem o papel `ADMIN` e ficam registradas em `audit_logs`.

## Regras de negócio e decisões

- **Cálculo:** parcelas fixas pela Tabela Price, com arredondamento para centavos. Taxa zero divide o valor igualmente pelo prazo.
- **Faixas de juros:** cada faixa define a taxa mensal para um intervalo de prazos. Em uma modalidade, as faixas **ativas** não podem se sobrepor, e cada faixa deve caber nos limites de prazo da modalidade. Uma modalidade sem faixa ativa para o prazo escolhido não pode ser simulada.
- **Sem exclusão:** modalidades e faixas são desativadas, não apagadas. As chaves estrangeiras usam `RESTRICT` para preservar o histórico.
- **Identidade vem do token:** o usuário de uma simulação é sempre o do token, nunca um valor enviado no corpo da requisição.
- **Regras separadas das rotas:** o cálculo e as regras das faixas ficam em `backend/src/domain`, isolados do HTTP e cobertos por testes.

## Segurança

- Senhas guardadas apenas como hash bcrypt (custo 12), com mínimo de 8 caracteres.
- Token JWT assinado com HS256 e validade de 15 minutos; o segredo vem de variável de ambiente e deve ter pelo menos 32 caracteres.
- Permissões verificadas no backend: usuário comum recebe `403` nas rotas administrativas.
- Consultas SQL com parâmetros, e alterações das faixas em transação.
- O arquivo `.env` é ignorado pelo Git; só o `.env.example` é versionado.

## Testes

```powershell
npm test
npm run typecheck
npm run build
```

Os testes cobrem o cálculo de crédito, a autenticação, o middleware de administrador, as regras das faixas de juros e o comportamento das rotas (permissões e `404`).

## Limitações conhecidas

- O cálculo usa o tipo `number` do JavaScript com arredondamento para centavos. Em um sistema financeiro real seria necessária precisão decimal.
- Não há renovação de sessão: o login dura 15 minutos e depois é preciso entrar de novo. O token fica no `sessionStorage` do navegador.
- Não há recuperação de senha, confirmação de e-mail nem limite de tentativas de login.
- Ainda não há tela para consultar usuários, métricas ou auditoria.
- A configuração de produção e a hospedagem ainda não foram definidas.
