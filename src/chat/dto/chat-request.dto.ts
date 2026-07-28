import { IsString, IsOptional, IsUUID } from 'class-validator'

export class ChatRequestDto {
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @IsString()
  message: string;
}