import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectTicketDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Response does not match support guidelines',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
