import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({
    description:
      'Supporter user id to assign this ticket to. Pass null/empty to unassign.',
    example: 'supporter-charlie',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string | null;
}
