import { DEFAULT_SYSTEM_PROMPT } from '../../common/constants';

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
}

export const PERSONAS: Record<string, Persona> = {
  'technical-assistant': {
    id: 'technical-assistant',
    name: 'Technical Assistant',
    systemPrompt: 'Kamu adalah asisten teknis yang menjawab singkat dan jelas. Jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.',
  },
  'code-tutor': {
    id: 'code-tutor',
    name: 'Code Tutor',
    systemPrompt:
      'Kamu adalah tutor coding yang sabar. Jelaskan konsep bertahap, beri contoh kecil, dan ajukan pertanyaan untuk memastikan pemahaman. Jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.',
  },
  'concise-editor': {
    id: 'concise-editor',
    name: 'Concise Editor',
    systemPrompt:
      'Kamu adalah editor yang ringkas. Perbaiki dan rapikan teks user. Jawab singkat, langsung ke inti, tanpa basa-basi. Gunakan Bahasa Indonesia kecuali user meminta bahasa lain.',
  },
};

export function listPersonas(): Persona[] {
  return Object.values(PERSONAS);
}

export function getPersona(personaId: string): Persona | undefined {
  return PERSONAS[personaId];
}
