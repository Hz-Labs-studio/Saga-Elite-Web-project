import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/api";

let socketInstance = null;

const getSocketUrl = () => SOCKET_URL;

export const connectSocket = () => {
  if (socketInstance) {
    if (!socketInstance.connected) {
      socketInstance.connect();
    }
    return socketInstance;
  }

  const url = getSocketUrl();
  if (!url) {
    // In serverless production without an external WebSocket server configured,
    // return null gracefully without throwing errors.
    return null;
  }

  try {
    socketInstance = io(url, {
      autoConnect: true,
      withCredentials: true,
      // Allow polling fallback when pure WebSocket upgrades are unavailable (e.g. serverless)
      transports: ["polling", "websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    // Gracefully handle connect errors without breaking UI execution
    socketInstance.on("connect_error", (error) => {
      // In production/serverless, WebSockets may not be provisioned; log as debug
      if (import.meta.env.DEV) {
        console.debug("[Socket] Connection notice:", error?.message || error);
      }
    });

    return socketInstance;
  } catch (error) {
    console.debug("[Socket] Init notice:", error?.message || error);
    return null;
  }
};

export const getSocket = () => socketInstance;

export const registerSocketUser = (user) => {
  const socket = connectSocket();
  if (!socket) return null;

  if (user?._id) {
    socket.emit("client:register", {
      userId: user._id,
      role: user.role,
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (!socketInstance) {
    return;
  }

  socketInstance.removeAllListeners();
  socketInstance.disconnect();
  socketInstance = null;
};
