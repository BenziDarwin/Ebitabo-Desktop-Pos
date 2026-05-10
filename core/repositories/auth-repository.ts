import type { AuthSession, LoginCredentials } from "@/core/entities";

export interface AuthRepository {
  authenticate(credentials: LoginCredentials): Promise<AuthSession | null>;
}
