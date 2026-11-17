import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SHA256, enc } from 'crypto-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';

import type { UserInfo, AuthResponse } from '@shared/api.interface';
import { pokerUsers } from '../../database/schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const JWT_SECRET =
  process.env.JWT_SECRET || 'poker-secret-key-change-in-production';
const JWT_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hashPassword(password: string): string {
  // 使用 SHA256 加盐哈希（salt 与密码拼接后 SHA256）
  // 由于项目里没有 bcrypt，用 crypto-js 的 SHA256 + 固定盐方案
  const salt = 'poker-salt';
  return SHA256(salt + password).toString();
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function generateToken(userId: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const payload = {
    sub: userId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + JWT_EXPIRES_IN_MS) / 1000),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = SHA256(encodedHeader + '.' + encodedPayload + '.' + JWT_SECRET)
    .toString(enc.Base64)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = SHA256(
      encodedHeader + '.' + encodedPayload + '.' + JWT_SECRET,
    )
      .toString(enc.Base64)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(atob(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload.sub as string;
  } catch {
    return null;
  }
}

function mapToUserInfo(row: {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  coins: number;
  isAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserInfo {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    coins: row.coins,
    isAdmin: row.isAdmin,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.db
      .select({ id: pokerUsers.id })
      .from(pokerUsers)
      .where(eq(pokerUsers.username, dto.username))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = hashPassword(dto.password);

    const result = await this.db
      .insert(pokerUsers)
      .values({
        username: dto.username,
        passwordHash,
        nickname: dto.nickname,
        coins: 0,
        isAdmin: false,
      })
      .returning({
        id: pokerUsers.id,
        username: pokerUsers.username,
        nickname: pokerUsers.nickname,
        avatarUrl: pokerUsers.avatarUrl,
        coins: pokerUsers.coins,
        isAdmin: pokerUsers.isAdmin,
        lastLoginAt: pokerUsers.lastLoginAt,
        createdAt: pokerUsers.createdAt,
      });

    const user = mapToUserInfo(result[0]);
    const token = generateToken(user.id);

    return { token, user };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const result = await this.db
      .select({
        id: pokerUsers.id,
        username: pokerUsers.username,
        passwordHash: pokerUsers.passwordHash,
        nickname: pokerUsers.nickname,
        avatarUrl: pokerUsers.avatarUrl,
        coins: pokerUsers.coins,
        isAdmin: pokerUsers.isAdmin,
        lastLoginAt: pokerUsers.lastLoginAt,
        createdAt: pokerUsers.createdAt,
      })
      .from(pokerUsers)
      .where(eq(pokerUsers.username, dto.username))
      .limit(1);

    if (result.length === 0) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const userRow = result[0];
    if (!verifyPassword(dto.password, userRow.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 更新 last_login_at
    const updated = await this.db
      .update(pokerUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(pokerUsers.id, userRow.id))
      .returning({
        id: pokerUsers.id,
        username: pokerUsers.username,
        nickname: pokerUsers.nickname,
        avatarUrl: pokerUsers.avatarUrl,
        coins: pokerUsers.coins,
        isAdmin: pokerUsers.isAdmin,
        lastLoginAt: pokerUsers.lastLoginAt,
        createdAt: pokerUsers.createdAt,
      });

    const user = mapToUserInfo(updated[0]);
    const token = generateToken(user.id);

    return { token, user };
  }

  async getMe(userId: string): Promise<UserInfo> {
    const result = await this.db
      .select({
        id: pokerUsers.id,
        username: pokerUsers.username,
        nickname: pokerUsers.nickname,
        avatarUrl: pokerUsers.avatarUrl,
        coins: pokerUsers.coins,
        isAdmin: pokerUsers.isAdmin,
        lastLoginAt: pokerUsers.lastLoginAt,
        createdAt: pokerUsers.createdAt,
      })
      .from(pokerUsers)
      .where(eq(pokerUsers.id, userId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    return mapToUserInfo(result[0]);
  }

  verifyToken(token: string): string | null {
    return verifyToken(token);
  }
}
