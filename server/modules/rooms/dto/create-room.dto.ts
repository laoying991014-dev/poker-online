import { Type } from 'class-transformer';
import {
  IsString,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  smallBlind!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bigBlind!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minBuyin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBuyin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(9)
  maxPlayers!: number;

  @IsBoolean()
  isPrivate!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyinAmount!: number;
}
