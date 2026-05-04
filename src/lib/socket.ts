import { Server } from "socket.io";
import { Server as HttpServer } from "http";

import { zomatoEvents } from "./zomato-events.js";

let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("🔌 CLIENT_LINKED: New dashboard session active.");
    
    socket.on("zomato:phone_provided", (data) => {
        zomatoEvents.emit("phone_received", data.phone);
    });

    socket.on("zomato:otp_provided", (data) => {
        zomatoEvents.emit("otp_provided", data.otp);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket not initialized!");
  return io;
};

export const emitUpdate = (event: string, data: any) => {
  if (io) {
    io.emit(event, data);
    if(event !== 'sync:item') {
    const msg = data.message || data.name || data.id || 'N/A';
    console.log(`📡 [SOCKET] EMITTED: ${event} -> ${msg}`);
    }
  }
};
