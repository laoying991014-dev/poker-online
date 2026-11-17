import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('未提供有效的认证令牌');
    }

    const token = authHeader.slice(7);
    const userId = this.authService.verifyToken(token);

    if (!userId) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    // 挂载 userId 到 req.user
    (req as unknown as { user: string }).user = userId;
    return true;
  }
}
