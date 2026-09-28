import { type Socket, io } from 'socket.io-client';
import { API_URL, tokenStore } from '../api/client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_URL;

let socket: Socket | null = null;

/** One authenticated Socket.IO connection for the whole dashboard. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { auth: (cb) => cb({ token: tokenStore.get() }), transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
