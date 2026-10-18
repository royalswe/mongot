import type { WebSocket } from './models/webSocket';

import fs from 'fs';
import path from 'path';
import lobbyChat from './snakeChat.json';
import { sessions } from './game';
import Emitter from './emitter';
import { LOBBY_EVENT as EVENT } from './constants/events';
import { getLobbyRooms } from './helpers/utils';

const decoder = new TextDecoder('utf-8');
const lobbyChatPath = path.join(__dirname, 'snakeChat.json');

export default new (class Lobby {
  private onlineClients: Set<string> = new Set(); // Maintain a list of online clients by username

  public open(ws: WebSocket) {
    ws.username = ws.user?.username || 'guest-' + Math.random().toString(36).substring(2, 6);

    ws.emitter = new Emitter(ws, ws.username);
    ws.emitter.room = 'lobby';
    ws.subscribe('lobby'); // subscribe to the room name
    ws.emitter.send(EVENT.updateRooms, { msg: getLobbyRooms(sessions) });
    this.onlineClients.add(ws.username); // Add the client's username to the online clients list
    ws.emitter.roomEmit(EVENT.updateClients, { msg: [...this.onlineClients] }); // Send the online clients list to all clients

    fs.readFile(lobbyChatPath, (err, data) => {
      if (err) {
        console.error('load chat error:', err);
      }
      ws.emitter.send(EVENT.updateChat, { msg: data.toString() }); // Send the online clients list to all clients
    });
  }

  public listen(ws: WebSocket, message: BufferSource, isBinary: boolean) {
    const clientMsg: any = JSON.parse(decoder.decode(message));
    switch (clientMsg.type) {
      case EVENT.chat:
        // add datetime to message
        clientMsg.datetime = new Date().toLocaleString();
        ws.emitter.lobby(EVENT.chat, clientMsg, isBinary, true);

        const newMessage = JSON.stringify({
          sender: ws.username,
          message: clientMsg.msg,
          datetime: clientMsg.datetime
        });

        // store messages in json file
        (lobbyChat as string[]).push(newMessage);

        fs.writeFile(lobbyChatPath, JSON.stringify(lobbyChat), (err) => {
          if (err) {
            console.error('could not send message:', err);
          }
        });

        break;
      default:
        console.log('unknown emit from server', clientMsg);
        break;
    }
  }

  close(ws: WebSocket) {
    this.onlineClients.delete(ws.username); // Remove the client's username from the online clients list
    ws.emitter.roomEmit(EVENT.updateClients, { msg: [...this.onlineClients] });
  }

  // export function Lobby(ws: WebSocket, message: BufferSource, isBinary: boolean) {
  //   ws.subscribe('lobby'); // subscribe to the room name
  //   const clientMsg = JSON.parse(decoder.decode(message));
  //   ws.send(clientMsg, isBinary, true); // sender only
  // }

  // Lobby.prototype.clientsPlaying = function() {
  //   console.log('size', sessions.size);
  //   // ws.send(JSON.stringify({ type: 'clientsPlaying', msg: sessions }));
  // };
})();