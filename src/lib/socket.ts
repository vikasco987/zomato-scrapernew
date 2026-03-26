import { Server } from "socket.io";
import { Server as HttpServer } from "http";

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
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket not initialized!");
  return io;
};

export const emitUpdate = (event: string, data: any) => {
  if (io) io.emit(event, data);
};
