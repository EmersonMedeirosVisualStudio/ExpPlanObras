---
name: expertobras-frontend-skill
description: >
  Use esta skill para tarefas no frontend expertObras: Next.js App Router,
  TypeScript strict, TanStack Query v5, Zod, shadcn/ui com prioridade para
  custom components, busca com querystring, formulários, hooks, SSE realtime.
  Código sempre em inglês. Um arquivo = uma responsabilidade.
---

# expertObras Frontend Skill
## Stack: Next.js 16 · TypeScript strict · TanStack Query v5 · Zod · shadcn/ui · Axios

Antes de escrever código, leia o arquivo de referência relevante:

| Precisa de...                              | Leia                                |
|--------------------------------------------|-------------------------------------|
| Busca com querystring + TanStack Query     | `references/querystring-search.md`  |
| Componentes UI, shadcn, custom components  | `references/shadcn-components.md`   |
| Padrões gerais (forms, hooks, query keys)  | nextjs-stack-skill references       |

---

## Regras inegociáveis

```
✅ TypeScript strict: true — nunca `any`
✅ Código sempre em inglês: variáveis, funções, tipos, comentários, mensagens de log
✅ Textos exibidos ao usuário podem ser em português (labels, mensagens UI)
✅ Um arquivo = uma responsabilidade = uma função/componente/hook exportado
✅ Dados remotos sempre via TanStack Query — NUNCA useEffect + fetch/axios manual
✅ Busca com filtros via querystring (useSearchParams) + queryKey derivada dos params
✅ Custom components têm prioridade sobre shadcn puro — verificar /components/custom/ antes
✅ shadcn tem prioridade sobre HTML nativo — verificar /components/ui/ antes de criar
✅ Validação com Zod em toda fronteira de dado externo (API response, form input, env)
✅ Nunca misturar lógica de negócio em componentes visuais — extrair para hooks/services
✅ Antes de qualquer commit: tsc + vitest + build (ver checklist)
```

---

## Estrutura de feature

```
src/
├── features/
│   └── [feature]/
│       ├── components/
│       │   ├── [Feature]List.tsx          # Lista/tabela principal
│       │   ├── [Feature]Form.tsx          # Formulário create/edit
│       │   ├── [Feature]Card.tsx          # Card individual
│       │   └── [Feature]Filters.tsx       # Filtros de busca
│       ├── hooks/
│       │   ├── useGet[Feature]s.ts        # Query com filtros
│       │   ├── useGet[Feature].ts         # Query por ID
│       │   ├── useCreate[Feature].ts      # Mutation criar
│       │   ├── useUpdate[Feature].ts      # Mutation atualizar
│       │   ├── useDelete[Feature].ts      # Mutation deletar
│       │   └── queryKeys.ts              # Factory de query keys
│       ├── services/
│       │   └── [feature]Service.ts        # Chamadas axios centralizadas
│       ├── schemas/
│       │   └── [feature]Schema.ts         # Zod schema + tipos
│       └── types/
│           └── index.ts                   # Tipos derivados dos schemas
│
├── components/
│   ├── custom/                            # PRIORIDADE 1 — custom components
│   └── ui/                               # shadcn (gerado — não editar)
│
└── lib/
    ├── api.ts                             # Axios instance configurada
    └── query-client.ts                    # TanStack QueryClient singleton
```

---

## Hierarquia de componentes (prioridade)

```
1. /components/custom/    ← verificar PRIMEIRO se existe o que precisa
2. /components/ui/        ← shadcn gerado
3. HTML nativo com Tailwind ← último recurso
```

**Antes de criar qualquer componente UI, grep em `/components/custom/` e `/components/ui/`.**

---

## Checklist de qualidade

- [ ] Código está em inglês (variáveis, funções, tipos, comentários)?
- [ ] Arquivo exporta apenas uma função/componente principal?
- [ ] Dados remotos via TanStack Query (sem useEffect + fetch)?
- [ ] Filtros de busca sincronizados com querystring via useSearchParams?
- [ ] Verificou /components/custom/ antes de criar novo componente?
- [ ] Schema Zod para response da API?
- [ ] Hook de query separado do componente?
- [ ] QueryKey inclui todos os filtros como dependência?
- [ ] Mutation invalida as queries da lista após sucesso?

### Checklist pré-commit (OBRIGATÓRIO)

- [ ] `npx tsc --noEmit` passou sem erros?
- [ ] `npm run test` passou sem falhas?
- [ ] `npm run build` compilou sem erros?
