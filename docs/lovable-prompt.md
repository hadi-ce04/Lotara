# Lovable design prompt (UI only)

Paste everything between the two `---` rules into Lovable. It asks for presentational UI only. The working app
(routes, auth, database, AI investigator, server actions) stays in this repository, and we port the exported
components by hand. See "How we will port it" at the end.

---

## Role and scope

Design the interface for **Lotara**, a hackathon prototype that helps the operations manager of several nursery
kitchens respond to a product-recall notice. It is **not** a food-safety system: it never certifies food as safe and
never proves that stock was removed.

Design **only three views** as React + Tailwind CSS presentational components:

1. **Manager overview** — one recall, three kitchens.
2. **Case detail** — one kitchen's case for that recall.
3. **Kitchen response** — the page a kitchen lead opens from a link (mobile-first).

Hard constraints (please follow exactly):

- React function components + Tailwind CSS utility classes only. TypeScript props.
- **Presentational only.** No data fetching, no `useEffect` loading, no routing library, no global state, no auth,
  no Supabase, no Lovable Cloud/backend, no database, no AI calls. All data arrives through props.
- Every button or form calls a callback prop (for example `onRunAiInvestigation()`), or is a plain `<form>` whose
  submit handler is a prop. Do not invent endpoints.
- Icons: `lucide-react` only. No other UI kit is required; if you use shadcn/ui, keep it to Button, Card, Badge, Table.
- Accessible: real `<label>` elements tied to inputs, `<fieldset>`/`<legend>` for radio groups, visible focus rings,
  `role="alert"` for errors and `role="status"` for success messages, sufficient contrast, tables with `<th>`.
- Meaning must be carried by **text + icon**, never colour alone.
- Desktop layout for views 1 and 2 (max width about 1150 px). View 3 is a single column (max width about 680 px) that
  works on a phone.
- Neutral, calm, professional look (slate greys, one accent). Not playful, no stock photos, no gradients, no
  dashboards with decorative charts. Readable tables and a timeline matter more than graphics.

## Required vocabulary (do not paraphrase)

Match status (from the notice's exact batch criteria):

| Value | Label | Icon (lucide) | Tone |
|---|---|---|---|
| `RECORDED_MATCH` | **Recorded match** | `CircleAlert` | red / attention |
| `NEEDS_EVIDENCE` | **Needs evidence** | `CircleHelp` | amber |
| `NOT_MATCHING_THIS_NOTICE` | **Not matching this notice** | `CircleMinus` | neutral grey |

Response status (separate from match status):

| Value | Label | Icon | Tone |
|---|---|---|---|
| `NOT_REQUESTED` | Not requested | `Clock` | neutral |
| `REQUESTED` | Staff check requested | `PhoneOutgoing` | blue |
| `STAFF_REPORTED_ACTION` | Staff reported action | `UserCheck` | indigo |
| `REVIEWED_COMPLETE` | **Reviewed complete** | `ClipboardCheck` | green — the **only** success styling in the app |
| `ESCALATED` | Escalated | `ShieldAlert` | orange |

Wording rules:

- Never write "safe", "cleared", "OK to use" or "no risk". "Not matching this notice" only means this notice's
  criteria are not met.
- Wherever a delivery is shown: "A recorded delivery does not prove the product is still in stock."
- Wherever a staff report is shown: "A staff report, not independent verification."
- AI-read label values are labelled **"AI transcription · unconfirmed"** until a person confirms them.
- Green / success styling only for "Reviewed complete". Do not use green checkmarks for matches or uploads.
- A persistent banner on every view: **"Historical replay with synthetic data.** The recall is a real, previously
  published RappelConso notice replayed for this demo, not a new alert. Kitchens, staff and deliveries are fictional."
  (lucide `History` icon, amber background).
- Dates are shown in French format, Europe/Paris time (e.g. "1 mai 2026, 10:19"). Formatting is done by the
  component from ISO strings.

## Data contract (props)

These shapes mirror the real server queries. Keep the field names exactly (snake_case is intentional). Dates are
ISO strings. `null` means "not recorded" and must be shown as such (e.g. *not recorded* in italic amber), never as
an empty cell.

```ts
type MatchStatus = "RECORDED_MATCH" | "NEEDS_EVIDENCE" | "NOT_MATCHING_THIS_NOTICE";
type ResponseStatus = "NOT_REQUESTED" | "REQUESTED" | "STAFF_REPORTED_ACTION" | "REVIEWED_COMPLETE" | "ESCALATED";
type StaffAction = "SET_ASIDE" | "NONE_FOUND" | "COULD_NOT_CHECK";
type ActionResult = { error?: string; ok?: string } | null; // shown inline next to each button

type ScopeEntry = { gtinRaw: string; lot: string | null; allLots: boolean; date: string | null; dateType: string | null };

// ---------- 1. Manager overview
type OverviewProps = {
  recall: null | {
    source_id: string;            // "2026-04-0331"
    source_version: number;
    source_url: string;
    title: string;                // lowercase in source; display capitalised
    published_at: string;
    retrieved_at: string;         // snapshot retrieval time
    replay: boolean;              // true -> "Historical replay"
    review_status: string;        // "REVIEWED_FOR_DEMO"
    normalized_scope: { brand: string; productTitle: string; entries: ScopeEntry[] };
  };
  cases: {
    id: string;
    site_name: string; city: string;
    match_status: MatchStatus; response_status: ResponseStatus;
    reasons: string[];            // already human-readable sentences
    product_name_raw: string; gtin_raw: string | null; lot_raw: string | null;
    source_ref: string;           // delivery register reference, e.g. "SYN-DL-0412"
    received_at: string; quantity: number; unit: string;
  }[];
  counts: { sites: number; deliveries: number; last_event: string | null };
  refreshedAt: string | null;     // "View refreshed 14:02:11" indicator (app-state polling, not source freshness)
  onResetDemo: () => void; onSignOut: () => void; caseHref: (id: string) => string;
  resetResult: ActionResult;
};
```

Overview layout: header ("Recall response overview", "3 kitchens · 5 recorded deliveries (synthetic) · last event
…", refreshed indicator, **Reset demo** as a secondary danger button, Sign out). Then a **source card**: "Source notice
· RappelConso 2026-04-0331 v1 · reviewed for demo", title, Published / Retrieved (snapshot) / Mode = Historical
replay, the scope list ("GTIN 4056489470458 lot K100 · …"), and an "Official notice" external link. Then **six count
tiles**: Recorded match, Needs evidence, Not matching, Check requested, Staff reported, Reviewed complete. Then the
**site/case table**: Kitchen (link + city) · Delivery (recorded) · Match badge · Why · Response badge. Footer note:
"Deliveries whose GTIN is not in the notice are not listed. A recorded match concerns the recorded lot; it does not
prove stock is still on site. 'Not matching this notice' is not a safety statement." Empty state when `recall` is
null: "No recall loaded yet. Use Reset demo …".

```ts
// ---------- 2. Case detail
type EffectiveField = { value: string | null; source: "register" | "evidence" | null };
type CaseDetailProps = {
  case: {
    id: string; version: number;
    site_name: string; city: string; contact_name: string;
    match_status: MatchStatus; response_status: ResponseStatus;
    reasons: string[];
    evaluation: {
      missingFields: ("lot" | "best_before" | "gtin")[];
      matchedEntry: ScopeEntry | null;
      effective: { gtin: EffectiveField; lot: EffectiveField; bestBefore: EffectiveField };
    };
    // recorded delivery (synthetic)
    source_ref: string; supplier: string; product_name_raw: string;
    gtin_raw: string | null; lot_raw: string | null; best_before_raw: string | null;
    received_at: string; quantity: number; unit: string; synthetic: boolean;
    // notice
    source_id: string; source_version: number; source_url: string; title: string;
    published_at: string; retrieved_at: string; replay: boolean;
    normalized_scope: { entries: ScopeEntry[] };
    reason: string;               // official recall reason, French
    instructions: string;         // official instructions, French, "|"-separated
  };
  caseGtinMatchesEntry: (entry: ScopeEntry) => boolean; // highlight "this delivery's GTIN" rows
  openRequest: null | { requested_fields: string[]; request_text: string; created_at: string };
  documents: {
    id: string; imageUrl: string; byte_size: number; uploaded_by: string; created_at: string;
    confirmed: boolean;
    extraction_status: "COMPLETED" | "FAILED" | null;
    extraction: null | {
      legible: boolean; brand_text: string | null; product_text: string | null;
      gtin_digits: string | null; lot_text: string | null; best_before_text: string | null;
      date_label_type: "best_before" | "use_by" | "unknown" | null;
      ambiguous: { field: "gtin_digits" | "lot_text" | "best_before_text"; detail: string }[];
      notes: string;
    };
    extraction_model: string | null; extraction_ms: number | null; extraction_error: string | null;
    confirmedItems: { id: string; field_name: "lot" | "best_before"; raw_value: string;
      extraction_method: "ai_extraction_confirmed_by_human" | "human_corrected_ai_extraction" | "human_reading_of_photo";
      confirmed_by: string }[];
  }[];
  runs: {
    id: string; method: string;   // "ai-v1" or "rules-v1"
    status: "RUNNING" | "COMPLETED" | "NEEDS_EVIDENCE" | "FAILED";
    trigger: string | null;       // "manual" | "evidence_uploaded" | "evidence_confirmed"
    model_id: string | null; started_at: string; finished_at: string | null;
    summary: string | null; error_category: string | null;
    usage: { input_tokens: number; output_tokens: number } | null;
    cost_usd_est: string | null;  // estimate only
    steps: { step_index: number; kind: "tool" | "model"; tool_name: string; status: "OK" | "ERROR";
      elapsed_ms: number; detail: string;  // one-line, already formatted
      usage: { input_tokens: number; output_tokens: number } | null }[];
  }[];
  reports: { id: string; reported_action: StaffAction; quantity_if_known: number | null; unit: string | null;
    note: string | null; reported_at: string; actor_id: string; confirmation_method: string }[];
  events: { id: string; event_type: string; occurred_at: string; actor_id: string; source: string;
    payload: { from?: MatchStatus; to?: MatchStatus; trigger?: string } }[];
  aiAvailable: boolean; aiModel: string;
  kitchenLink: string | null;     // signed, site-scoped link (valid 7 days)
  results: Record<string, ActionResult>; // keyed by action name, shown next to the button
  onRunAiInvestigation: () => void; onRuleBasedCheck: () => void;
  onTranscribe: (documentId: string) => void;
  onConfirmReading: (v: { documentId: string; lot: string; bestBefore: string; attested: boolean }) => void;
  onManagerUpload: (file: File) => void;
  onRequestStaffCheck: () => void; onMarkReviewed: () => void;
};
```

Case detail layout: back link "Overview", header with kitchen name, match badge, response badge, "case version N".
Two columns (3/5 left, 2/5 right).

Left column:

- **Assessment**: reason sentences, then a criteria table: Field (GTIN, Lot, Best before) · Value used (mono;
  *missing* in amber if null) · Source ("Delivery register" / "Confirmed label reading" / —) · Notice entry.
- **Official notice scope**: link "RappelConso 2026-04-0331 v1", published + snapshot retrieved times, table of all
  (GTIN, Lot, Best before) entries with rows for this delivery's GTIN highlighted and tagged "this delivery's GTIN";
  official reason and instructions (French, joined with " · "); note "Lot codes are compared case-insensitively. No
  other character substitutions (such as O/0) are made."
- **Recorded delivery (synthetic)**: definition list of the delivery fields, plus "A historical delivery does not
  prove the product is still in stock."
- **Investigation**: primary button **Run AI investigation** and secondary **Rule-based check (no AI)**. Explainer:
  "The AI investigator (model) chooses allowlisted tools, at most 8 per segment within 120 s. The deterministic
  matcher decides status; extracted label values need human confirmation." If `aiAvailable` is false, show "AI
  investigation is unavailable on this server. The rule-based check still works and is labelled as such." Then a
  list of **investigation runs**, newest first. Each run: a chip "AI · {model_id}" (lucide `Bot`, violet) or
  "Rule-based (no AI)" (`Cog`, grey), status, start time, trigger, tokens in/out, "≈$0.000 est.", an error line
  "Stopped: {category}. Steps so far are saved." when present, an ordered step list (model turns with `Bot`, tool
  calls with `Wrench`, monospace tool name, ms, detail; ERROR steps show "rejected: …"), and the summary box.

Right column:

- **Evidence**: open evidence request (amber box: "Open evidence request · lot, best_before" + request text) or "No
  open evidence request." For each document: **label photo on the left, AI transcription on the right** headed
  "AI transcription · unconfirmed" (`Bot` icon) with GTIN, Lot, Date (+ label type), Brand, Legible; **ambiguity
  warnings** as an amber list with `AlertTriangle` (e.g. "lot: last character could be O or 0"); model + ms. States:
  not transcribed yet (button "Transcribe with AI"), failed ("AI transcription failed (category). Read the photo
  manually."), AI unavailable. Below: upload metadata "original image preserved". Then either the **confirmed values**
  ("Confirmed lot: K100 · AI transcription confirmed by a person · manager") or the **human confirmation form**:
  "Compare with the photo and type exactly what the label shows:", Lot code + Best before (DD/MM/YYYY) inputs (mono),
  a note "Ambiguous characters were left blank — read them from the photo." when ambiguity exists, a required
  checkbox "I compared these values with the photo myself.", button **Confirm values & reassess**. Collapsible
  "Upload a label photo as manager".
- **Staff response**: button "Request kitchen stock check" (hidden when not matching or already requested); kitchen
  link with `Link2` icon and "Signed, site-scoped participant link (valid 7 days). Share only with that kitchen.";
  staff reports as indigo cards "Participant reported: Set aside affected stock according to the notice", quantity or
  "Quantity not stated", time, actor, "typed and confirmed", note, and "A staff report, not independent
  verification."; button **Mark reviewed complete** only when status is Staff reported action.
- **Event history**: vertical timeline, newest first, monospace event type (e.g. `case.reassessed`,
  `evidence.requested`, `evidence.uploaded`, `evidence.extracted`, `evidence.confirmed`, `staff.reported`,
  `investigation.finished`, `case.reviewed_complete`), time · actor · source, and "NEEDS_EVIDENCE → RECORDED_MATCH
  (label_confirmed)" for reassessments.

```ts
// ---------- 3. Kitchen response
type KitchenProps = {
  site: { name: string };
  cases: {
    id: string;
    title: string; source_url: string; published_at: string;
    product_name_raw: string; gtin_raw: string | null; lot_raw: string | null;
    received_at: string; quantity: number; unit: string;
    instructions: string;           // official, French, "|"-separated
    open_request: string | null;    // photo request text written by the server
    photos: number;                 // photos received so far
    last_report: null | { action: StaffAction; quantity: number | null; unit: string | null; at: string };
  }[];
  invalidLink?: boolean;            // "This kitchen link is invalid or has expired. Ask your manager for a new one."
  results: Record<string, ActionResult>;
  onSendPhoto: (caseId: string, file: File) => void;
  onSendReport: (caseId: string, r: { action: StaffAction; quantity: string; unit: string; note: string; attested: boolean }) => void;
};
```

Kitchen layout: small caption "Kitchen response · demo participant page", kitchen name, then one card per case:
"Product recall: {title}", published date + "official notice" link; "Our records show a delivery to your kitchen on
{date}: {product}, GTIN …, lot *not recorded*, 24 gourdes. This does not mean the product is still in stock — please
check."; official instructions. If `open_request`: amber **Photo requested** section (`Camera` icon), request text,
"N photo(s) received so far", a file input (accept JPEG/PNG, `capture="environment"`) and **Send photo**. Then
**Report your stock check** (`ClipboardList`): radio group "What did you do?" with exactly: "I set aside the affected
stock as the notice says" / "I checked: none of this product/lot is in stock" / "I could not check"; Quantity (only if
you counted) and Unit (placeholder "gourdes, cartons…"); Note (optional, 500 chars); required checkbox "I confirm this
report describes what I did. It will be recorded as a staff report for the manager to review."; **Send report**. If a
report exists: "Last report received {date}. You can send a correction below." Success text examples: "Report
recorded. The manager will review it." and "Already received — your report was recorded once." Empty state: "No
action is requested from this kitchen right now." No AI wording, no internal statuses on this page.

## Sample data (SAMPLE / SYNTHETIC — for the preview only)

Show a small "Sample data" tag in the preview. The notice ID, GTINs, lots and dates come from a real public notice;
kitchens, people and deliveries are fictional.

- Recall: RappelConso `2026-04-0331` v1, title "compote bio", brand "les vergers gourmands", published
  2026-05-01T08:19:50Z, retrieved 2026-10-22T09:44:22Z, replay true, `source_url`
  `https://rappel.conso.gouv.fr/fiche-rappel/22174/interne`.
  Entries: 4056489470458 lot k100 date 10/12/2026 · 4056489470458 lot k101 11/12/2026 · 4056489470441 lot k099
  09/12/2026 · 4056489470441 lot k100 10/12/2026. Reason: "défaut d'étanchéité du bouchon". Instructions: "ne plus
  consommer|rapporter le produit au point de vente|contacter le service consommateur".
- Cases (counts: 3 sites, 5 deliveries):
  - Crèche Les Lilas (Paris 20e), SYN-DL-0412, GTIN 4056489470458, lot K101, 24 gourdes, received 2026-04-21 —
    Recorded match; reasons "The GTIN is listed in this notice." "The lot code is listed for this GTIN in the notice."
  - Crèche Belleville (Paris 19e), SYN-DL-0415, GTIN 4056489470441, lot K101, 36 gourdes — Not matching this notice;
    reason "This lot code appears in the notice only under a different GTIN."
  - Crèche Montreuil Centre (Montreuil), SYN-DL-0419, GTIN 4056489470458, lot not recorded, 24 gourdes — Needs
    evidence; reason "No lot code is recorded, so the batch cannot be resolved."; open request for lot, best_before:
    "Please photograph a label of the Les Vergers Gourmands compote bio pouches (GTIN 4056489470458) still in your
    stock, clearly showing the lot code and the best-before date (DDM). The recall lists lots K100, K101 for this
    product, but no lot code was recorded at delivery. Do not use or discard the stock until the check is complete."
- Montreuil document: AI transcription lot_text "K100", best_before_text "10/12/2026", gtin_digits "4056489470458",
  ambiguous `[{ field: "lot_text", detail: "The character after 'K1' could be the digit 0 or the letter O." }]`.
  Use a grey placeholder box labelled "synthetic label photo" for the image.
- One AI run: method ai-v1, model claude-opus-5-5, NEEDS_EVIDENCE, trigger manual, about 6 steps alternating
  model / get_recall_scope / get_delivery_record / get_case_evidence / evaluate_match / request_evidence /
  finish_investigation. Use placeholder token and cost values and mark them "sample".
- One staff report: SET_ASIDE, 2 cartons, typed and confirmed.

Provide state variants for the case detail: (a) Montreuil before upload, (b) after upload with unconfirmed AI
transcription and ambiguity warning, (c) after confirmation (Recorded match, confirmed values), (d) staff reported +
"Mark reviewed complete", (e) Reviewed complete.

## What to export

- One file per component, for example: `ReplayBanner.tsx`, `StatusBadges.tsx` (MatchBadge, ResponseBadge),
  `SourceCard.tsx`, `CountTiles.tsx`, `CaseTable.tsx`, `CriteriaTable.tsx`, `NoticeScope.tsx`, `DeliveryCard.tsx`,
  `InvestigationRuns.tsx`, `LabelEvidence.tsx` (photo + transcription + confirmation form), `StaffResponse.tsx`,
  `EventTimeline.tsx`, `KitchenCaseCard.tsx`, `StaffReportForm.tsx`, plus the three page compositions.
- Sample data in a separate `sample-data.ts` file, so it can be deleted.
- Tailwind classes only (no custom CSS file other than defaults). No new fonts.
- No `react-router`, no Supabase client, no fetch calls, no environment variables.

---

## How we will port it

1. Export from Lovable (GitHub sync or download). Do **not** import it as a new app or replace this repository.
2. Copy only the selected presentational components into `components/`. Delete `sample-data.ts` and any router,
   Supabase or Lovable backend code.
3. Bind props to the existing server data in `app/page.tsx` (`getOverview`), `app/cases/[id]/page.tsx`
   (`getCaseDetail`) and `app/kitchen/[token]/page.tsx` (`getKitchenView`). Reasons are mapped with `REASON_TEXT`.
4. Replace callback props with the existing server actions in `app/actions.ts` via `components/action-form.tsx`
   (`useActionState`), keeping the hidden `caseId`, `version`, `token` and `submissionKey` fields.
5. Keep routes, manager login, signed kitchen links, actions and the state contract unchanged. Run `npm test` and
   `npm run test:e2e`; the e2e test locates elements by the exact labels above, so keep the wording.
