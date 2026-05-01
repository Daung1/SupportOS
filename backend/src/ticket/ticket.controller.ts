import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TicketService } from './ticket.service';
import {
  ApproveTicketDto,
  AssignTicketDto,
  BatchCreateTicketsDto,
  ChatWithAiDto,
  CreateTicketDto,
  ListTicketsQueryDto,
  RejectTicketDto,
} from './dto';
import { Ticket } from '@prisma/client';

@ApiTags('Tickets')
@Controller('api/tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a ticket',
    description:
      'Stores the ticket and enqueues async processing. Returns immediately with the created row.',
  })
  @ApiCreatedResponse({ description: 'Ticket accepted for processing' })
  create(@Body() dto: CreateTicketDto): Promise<Ticket> {
    return this.ticketService.create(dto);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit multiple tickets' })
  @ApiCreatedResponse({
    description: 'All tickets persisted and queued',
  })
  createBatch(@Body() dto: BatchCreateTicketsDto): Promise<Ticket[]> {
    return this.ticketService.createBatch(dto.items);
  }

  @Get()
  @ApiOperation({
    summary:
      'List tickets (paginated, optional status / userId / assigneeId filter)',
  })
  @ApiOkResponse({ description: 'Paginated ticket list with meta envelope' })
  list(@Query() query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.ticketService.list(
      page,
      limit,
      query.status,
      query.userId,
      query.assigneeId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ticket with logs and token usage',
  })
  @ApiNotFoundResponse()
  findOne(@Param('id') id: string) {
    return this.ticketService.getOneAggregated(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get audit logs for a ticket' })
  @ApiNotFoundResponse()
  getLogs(@Param('id') id: string) {
    return this.ticketService.getLogs(id);
  }

  @Get(':id/token-usage')
  @ApiOperation({ summary: 'Get stored token usage rows for a ticket' })
  @ApiNotFoundResponse()
  getTokenUsage(@Param('id') id: string) {
    return this.ticketService.getTokenUsage(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark ticket as approved by human reviewer',
  })
  @ApiOkResponse({ description: 'Ticket approved successfully' })
  @ApiNotFoundResponse()
  approve(@Param('id') id: string, @Body() dto: ApproveTicketDto) {
    return this.ticketService.approve(id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark ticket as rejected by human reviewer',
  })
  @ApiOkResponse({ description: 'Ticket rejected successfully' })
  @ApiNotFoundResponse()
  reject(@Param('id') id: string, @Body() dto: RejectTicketDto) {
    return this.ticketService.reject(id, dto);
  }

  @Post(':id/chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chat with AI to refine generated suggestion',
  })
  @ApiOkResponse({ description: 'AI refinement completed' })
  @ApiNotFoundResponse()
  chatWithAi(@Param('id') id: string, @Body() dto: ChatWithAiDto) {
    return this.ticketService.chatWithAi(id, dto.message);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign ticket to a supporter (or pass empty to unassign)',
  })
  @ApiOkResponse({ description: 'Ticket assignment updated' })
  @ApiNotFoundResponse()
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.ticketService.assign(id, dto.assigneeId ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ticket and its dependent rows' })
  @ApiNoContentResponse({ description: 'Ticket deleted' })
  @ApiNotFoundResponse()
  async remove(@Param('id') id: string): Promise<void> {
    await this.ticketService.remove(id);
  }
}
