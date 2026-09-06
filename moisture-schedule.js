export function effectiveCheckIntervalDays(reading, automaticDays) {
  const override = reading?.nextCheckDays;
  return Number.isInteger(override) && override >= 1 && override <= 365
    ? override
    : automaticDays;
}
