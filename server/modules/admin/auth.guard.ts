import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SHA256, enc } from 'crypto-js';
import type { Request } from 'express';

const JWT_SECRET =
  process.env.JWT_SECRET || 'poker-secret-key-change-in-production';

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

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('未提供有效的认证令牌');
    }

    const token = authHeader.slice(7);
    const userId = verifyToken(token);

    if (!userId) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    // 挂载 userId 到 req.user
    (req as unknown as { user: string }).user = userId;
    return true;
  }
}

export function getUserIdFromRequest(req: Request): string {
  const userId = (req as unknown as { user: string }).user;
  if (!userId) {
    throw new BadRequestException('未获取到用户信息');
  }
  return userId;
}
