import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ISocketGateway, SOCKET_GATEWAY } from '../agents/orchestrator/ports/orchestrator-ports';
import {
  SubscribeMessage as SubscribeMsgPayload,
  UnsubscribeMessage as UnsubscribeMsgPayload,
  TicketStageEvent,
  TicketIterationEvent,
  TicketCostEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
} from './socket.events';

/**
 * WebSocket gateway for real-time ticket processing updates.
 * Implements ISocketGateway for orchestrator integration.
 * 
 * Event flow:
 * - Client connects and emits 'subscribe' with ticketId
 * - Server joins client socket to room: `ticket:${ticketId}`
 * - Orchestrator and other services call emitToTicket() to push updates
 * - All clients in the room receive the update
 * 
 * Rooms structure: `ticket:${ticketId}` for per-ticket isolation
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class SocketGateway
  implements ISocketGateway, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SocketGateway.name);

  afterInit(server: Server): void {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Client subscribes to updates for a specific ticket.
   * Joins the room: `ticket:${ticketId}`
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeMsgPayload,
  ): void {
    const { ticketId } = payload;
    const room = `ticket:${ticketId}`;
    client.join(room);
    this.logger.debug(
      `Client ${client.id} subscribed to ticket: ${ticketId}`,
    );
  }

  /**
   * Client unsubscribes from a ticket.
   * Leaves the room: `ticket:${ticketId}`
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UnsubscribeMsgPayload,
  ): void {
    const { ticketId } = payload;
    const room = `ticket:${ticketId}`;
    client.leave(room);
    this.logger.debug(
      `Client ${client.id} unsubscribed from ticket: ${ticketId}`,
    );
  }

  /**
   * Emit event to all clients subscribed to a specific ticket.
   * Called by orchestrator and service layers.
   */
  emitToTicket(ticketId: string, event: string, data: unknown): void {
    const room = `ticket:${ticketId}`;
    this.server.to(room).emit(event, data);
  }

  /**
   * Convenience methods for common events
   */

  emitStageChange(ticketId: string, event: TicketStageEvent): void {
    this.emitToTicket(ticketId, 'ticket.stage', event);
  }

  emitIteration(ticketId: string, event: TicketIterationEvent): void {
    this.emitToTicket(ticketId, 'ticket.iteration', event);
  }

  emitCostUpdate(ticketId: string, event: TicketCostEvent): void {
    this.emitToTicket(ticketId, 'ticket.cost', event);
  }

  emitCompleted(ticketId: string, event: TicketCompletedEvent): void {
    this.emitToTicket(ticketId, 'ticket.completed', event);
  }

  emitFailed(ticketId: string, event: TicketFailedEvent): void {
    this.emitToTicket(ticketId, 'ticket.failed', event);
  }
}
