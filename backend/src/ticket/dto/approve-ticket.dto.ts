import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveTicketDto {
  @ApiProperty({
    description: 'User ID or name approving the ticket',
    example: 'admin@example.com',
  })
  @IsString()
  @IsNotEmpty()
  approvedBy!: string;

  @ApiProperty({
    required: false,
    description: 'Edited content if user made modifications',
  })
  @IsOptional()
  @IsString()
  editedContent?: string;
}
