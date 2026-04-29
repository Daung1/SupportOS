import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { SOCKET_GATEWAY } from '../agents/orchestrator/ports/orchestrator-ports';

/**
 * WebSocket module for real-time ticket updates.
 * Exports SocketGateway for use by other modules via SOCKET_GATEWAY token.
 */
@Module({
  providers: [
    SocketGateway,
    {
      provide: SOCKET_GATEWAY,
      useExisting: SocketGateway,
    },
  ],
  exports: [SocketGateway, SOCKET_GATEWAY],
})
export class SocketModule {}
