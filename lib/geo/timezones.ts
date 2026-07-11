export function getTimezoneOptions(): { value: string; label: string }[] {
  const zones = Intl.supportedValuesOf("timeZone");
  const sorted = [...zones].sort((a, b) => a.localeCompare(b));
  const utcIndex = sorted.indexOf("UTC");
  if (utcIndex > 0) {
    sorted.splice(utcIndex, 1);
    sorted.unshift("UTC");
  } else if (utcIndex === -1) {
    sorted.unshift("UTC");
  }
  return sorted.map((tz) => ({ value: tz, label: tz }));
}
