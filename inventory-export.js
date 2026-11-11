export function inventoryExportFilename(date = new Date()) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return `plant-inventory-${local.toISOString().slice(0, 10)}.json`;
}

export function serializeInventory(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

// True when the candidate record was saved after the one this page is showing,
// which means another device has edited since this page loaded.
export function isNewerInventory(candidate, current) {
  const candidateTime = Date.parse(candidate?.updatedAt || '');
  const currentTime = Date.parse(current?.updatedAt || '');
  if (Number.isNaN(candidateTime)) return false;
  if (Number.isNaN(currentTime)) return true;
  return candidateTime > currentTime;
}
