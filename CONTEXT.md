# General Game

This context describes the turn-based territory strategy game in `general.mongot.com`, its players, maps, and match lifecycle.

## Language

**Game**:
A turn-based territory strategy game whose players compete to control regions and fulfill match objectives.
_Avoid_: RISK clone

**Player**:
A human participant in a match.
_Avoid_: User (when referring to an in-game participant)

**Bot**:
A computer-controlled competitor that occupies a player seat, either from the start of a match or after taking over an abandoned seat.
_Avoid_: AI user

**Table**:
A multiplayer room where players meet before a match and can play consecutive matches together.
_Avoid_: Game (when referring to the room)

**Original Map**:
The existing 33-territory map, retained in its current form as one of the selectable maps.
_Avoid_: Default map (when distinguishing it from alternate maps)

**Alternate Map**:
A selectable territory layout with its own regions and connections, distinct from the Original Map.
_Avoid_: Skin (when the territory connections differ)

**Rematch**:
A new match played by the same seated players at the same Table after the previous match ends.
_Avoid_: Replay (when referring to a new match)

**Surrender**:
A player's explicit decision to concede the current match.
_Avoid_: Disconnect

**Disconnect**:
A temporary loss of a player's connection that does not, by itself, mean they have surrendered.
_Avoid_: Rage quit

**Player Rating**:
A measure of competitive standing that changes according to match outcomes and opponent strength.
_Avoid_: Score (when referring to competitive standing)
