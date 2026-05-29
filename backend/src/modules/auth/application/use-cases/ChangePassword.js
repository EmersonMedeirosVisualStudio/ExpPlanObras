import bcrypt from 'bcryptjs';
import { UserNotFoundError, InvalidCredentialsError } from '../../domain/errors/AuthErrors.js';
export class ChangePasswordUseCase {
    userRepo;
    constructor(userRepo) {
        this.userRepo = userRepo;
    }
    async execute(userId, oldPassword, newPassword) {
        const user = await this.userRepo.findById(userId);
        if (!user)
            throw new UserNotFoundError();
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid)
            throw new InvalidCredentialsError();
        const hashed = await bcrypt.hash(newPassword, 10);
        await this.userRepo.updatePassword(userId, hashed);
    }
}
