export function getLocaleOptions(
  supportedLocales: string[],
  locale = "en"
): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "language" });
  return supportedLocales.map((code) => {
    const base = code.split("-")[0];
    const name = names.of(base) ?? code;
    return { value: code, label: `${code} — ${name}` };
  });
}
