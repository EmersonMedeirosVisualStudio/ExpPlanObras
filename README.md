# ExpPlanObras - Sistema de Gestão de Obras

Sistema web SaaS multi-tenant para gestão de obras públicas e particulares, desenvolvido com arquitetura moderna e escalável.

## 🚀 Tecnologias

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend**: Node.js, Fastify, TypeScript.
- **Banco de Dados**: SQLite (Desenvolvimento) / PostgreSQL (Produção), Prisma ORM.
- **Validação**: Zod.
- **Autenticação**: JWT.
- **Login Social**: Google OAuth (opcional).

## 🛠️ Funcionalidades Principais

- **Cadastro de Obras**: Gestão completa com geolocalização.
- **Mapa Interativo**: Visualização de obras no mapa com marcadores por status.
- **Multi-tenancy**: Suporte a múltiplas empresas/órgãos.
- **Gestão Financeira**: Controle de medições e pagamentos (Em desenvolvimento).

## ⚙️ Configuração Local

### 1. Clonar o repositório

```bash
git clone https://github.com/EmersonMedeirosVisualStudio/ExpPlanObras.git
cd ExpPlanObras
```

### 2. Backend

```bash
cd backend
npm install
# Configurar banco de dados SQLite local
npx prisma migrate dev
npm run dev
```
O backend rodará em `http://localhost:3333`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```
O frontend rodará em `http://localhost:3000`.

## 🌐 Produção (Render + Vercel)

### Variáveis no Backend (Render)

- `DATABASE_URL` (segredo)
- `JWT_SECRET` (segredo)
- `PUBLIC_API_URL` (ex.: `https://expplanobras-backend.onrender.com`)
- `PUBLIC_APP_URL` (ex.: `https://expplanobrasfrontendvercel.vercel.app`)

**Google OAuth (opcional)**

- `GOOGLE_CLIENT_ID` (segredo)
- `GOOGLE_CLIENT_SECRET` (segredo)
- `GOOGLE_REDIRECT_URI` (ex.: `https://expplanobras-backend.onrender.com/api/auth/google/callback`)

**Rotas**

- Iniciar Google: `GET /api/auth/google/start`
- Callback Google: `GET /api/auth/google/callback`

### Backups por empresa (Admin)

- Exportar backup: `GET /api/admin/tenants/:id/backup`
- Restaurar backup: `POST /api/admin/tenants/:id/restore` (requer `x-maintenance-token`)

Para restore/export, use um usuário com `isSystemAdmin=true`.

### Automação de limpeza/retenção (opcional)

- `MAINTENANCE_TOKEN` (segredo)
- `DATA_RETENTION_DAYS` (ex.: `30`)

O endpoint `POST /api/maintenance/purge-expired` aceita o header `x-maintenance-token`.

## 📝 Estrutura do Projeto

- `/frontend`: Aplicação Next.js (Interface)
- `/backend`: API Fastify (Regras de Negócio)
- `/backend/prisma`: Schema do banco de dados

## ✅ Status

Em desenvolvimento ativo. Módulos de Mapa e Cadastro de Obras operacionais.
