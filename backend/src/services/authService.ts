import type { User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { AppError } from '../errors.js';
import { AuthUser, signToken } from '../auth/index.js';
import { UserRepository } from '../repositories/userRepository.js';

export interface AuthPayload {
  token: string;
  user: AuthUser;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwtSecret: string,
    private readonly jwtExpiresIn: string,
  ) {}

  async register(name: string, email: string, password: string, role: 'REPORTER' | 'AGENT'): Promise<AuthPayload> {
    const existing = await this.users.findByEmail(email);
    if (existing !== null) throw new AppError('EMAIL_TAKEN', 'A user with this email already exists');
    const passwordHash = await hash(password, 10);
    const user = await this.users.create({ name, email, passwordHash, role });
    return { token: this.tokenFor(user), user: toAuthUser(user) };
  }

  async login(email: string, password: string): Promise<AuthPayload> {
    const user = await this.users.findByEmail(email);
    if (user === null) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
    const ok = await compare(password, user.passwordHash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
    return { token: this.tokenFor(user), user: toAuthUser(user) };
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (user === null) throw new AppError('UNAUTHORIZED', 'Account no longer exists');
    return toAuthUser(user);
  }

  private tokenFor(user: Pick<User, 'id' | 'role'>): string {
    return signToken(user, this.jwtSecret, this.jwtExpiresIn);
  }
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
