# Snake Game

Language for the multiplayer Snake game: who participates in a room, how a match advances, and how it ends.

## Room and participants

**Room**:
A shared game space in which clients can chat, watch, and play a match.
_Avoid_: Lobby (the lobby is where rooms are discovered)

**Player**:
A human or bot participant occupying one of a room's four active seats.
_Avoid_: Client (a connected client may be a spectator)

**Bot**:
A server-controlled player that balances surviving with attempts to eliminate opponents.
_Avoid_: Spectator

**Seat**:
One of the four unique player positions available in a room.
_Avoid_: Slot

**Spectator**:
A connected human room participant who watches but does not occupy a player seat.
_Avoid_: Player

**Ready**:
A human player's declaration that they are prepared to begin the next match; bots are ready automatically.
_Avoid_: Joined

**Bot-only match**:
A match explicitly started with at least two bots seated and no human occupying a seat.
_Avoid_: Automatic rematch

## Match and movement

**Match**:
A room's play period, from its start countdown until a win, draw, or solo game-over outcome.
_Avoid_: Game (ambiguous between the full product and one play period)

**Simulation tick**:
A server update at 30 ticks per second that advances match simulation.
_Avoid_: Movement step

**Movement step**:
One grid-cell advance by a snake; each snake moves three steps per second.
_Avoid_: Tick

**Continuous growth**:
A snake gains one segment after each movement step, without requiring a collectible.
_Avoid_: Food growth

**Forfeit**:
A player's elimination from the current match after disconnecting; reconnecting does not restore the previous participation.
_Avoid_: Resume

**Winner**:
The sole player remaining in a multiplayer match.
_Avoid_: Last snake

**Draw**:
A multiplayer match outcome in which all remaining players are eliminated during the same simulation tick.
_Avoid_: Tie (may also describe a score)

**Solo game over**:
The end of a one-player run when its player is eliminated.
_Avoid_: Draw
