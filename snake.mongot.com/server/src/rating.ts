export const INITIAL_RATING = 1600;
const K_FACTOR = 32;

export interface RatedParticipant {
  username: string;
  rating: number;
  place: number;
}

export interface RatingChange extends RatedParticipant {
  change: number;
}

export function isRankedMatch(
  participants: { accountUsername: string | null; isBot: boolean }[],
): boolean {
  if (
    participants.length < 2 ||
    participants.some((participant) => participant.isBot || !participant.accountUsername)
  ) {
    return false;
  }

  const usernames = participants.map((participant) =>
    participant.accountUsername!.toLowerCase(),
  );
  return new Set(usernames).size === usernames.length;
}

export function calculateRatingChanges(
  participants: RatedParticipant[],
): RatingChange[] {
  if (participants.length < 2) {
    return participants.map((participant) => ({ ...participant, change: 0 }));
  }

  const rawChanges = participants.map((participant, index) => {
    let performance = 0;
    for (let opponentIndex = 0; opponentIndex < participants.length; opponentIndex++) {
      if (opponentIndex === index) continue;
      const opponent = participants[opponentIndex];
      const expected =
        1 / (1 + Math.pow(10, (opponent.rating - participant.rating) / 400));
      const outcome =
        participant.place < opponent.place
          ? 1
          : participant.place === opponent.place
            ? 0.5
            : 0;
      performance += outcome - expected;
    }
    return (K_FACTOR * performance) / (participants.length - 1);
  });

  const changes = rawChanges.map(Math.floor);
  const remainingPoints =
    Math.round(rawChanges.reduce((total, change) => total + change, 0)) -
    changes.reduce((total, change) => total + change, 0);
  const allocationOrder = rawChanges
    .map((change, index) => ({ index, remainder: change - changes[index] }))
    .sort((left, right) => right.remainder - left.remainder);

  for (let index = 0; index < remainingPoints; index++) {
    changes[allocationOrder[index].index] += 1;
  }

  return participants.map((participant, index) => ({
    ...participant,
    rating: participant.rating + changes[index],
    change: changes[index],
  }));
}