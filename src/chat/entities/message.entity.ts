import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column()
  role: 'system' | 'user' | 'assistant';

  @Column('text')
  content: string;

  @Column({ name: 'prompt_tokens', type: 'int', nullable: true })
  promptTokens: number | null;

  @Column({ name: 'completion_tokens', type: 'int', nullable: true })
  completionTokens: number | null;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs: number | null;

  @Column({ name: 'tokens_estimated', type: 'boolean', nullable: true })
  tokensEstimated: boolean | null;

  @CreateDateColumn()
  createdAt: Date;
}
