export type ObraStatus =
  | 'AGUARDANDO_RECURSOS'
  | 'AGUARDANDO_CONTRATO'
  | 'AGUARDANDO_OS'
  | 'NAO_INICIADA'
  | 'EM_ANDAMENTO'
  | 'PARADA'
  | 'FINALIZADA'

export type ObraType = 'PUBLICA' | 'PARTICULAR'

export type OrigemEndereco = 'LINK' | 'CEP' | 'MANUAL'

export interface AbrangenciaContext {
  empresa: boolean
  obras: number[]
  unidades: number[]
}

export interface Obra {
  id: number
  tenantId: number
  contratoId: number
  name: string
  type: ObraType
  status: ObraStatus
  description: string | null
  valorPrevisto: number | null
  valorAtual: number | null
  createdAt: Date
  updatedAt: Date
}

export interface EnderecoObra {
  id: number
  tenantId: number
  obraId: number
  nomeEndereco: string | null
  principal: boolean
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  latitude: string | null
  longitude: string | null
  origemEndereco: OrigemEndereco
  origemCoordenada: OrigemEndereco
}

export function canAccessObra(obraId: number, scope?: AbrangenciaContext): boolean {
  if (!scope || scope.empresa) return true
  return Array.isArray(scope.obras) && scope.obras.includes(obraId)
}

export function buildScopeWhere(tenantId: number, scope?: AbrangenciaContext): { tenantId: number; id?: { in: number[] } } {
  if (!scope || scope.empresa) return { tenantId }
  if (Array.isArray(scope.obras) && scope.obras.length > 0) return { tenantId, id: { in: scope.obras } }
  return { tenantId, id: { in: [-1] } }
}
