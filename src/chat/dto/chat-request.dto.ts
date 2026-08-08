import { IsString, IsOptional, IsUUID, IsIn } from 'class-validator';
import { listPersonas } from 'src/prompt/personas';

const PERSONA_IDS = listPersonas().map((persona) => persona.id);

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
