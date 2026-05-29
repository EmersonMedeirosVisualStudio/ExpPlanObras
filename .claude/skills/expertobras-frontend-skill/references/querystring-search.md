# Querystring Search — TanStack Query + useSearchParams

## Padrão obrigatório para telas com filtros de busca

Filtros de busca devem ser **sincronizados com a URL** via `useSearchParams`.
Isso permite: link compartilhável, back/forward do browser, refresh sem perder filtros.

---

## Schema de filtros (Zod)

```ts
// features/contratos/schemas/contratoFiltersSchema.ts
import { z } from 'zod'

export const contratoFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ATIVO', 'ENCERRADO', 'RESCINDIDO']).optional(),
  papel: z.enum(['CONTRATADO', 'CONTRATANTE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type ContratoFilters = z.infer<typeof contratoFiltersSchema>
```

---

## Query keys factory

```ts
// features/contratos/hooks/queryKeys.ts
import type { ContratoFilters } from '../schemas/contratoFiltersSchema'

export const contratoKeys = {
  all: ['contratos'] as const,
  lists: () => [...contratoKeys.all, 'list'] as const,
  list: (filters: ContratoFilters) => [...contratoKeys.lists(), filters] as const,
  detail: (id: number) => [...contratoKeys.all, 'detail', id] as const,
}
```

---

## Hook de busca com filtros

```ts
// features/contratos/hooks/useGetContratos.ts
import { useQuery } from '@tanstack/react-query'
import { contratoKeys } from './queryKeys'
import { contratoService } from '../services/contratoService'
import type { ContratoFilters } from '../schemas/contratoFiltersSchema'

export function useGetContratos(filters: ContratoFilters) {
  return useQuery({
    queryKey: contratoKeys.list(filters),
    queryFn: () => contratoService.list(filters),
    placeholderData: (prev) => prev,  // mantém dados anteriores durante refetch
    staleTime: 30 * 1000,
  })
}
```

---

## Hook para sincronizar filtros com URL

```ts
// features/contratos/hooks/useContratoFilters.ts
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { contratoFiltersSchema, type ContratoFilters } from '../schemas/contratoFiltersSchema'

export function useContratoFilters() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Parseia e valida params da URL com Zod
  const filters: ContratoFilters = contratoFiltersSchema.parse({
    search: searchParams.get('search') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    papel: searchParams.get('papel') ?? undefined,
    page: searchParams.get('page') ?? 1,
    limit: searchParams.get('limit') ?? 20,
  })

  const setFilters = useCallback(
    (updates: Partial<ContratoFilters>) => {
      const next = new URLSearchParams(searchParams.toString())
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      })
      
      // Reset page to 1 when filters change (except when setting page explicitly)
      if (!('page' in updates)) next.set('page', '1')
      
      router.push(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [searchParams, router, pathname]
  )

  const resetFilters = useCallback(() => {
    router.push(pathname, { scroll: false })
  }, [router, pathname])

  return { filters, setFilters, resetFilters }
}
```

---

## Componente de filtros

```tsx
// features/contratos/components/ContratoFilters.tsx
'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useContratoFilters } from '../hooks/useContratoFilters'
import { useDebounce } from '@/hooks/useDebounce'
import { useState, useEffect } from 'react'

export function ContratoFilters() {
  const { filters, setFilters, resetFilters } = useContratoFilters()
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debouncedSearch = useDebounce(searchInput, 400)

  // Sincroniza debounced search com URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      setFilters({ search: debouncedSearch || undefined })
    }
  }, [debouncedSearch])

  return (
    <div className="flex gap-3 items-center flex-wrap">
      <Input
        placeholder="Search contracts..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="w-64"
      />
      
      <Select
        value={filters.status ?? 'all'}
        onValueChange={(v) => setFilters({ status: v === 'all' ? undefined : v as any })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="ATIVO">Active</SelectItem>
          <SelectItem value="ENCERRADO">Closed</SelectItem>
          <SelectItem value="RESCINDIDO">Rescinded</SelectItem>
        </SelectContent>
      </Select>
      
      <Button variant="ghost" size="sm" onClick={resetFilters}>
        Clear
      </Button>
    </div>
  )
}
```

---

## Tela completa (page + client component)

```tsx
// app/(protected)/dashboard/contratos/page.tsx
import { Suspense } from 'react'
import { ContratosClient } from '@/features/contratos/components/ContratosClient'

export default function ContratosPage() {
  return (
    <Suspense>
      <ContratosClient />
    </Suspense>
  )
}
```

```tsx
// features/contratos/components/ContratosClient.tsx
'use client'

import { useContratoFilters } from '../hooks/useContratoFilters'
import { useGetContratos } from '../hooks/useGetContratos'
import { ContratoFilters } from './ContratoFilters'
import { ContratoTable } from './ContratoTable'
import { QueryBoundary } from '@/components/custom/query-boundary'
import { Pagination } from '@/components/custom/pagination'

export function ContratosClient() {
  const { filters, setFilters } = useContratoFilters()
  const { data, isLoading, error } = useGetContratos(filters)

  return (
    <div className="space-y-4">
      <ContratoFilters />
      
      <QueryBoundary isLoading={isLoading} error={error}>
        <ContratoTable contracts={data?.data ?? []} />
        
        <Pagination
          page={filters.page}
          totalPages={data ? Math.ceil(data.total / filters.limit) : 1}
          onPageChange={(page) => setFilters({ page })}
        />
      </QueryBoundary>
    </div>
  )
}
```

---

## Hook useDebounce (utilitário)

```ts
// hooks/useDebounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

---

## Service (Axios)

```ts
// features/contratos/services/contratoService.ts
import api from '@/lib/api'
import type { ContratoFilters } from '../schemas/contratoFiltersSchema'

export const contratoService = {
  async list(filters: ContratoFilters) {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.status) params.set('status', filters.status)
    if (filters.papel) params.set('papel', filters.papel)
    params.set('page', String(filters.page))
    params.set('limit', String(filters.limit))
    
    const { data } = await api.get<{ data: Contrato[]; total: number }>(`/contratos?${params}`)
    return data
  },
  
  async getById(id: number) {
    const { data } = await api.get<Contrato>(`/contratos/${id}`)
    return data
  },
}
```
