import { Client, IMessage } from '@stomp/stompjs';
import { RoomEventMessage } from '@/entities/game';
import { tokenStorage } from '@/features/auth/token-storage';
import { refreshAccessToken } from '@/shared/api/http-client';

const ROOM_HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;

export type RoomSocket = {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (content: string, clientMessageId: string) => void;
  sendSkipVote: (questionId: number, questionNumber: number) => void;
  sendAudioLoadFailure: (questionId: number, questionNumber: number) => boolean;
};

export function createRoomSocket({
  roomId,
  onEvent,
  onError,
  onReconnect,
}: {
  roomId: number;
  onEvent: (event: RoomEventMessage) => void;
  onError: (message: string) => void;
  onReconnect: () => void;
}): RoomSocket {
  let disposed = false;
  let heartbeatIntervalId: number | null = null;
  const emitError = (message: string) => {
    if (!disposed) onError(message);
  };
  const stopRoomHeartbeat = () => {
    if (heartbeatIntervalId === null) return;
    window.clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  };
  const sendRoomHeartbeat = () => {
    if (!client.connected) return;
    client.publish({
      destination: `/app/rooms/${roomId}/heartbeat`,
      headers: authHeaders(),
    });
  };
  const startRoomHeartbeat = () => {
    stopRoomHeartbeat();
    sendRoomHeartbeat();
    heartbeatIntervalId = window.setInterval(sendRoomHeartbeat, ROOM_HEARTBEAT_INTERVAL_MS);
  };

  const client = new Client({
    brokerURL: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`,
    reconnectDelay: 2500,
    connectHeaders: authHeaders(),
    onConnect: () => {
      if (disposed) return;
      client.subscribe('/user/queue/errors', (message) => emitError(parseMessageCode(message)));
      client.subscribe(`/topic/rooms/${roomId}`, (message) => {
        if (!disposed) onEvent(JSON.parse(message.body) as RoomEventMessage);
      });
      startRoomHeartbeat();
      if (!disposed) onReconnect();
    },
    onStompError: (frame) => emitError(parseMessageBody(frame.body)),
    onWebSocketError: () => undefined,
    onWebSocketClose: stopRoomHeartbeat,
  });

  return {
    connect: () => {
      disposed = false;
      if (client.active) return;
      void ensureSocketAccessToken()
        .catch(() => null)
        .then(() => {
          if (disposed || client.active) return;
          client.connectHeaders = authHeaders();
          client.activate();
        });
    },
    disconnect: () => {
      disposed = true;
      stopRoomHeartbeat();
      void client.deactivate();
    },
    sendMessage: (content, clientMessageId) =>
      client.publish({
        destination: `/app/rooms/${roomId}/messages`,
        headers: authHeaders(),
        body: JSON.stringify({ content, clientMessageId }),
      }),
    sendSkipVote: (questionId, questionNumber) =>
      client.publish({
        destination: `/app/rooms/${roomId}/skip-votes`,
        headers: authHeaders(),
        body: JSON.stringify({ questionId, questionNumber }),
      }),
    sendAudioLoadFailure: (questionId, questionNumber) => {
      if (!client.connected) return false;
      client.publish({
        destination: `/app/rooms/${roomId}/audio-load-failures`,
        headers: authHeaders(),
        body: JSON.stringify({ questionId, questionNumber }),
      });
      return true;
    },
  };
}

function authHeaders() {
  const stored = tokenStorage.read();
  const headers: Record<string, string> = {};
  if (stored?.accessToken) headers.Authorization = `Bearer ${stored.accessToken}`;
  return headers;
}

async function ensureSocketAccessToken() {
  if (tokenStorage.read()?.accessToken) return;
  await refreshAccessToken();
}

function parseMessageCode(message: IMessage) {
  return parseMessageBody(message.body);
}

function parseMessageBody(bodyText: string) {
  try {
    const body = JSON.parse(bodyText) as { message?: string };
    return body.message ?? 'websocket_error';
  } catch {
    return bodyText || 'websocket_error';
  }
}
