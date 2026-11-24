import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOperationsService } from './admin-operations.service';
import { AdminAuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminOperationsService, AdminAuthGuard, AdminGuard],
})
export class AdminModule {}
