import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DRIZZLE_DATABASE } from './database.constants';
import { AdminSeedService } from './admin-seed.service';
import { BotSeedService } from './bot-seed.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: (): PostgresJsDatabase => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error('缺少 DATABASE_URL 环境变量，无法连接数据库');
        }

        // 本地数据库通常不带 SSL；Supabase 等云数据库必须启用 SSL。
        const isLocal = /localhost|127\.0\.0\.1/.test(url);
        const client = postgres(url, {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 15,
          // Supabase 连接池（PgBouncer）不支持 prepared statements
          prepare: false,
          ssl: isLocal ? false : 'require',
        });

        return drizzle(client);
      },
    },
    AdminSeedService,
    BotSeedService,
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
