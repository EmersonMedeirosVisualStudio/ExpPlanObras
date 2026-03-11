Objetivo

Deploy diário automático no final do dia para equipe de testes, com Frontend no Vercel e Backend no Render, usando PostgreSQL gerenciado (Neon/Supabase) com RLS.

Resumo

- Frontend: Vercel, variável NEXT_PUBLIC_API_URL apontando para o backend.
- Backend: Render, build com Prisma usando prisma/postgres/schema.prisma, DATABASE_URL de Postgres, JWT_SECRET.
- Banco: PostgreSQL (Neon/Supabase).
- Deploy: on push na branch main e agendamento diário 23:55 UTC.

Passos

1) Banco PostgreSQL
- Criar database e usuário.
- Copiar DATABASE_URL.
- Configurar RLS manualmente nas tabelas com tenantId.

2) Render (Backend)
- Criar Web Service a partir do repositório.
- Selecionar render.yaml como blueprint.
- Definir envs: DATABASE_URL, JWT_SECRET.
- Copiar Deploy Hook URL e salvar em GitHub Secrets RENDER_DEPLOY_HOOK_URL.

3) Vercel (Frontend)
- Importar o projeto da pasta frontend.
- Definir NEXT_PUBLIC_API_URL=https://seu-backend.onrender.com.
- Obter VERCEL_ORG_ID, VERCEL_PROJECT_ID e VERCEL_TOKEN e salvar nos GitHub Secrets.

4) GitHub Actions
- deploy-frontend.yml e deploy-backend.yml já criados.
- Eventos: push na main e agendamento 23:55 UTC.

Secrets necessários (GitHub)

- RENDER_DEPLOY_HOOK_URL: Render -> Service -> Settings -> Deploy Hook
- VERCEL_TOKEN: Vercel -> Account Settings -> Tokens
- VERCEL_ORG_ID: Vercel -> Team/Org Settings (ou via vercel project settings)
- VERCEL_PROJECT_ID: Vercel -> Project Settings

Checklist Render (Backend) - clique a clique

1. Render -> New -> Blueprint
2. Selecione o repositório e confirme o blueprint render.yaml
3. Após criar, entre no serviço expplanobras-backend
4. Environment -> adicione:
   - DATABASE_URL (Postgres do Neon/Supabase)
   - JWT_SECRET (uma string forte)
   - PORT não precisa configurar (o Render define automaticamente)
5. Deploys -> Manual Deploy -> Deploy latest commit
6. Depois do deploy, copie a URL pública da API e teste /health

Checklist Vercel (Frontend) - clique a clique

1. Vercel -> Add New -> Project
2. Importe o mesmo repositório e selecione Root Directory = frontend
3. Environment Variables:
   - NEXT_PUBLIC_API_URL = https://<sua-api-do-render>
4. Deploy
5. Teste login e chamadas para /api/obras

RLS (modelo mínimo)

As tabelas com tenantId devem ter políticas de isolamento. Exemplo para Obra:

ALTER TABLE "Obra" ENABLE ROW LEVEL SECURITY;
CREATE POLICY obra_select ON "Obra"
  FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id')::int);
CREATE POLICY obra_all ON "Obra"
  FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id')::int)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id')::int);

Smoke test automático (GitHub Actions)

- Workflow: .github/workflows/smoke-test.yml
- Secrets necessários:
  - SMOKE_API_BASE_URL: https://<sua-api-do-render>
  - SMOKE_PASSWORD: senha usada no usuário criado automaticamente
- O teste cria um tenant e usuário novos (com email único) e valida:
  - /health
  - /api/auth/register + /api/auth/login
  - /api/obras (criação e listagem)
  - /api/obras/:id/orcamento e /custos

Execução local

- Backend dev: SQLite conforme schema.prisma.
- Produção: Postgres conforme prisma/postgres/schema.prisma e migrations em prisma/postgres/migrations.

Observações

- Ajuste o horário do cron se necessário.
- Ative RLS e políticas no Postgres usando a chave de sessão app.tenant_id.
