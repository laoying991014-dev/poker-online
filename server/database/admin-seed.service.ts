import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SHA256 } from 'crypto-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DRIZZLE_DATABASE } from './database.constants';
import { pokerUsers } from './schema';

/**
 * 启动时确保存在一个管理员账号，方便在新数据库上直接进入后台充值。
 * 账号密码通过环境变量 ADMIN_USERNAME / ADMIN_PASSWORD 配置。
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const initialCoins = Number(process.env.ADMIN_INITIAL_COINS || '0');

    try {
      const existing = await this.db
        .select({ id: pokerUsers.id, isAdmin: pokerUsers.isAdmin })
        .from(pokerUsers)
        .where(eq(pokerUsers.username, username))
        .limit(1);

      if (existing.length > 0) {
        if (!existing[0].isAdmin) {
          await this.db
            .update(pokerUsers)
            .set({ isAdmin: true })
            .where(eq(pokerUsers.id, existing[0].id));
          this.logger.log(`已将账号 ${username} 设为管理员`);
        }
        return;
      }

      const passwordHash = SHA256('poker-salt' + password).toString();
      await this.db.insert(pokerUsers).values({
        username,
        passwordHash,
        nickname: '管理员',
        coins: initialCoins,
        isAdmin: true,
      });
      this.logger.log(`已创建管理员账号 ${username}`);
    } catch (error) {
      // 表还没建好时不要阻断启动，但要在日志里明确提示
      this.logger.error(
        `管理员账号初始化失败，请确认已执行 supabase/schema.sql：${(error as Error).message}`,
      );
    }
  }
}
