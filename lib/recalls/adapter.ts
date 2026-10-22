import { createHash } from "node:crypto";
import { normalizeDate, normalizeGtin } from "../matching/normalize";
import type { RecallScope, ScopeEntry } from "./scope";

// Maps a RappelConso v2 record (dataset rappelconso-v2-gtin-espaces) to canonical form.
// Observed source quirks:
// - All text is lowercased by the dataset, so lot comparison must be case-insensitive.
// - identification_produits is a flat array: [gtin, lot, date type, date, "|gtin", ...].
//   A group without a lot has only three items.
// - The numeric `gtin` column drops leading zeroes, so it is never used.

export type RappelConsoRecord = {
  numero_fiche: string;
  numero_version: number;
  rappel_guid: string;
  libelle: string;
  marque_produit: string;
  modeles_ou_references: string | null;
  identification_produits: string[] | string | null;
  date_publication: string;
  lien_vers_la_fiche_rappel: string;
  conduites_a_tenir_par_le_consommateur: string | null;
  motif_rappel: string | null;
  [key: string]: unknown;
};

const DATE_TYPES: Record<string, ScopeEntry["dateType"]> = {
  "date de durabilité minimale": "best_before",
  "date limite de consommation": "use_by",
};

export class UnsupportedScopeError extends Error {}

export function parseIdentification(items: string[]): ScopeEntry[] {
  const groups: string[][] = [];
  for (const item of items) {
    if (item.startsWith("|") || groups.length === 0) groups.push([item.replace(/^\|/, "")]);
    else groups.at(-1)!.push(item);
  }
  return groups.map((group) => {
    const [gtinRaw, ...rest] = group.map((s) => s.trim());
    const gtin = normalizeGtin(gtinRaw);
    if (!gtin.ok) throw new UnsupportedScopeError(`Unsupported GTIN in notice (${gtin.reason})`);
    const dateTypeIndex = rest.findIndex((s) => s in DATE_TYPES);
    const lotPart = dateTypeIndex === -1 ? rest[0] : rest.slice(0, dateTypeIndex)[0];
    const dateType = dateTypeIndex === -1 ? null : DATE_TYPES[rest[dateTypeIndex]];
    const date = dateTypeIndex === -1 ? null : normalizeDate(rest[dateTypeIndex + 1]);
    const allLots = lotPart === "tous les lots";
    if (!allLots && (!lotPart || lotPart === "/")) {
      // A missing batch value is never interpreted as "all batches".
      throw new UnsupportedScopeError("Notice entry has no lot and does not state all lots");
    }
    return { gtin14: gtin.gtin14, gtinRaw, lot: allLots ? null : lotPart, allLots, dateType, date };
  });
}

export function adaptRappelConso(record: RappelConsoRecord) {
  const ident = Array.isArray(record.identification_produits)
    ? record.identification_produits
    : (record.identification_produits ?? "").split("$");
  const scope: RecallScope = {
    brand: record.marque_produit,
    productTitle: record.libelle,
    // The source separates references with "¤".
    references: (record.modeles_ou_references ?? "").split(/[¤\n]+/).map((s) => s.trim()).filter(Boolean),
    entries: parseIdentification(ident),
    lotCaseInsensitive: true,
    unsupportedCriteria: [],
  };
  return {
    source: "rappelconso",
    sourceId: record.numero_fiche,
    sourceVersion: record.numero_version,
    sourceUrl: record.lien_vers_la_fiche_rappel,
    title: `${record.libelle} — ${record.marque_produit}`,
    publishedAt: record.date_publication,
    contentHash: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
    scope,
  };
}
