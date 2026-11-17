import { Type } from 'class-transformer';
import { IsString, IsInt, Min } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  roomCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyinAmount!: number;
}
