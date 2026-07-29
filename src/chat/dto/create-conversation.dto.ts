import { IsOptional, IsString, IsIn } from 'class-validator';

const PERSONA_IDS = [
  'technical-assistant',
  'code-tutor',
  'concise-editor',
] as const;

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @IsIn([...PERSONA_IDS])
  personaId?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
