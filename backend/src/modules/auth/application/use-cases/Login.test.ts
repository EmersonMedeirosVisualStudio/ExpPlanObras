import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IUserRepository } from '@/modules/auth/domain/ports/IUserRepository.js'
import type { ITenantRepository } from '@/modules/auth/domain/ports/ITenantRepository.js'
import { LoginUseCase } from '@/modules/auth/application/use-cases/Login.js'
import { InvalidCredentialsError } from '@/modules/auth/domain/errors/AuthErrors.js'

const mockUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  cpf: '12345678901',
  password: '$2b$10$hashedpassword',
  whatsapp: null,
  address: null,
  location: null,
  oauthProvider: null,
  oauthId: null,
  isSystemAdmin: false,
  createdAt: new Date(),
  tenants: [{ tenantId: 10, role: 'ADMIN', name: 'Empresa Test', slug: 'empresa-test', funcionarioId: null }],
}

const mockTenant = {
  id: 10,
  name: 'Empresa Test',
  slug: 'empresa-test',
  status: 'ACTIVE',
  subscriptionStatus: 'ACTIVE',
  trialEndsAt: null,
  paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  gracePeriodEndsAt: null,
}

const makeUserRepo = (): IUserRepository => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  updatePassword: vi.fn(),
})

const makeTenantRepo = (): ITenantRepository => ({
  findById: vi.fn(),
  getUserTenants: vi.fn(),
  findTenantUser: vi.fn(),
  createWithOwner: vi.fn(),
})

const mockSessionAccess = vi.fn().mockResolvedValue({
  perfis: ['REPRESENTANTE_EMPRESA'],
  permissoes: ['*'],
  abrangencia: { empresa: true, obras: [], unidades: [] },
})

const mockApp = {
  jwt: { sign: vi.fn().mockReturnValue('signed-token') },
} as any

describe('LoginUseCase', () => {
  let userRepo: IUserRepository
  let tenantRepo: ITenantRepository
  let useCase: LoginUseCase

  beforeEach(() => {
    userRepo = makeUserRepo()
    tenantRepo = makeTenantRepo()
    useCase = new LoginUseCase(userRepo, tenantRepo, mockSessionAccess)
    vi.clearAllMocks()
    mockApp.jwt.sign.mockReturnValue('signed-token')
  })

  it('throws InvalidCredentialsError when user not found', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null)

    await expect(
      useCase.execute({ email: 'notfound@test.com', password: '123' }, mockApp),
    ).rejects.toThrow(InvalidCredentialsError)
  })

  it('throws InvalidCredentialsError when password is wrong', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(mockUser)

    await expect(
      useCase.execute({ email: mockUser.email, password: 'wrongpassword' }, mockApp),
    ).rejects.toThrow(InvalidCredentialsError)
  })

  it('returns system admin token without tenant when isSystemAdmin', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue({ ...mockUser, isSystemAdmin: true })

    const bcrypt = await import('bcryptjs')
    const realPassword = 'password123'
    const hashed = await bcrypt.hash(realPassword, 10)
    vi.mocked(userRepo.findByEmail).mockResolvedValue({ ...mockUser, password: hashed, isSystemAdmin: true })

    const result = await useCase.execute({ email: mockUser.email, password: realPassword }, mockApp)

    expect(result.token).toBe('signed-token')
    expect(result.user.isSystemAdmin).toBe(true)
    expect(result.user.tenants).toHaveLength(0)
  })

  it('returns token and session when single tenant', async () => {
    const bcrypt = await import('bcryptjs')
    const realPassword = 'password123'
    const hashed = await bcrypt.hash(realPassword, 10)
    vi.mocked(userRepo.findByEmail).mockResolvedValue({ ...mockUser, password: hashed })
    vi.mocked(tenantRepo.findById).mockResolvedValue(mockTenant)

    const result = await useCase.execute({ email: mockUser.email, password: realPassword }, mockApp)

    expect(result.token).toBe('signed-token')
    expect(result.user.perfis).toEqual(['REPRESENTANTE_EMPRESA'])
    expect(result.user.tenants).toHaveLength(1)
  })

  it('returns null token when user has multiple tenants', async () => {
    const bcrypt = await import('bcryptjs')
    const realPassword = 'password123'
    const hashed = await bcrypt.hash(realPassword, 10)
    const multiTenantUser = {
      ...mockUser,
      password: hashed,
      tenants: [
        { tenantId: 10, role: 'ADMIN', name: 'Empresa A', slug: 'empresa-a', funcionarioId: null },
        { tenantId: 20, role: 'ADMIN', name: 'Empresa B', slug: 'empresa-b', funcionarioId: null },
      ],
    }
    vi.mocked(userRepo.findByEmail).mockResolvedValue(multiTenantUser)

    const result = await useCase.execute({ email: mockUser.email, password: realPassword }, mockApp)

    expect(result.token).toBeNull()
    expect(result.user.tenants).toHaveLength(2)
  })
})
