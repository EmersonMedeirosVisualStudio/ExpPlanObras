export interface User {
  id: number
  email: string
  name: string | null
  cpf: string | null
  password: string
  whatsapp: string | null
  address: string | null
  location: string | null
  oauthProvider: string | null
  oauthId: string | null
  isSystemAdmin: boolean
  createdAt: Date
}

export interface UserTenant {
  tenantId: number
  role: string
  name: string
  slug: string
  funcionarioId: number | null
}
