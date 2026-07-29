import { IsString, IsOptional, IsUUID, IsIn } from 'class-validator';

const PERSONA_IDS = [
  'technical-assistant',
  'code-tutor',
  'concise-editor',
] as const;

export class ChatRequestDto {
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @IsString()
  message: string;

  /** Applied only when creating a new conversation (no conversationId). */
  @IsOptional()
  @IsString()
  @IsIn([...PERSONA_IDS])
  personaId?: string;

  /** Applied only when creating a new conversation (no conversationId). */
  @IsOptional()
  @IsString()
  systemPrompt?: string;
}
