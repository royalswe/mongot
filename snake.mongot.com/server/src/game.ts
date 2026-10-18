import type { UrlParams } from "./models/urlParams";
import type { WebSocket } from "./models/webSocket";
import { randomUUID } from "node:crypto";

import Client from "./client";
import Session from "./session";
import Emitter from "./emitter";
import { getLobbyRooms, isEveryPlayerReady } from "./helpers/utils";
import { VELOCITY, COLOR, FRAME_RATE } from "./constants/constants";
import { EVENT, LOBBY_EVENT } from "./constants/events";
import { GAME_STATUS, PLAYER_STATUS } from "./constants/status";
import highscoreStore from "./highscores";
import { getErrorMessage, reportError } from "./helpers/errorHandling";
import { isRankedMatch } from "./rating";

const decoder = new TextDecoder("utf-8");
export const sessions = new Map<string, Session>();

export default new (class Game {
  /**
   * Opens a WebSocket connection and performs the necessary setup.
   *
   * @param {WebSocket} ws - The WebSocket connection object.
   * @return {void}
   */
  public open(ws: WebSocket): void {
    const username =
      ws.user?.username ||
      "guest-" + Math.random().toString(36).substring(2, 6);

    ws.client = new Client(username, false, ws.user?.username || null);
    ws.emitter = new Emitter(ws, username);
    ws.emitter.send(EVENT.open, { msg: username });
    ws.emitter.broadcast(EVENT.chat, {
      message: username + " joined the room",
    });
  }

  public listen(
    ws: WebSocket,
    message: BufferSource,
    _isBinary: boolean,
  ): void {
    const client: Client = ws.client;
    const clientMsg: any = JSON.parse(decoder.decode(message));

    switch (clientMsg.type) {
      case EVENT.joinRoom: {
        const params = clientMsg.params;
        const roomName: string = params.room;

        if (!roomName) {
          throw Error("There is no room name");
        }

        ws.emitter.room = roomName;
        ws.subscribe(roomName); // subscribe to the room name

        const session = this.getSession(roomName) || this.createSession(params);
        if (session.join(client) === false) {
          throw Error("Could not join game session"); // Could not join game session
        }
        ws.emitter.send(EVENT.joinRoom, {
          width: session.width,
          height: session.height,
        });

        ws.emitter.roomEmit(EVENT.roomStatus, {
          clients: this.updateClientList(roomName),
        });

        // update rooms in lobby
        ws.emitter.lobby(LOBBY_EVENT.updateRooms, {
          msg: getLobbyRooms(sessions),
        });
        break;
      }

      case EVENT.joinGame: {
        const session: Session = client.session;
        if (!session) throw new Error("Join a room before claiming a seat");
        if (client.status === PLAYER_STATUS.ready) {
          throw new Error("A ready player cannot change seats");
        }

        if (
          session.status === GAME_STATUS.running ||
          session.status === GAME_STATUS.countDown
        ) {
          if (client.color) {
            throw new Error(
              "A seated player cannot change seats during a match",
            );
          }
          client.color = "";
          client.status = PLAYER_STATUS.spectating;
          ws.emitter.send(EVENT.joinGame, { playerStatus: client.status });
        } else {
          const color = clientMsg.color;
          if (!Object.prototype.hasOwnProperty.call(COLOR, color)) {
            throw new Error("Choose a valid seat");
          }
          if (
            [...session.clients].some(
              (other) => other !== client && other.color === color,
            )
          ) {
            throw new Error("That seat is already occupied");
          }

          client.color = color;
          client.setGamestate();
          client.status = PLAYER_STATUS.joined;
          ws.emitter.send(EVENT.joinGame, {
            playerStatus: PLAYER_STATUS.joined,
          });
        }

        ws.emitter.roomEmit(EVENT.roomStatus, {
          clients: this.updateClientList(client.session.room),
        });
        break;
      }

      case EVENT.addBot: {
        const session = this.getWaitingSession(client);
        const color = clientMsg.color;
        if (!Object.prototype.hasOwnProperty.call(COLOR, color)) {
          throw new Error("Choose a valid seat for the bot");
        }
        if ([...session.clients].some((other) => other.color === color)) {
          throw new Error("That seat is already occupied");
        }

        const bot = new Client(`bot-${randomUUID()}`, true);
        bot.color = color;
        session.join(bot);
        bot.setGamestate();
        bot.status = PLAYER_STATUS.ready;
        this.broadcastRoomStatus(session, ws);
        break;
      }

      case EVENT.removeBot: {
        const session = this.getWaitingSession(client);
        const bot = [...session.clients].find(
          (other) => other.isBot && other.color === clientMsg.color,
        );
        if (!bot) throw new Error("There is no bot in that seat");

        session.leave(bot);
        this.broadcastRoomStatus(session, ws);
        break;
      }

      case EVENT.leaveSeat: {
        const session = this.getWaitingSession(client);
        client.color = "";
        client.status = PLAYER_STATUS.spectating;
        ws.emitter.send(EVENT.joinGame, { playerStatus: client.status });
        this.broadcastRoomStatus(session, ws);
        break;
      }

      case EVENT.startBotMatch: {
        const session = client.session;
        if (!session)
          throw new Error("Join a room before starting a bot match");
        if (session.status !== GAME_STATUS.waiting) {
          throw new Error(
            "A bot match can only be started while the room is waiting",
          );
        }
        if ([...session.clients].some((other) => !other.isBot && other.color)) {
          throw new Error(
            "All human players must leave their seats before a bot-only match",
          );
        }
        if (
          [...session.clients].filter((other) => other.isBot && other.color)
            .length < 2
        ) {
          throw new Error("A bot-only match requires at least two bots");
        }

        this.startMatch(session, ws, true);
        break;
      }

      case EVENT.playerReady: {
        const session: Session = client.session;
        if (!session) {
          throw Error("can not be ready if not joined session");
        }

        if (
          session.status === GAME_STATUS.running ||
          client.status !== PLAYER_STATUS.joined
        ) {
          throw Error("game already started or you have not join the game"); // if game is already started or player clicked ready when not joined
        }

        client.status = PLAYER_STATUS.ready;
        ws.emitter.send(EVENT.playerReady, { playerStatus: client.status });
        ws.emitter.roomEmit(EVENT.roomStatus, {
          clients: this.updateClientList(client.session.room),
        });

        if (isEveryPlayerReady(session.clients)) {
          this.startMatch(session, ws);
        }
        // update rooms in lobby
        ws.emitter.lobby(LOBBY_EVENT.updateRooms, {
          msg: getLobbyRooms(sessions),
        });
        break;
      }
      case EVENT.movement: {
        const velocity = VELOCITY[clientMsg.key];
        if (velocity) client.session?.queueDirection(client, velocity);
        break;
      }

      case EVENT.chat: {
        clientMsg.datetime = new Date().toLocaleString();
        ws.emitter.roomEmit(EVENT.chat, clientMsg);
        break;
      }
    }
  }

  private createSession(params: UrlParams): Session {
    this.validateUrlParameters(params);

    const { room } = params;
    if (!room) throw Error(`Room don't have any name`);

    if (sessions.has(room)) {
      throw Error(`room ${room} already exists`);
    }

    const session = new Session(params);
    sessions.set(room, session);

    return session;
  }

  private requireSeatedHuman(
    client: Client,
  ): asserts client is Client & { session: Session } {
    if (!client.session || client.isBot || !client.color) {
      throw new Error(
        "Only a seated human player can manage bots or leave a seat",
      );
    }
  }

  private getWaitingSession(client: Client) {
    this.requireSeatedHuman(client);
    if (client.session.status !== GAME_STATUS.waiting) {
      throw new Error(
        "Bots and seats can only be changed while the room is waiting",
      );
    }
    return client.session;
  }

  private broadcastRoomStatus(session: Session, ws: WebSocket) {
    ws.emitter.roomEmit(EVENT.roomStatus, {
      clients: this.updateClientList(session.room),
    });
    ws.emitter.lobby(LOBBY_EVENT.updateRooms, { msg: getLobbyRooms(sessions) });
  }

  private startMatch(session: Session, ws: WebSocket, botOnlyRun = false) {
    session.botOnlyRun = botOnlyRun;
    session.status = GAME_STATUS.countDown;
    ws.emitter.roomEmit(EVENT.gameStatus, {
      gameStatus: GAME_STATUS.countDown,
    });
    session
      .countDown()
      .then((gameStatus): void => {
        session.playingClients = [...session.clients].filter(
          (client) => client.status === PLAYER_STATUS.ready,
        );
        session.matchParticipants = [...session.playingClients];
        session.matchPlacements.clear();
        session.matchWinner = null;
        session.matchDraw = false;

        ws.emitter.roomEmit(EVENT.gameStatus, { gameStatus });
        ws.emitter.lobby(LOBBY_EVENT.updateRooms, {
          msg: getLobbyRooms(sessions),
        });

        const cancelTimer = session.gameInterval(() => {
          const tick = session.tick();
          if (!tick.moved) return;

          if (tick.outcome) {
            this.finishGame(session, ws, tick.outcome);
          } else {
            ws.emitter.roomEmit(EVENT.gameState, {
              data: session.playingClients.map((player) => player.gameState),
            });
          }
        }, 1000 / FRAME_RATE);
        session.stopGameLoop = cancelTimer;
      })
      .catch((error: Error) => {
        if (error.message === "Countdown cancelled") return;
        session.botOnlyRun = false;
        session.status = GAME_STATUS.waiting;
        ws.emitter.roomEmit(EVENT.gameStatus, {
          gameStatus: GAME_STATUS.waiting,
        });
        ws.emitter.lobby(LOBBY_EVENT.updateRooms, {
          msg: getLobbyRooms(sessions),
        });
        console.error(error);
      });
  }

  updateClientList(room: string) {
    const session = this.getSession(room);
    if (!session) {
      return null;
    }
    return [...session.clients].map((client) => ({
      clientId: client.id,
      displayName: client.displayName,
      clientStatus: client.status,
      color: client.color,
      isBot: client.isBot,
      isRegistered: Boolean(client.accountUsername),
    }));
  }

  getSession(roomName: string) {
    const session = sessions.get(roomName);
    if (!session) {
      return false;
    }
    return session;
  }

  validateUrlParameters(params: UrlParams): void {
    const { room, width, height } = params;
    if (!room || !width || !height) {
      throw Error('Parameters "room and board" must be set');
    }
    if (!Number.isInteger(width) && !Number.isInteger(height)) {
      if (width < 10 && height < 10) {
        throw Error("Board parameter must be at least 10:10");
      }
      throw Error("Board parameter must be a integer");
    }
  }

  private finishGame(session: Session, ws: WebSocket, outcome: string) {
    session.stopGameLoop?.();
    session.stopGameLoop = null;
    const finalState = session.playingClients.map((player) => ({
      ...player.gameState,
      pos: { ...player.gameState.pos },
      vel: { ...player.gameState.vel },
      directionQueue: player.gameState.directionQueue.map((direction) => ({
        ...direction,
      })),
      snake: player.gameState.snake.map((segment) => ({ ...segment })),
      grid: { ...player.gameState.grid },
    }));
    ws.emitter.roomEmit(EVENT.gameState, { data: finalState });
    session.status = GAME_STATUS.waiting;
    session.botOnlyRun = false;
    session.resetPlayers();
    const results = session.matchParticipants
      .filter((player) => player.accountUsername && !player.isBot)
      .map((player) => ({
        username: player.accountUsername!,
        won: player === session.matchWinner,
        place:
          session.matchPlacements.get(player) ??
          (player === session.matchWinner ? 1 : session.matchPlacements.size + 1)
      }));
    const rated = isRankedMatch(session.matchParticipants);
    if (results.length) {
      void highscoreStore
        .recordMatch(results, {
          rated,
          recordStats: !session.matchDraw
        })
        .then(() => {
          ws.emitter.roomEmit(EVENT.ratingsUpdated, {});
          ws.emitter.lobby(LOBBY_EVENT.ratingsUpdated, {});
        })
        .catch((error: unknown) => {
          reportError({
            message: `Could not save high scores: ${getErrorMessage(error)}`
          });
        });
    }
    session.matchParticipants = [];
    session.matchPlacements.clear();
    session.matchWinner = null;
    session.matchDraw = false;
    ws.emitter.roomEmit(EVENT.gameOver, {
      winner: outcome,
      clients: this.updateClientList(session.room),
    });
    ws.emitter.lobby(LOBBY_EVENT.updateRooms, { msg: getLobbyRooms(sessions) });
    session.playingClients.forEach((player) => player.setGamestate());
  }

  close(ws: WebSocket) {
    const session = ws.client?.session;
    if (!session) {
      return console.log(
        "client can not be closed because it is not in a session",
      );
    }

    const wasPlaying = session.playingClients?.some(
      (player) => player === ws.client && player.status === PLAYER_STATUS.ready,
    );
    const wasCountingDown = session.status === GAME_STATUS.countDown;
    const wasBotOnlyRun = session.botOnlyRun;
    session.leave(ws.client);
    if (wasPlaying && session.status === GAME_STATUS.running) {
      session.recordEliminations([ws.client]);
    }
    const cancelledCountdown =
      wasCountingDown && !wasBotOnlyRun && !isEveryPlayerReady(session.clients);
    if (cancelledCountdown) {
      session.cancelCountdown();
      session.status = GAME_STATUS.waiting;
      for (const client of session.clients) {
        if (client.status === PLAYER_STATUS.ready) {
          client.status = PLAYER_STATUS.joined;
        }
      }
      ws.emitter.roomEmit(EVENT.gameStatus, {
        gameStatus: GAME_STATUS.waiting,
      });
      ws.emitter.roomEmit(EVENT.roomStatus, {
        clients: this.updateClientList(session.room),
      });
    }

    if (session.clients.size === 0) {
      session.stopGameLoop?.();
      sessions.delete(session.room);
    } else {
      if (
        !cancelledCountdown &&
        wasPlaying &&
        session.status === GAME_STATUS.running
      ) {
        const remainingPlayers = session.playingClients.filter(
          (player) => player.status === PLAYER_STATUS.ready,
        );
        if (remainingPlayers.length <= 1) {
          session.matchWinner = remainingPlayers[0] ?? null;
          const outcome = remainingPlayers.length
            ? "The winner is " + remainingPlayers[0].color
            : "Game over";
          this.finishGame(session, ws, outcome);
        } else {
          ws.emitter.roomEmit(EVENT.roomStatus, {
            clients: this.updateClientList(session.room),
          });
        }
      } else if (!cancelledCountdown) {
        ws.emitter.roomEmit(EVENT.roomStatus, {
          clients: this.updateClientList(session.room),
        });
      }
    }

    // update lobby rooms
    ws.emitter.lobby(LOBBY_EVENT.updateRooms, { msg: getLobbyRooms(sessions) });
  }
})();
