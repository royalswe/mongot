# Blockwars

A multiplayer Tetris game where up to five Players compete in a Room and send Specials to each other until one is left standing.

## Language

**Room**:
A named place in the Lobby where Players and Spectators meet and play consecutive Games. Either ranked or unranked.
_Avoid_: Session (code name only), table, lobby room

**Game**:
One match inside a Room, from the moment every seated Player is Ready until a winner is decided.
_Avoid_: Round, match

**Seat**:
One of the five playing positions in a Room. Taking a Seat makes someone a Player.
_Avoid_: Slot, spot

**Player**:
Someone who holds a Seat in a Room.
_Avoid_: Client, user (in the UI)

**Spectator**:
Someone in a Room without a Seat. Watches the Arenas but does not play.
_Avoid_: Viewer, observer

**Arena**:
One Player's playfield.
_Avoid_: Board, field, grid (the bot's internal word)

**Special**:
A power-up collected by clearing a row that contains one, queued by its collector and sent at another Player's Arena.
_Avoid_: Power-up, item, bonus

**Ready**:
A seated Player confirming they want the Game to start. The Game begins once every Player is Ready.
_Avoid_: Start, confirmed

**Lobby**:
The page that lists all Rooms, with chat and who is online. Entering a Room from here makes someone a Spectator until they take a Seat.
_Avoid_: Menu, home

**Guest**:
Someone who is not logged in. A Guest can take Seats only in unranked Rooms.
_Avoid_: Anonymous, visitor

**Ranked Room**:
A Room whose Games change its Players' points. Only logged-in users can take a Seat in one.
_Avoid_: Ranking room, rated room
