# ExpertObras - Sistema de Gestão de Obras SaaS

Sistema web SaaS multi-tenant para gestão de obras, desenvolvido com arquitetura moderna e escalável.

## 🚀 Tecnologias

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend**: Node.js, Fastify, TypeScript.
- **Banco de Dados**: PostgreSQL (Neon), Prisma ORM.
- **Validação**: Zod.
- **Autenticação**: JWT.

## 🛠️ Pré-requisitos

- Node.js 20+
- NPM ou Yarn
- Conta no [Neon](https://neon.tech) para o banco de dados PostgreSQL.

## ⚙️ Configuração Local

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/expertobras.git
cd expertobras
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (ou configure as variáveis no seu ambiente) baseando-se no `.env.example`:

```bash
cp .env.example .env
```

Edite o `.env` com sua string de conexão do PostgreSQL e segredos.

### 3. Backend

```bash
cd backend
npm install
# Configure o banco de dados
npx prisma generate
# Rode as migrações (quando tiver o banco conectado)
# npx prisma migrate dev --name init
npm run dev
```
O backend rodará em `http://localhost:3333`.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```
O frontend rodará em `http://localhost:3000`.

## 🗄️ Banco de Dados e Migrations

O projeto utiliza Prisma com PostgreSQL. Para atualizar o esquema do banco:

1. Edite `backend/prisma/schema.prisma`.
2. Execute `npx prisma migrate dev --name <nome-da-migracao>` dentro da pasta `backend`.

**Nota sobre Multi-tenancy:**
O sistema utiliza Row Level Security (RLS). Certifique-se de que o usuário do banco tenha permissões para definir `app.tenant_id`.

## 📦 Deploy

### Backend (Render)
1. Conecte o repositório ao Render.
2. Configure as variáveis de ambiente (`DATABASE_URL`, `JWT_SECRET`, etc.).
3. Comando de Build: `npm install && npm run build`
4. Comando de Start: `npm start`

### Frontend (Vercel)
1. Conecte o repositório à Vercel.
2. Configure as variáveis de ambiente (`NEXT_PUBLIC_API_URL`).
3. O deploy é automático.

## 📝 Estrutura do Projeto

- `/frontend`: Aplicação Next.js
- `/backend`: API Fastify
- `/backend/prisma`: Schema do banco de dados

## ✅ Testes

Após o deploy, verifique os endpoints principais:
- `/health` (Backend)
- Login e Dashboard (Frontend)
