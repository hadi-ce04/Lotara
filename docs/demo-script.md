# Demo script (about 150 seconds)

This follows Blueprint §14 and the real deployed flow on Aiven Runtime. The times are targets. Rehearse with a stopwatch
and cut lines until you fit the organisers' limit. Measured numbers come only from [RESULTS.md](RESULTS.md). Do not
quote figures that are not in that file.

## Pre-demo checklist (about 5 minutes before)

1. Open `https://<app>/api/health`. Check that:
   - `status` is `"ok"` and `database.ok` is true;
   - `release` matches the value in `lib/release.ts` for the commit you deployed;
   - in `config`, `adminPasswordHash` is `"ok"`, `sessionSecret` and `participantTokenSecret` are `true`, and
     `anthropicApiKey` is `true` (if it is `false`, use the fallback path).
2. Sign in at `/login`, then click **Reset demo** and wait for "Demo data reset and assessed". The overview should
   show Les Lilas = Recorded match, Belleville = Not matching this notice, and Montreuil = Needs evidence.
3. Have `public/demo/synthetic-label-K100.png` saved locally (it is also served at `/demo/synthetic-label-K100.png`).
   Open it once so the file picker remembers the folder.
4. Use two browser windows: the manager window (signed in) and a private window for the kitchen link. Zoom to 125%.
5. Keep the results slide ([pitch-slide.md](pitch-slide.md), with numbers from [RESULTS.md](RESULTS.md)) open in
   another tab. Also have a labelled fallback screen recording ready.

## Script

| Time | Screen | Say / do |
|---|---|---|
| 0:00–0:20 | Overview (banner visible) | "A food product has been recalled. Which of our kitchens received the affected batch, and has someone acted? This recall names a batch, not every product with the same brand. Lotara helps a multi-site nursery-kitchen operator work out where that batch went and coordinate the response." |
| 0:20–0:40 | Source card, then table | "This is a real RappelConso notice, 2026-04-0331. It is replayed from a saved snapshot, and you can see the publication and retrieval times. It is not a new alert. The three kitchens and their deliveries are synthetic. **Les Lilas**: recorded match, because its GTIN and lot K101 are listed together. **Belleville** received the same compote with lot K101, but the notice lists K101 only under the *other* GTIN. So it is **not matching this notice**. A product-name matcher flags this one wrongly. **Montreuil**: **needs evidence**, because nobody recorded the lot at delivery." |
| 0:40–1:15 | Montreuil case, **Run AI investigation** | Click **Run AI investigation**. While it runs: "The investigator is a model with a short allowlist of tools, all scoped to this one case. It gets at most 8 tool calls and 8 model turns in 120 seconds. The deterministic matcher is the authority. The model can't finish with a conclusion that disagrees with it, and every evidence reference it cites is validated." When it finishes, show the run: the model and tool steps, tokens and estimated cost, and the open evidence request for lot and best-before. Click **Request kitchen stock check**, then open the kitchen link in the private window. |
| 1:15–1:40 | Kitchen page, then case | Kitchen window: point at the photo request, choose `synthetic-label-K100.png`, then **Send photo**. Manager window: the photo appears beside the **AI transcription · unconfirmed** panel. The upload starts a new AI segment in the background. If the transcription hasn't appeared yet, click **Transcribe with AI**. "The model read lot K100. When it flags a character as ambiguous, for example O versus 0, the field is left blank on purpose. The status is still Needs evidence, because unconfirmed AI output changes nothing." Type `K100` and `10/12/2026`, tick "I compared these values with the photo myself", then **Confirm values & reassess**. The header changes to **Recorded match**, and the criteria table shows "Confirmed label reading". |
| 1:40–2:10 | Kitchen page, then case | Kitchen window: choose "I set aside the affected stock as the notice says", quantity 2, unit cartons, tick the confirmation, then **Send report**. "Send the same form again and it's recorded once." (Optional: press Send report again to show "Already received".) Manager window: "This is a staff report, not independent verification. Only the manager can close the case, and only once the evidence is resolved." Click **Mark reviewed complete**. That is the only green state in the app. Scroll the event history: every change was persisted in Aiven PostgreSQL with its event. |
| 2:10–2:30 | Results slide | Read the measured comparison from [RESULTS.md](RESULTS.md) as full counts (for example "x/y"), covering the name-only baseline, the structured matcher and the full flow. Then the pilot route: "Next we want a supervised recall drill on historical data with one catering operator. The buyer and the willingness to pay are still hypotheses." |

Closing line, if there is time: "A replayed official notice, synthetic deliveries, and a real evidence-dependent agent
workflow on Aiven. We don't claim real-world savings."

## Fallback path (AI unavailable or slow)

- If `/api/health` shows `anthropicApiKey: false`, or an AI action returns "AI investigation unavailable (…)", click
  **Rule-based check (no AI)** instead. The run is labelled "Rule-based (no AI)". It still creates the same targeted
  evidence request. Say clearly: "this run uses no AI".
- If the label isn't transcribed, read the photo yourself and type the values. The evidence is then recorded as
  "Read by a person". Reassessment, the staff report and the review work exactly the same.
- If the AI run takes more than about 30 s, keep talking about the tool steps already on screen. Steps are saved as
  they happen, and auto-refresh shows new ones. A run left `RUNNING` by a crash is marked stale after 5 minutes.
- If the deployment itself fails, play the fallback recording and say aloud that it is **prerecorded**.
- Say nothing about voice. It is deferred, and staff reports are typed.

## Wording to avoid

Never say "safe", "cleared", "removed" or "verified in stock". Say "recorded match", "not matching this notice",
"needs evidence" and "staff reported". A recorded delivery does not prove current stock. A staff report is not
independent proof.
