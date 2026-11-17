import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import type { Request } from 'express';

import { pokerUsers } from '../../database/schema';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = (req as unknown as { user: string }).user;

    if (!userId) {
      throw new ForbiddenException('未登录');
    }

    const result = await this.db
      .select({ isAdmin: pokerUsers.isAdmin })
      .from(pokerUsers)
      .where(eq(pokerUsers.id, userId))
      .limit(1);

    if (result.length === 0 || !result[0].isAdmin) {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }
}
