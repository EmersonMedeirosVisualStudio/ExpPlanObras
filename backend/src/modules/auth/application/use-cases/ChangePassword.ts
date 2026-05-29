import bcrypt from 'bcryptjs'
import type { IUserRepository } from '../../domain/ports/IUserRepository.js'
import { UserNotFoundError, InvalidCredentialsError } from '../../domain/errors/AuthErrors.js'

export class ChangePasswordUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new UserNotFoundError()

    const isValid = await bcrypt.compare(oldPassword, user.password)
    if (!isValid) throw new InvalidCredentialsError()

    const hashed = await bcrypt.hash(newPassword, 10)
    await this.userRepo.updatePassword(userId, hashed)
  }
}
