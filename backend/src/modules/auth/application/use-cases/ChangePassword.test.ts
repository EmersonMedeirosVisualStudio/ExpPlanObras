import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IUserRepository } from '@/modules/auth/domain/ports/IUserRepository.js'
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/ChangePassword.js'
import { InvalidCredentialsError, UserNotFoundError } from '@/modules/auth/domain/errors/AuthErrors.js'

const mockUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test',
  cpf: null,
  password: '',
  whatsapp: null,
  address: null,
  location: null,
  oauthProvider: null,
  oauthId: null,
  isSystemAdmin: false,
  createdAt: new Date(),
}

const makeUserRepo = (): IUserRepository => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  updatePassword: vi.fn(),
})

describe('ChangePasswordUseCase', () => {
  let userRepo: IUserRepository
  let useCase: ChangePasswordUseCase

  beforeEach(() => {
    userRepo = makeUserRepo()
    useCase = new ChangePasswordUseCase(userRepo)
    vi.clearAllMocks()
  })

  it('throws UserNotFoundError when user does not exist', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null)

    await expect(useCase.execute(999, 'old', 'new123')).rejects.toThrow(UserNotFoundError)
  })

  it('throws InvalidCredentialsError when old password is wrong', async () => {
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.hash('correctpassword', 10)
    vi.mocked(userRepo.findById).mockResolvedValue({ ...mockUser, password: hashed })

    await expect(useCase.execute(1, 'wrongpassword', 'newpass123')).rejects.toThrow(InvalidCredentialsError)
  })

  it('updates password when old password is correct', async () => {
    const bcrypt = await import('bcryptjs')
    const realPassword = 'oldpassword123'
    const hashed = await bcrypt.hash(realPassword, 10)
    vi.mocked(userRepo.findById).mockResolvedValue({ ...mockUser, password: hashed })
    vi.mocked(userRepo.updatePassword).mockResolvedValue(undefined)

    await useCase.execute(1, realPassword, 'newpassword456')

    expect(userRepo.updatePassword).toHaveBeenCalledOnce()
    expect(userRepo.updatePassword).toHaveBeenCalledWith(1, expect.stringMatching(/^\$2b\$/))
  })
})
