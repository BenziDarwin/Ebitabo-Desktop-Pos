import type { AuthSession, LoginCredentials } from "@/core/entities";
import type { AuthRepository } from "@/core/repositories";

export class AuthenticateUserUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  execute(credentials: LoginCredentials): Promise<AuthSession | null> {
    return this.authRepository.authenticate(credentials);
  }
}
