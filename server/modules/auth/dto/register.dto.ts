import { IsAlphanumeric, IsString, Length } from 'class-validator';

import type { RegisterRequest } from '@shared/api.interface';

export class RegisterDto implements RegisterRequest {
  @IsString()
  @IsAlphanumeric()
  @Length(3, 20)
  username!: string;

  @IsString()
  @Length(6, 32)
  password!: string;

  @IsString()
  @Length(1, 20)
  nickname!: string;
}
