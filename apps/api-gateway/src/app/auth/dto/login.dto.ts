import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
