import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateTicketDto } from './create-ticket.dto';

export class BatchCreateTicketsDto {
  @ApiProperty({ type: [CreateTicketDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketDto)
  items!: CreateTicketDto[];
}
