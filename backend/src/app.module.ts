import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AgentsModule } from './agents/agents.module';
import { QueueModule } from './queue/queue.module';
import { LoggerModule } from './common/logger';
import { MetricsModule } from './common/metrics';
import { HealthModule } from './health';
import { TicketModule } from './ticket/ticket.module';
import { SocketModule } from './socket/socket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // LoggerModule + MetricsModule are @Global() and must be imported
    // BEFORE any feature module that injects StructuredLogger or relies
    // on the LOG_REPOSITORY token.  AgentsModule + QueueModule both
    // consume LOG_REPOSITORY (optionally), so order matters.
    LoggerModule,
    MetricsModule,
    DatabaseModule,
    SocketModule,
    AgentsModule,
    QueueModule,
    TicketModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
