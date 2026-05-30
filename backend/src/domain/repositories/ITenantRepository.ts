import type { Tenant } from '@/domain/entities/Tenant.js'
import type { UserTenant } from '@/domain/entities/User.js'

export interface CreateTenantInput {
  name: string
  slug: string
  cnpj?: string | null
  companyEmail?: string | null
  companyWhatsapp?: string | null
  link?: string | null
  street?: string | null
  number?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  cep?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface ITenantRepository {
  findById(id: number): Promise<Tenant | null>
  getUserTenants(userId: number): Promise<UserTenant[]>
  findTenantUser(tenantId: number, userId: number): Promise<{ role: string; tenant: Tenant } | null>
  createWithOwner(
    tenantInput: CreateTenantInput,
    userId: number,
    ownerName: string,
    ownerCpf: string | null,
    ownerEmail: string,
  ): Promise<Tenant>
}
