import type { WebSocket } from './models/webSocket'; // Replace with the actual path to your custom type definitions
import uws from "./uws";

export default class Emitter {
    emit;
    publish;
    id: string;
    room!: string;

    constructor(ws: WebSocket, username: string) {
        this.emit = ws.send.bind(ws);
        this.publish = ws.publish.bind(ws);
        this.id = username;
    }


    /**
     * Send to local client only
     */
    send(type: string, message: Record<string, unknown>, isBinary = true, compress = true) {
        message = { type, ...message };
        const ok = this.emit(JSON.stringify(message), isBinary, compress);
        if (!ok) {
            console.error("problem sending client msg from " + this.room);
        }
    }
    /**
     * Send to all clients in the same session except local user
     */
    broadcast(type: string, message: Record<string, unknown>, isBinary = true, compress = true) {
        message = { type, clientId: this.id, ...message };
        this.publish(this.room, JSON.stringify(message), isBinary, compress);
    }
    /**
     * Send to all clients in room
     */
    roomEmit(type: string, message: Record<string, unknown>, isBinary = true, compress = true) {
        message = { type, clientId: this.id, ...message };
        uws.publish(this.room, JSON.stringify(message), isBinary, compress);
    }

    /**
     * Send to all in lobby
     */
    lobby(type: string, message: Record<string, unknown>, isBinary = true, compress = true) {
        message = { type, clientId: this.id, ...message };
        uws.publish('lobby', JSON.stringify(message), isBinary, compress);
    }
}
