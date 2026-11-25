import { Type } from 'class-transformer';
import {
  IsString,
  IsIn,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsBoolean,
} from 'class-validator';

const ACTIONS = ['fold', 'check', 'call', 'raise', 'allin'] as const;
type ActionType = (typeof ACTIONS)[number];

export class PlayerActionDto {
  @IsUUID()
  gameId!: string;

  @IsString()
  @Type(() => String)
  @IsIn(ACTIONS)
  action!: ActionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;
}

export class MyRecordsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ShowFoldedCardsDto {
  @IsBoolean()
  show!: boolean;
}
