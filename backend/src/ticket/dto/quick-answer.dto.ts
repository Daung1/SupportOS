import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request for quick answer (L1/L2 only) - no deep analysis
 */
export class QuickAnswerDto {
  @ApiProperty({
    description: 'The user question to match against FAQ/rules',
  })
  @IsString()
  question!: string;

  @ApiProperty({
    description: 'Optional userId for session context',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * Response for quick answer.
 *
 * Three terminal states the frontend renders differently:
 *   - matched (level=1):  show `answer` as the FAQ reply.
 *   - outOfDomain=true:   show `answer` as a friendly OOD message,
 *                         do NOT offer ticket creation.
 *   - requiresTicket=true: in-domain but no quick answer; offer
 *                         "Generate as Ticket" CTA.
 *
 * level meaning: 0 = no answer / OOD / requiresTicket, 1 = FAQ match.
 * (Legacy level 2 SimpleFilter has been retired.)
 */
export interface QuickAnswerResponse {
  success: boolean;
  level: 0 | 1;
  source: string; // 'FAQMatcher' | 'Triage' | 'Error'
  answer?: string;
  category?: string;
  confidence?: number;
  requiresTicket: boolean;
  outOfDomain: boolean;
  /** L0 triage intent, null when triage was skipped (error path). */
  intent: string | null;
  /** L0 reformulated query (rewrite of the raw input). */
  reformulated: string | null;
  message?: string;
  error?: string;
}
