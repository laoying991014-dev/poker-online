import { Controller, Get } from '@nestjs/common';
import { AdminOperationsService } from './admin-operations.service';

@Controller('api/clubs')
export class PublicClubsController {
  constructor(private readonly operations: AdminOperationsService) {}

  @Get()
  listPublicClubs() {
    return this.operations.listPublicClubs();
  }
}
