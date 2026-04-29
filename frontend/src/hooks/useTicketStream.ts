import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  TicketStageChangeEvent,
  TicketIterationEvent,
  TicketCostUpdateEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
} from '../types';

interface UseTicketStreamOptions {
  autoConnect?: boolean;
}

interface TicketStreamState {
  isConnected: boolean;
  stages: TicketStageChangeEvent[];
  iterations: TicketIterationEvent[];
  costs: TicketCostUpdateEvent[];
  completed?: TicketCompletedEvent;
  failed?: TicketFailedEvent;
  error?: string;
}

// Global socket instance
let globalSocket: Socket | null = null;

const getSocket = (): Socket => {
  if (!globalSocket) {
    globalSocket = io('/ws', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    globalSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }
  return globalSocket;
};

export const useTicketStream = (
  ticketId: string,
  options: UseTicketStreamOptions = {},
): TicketStreamState => {
  const { autoConnect = true } = options;
  const [state, setState] = useState<TicketStreamState>({
    isConnected: false,
    stages: [],
    iterations: [],
    costs: [],
  });

  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    const sock = getSocket();
    setSocket(sock);

    if (sock.connected) {
      sock.emit('subscribe', { ticketId });
    } else {
      sock.once('connect', () => {
        sock.emit('subscribe', { ticketId });
      });
    }

    const handleConnect = () => {
      setState((prev) => ({ ...prev, isConnected: true }));
      sock.emit('subscribe', { ticketId });
    };

    const handleDisconnect = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
    };

    const handleStageChange = (event: TicketStageChangeEvent) => {
      setState((prev) => ({
        ...prev,
        stages: [...prev.stages, event],
      }));
    };

    const handleIteration = (event: TicketIterationEvent) => {
      setState((prev) => ({
        ...prev,
        iterations: [...prev.iterations, event],
      }));
    };

    const handleCostUpdate = (event: TicketCostUpdateEvent) => {
      setState((prev) => ({
        ...prev,
        costs: [...prev.costs, event],
      }));
    };

    const handleCompleted = (event: TicketCompletedEvent) => {
      setState((prev) => ({
        ...prev,
        completed: event,
      }));
    };

    const handleFailed = (event: TicketFailedEvent) => {
      setState((prev) => ({
        ...prev,
        failed: event,
      }));
    };

    sock.on('connect', handleConnect);
    sock.on('disconnect', handleDisconnect);
    sock.on('ticket.stage', handleStageChange);
    sock.on('ticket.iteration', handleIteration);
    sock.on('ticket.cost', handleCostUpdate);
    sock.on('ticket.completed', handleCompleted);
    sock.on('ticket.failed', handleFailed);

    return () => {
      sock.off('connect', handleConnect);
      sock.off('disconnect', handleDisconnect);
      sock.off('ticket.stage', handleStageChange);
      sock.off('ticket.iteration', handleIteration);
      sock.off('ticket.cost', handleCostUpdate);
      sock.off('ticket.completed', handleCompleted);
      sock.off('ticket.failed', handleFailed);
      sock.emit('unsubscribe', { ticketId });
    };
  }, [ticketId, autoConnect]);

  return state;
};

// Disconnect helper for cleanup
export const disconnectTicketStream = () => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
};
