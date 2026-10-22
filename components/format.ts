// Display helpers: French formats, Europe/Paris time (as the source notice).

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export const fmtDay = (d: string | Date) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" });

/** "2026-12-10" -> "10/12/2026"; anything else is returned unchanged. */
export const fmtIsoDay = (s: string | null | undefined) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
