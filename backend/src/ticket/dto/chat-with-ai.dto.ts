import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChatWithAiDto {
  @ApiProperty({
    description: 'User message to refine AI-generated content',
    example: 'Make it shorter and more technical',
  })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
