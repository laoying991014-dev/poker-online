import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SHA256 } from 'crypto-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DRIZZLE_DATABASE } from './database.constants';
import { pokerUsers } from './schema';
import { BOT_NICKNAME, BOT_USER_ID, BOT_USERNAME } from '../modules/games/bot';

/**
 * 启动时确保存在固定的电脑人账号。
 * 该账号不参与充值、不对外提供登录，仅用于快速匹配补位。
 */
@Injectable()
export class BotSeedService implements OnModuleInit {
  private readonly logger = new Logger(BotSeedService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.db
        .select({ id: pokerUsers.id })
        .from(pokerUsers)
        .where(eq(pokerUsers.username, BOT_USERNAME))
        .limit(1);

      if (existing.length > 0) {
        return;
      }

      const passwordHash = SHA256('poker-salt-bot').toString();
      await this.db.insert(pokerUsers).values({
        id: BOT_USER_ID,
        username: BOT_USERNAME,
        passwordHash,
        nickname: BOT_NICKNAME,
        coins: 0,
        isAdmin: false,
      });
      this.logger.log(`已创建电脑人账号 ${BOT_USERNAME}`);
    } catch (error) {
      this.logger.error(
        `电脑人账号初始化失败：${(error as Error).message}`,
      );
    }
  }
}
