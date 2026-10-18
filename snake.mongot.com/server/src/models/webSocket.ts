import type { WebSocket as uWebSocket } from "uWebSockets.js";
import type Client from "../client";
import type Emitter from "../emitter";

type WebSocketCustom = {
    user?: {
        username: string;
    };
    username: string;
    client: Client;
    emitter: Emitter;
};

export type WebSocket = uWebSocket<unknown> & WebSocketCustom;
