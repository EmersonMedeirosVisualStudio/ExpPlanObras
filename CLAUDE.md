# expertObras — Claude Code Guidelines

## Skills disponíveis (ler antes de qualquer tarefa)

| Tarefa                                         | Skill                         |
|------------------------------------------------|-------------------------------|
| Backend: rotas, use-cases, repositórios, testes | `fastify-hexagonal-skill`    |
| Frontend: componentes, hooks, TanStack Query   | `expertobras-frontend-skill`  |
| Convenções: inglês, 1 arquivo = 1 responsabilidade | `code-conventions-skill` |
| Git: branches, commits, releases, pre-commit   | `gitflow-skill`               |

---

## Stack

**Backend:** Fastify 5 · TypeScript strict · Zod v4 · Prisma (PostgreSQL) · Vitest

**Frontend:** Next.js 16 App Router · TypeScript strict · TanStack Query v5 · Zod · shadcn/ui · Axios

---

## Regras universais (aplicar em todo código)

```
✅ Código em inglês — variáveis, funções, classes, tipos, comentários
✅ Textos de UI e mensagens ao usuário podem ser em português
✅ Um arquivo = uma exportação principal
✅ TypeScript strict: true — nunca `any`
✅ Testes com Vitest — nunca Jest
✅ Antes de qualquer commit: typecheck + test + build
```

---

## Pre-commit hook

```bash
# Instalar uma vez após clonar o repositório
cp scripts/pre-commit-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Roda automaticamente: `tsc --noEmit` + `vitest run` + `tsc --noEmit` (frontend).

---

## Estrutura do monorepo

```
expertObras/
├── backend/           # Fastify API
├── frontend/          # Next.js App
├── scripts/           # Scripts utilitários e hooks
└── .claude/
    └── skills/        # Skills deste projeto
        ├── fastify-hexagonal-skill/
        ├── expertobras-frontend-skill/
        ├── code-conventions-skill/
        └── gitflow-skill/
```
