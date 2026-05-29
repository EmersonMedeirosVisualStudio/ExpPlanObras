# shadcn/ui + Custom Components — Referência

## Hierarquia de uso (ordem de prioridade)

```
1. /components/custom/   ← verificar PRIMEIRO
2. /components/ui/       ← shadcn gerado
3. Compor com primitivos shadcn + Tailwind
4. HTML nativo           ← último recurso
```

**Regra:** antes de criar qualquer componente UI, grep:
```bash
# Verificar custom components existentes
ls src/components/custom/

# Verificar shadcn components instalados
ls src/components/ui/
```

---

## Custom components já existentes (verificar antes de criar)

| Componente                  | Caminho                              | Uso                                |
|-----------------------------|--------------------------------------|------------------------------------|
| `QueryBoundary`             | `custom/query-boundary`              | Wrap de loading/error em queries   |
| `CustomFormField`           | `custom/custom-form-field`           | Campo de formulário tipado         |
| `CustomSubmitButton`        | `custom/custom-submit-button`        | Botão submit com isDirty           |
| `PageLoadStatusBadge`       | `custom/PageLoadStatus`              | Badge de status de carregamento    |

---

## Padrão de custom component

```tsx
// components/custom/status-badge.tsx
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type Status = 'ATIVO' | 'ENCERRADO' | 'RESCINDIDO' | 'PENDENTE'

const statusConfig: Record<Status, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ATIVO: { label: 'Active', variant: 'default' },
  ENCERRADO: { label: 'Closed', variant: 'secondary' },
  RESCINDIDO: { label: 'Rescinded', variant: 'destructive' },
  PENDENTE: { label: 'Pending', variant: 'outline' },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  )
}
```

---

## Padrão de data table (custom)

```tsx
// components/custom/data-table.tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export function DataTable<T extends { id: number | string }>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={String(col.key)} className={col.className}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow
            key={row.id}
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
          >
            {columns.map((col) => (
              <TableCell key={String(col.key)} className={col.className}>
                {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

---

## Padrão de modal com form (custom)

```tsx
// components/custom/entity-modal.tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

interface EntityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}

export function EntityModal({ open, onOpenChange, title, description, children }: EntityModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
```

---

## Padrão de empty state (custom)

```tsx
// components/custom/empty-state.tsx
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <Icon className="h-12 w-12 text-muted-foreground/50" />
      <div className="space-y-1">
        <p className="font-medium text-muted-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground/70">{description}</p>}
      </div>
      {action}
    </div>
  )
}
```

---

## Tokens de design obrigatórios

```tsx
// ✅ Usar CSS variables via shadcn — nunca cores hardcodadas
<p className="text-muted-foreground">   // texto secundário
<div className="bg-muted">             // fundo neutro
<span className="text-destructive">   // erros/alerta
<div className="border-border">       // bordas

// ✅ Espaçamento consistente
gap-4, gap-6        // entre itens
p-4, p-6, p-8      // padding de cards/sections
space-y-4, space-y-6 // pilha vertical

// ✅ Ícone Lucide em todo ponto de ação/contexto
import { Plus, Trash2, Edit, AlertCircle } from 'lucide-react'
<Button><Plus className="h-4 w-4 mr-2" />New Contract</Button>

// ❌ NUNCA
<div style={{ color: '#ff0000' }}>
<p className="text-red-500">  // usar text-destructive
<div className="bg-gray-100"> // usar bg-muted
```

---

## Skeleton de loading (padrão)

```tsx
// Sempre criar skeleton correspondente ao layout real
import { Skeleton } from '@/components/ui/skeleton'

export function ContratoTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
```
