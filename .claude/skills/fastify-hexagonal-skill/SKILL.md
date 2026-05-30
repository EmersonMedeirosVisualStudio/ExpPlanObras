---
name: fastify-hexagonal-skill
description: >
  Use esta skill para tarefas no backend: Fastify 5, TypeScript strict, Zod v4,
  Prisma, Vitest, arquitetura Hexagonal + DDD (Domain-Driven Design), design
  patterns, multi-tenant (tenantId RLS), autenticação JWT, rotas, serviços,
  testes. Inclui Bounded Context, Aggregates, Value Objects, Domain Events,
  Domain Services, Ubiquitous Language e checklists obrigatórios.
---

# Fastify Backend Skill — Hexagonal + DDD
## Stack: Fastify 5 · TypeScript strict · Zod v4 · Prisma · Vitest · Hexagonal + DDD

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
✅ Nunca acessar Prisma diretamente nas rotas — sempre via use-case → porta
✅ Repositórios sempre via interface (porta) — nunca instanciar PrismaXxxRepository nas rotas
✅ Use-cases não conhecem Fastify (FastifyRequest, FastifyReply) — recebem DTOs tipados
✅ Erros de domínio = classes tipadas herdando AppError; rotas capturam e mapeiam HTTP
✅ Domain logic (regras de negócio) NUNCA na camada de infraestrutura
✅ Multi-tenant: tenantId SEMPRE do JWT — nunca no body/query
✅ @/ para todos os imports (nunca relative cross-module)
✅ Imports ordenados pelo Biome (npx biome check --write)
✅ Todo teste usa Vitest — nunca Jest
✅ Antes de qualquer commit: tsc + vitest + biome check (ver checklist)
```

---

## Estrutura de módulo (Hexagonal + DDD)

Cada módulo = um **Bounded Context**. Cada bounded context tem:

```
src/
├── modules/
│   └── [bounded-context]/          # Ex: contratos/, auth/, obras/
│       ├── domain/                 # CAMADA DE DOMÍNIO (pura — sem infra)
│       │   ├── entities/
│       │   │   └── [Entity].ts         # Aggregate Root ou Entity
│       │   ├── value-objects/
│       │   │   └── [ValueObject].ts    # Imutável, identificado por valor
│       │   ├── services/
│       │   │   └── [DomainService].ts  # Lógica que não pertence a uma entidade
│       │   ├── events/
│       │   │   └── [Entity]Events.ts   # Domain events
│       │   ├── ports/
│       │   │   └── I[Entity]Repository.ts  # Interface (porta de saída)
│       │   └── errors/
│       │       └── [Entity]Errors.ts   # Erros de domínio tipados
│       │
│       ├── application/             # CAMADA DE APLICAÇÃO (orquestra domínio)
│       │   ├── dtos/
│       │   │   ├── create[Entity]Dto.ts    # Zod schema + tipo inferido
│       │   │   └── update[Entity]Dto.ts
│       │   ├── use-cases/
│       │   │   ├── commands/
│       │   │   │   ├── Create[Entity].ts   # Mutação — um arquivo por use-case
│       │   │   │   ├── Update[Entity].ts
│       │   │   │   └── Delete[Entity].ts
│       │   │   └── queries/
│       │   │       ├── Get[Entity]ById.ts
│       │   │       └── List[Entity]s.ts
│       │   └── factories/
│       │       └── make[Entity]UseCases.ts # Wiring: instancia repos + use-cases
│       │
│       └── infrastructure/          # CAMADA DE INFRAESTRUTURA (I/O)
│           ├── http/
│           │   └── [bounded-context].routes.ts  # Fastify routes — só HTTP
│           └── persistence/
│               └── Prisma[Entity]Repository.ts  # Implementa I[Entity]Repository
│
├── shared/
│   ├── errors/
│   │   ├── AppError.ts             # Base de erros de domínio
│   │   └── HttpError.ts            # Mapeia AppError → HTTP status
│   ├── middleware/
│   │   ├── authenticate.ts         # JWT + subscription + abrangência
│   │   └── checkSystemAdmin.ts
│   └── plugins/
│       └── prisma.ts               # Prisma client + withRLS<T>()
│
└── server.ts                       # Bootstrap Fastify
```

---

## DDD — Conceitos aplicados

### Bounded Context
Cada módulo (`contratos/`, `auth/`, `obras/`) é um bounded context.
- **Linguagem ubíqua (Ubiquitous Language):** termos do domínio usados igual no código e no negócio
- `Contrato`, `Obra`, `Aditivo` são termos do domínio — mantidos nos nomes de arquivo
- Funções e variáveis: inglês. Nomes de entidade de domínio: podem ser do domínio

### Aggregate Root
Entidade principal que controla acesso a entidades filhas.
```ts
// Contrato é o Aggregate Root
// ContratoAditivo, ContratoMedicao só são acessados via IContratoRepository
// Nunca acesse ContratoAditivo diretamente de outra bounded context
```

### Value Object
Imutável, identificado pelo valor (não por ID).
```ts
// modules/contratos/domain/value-objects/ContractValidity.ts
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
// modules/auth/domain/services/assertTenantActive.ts — 1 função por arquivo
export function assertTenantActive(tenant: Tenant): void {
  if (tenant.status === 'INACTIVE') throw new Error('Tenant inativo')
  // ... regras de subscrição
}

// modules/auth/domain/services/buildSubscriptionAlert.ts
export function buildSubscriptionAlert(tenant: Tenant): string | null {
  // ... retorna mensagem de alerta ou null
}
```

### Domain Event (padrão para side-effects)
```ts
// modules/contratos/domain/events/ContratoEvents.ts
export type ContratoCreatedEvent = {
  type: 'CONTRATO_CREATED'
  payload: { tenantId: number; contratoId: number; numeroContrato: string }
  occurredAt: Date
}

export type ContratoAditivoApprovedEvent = {
  type: 'CONTRATO_ADITIVO_APPROVED'
  payload: { tenantId: number; contratoId: number; aditivoId: number }
  occurredAt: Date
}
```

### Domain Errors (tipados, herdando AppError)
```ts
// modules/contratos/domain/errors/ContratoErrors.ts
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

---

## Fluxo obrigatório (Hexagonal + DDD)

```
[HTTP Request]
      │
      ▼
[Fastify Route]           ← só HTTP: parse, validate Zod, auth context
      │ DTO tipado
      ▼
[Use Case]                ← orquestra: chama domínio + porta
      │ chama domain services/entities
      ▼
[Domain Layer]            ← regras de negócio puras (sem I/O)
      │
      ▼
[IXxxRepository port]     ← interface definida no domínio
      │
      ▼
[PrismaXxxRepository]     ← implementação de infraestrutura
      │ withRLS(tenantId)
      ▼
[Prisma + PostgreSQL]
```

**Leis:**
- Domínio não importa nada de infra (Prisma, Fastify, Zod, HTTP)
- Use-case não importa Fastify
- Rotas não contêm lógica de negócio
- Repositório não conhece regras de negócio

---

## Nomenclatura

| Artefato                   | Convenção                   | Exemplo                          |
|----------------------------|-----------------------------|----------------------------------|
| Aggregate Root / Entity    | PascalCase (domínio)        | `Contrato.ts`, `Obra.ts`        |
| Value Object               | PascalCase + VO (opcional)  | `ContractValidity.ts`           |
| Domain Service             | verbo + noun camelCase      | `assertTenantActive.ts`         |
| Domain Event               | PascalCase + Event          | `ContratoEvents.ts`             |
| Interface repositório      | `I` + PascalCase            | `IContratoRepository.ts`        |
| Implementação repositório  | `Prisma` + PascalCase       | `PrismaContratoRepository.ts`   |
| Use-case (command)         | Verb + Entity               | `CreateContrato.ts`             |
| Use-case (query)           | Get/List + Entity           | `GetContratoById.ts`            |
| DTO (Zod)                  | camelCase + Dto             | `createContratoDto.ts`          |
| Erro de domínio            | PascalCase + Error          | `ContratoNotFoundError.ts`      |
| Factory                    | `make` + UseCases           | `makeContratoUseCases.ts`       |
| Rota                       | camelCase + `.routes`       | `contratos.routes.ts`           |

---

## Checklist de qualidade (DDD + Hexagonal)

- [ ] Módulo tem pasta `domain/` com entidades, portas e erros?
- [ ] Domain logic (regras de negócio) está em `domain/`, não em routes ou infra?
- [ ] Conceitos de domínio têm nomes da linguagem ubíqua?
- [ ] Aggregate Root identificado? Acesso a filhos só via repositório raiz?
- [ ] Value objects imutáveis onde aplicável?
- [ ] Domain services separados (1 função/classe por arquivo)?
- [ ] Cada use-case tem teste unitário com repository mockado?
- [ ] Interface do repositório em `domain/ports/`?
- [ ] Erros tipados mapeados para HTTP nas rotas?
- [ ] Zod schema para todo body, params e querystring?
- [ ] `@/` em todos os imports cross-module?
- [ ] `tenantId` sempre do JWT, nunca do body?

### Checklist pré-commit (OBRIGATÓRIO)

- [ ] `npm run typecheck` (`tsc --noEmit`) passou?
- [ ] `npm run test` (Vitest) passou?
- [ ] `npm run check` (Biome lint + format) passou?
- [ ] Zero erros de nível `error` no Biome?
