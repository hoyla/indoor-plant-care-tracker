export const ROOM_ORDER = ['Bright room', 'Lower-light room'];

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

function roomRank(room) {
  const index = ROOM_ORDER.indexOf(room);
  return index < 0 ? ROOM_ORDER.length : index;
}

function urgencyRank(plant) {
  if (plant.dueState === 'never') return Number.NEGATIVE_INFINITY;
  return Number.isFinite(plant.dueRemaining) ? plant.dueRemaining : Number.POSITIVE_INFINITY;
}

export function comparePlantOrder(left, right, { needsCheck = false } = {}) {
  if (needsCheck) {
    const urgency = urgencyRank(left) - urgencyRank(right);
    if (urgency) return urgency;
  }

  const rankedRoom = roomRank(left.room) - roomRank(right.room);
  if (rankedRoom) return rankedRoom;

  const room = collator.compare(left.room || '', right.room || '');
  if (room) return room;

  return collator.compare(left.name || '', right.name || '');
}
