import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({
    summary: 'List demo users (optionally filtered by role)',
    description:
      'Lightweight directory used by the frontend identity switcher. Not auth-protected.',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['user', 'supporter'],
  })
  @ApiOkResponse({ description: 'User list' })
  list(@Query('role') role?: string) {
    return this.userService.list(role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user by id' })
  @ApiNotFoundResponse()
  getOne(@Param('id') id: string) {
    return this.userService.getById(id);
  }
}
