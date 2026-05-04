import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({
    description: 'User question or support request body',
    example: 'How do I reset my password?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;

  @ApiProperty({
    required: false,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    description: 'Routing priority hint',
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    description:
      'Identity of the submitting user (lightweight, no auth). Unknown ids are silently dropped.',
    example: 'user-alice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({
    description:
      'When true, the cascade skips L1 FAQ matching and runs the full multi-agent pipeline. Set by the chat UI after the user has already seen the quick FAQ answer and explicitly clicked "Generate as Ticket" to escalate; without this flag the cascade would re-run L1 and hand back the same FAQ the user already declined.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceDeepAnalysis?: boolean;
}
