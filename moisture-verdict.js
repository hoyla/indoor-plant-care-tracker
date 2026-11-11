const DAY_MS = 86_400_000;
const SUSTAINED_WET_DAYS = 3;

function sortedReadings(readings = []) {
  return [...readings]
    .filter((reading) => Number.isInteger(reading?.value))
    .sort((left, right) => new Date(right.checkedAt) - new Date(left.checkedAt));
}

export function formatMeterTarget(target) {
  if (!target || !Array.isArray(target.waterAt)) return '';
  const [low, high] = target.waterAt;
  return `${low === high ? low : `${low}–${high}`}/10`;
}

export function moistureVerdict(target, readings = []) {
  if (!target || !Array.isArray(target.waterAt)) {
    return { state: 'unmetered', label: 'No meter target', detail: 'Use the meter guide for this plant instead of a number.' };
  }
  const [low, high] = target.waterAt;
  const range = formatMeterTarget(target);
  const [latest, previous] = sortedReadings(readings);
  if (!latest) return { state: 'unread', label: 'No reading yet', detail: `Water at ${range}.` };

  const { value } = latest;
  // A dry bound exists only where the profile's own prose says the plant must
  // never dry out and names the point; cycle plants have none.
  if (Number.isInteger(target.dryBelow) && value < target.dryBelow) {
    return {
      state: 'dry',
      label: 'Too dry. Water now',
      detail: `Below ${target.dryBelow}/10. The profile says not to let it dry out.`,
    };
  }
  if (value <= high) {
    const dry = value < low - 1;
    return {
      state: 'water',
      label: 'Water now',
      detail: dry ? `Drier than the ${range} target.` : `At the ${range} target.`,
    };
  }

  // A wet band exists only where the profile's own prose names one; otherwise
  // any reading above the target simply means no water is needed yet.
  const wetBand = Number.isInteger(target.avoidAbove) ? target.avoidAbove : null;
  if (wetBand === null || value < wetBand) {
    return { state: 'hold', label: 'No water needed', detail: `Above the ${range} target.` };
  }
  const elapsedDays = previous
    ? Math.round((new Date(latest.checkedAt) - new Date(previous.checkedAt)) / DAY_MS)
    : 0;
  if (previous && previous.value >= wetBand && elapsedDays >= SUSTAINED_WET_DAYS) {
    return {
      state: 'sustained',
      label: 'Staying wet',
      detail: `Still ${wetBand}+ after ${elapsedDays} days. The profile says to avoid sustained readings of ${wetBand}–10.`,
    };
  }
  return { state: 'wet', label: 'Wet. Hold off', detail: `The profile says to avoid sustained readings of ${wetBand}–10.` };
}
