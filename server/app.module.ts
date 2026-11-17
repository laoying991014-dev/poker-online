import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { AuthModule } from './modules/auth/auth.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { GamesModule } from './modules/games/games.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // 独立部署：使用 DATABASE_URL 连接 Supabase Postgres
    DatabaseModule,
    // ====== @route-section: business-modules START ======
    AuthModule,
    RoomsModule,
    GamesModule,
    AdminModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
