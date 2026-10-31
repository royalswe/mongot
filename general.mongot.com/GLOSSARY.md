# Game

The game is a multiplayer territory strategy game played on maps grouped into continents.

## Language

**Territory**:
A playable region with neighboring regions, optionally grouped into a continent. On the World map, territory borders are abstract gameplay divisions within geographic silhouettes, not precise political boundaries.
_Avoid_: Country (when referring to a playable region)

**Game-room sound preference**:
A player's choice to hear or silence the game's sound effects.

**Game room**:
A shared table where players and spectators gather; it can be open, waiting for players, hosting a match, or awaiting a rematch.

**Seat**:
A player's place in a game room, associated with a color. A player who loses connection can reclaim it for as long as the match runs (a bot or sitting out covers the gap); giving up forfeits it for good.

**Stand-in bot**:
A bot that takes over a seat whose player gave up or stayed away past the reconnect window, playing at that player's rating. Its result is unrated; the player it replaced always takes a loss.

**Fast-forward**:
How a match with no players or spectators left in the room is finished: the bots play on without pacing delays, then the room is removed. It stops as soon as anyone joins the room.
