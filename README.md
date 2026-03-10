# ExpPlanObras - Sistema de Gestão de Obras

Sistema web SaaS multi-tenant para gestão de obras públicas e particulares, desenvolvido com arquitetura moderna e escalável.

## 🚀 Tecnologias

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend**: Node.js, Fastify, TypeScript.
- **Banco de Dados**: SQLite (Desenvolvimento) / PostgreSQL (Produção), Prisma ORM.
- **Validação**: Zod.
- **Autenticação**: JWT.

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

## 📝 Estrutura do Projeto

- `/frontend`: Aplicação Next.js (Interface)
- `/backend`: API Fastify (Regras de Negócio)
- `/backend/prisma`: Schema do banco de dados

## ✅ Status

Em desenvolvimento ativo. Módulos de Mapa e Cadastro de Obras operacionais.
