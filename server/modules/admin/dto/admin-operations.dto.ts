import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClubDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsIn(['none', 'daily', 'once']) scheduleType?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) dailyStartTime?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) smallBlind?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) bigBlind?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minBuyin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxBuyin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(9) maxPlayers?: number;
  @IsOptional() autoStart?: boolean;
}
export class UpdateClubDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['active', 'disabled']) status?: string;
  @IsOptional() @IsIn(['none', 'daily', 'once']) scheduleType?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) dailyStartTime?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) smallBlind?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) bigBlind?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minBuyin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxBuyin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(9) maxPlayers?: number;
  @IsOptional() autoStart?: boolean;
}
export class CreateTournamentDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) entryFee?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) prizePool?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(10000) maxPlayers?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsIn(['draft', 'scheduled']) status?: string;
}
export class UpdateTournamentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsIn(['draft', 'scheduled', 'running', 'finished', 'cancelled']) status?: string;
}
export class UpdateComplianceRequestDto {
  @IsIn(['pending', 'approved', 'rejected', 'closed']) status!: string;
  @IsOptional() @IsString() adminNote?: string;
}
