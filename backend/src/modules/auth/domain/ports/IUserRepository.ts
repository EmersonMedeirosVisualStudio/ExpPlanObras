import type { User, UserTenant } from '@/modules/auth/domain/entities/User.js'

export interface CreateUserInput {
  email: string
  name: string
  cpf: string | null
  password: string
  whatsapp?: string | null
  address?: string | null
  location?: string | null
  oauthProvider?: string | null
  oauthId?: string | null
}

export interface IUserRepository {
  findByEmail(email: string): Promise<(User & { tenants: UserTenant[] }) | null>
  findById(id: number): Promise<User | null>
  existsByEmail(email: string): Promise<boolean>
  create(input: CreateUserInput): Promise<User>
  updatePassword(userId: number, hashedPassword: string): Promise<void>
}
