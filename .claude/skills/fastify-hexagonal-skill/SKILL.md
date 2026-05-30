---
name: fastify-hexagonal-skill
description: >
  Use esta skill para tarefas no backend: Fastify 5, TypeScript strict, Zod v4,
  Prisma, Vitest, arquitetura Clean Architecture layer-first (domain / application /
  infra / shared), multi-tenant (tenantId RLS), autenticação JWT, rotas, serviços,
  testes. Inclui Entities, Value Objects, Domain Services, Repository interfaces,
  Use Cases (commands/queries), Contracts (factories) e checklists obrigatórios.
---

# Fastify Backend Skill — Clean Architecture (Layer-First)
## Stack: Fastify 5 · TypeScript strict · Zod v4 · Prisma · Vitest · Clean Architecture

Antes de escrever código, leia o arquivo de referência relevante:

| Precisa de...                               | Leia                              |
|---------------------------------------------|-----------------------------------|
| Camadas, portas, adaptadores, DDD completo  | `references/hexagonal-ddd.md`    |
| Rotas, hooks, plugins, schemas HTTP         | `references/fastify.md`           |
| Prisma, transações, RLS multi-tenant        | `references/prisma.md`            |
| Testes unitários e integração, mocks        | `references/vitest.md`            |
| Repository, Factory, Strategy, CQRS        | `references/design-patterns.md`   |

---

## Regras inegociáveis

```
✅ Código sempre em inglês: variáveis, funções, classes, interfaces, tipos, comentários
✅ Textos de API response (mensagens ao usuário) podem ser em português
✅ Um arquivo = uma exportação principal (use-case, entidade, repositório, rota, DTO)
✅ TypeScript strict: true — nunca `any`, usar `unknown` + type guards
✅ Validação com Zod em TODA fronteira (body, params, querystring, env vars)
✅ Nunca acessar Prisma diretamente nas rotas — sempre via use-case → repositório
✅ Repositórios sempre via interface — nunca instanciar PrismaXxxRepository nas rotas
✅ Use-cases não conhecem Fastify (FastifyRequest, FastifyReply) — recebem DTOs tipados
✅ Erros de domínio = classes tipadas herdando AppError; rotas capturam e mapeiam HTTP
✅ Domain logic (regras de negócio) NUNCA na camada de infra
✅ Multi-tenant: tenantId SEMPRE do JWT — nunca no body/query
✅ @/ para todos os imports (nunca relative cross-layer)
✅ Imports ordenados pelo Biome (npx biome check --write)
✅ Todo teste usa Vitest — nunca Jest
✅ Antes de qualquer commit: tsc + vitest + biome check (ver checklist)
```

---

## Estrutura (Clean Architecture — Layer-First)

```
src/
├── domain/                          # CAMADA DE DOMÍNIO (pura — zero infra)
│   ├── entities/
│   │   ├── User.ts                  # Aggregate Root ou Entity
│   │   ├── Tenant.ts
│   │   ├── Contrato.ts
│   │   ├── Obra.ts
│   │   └── ...
│   ├── value-objects/
│   │   └── ContractValidity.ts      # Imutável, identificado por valor
│   ├── repositories/                # Interfaces (portas de saída)
│   │   ├── IUserRepository.ts
│   │   ├── ITenantRepository.ts
│   │   ├── IContratoRepository.ts
│   │   └── ...
│   ├── services/                    # Lógica que não pertence a uma entidade
│   │   ├── assertTenantActive.ts
│   │   └── buildSubscriptionAlert.ts
│   └── errors/
│       ├── AuthErrors.ts
│       ├── ContratoErrors.ts
│       └── ...
│
├── application/                     # CAMADA DE APLICAÇÃO (orquestra domínio)
│   ├── use-cases/
│   │   ├── auth/
│   │   │   ├── commands/
│   │   │   │   ├── Login.ts
│   │   │   │   ├── Register.ts
│   │   │   │   └── ChangePassword.ts
│   │   │   └── queries/
│   │   │       └── SelectTenant.ts
│   │   ├── contratos/
│   │   │   ├── commands/
│   │   │   │   ├── CreateContrato.ts
│   │   │   │   └── UpdateContrato.ts
│   │   │   └── queries/
│   │   │       ├── GetContratoById.ts
│   │   │       └── ListContratos.ts
│   │   └── [domain]/               # um subdir por domínio
│   │       ├── commands/
│   │       └── queries/
│   ├── dto/
│   │   ├── auth/
│   │   │   ├── loginDto.ts
│   │   │   └── registerDto.ts
│   │   ├── contratos/
│   │   │   ├── createContratoDto.ts
│   │   │   └── updateContratoDto.ts
│   │   └── [domain]/
│   └── contracts/                   # Wiring: instancia repos + use-cases
│       ├── makeAuthUseCases.ts
│       ├── makeContratoUseCases.ts
│       └── ...
│
├── infra/                           # CAMADA DE INFRAESTRUTURA (I/O)
│   ├── database/
│   │   ├── prisma/
│   │   │   └── client.ts            # Prisma client + withRLS<T>()
│   │   └── repositories/
│   │       ├── PrismaUserRepository.ts
│   │       ├── PrismaContratoRepository.ts
│   │       └── ...
│   ├── http/
│   │   ├── middlewares/
│   │   │   ├── authenticate.ts      # JWT + subscription + abrangência
│   │   │   └── checkSystemAdmin.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts       # Só HTTP: parse, validate Zod, auth ctx
│   │   │   ├── contratos.routes.ts
│   │   │   └── ...
│   │   └── server.ts                # Bootstrap Fastify + registro de rotas
│   └── providers/                   # Serviços externos e adaptadores
│       ├── billing/
│       │   └── billingOps.ts        # Mercado Pago, pagamentos
│       ├── geo/
│       │   └── geoOps.ts            # Nominatim, ViaCEP
│       └── [domain]/
│
├── shared/
│   ├── utils/
│   │   ├── validators.ts
│   │   ├── rateLimit.ts
│   │   ├── slug.ts
│   │   └── captcha.ts
│   ├── config/
│   │   └── fastify-jwt.d.ts         # Augmentação de tipos JWT
│   └── errors/
│       ├── AppError.ts              # Base de erros de domínio
│       └── HttpError.ts             # Mapeia AppError → HTTP status
│
├── tests/
│   ├── unit/
│   │   └── use-cases/               # Testes unitários por domínio
│   └── integration/
│
└── main.ts                          # Entry point
```

---

## DDD — Conceitos aplicados

### Organização por camada, domínio dentro

Diferente da organização por bounded context (module-first), aqui a camada vem primeiro
e o domínio é um subdiretório dentro dela:

```
domain/repositories/IContratoRepository.ts      ← interface
infra/database/repositories/PrismaContratoRepository.ts  ← implementação
application/use-cases/contratos/commands/CreateContrato.ts
infra/http/routes/contratos.routes.ts
```

### Value Object
Imutável, identificado pelo valor (não por ID).
```ts
// domain/value-objects/ContractValidity.ts
export class ContractValidity {
  private constructor(
    readonly initialDate: Date,
    readonly currentDate: Date,
    readonly durationDays: number,
  ) {}

  static create(input: { durationDays: number; signatureDate?: Date | null }): ContractValidity {
    const base = input.signatureDate ?? new Date()
    const d = new Date(base.getTime() + input.durationDays * 86400000)
    return new ContractValidity(d, d, input.durationDays)
  }

  isExpired(): boolean {
    return this.currentDate < new Date()
  }

  extend(days: number): ContractValidity {
    const extended = new Date(this.currentDate.getTime() + days * 86400000)
    return new ContractValidity(this.initialDate, extended, this.durationDays + days)
  }
}
```

### Domain Service
Lógica de domínio que não pertence a uma única entidade.
```ts
// domain/services/assertTenantActive.ts — 1 função por arquivo
export function assertTenantActive(tenant: Tenant): void {
  if (tenant.status === 'INACTIVE') throw new Error('Tenant inativo')
}

// domain/services/buildSubscriptionAlert.ts
export function buildSubscriptionAlert(tenant: Tenant): string | null {
  // ... retorna mensagem de alerta ou null
}
```

### Domain Errors (tipados, herdando AppError)
```ts
// domain/errors/ContratoErrors.ts
import { AppError } from '@/shared/errors/AppError.js'

export class ContratoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Contract ${id} not found` : 'Contract not found', 404, 'NOT_FOUND')
    this.name = 'ContratoNotFoundError'
  }
}

export class ContratoConflictError extends AppError {
  constructor(numero: string) {
    super(`Contract number "${numero}" already exists`, 409, 'CONFLICT')
    this.name = 'ContratoConflictError'
  }
}
```

### Repository Interface
```ts
// domain/repositories/IContratoRepository.ts
export interface IContratoRepository {
  findById(tenantId: number, id: number): Promise<Contrato | null>
  list(tenantId: number, filter?: ListContratosFilter): Promise<Contrato[]>
  create(tenantId: number, input: CreateContratoInput): Promise<Contrato>
  update(tenantId: number, id: number, input: UpdateContratoInput): Promise<Contrato>
}
```

### Contract (Factory)
```ts
// application/contracts/makeContratoUseCases.ts
export function makeContratoUseCases() {
  const repo = new PrismaContratoRepository()
  return {
    createContrato: new CreateContratoUseCase(repo),
    updateContrato: new UpdateContratoUseCase(repo),
    getContratoById: new GetContratoByIdUseCase(repo),
    listContratos: new ListContratosUseCase(repo),
  }
}
```

---

## Fluxo obrigatório

```
[HTTP Request]
      │
      ▼
[infra/http/routes/*.routes.ts]   ← só HTTP: parse, validate Zod, auth context
      │ DTO tipado
      ▼
[application/use-cases/[domain]]  ← orquestra: chama domínio + repositório
      │ chama domain/services, domain/entities
      ▼
[domain/]                         ← regras de negócio puras (sem I/O)
      │
      ▼
[domain/repositories/I*Repository]  ← interface definida no domínio
      │
      ▼
[infra/database/repositories/Prisma*Repository]  ← implementação
      │ withRLS(tenantId)
      ▼
[Prisma + PostgreSQL]
```

**Leis:**
- `domain/` não importa nada de `infra/` ou `application/`
- `application/` importa `domain/` mas nunca `infra/`
- `infra/` importa `domain/` e `application/` mas nunca importa de `infra/` cruzado
- Rotas (`infra/http/routes/`) não contêm lógica de negócio
- Use-cases não conhecem Fastify

---

## Nomenclatura

| Artefato                   | Convenção                   | Exemplo                                           |
|----------------------------|-----------------------------|---------------------------------------------------|
| Entity                     | PascalCase                  | `domain/entities/Contrato.ts`                    |
| Value Object               | PascalCase                  | `domain/value-objects/ContractValidity.ts`       |
| Domain Service             | verbo + noun                | `domain/services/assertTenantActive.ts`          |
| Repository interface       | `I` + PascalCase            | `domain/repositories/IContratoRepository.ts`     |
| Repository impl            | `Prisma` + PascalCase       | `infra/database/repositories/PrismaContratoRepository.ts` |
| Use-case command           | Verb + Entity               | `application/use-cases/contratos/commands/CreateContrato.ts` |
| Use-case query             | Get/List + Entity           | `application/use-cases/contratos/queries/GetContratoById.ts` |
| DTO (Zod)                  | camelCase + Dto             | `application/dto/contratos/createContratoDto.ts` |
| Contract (factory)         | `make` + UseCases           | `application/contracts/makeContratoUseCases.ts`  |
| Route file                 | camelCase + `.routes`       | `infra/http/routes/contratos.routes.ts`          |
| Domain error               | PascalCase + Error          | `domain/errors/ContratoErrors.ts`                |
| Domain error file          | PascalCase + Errors (plural)| `domain/errors/AuthErrors.ts`                    |

---

## Checklist de qualidade

- [ ] Novo código respeita separação de camadas: domain → application → infra?
- [ ] Domain layer importa apenas `shared/errors/` — zero imports de infra ou application?
- [ ] Use-case recebe DTO tipado, não FastifyRequest?
- [ ] Repository interface em `domain/repositories/`?
- [ ] Implementação Prisma em `infra/database/repositories/`?
- [ ] Route file em `infra/http/routes/` — zero prisma, zero lógica de negócio?
- [ ] Erros de domínio em `domain/errors/`, tipados, herdam AppError?
- [ ] Zod schema para todo body, params e querystring?
- [ ] `@/` em todos os imports (nunca relativos entre camadas)?
- [ ] `tenantId` sempre do JWT, nunca do body?
- [ ] DTO em `application/dto/[domain]/`?
- [ ] Contract (factory) em `application/contracts/`?

### Checklist pré-commit (OBRIGATÓRIO)

- [ ] `npm run typecheck` (`tsc --noEmit`) passou?
- [ ] `npm run test` (Vitest) passou?
- [ ] `npm run check` (Biome lint + format) passou?
- [ ] Zero erros de nível `error` no Biome?
