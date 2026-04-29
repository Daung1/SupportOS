import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
