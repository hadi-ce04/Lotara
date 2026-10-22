// Deterministic synthetic demo data. Kitchens, people and deliveries are fictional.
// The recall notice is a real, saved RappelConso record replayed as history.

export const DEMO_RECALL_FIXTURE = "recall-2026-04-0331";

export const DEMO_SITES = [
  { id: "lilas", name: "Crèche Les Lilas", city: "Paris 20e", contactName: "Amina (kitchen lead)" },
  { id: "belleville", name: "Crèche Belleville", city: "Paris 19e", contactName: "Julien (kitchen lead)" },
  { id: "montreuil", name: "Crèche Montreuil Centre", city: "Montreuil", contactName: "Sofia (kitchen lead)" },
] as const;

export type DemoDelivery = {
  ref: string;
  siteId: (typeof DEMO_SITES)[number]["id"];
  supplier: string;
  productName: string;
  gtin: string | null;
  lot: string | null;
  bestBefore: string | null;
  receivedAt: string;
  quantity: number;
  unit: string;
};

const SUPPLIER = "Grossiste Démo (synthetic)";
const COMPOTE = "Les Vergers Gourmands compote bio, gourde";

export const DEMO_DELIVERIES: DemoDelivery[] = [
  // Listed (GTIN, lot) pair -> recorded match.
  { ref: "SYN-DL-0412", siteId: "lilas", supplier: SUPPLIER, productName: COMPOTE, gtin: "4056489470458", lot: "K101", bestBefore: "11/12/2026", receivedAt: "2026-04-21T07:30:00+02:00", quantity: 24, unit: "gourdes" },
  // Lot K101 is listed only under the other GTIN -> not matching this notice.
  { ref: "SYN-DL-0415", siteId: "belleville", supplier: SUPPLIER, productName: COMPOTE, gtin: "4056489470441", lot: "K101", bestBefore: "11/12/2026", receivedAt: "2026-04-22T07:45:00+02:00", quantity: 36, unit: "gourdes" },
  // Lot not captured at delivery -> needs evidence.
  { ref: "SYN-DL-0419", siteId: "montreuil", supplier: SUPPLIER, productName: COMPOTE, gtin: "4056489470458", lot: null, bestBefore: null, receivedAt: "2026-04-22T08:10:00+02:00", quantity: 24, unit: "gourdes" },
  // Unrelated products: never become cases for this notice.
  { ref: "SYN-DL-0420", siteId: "montreuil", supplier: SUPPLIER, productName: "Yaourt nature (synthetic product)", gtin: "2000000000015", lot: "Y2604", bestBefore: "05/05/2026", receivedAt: "2026-04-22T08:10:00+02:00", quantity: 48, unit: "pots" },
  { ref: "SYN-DL-0421", siteId: "lilas", supplier: SUPPLIER, productName: "Purée de carottes (synthetic product)", gtin: "2000000000022", lot: "P118", bestBefore: "30/06/2026", receivedAt: "2026-04-21T07:30:00+02:00", quantity: 12, unit: "barquettes" },
];
