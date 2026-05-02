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
 * Response for quick answer - either found answer or needs ticket
 */
export interface QuickAnswerResponse {
  success: boolean;
  level: 0 | 1 | 2; // 0 = no answer (needs ticket), 1 = FAQ match, 2 = Filter match
  source: string; // 'FAQMatcher' | 'SimpleFilter' | 'NeedsPending'
  answer?: string;
  category?: string;
  confidence?: number;
  requiresTicket: boolean; // true if level === 0
  message?: string; // User-friendly message when requiresTicket
}
