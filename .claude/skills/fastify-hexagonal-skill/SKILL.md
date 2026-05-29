---
name: fastify-hexagonal-skill
description: >
  Use esta skill para tarefas no backend: Fastify 5, TypeScript strict, Zod v4,
  Prisma, Vitest, arquitetura hexagonal (Ports & Adapters), design patterns,
  multi-tenant (tenantId RLS), autenticação JWT, rotas, serviços, testes.
  Inclui padrões production-grade, estrutura de módulos e checklists obrigatórios.
---

# Fastify Backend Skill
## Stack: Fastify 5 · TypeScript strict · Zod v4 · Prisma · Vitest · Hexagonal Architecture

Antes de escrever código, leia o arquivo de referência relevante:

| Precisa de...                          | Leia                              |
|----------------------------------------|-----------------------------------|
| Rotas, hooks, plugins, schemas HTTP    | `references/fastify.md`           |
| Camadas, portas, adaptadores, módulos  | `references/hexagonal.md`         |
| Prisma, transações, RLS multi-tenant   | `references/prisma.md`            |
| Testes unitários e integração, mocks   | `references/vitest.md`            |
| Repository, Factory, Strategy, CQRS   | `references/design-patterns.md`   |

---

## Regras inegociáveis

```
✅ Código sempre em inglês: variáveis, funções, classes, interfaces, tipos, comentários
✅ Textos de API response (mensagens de erro ao usuário) podem ser em português
✅ Um arquivo = uma exportação principal (use-case, repositório, rota, ou DTO)
✅ TypeScript strict: true — nunca `any`, usar `unknown` + type guards quando necessário
✅ Validação com Zod em TODA fronteira (body, params, querystring, env vars)
✅ Nunca acessar Prisma diretamente nas rotas — passar pelo use-case/service
✅ Repositórios sempre via interface (porta) — nunca instanciar PrismaXxxRepository diretamente nas rotas
✅ Use-cases não conhecem Fastify (FastifyRequest, FastifyReply) — recebem DTOs tipados
✅ Erros de domínio = exceções tipadas; rotas capturam e mapeiam para HTTP status
✅ Multi-tenant: tenantId SEMPRE extraído do JWT — nunca aceitar tenantId no body/query
✅ Todo teste usa Vitest — nunca Jest
✅ Antes de qualquer commit: tsc + vitest + build (ver checklist)
```

---

## Estrutura de módulo (hexagonal)

```
src/
├── modules/
│   └── [feature]/
│       ├── domain/
│       │   ├── entities/
│       │   │   └── [Entity].ts              # Classe/tipo de domínio puro, sem Prisma
│       │   ├── ports/
│       │   │   └── I[Entity]Repository.ts   # Interface do repositório
│       │   └── errors/
│       │       └── [Entity]Errors.ts        # Erros de domínio tipados
│       ├── application/
│       │   ├── dtos/
│       │   │   ├── create[Entity].dto.ts    # Zod schema + tipo inferido
│       │   │   └── update[Entity].dto.ts
│       │   └── use-cases/
│       │       ├── Create[Entity].ts        # Um caso de uso por arquivo
│       │       ├── Update[Entity].ts
│       │       ├── Delete[Entity].ts
│       │       └── Get[Entity].ts
│       ├── infrastructure/
│       │   ├── http/
│       │   │   └── [feature].routes.ts      # Fastify routes — só HTTP concerns
│       │   └── persistence/
│       │       └── Prisma[Entity]Repository.ts  # Implementa a interface
│       └── index.ts                         # Re-exporta o plugin de rotas
│
├── shared/
│   ├── errors/
│   │   └── AppError.ts                      # Base de erros
│   ├── middleware/
│   │   └── authenticate.ts                  # Extrai tenantId + userId do JWT
│   └── plugins/
│       └── prisma.ts                        # Plugin Prisma + RLS helper
│
└── server.ts                                # Bootstrap Fastify
```

---

## Nomenclatura

| Artefato                   | Convenção               | Exemplo                          |
|----------------------------|-------------------------|----------------------------------|
| Entidade de domínio        | PascalCase              | `Contrato.ts`                    |
| Interface repositório      | `I` + PascalCase        | `IContratoRepository.ts`         |
| Implementação repositório  | `Prisma` + PascalCase   | `PrismaContratoRepository.ts`    |
| Use-case                   | Verbo + Entidade        | `CreateContrato.ts`              |
| DTO (Zod schema)           | camelCase + `Dto`       | `createContratoDto.ts`           |
| Erro de domínio            | PascalCase + `Error`    | `ContratoNotFoundError.ts`       |
| Rota Fastify               | camelCase + `.routes`   | `contratos.routes.ts`            |

---

## Fluxo obrigatório

```
[Fastify Route]
      │ (Zod valida body/params/query)
      ▼
[Use Case] ← recebe DTO tipado + tenantId (do JWT)
      │ (lógica de domínio)
      ▼
[I[Entity]Repository] ← interface (porta)
      │
      ▼
[Prisma[Entity]Repository] ← adaptador (infraestrutura)
      │
      ▼
[Prisma + RLS context]
```

**Rotas não contêm lógica de negócio. Use-cases não importam Fastify.**

---

## Checklist de qualidade

- [ ] Cada use-case tem teste unitário com repository mockado?
- [ ] Cada rota tem teste de integração (Fastify inject)?
- [ ] `tenantId` sempre vem do JWT, nunca do body?
- [ ] Interface do repositório definida em `domain/ports/`?
- [ ] Erros de domínio tipados e mapeados para HTTP no handler?
- [ ] Zod schema para todo body, params e querystring?
- [ ] Nenhum `any` no código (exceto Prisma raw query justificada)?

### Checklist pré-commit (OBRIGATÓRIO)

- [ ] `npm run typecheck` (`tsc --noEmit`) passou sem erros?
- [ ] `npm run test` (Vitest) passou sem falhas?
- [ ] `npm run build` compilou sem erros?
- [ ] Ver `references/vitest.md` → seção "Cobertura mínima"
