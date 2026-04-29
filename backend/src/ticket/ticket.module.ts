import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { SocketModule } from '../socket/socket.module';
import { TicketController } from './ticket.controller';
import { TicketRepository } from './ticket.repository';
import { TicketService } from './ticket.service';

@Module({
  imports: [DatabaseModule, QueueModule, SocketModule],
  controllers: [TicketController],
  providers: [TicketRepository, TicketService],
  exports: [TicketService, TicketRepository],
})
export class TicketModule {}
