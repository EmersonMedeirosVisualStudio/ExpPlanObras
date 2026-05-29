---
name: code-conventions-skill
description: >
  Use esta skill para aplicar convenções de código do projeto expertObras:
  código sempre em inglês, um arquivo = uma função/classe exportada,
  nomenclatura, organização, comentários e anti-patterns a evitar.
  Aplicável a todo código TypeScript (frontend e backend).
---

# Code Conventions Skill
## Projeto expertObras — Padrões universais de código

---

## Regras absolutas

```
✅ Código em inglês: variáveis, funções, classes, interfaces, tipos, enums, comentários, logs
✅ Textos de UI exibidos ao usuário podem ser em português (labels, mensagens, placeholders)
✅ Um arquivo = uma exportação principal (função, classe ou componente React)
✅ Arquivos secundários (helpers, types) podem ter múltiplas exports pequenas relacionadas
✅ Nenhum arquivo de código ultrapassa 200 linhas — dividir em responsabilidades menores
✅ TypeScript strict: true — nunca `any`, nunca `@ts-ignore` sem comentário justificando
```

---

## Idioma do código

```ts
// ✅ Inglês em todo código
const contractList = await getContracts(tenantId, filters)
const isContractExpired = checkExpiry(contract.expirationDate)

function calculateContractAlert(contract: Contract): AlertLevel {
  // Business rule: contracts expiring in less than 30 days are "pending"
  ...
}

interface ContractRepository {
  findById(tenantId: number, id: number): Promise<Contract | null>
  create(tenantId: number, data: CreateContractDto): Promise<Contract>
}

// ✅ Texto de UI em português (string literals para o usuário)
<Button>Novo Contrato</Button>
toast.error('Contrato não encontrado')
return reply.status(404).send({ message: 'Contrato não encontrado' })

// ❌ NUNCA — variáveis/funções em português
const listaContratos = await buscarContratos(tenantId)
function calcularAlerta(contrato: Contrato) { ... }
interface RepositorioContrato { ... }
```

---

## Um arquivo = uma responsabilidade

```ts
// ✅ Um use-case por arquivo
// CreateContract.ts
export class CreateContractUseCase {
  constructor(private readonly repo: IContractRepository) {}
  async execute(input: CreateContractInput) { ... }
}

// ✅ Um hook por arquivo
// useGetContracts.ts
export function useGetContracts(filters: ContractFilters) {
  return useQuery({ ... })
}

// ❌ NUNCA múltiplas responsabilidades no mesmo arquivo
// contracts.ts — mistura tudo
export class CreateContractUseCase { ... }
export class UpdateContractUseCase { ... }
export class DeleteContractUseCase { ... }
export function useGetContracts() { ... }
export function useCreateContract() { ... }
```

---

## Nomeação de arquivos

| Tipo                        | Convenção                   | Exemplo                          |
|-----------------------------|-----------------------------|----------------------------------|
| Use case                    | `PascalCase.ts`             | `CreateContract.ts`              |
| Hook React                  | `useXxx.ts`                 | `useGetContracts.ts`             |
| Componente React            | `PascalCase.tsx`            | `ContractTable.tsx`              |
| Interface/porta             | `IXxx.ts`                   | `IContractRepository.ts`         |
| DTO (Zod schema)            | `xxxDto.ts`                 | `createContractDto.ts`           |
| Schema de validação         | `xxxSchema.ts`              | `contractFiltersSchema.ts`       |
| Service (HTTP calls)        | `xxxService.ts`             | `contractService.ts`             |
| Repositório (Prisma)        | `PrismaXxxRepository.ts`    | `PrismaContractRepository.ts`    |
| Erro de domínio             | `XxxErrors.ts`              | `ContractErrors.ts`              |
| Query keys                  | `queryKeys.ts`              | `queryKeys.ts`                   |
| Constante global            | `SCREAMING_SNAKE.ts`        | `CONTRACT_STATUS.ts`             |

---

## Nomenclatura de identificadores

```ts
// Funções e variáveis — camelCase
const contractId = 123
function getContractById(id: number) { ... }

// Classes e interfaces — PascalCase
class CreateContractUseCase { ... }
interface IContractRepository { ... }
type ContractStatus = 'ACTIVE' | 'CLOSED'

// Enums — PascalCase (chaves SCREAMING_SNAKE ou PascalCase)
enum ContractRole {
  CONTRACTOR = 'CONTRACTOR',
  CONTRACTEE = 'CONTRACTEE',
}

// Constantes globais — SCREAMING_SNAKE
const MAX_CONTRACT_AMOUNT = 1_000_000_000
const DEFAULT_PAGE_SIZE = 20

// Componentes React — PascalCase
function ContractCard({ contract }: ContractCardProps) { ... }

// Tipos derivados de Zod — PascalCase
type CreateContractDto = z.infer<typeof createContractDto>
```

---

## Comentários — quando e como

```ts
// ✅ Comentar apenas o WHY — nunca o WHAT
// RLS requires tenant context before any query — do not remove
await setTenantContext(tx, tenantId)

// Prisma P2002 = unique constraint violation (contract number already exists)
if (e.code === 'P2002') throw new ContractConflictError(data.contractNumber)

// ❌ NUNCA comentar o que o código já diz
// Get contract by id
const contract = await repo.findById(tenantId, id)

// ❌ NUNCA comentar em português
// Busca contrato por id
```

---

## Limite de tamanho

```
Arquivo         → máx 200 linhas (exceto schema.prisma e arquivos gerados)
Função/método   → máx 40 linhas
Componente React → máx 150 linhas — extrair sub-componentes se ultrapassar
```

Quando ultrapassar: **dividir em responsabilidades menores**, não aumentar o limite.

---

## Anti-patterns

```ts
// ❌ Exportações múltiplas sem relação
export function createContract() { ... }
export function updateContract() { ... }
export function deleteContract() { ... }   // ← 3 use-cases em 1 arquivo

// ❌ Português no código
const valorContrato = 50000
function calcularAlerta(contrato: any) { return 'OK' }

// ❌ any sem justificativa
const result: any = await someOperation()

// ❌ Arquivo gigante (god file)
// contracts.service.ts com 800 linhas e 30 funções

// ✅ Correto
// CreateContract.ts → export class CreateContractUseCase
// UpdateContract.ts → export class UpdateContractUseCase
// DeleteContract.ts → export class DeleteContractUseCase
```
