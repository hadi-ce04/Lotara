# Submission answers (copy and paste)

## Project name
Lotara

## One-line pitch
Lotara tells a nursery-kitchen operator which kitchens received a recalled batch, sends an AI agent to collect the missing label evidence, and tracks every kitchen's confirmed response to closure.

## The data layer in action
Lotara runs on Aiven Runtime with Aiven for PostgreSQL as its single source of truth.

- **Notice:** a real RappelConso recall (2026-04-0331, compote bio) is saved with its publication and retrieval times and normalised into exact recall criteria: barcode + lot + best-before.
- **Deliveries:** each kitchen's recorded deliveries (synthetic, clearly labelled) live in PostgreSQL next to the notice. A deterministic matcher compares them and writes one case per kitchen: Recorded match, Not matching this notice, or Needs evidence.
- **Agent:** for a case that needs evidence, an AI investigator (Claude, called directly through the Anthropic API) works through seven allowlisted tools scoped to that one case. It reads the recall criteria, the delivery record and the case evidence from PostgreSQL, runs the matcher, and writes a targeted evidence request for the kitchen.
- **Evidence in:** the kitchen uploads a label photo, stored privately in PostgreSQL. The agent transcribes it, unconfirmed. A person confirms the values, and the matcher re-checks the case and updates it.
- **Response:** the kitchen's typed stock-check report and the manager's review are saved as well.
- **Audit trail:** every state change is written in the same transaction as an event-log entry, with version checks so a stale update can't overwrite newer evidence. Every AI model turn and tool call is also saved, with its timing, token usage and estimated cost, so the full history survives a page reload.

## Evidence it works
Upload `docs/submission/evidence.png`. Suggested caption:

> On 28 labelled cases against a real recall notice (16 affected), name-only matching raised false alarms on 11 of 12 unaffected cases. Lotara (exact rules plus AI evidence collection) was correct on 11 of 11 declared matches, with 1 of 12 false alarms, and confirmed 11 of 16 affected kitchens against 7 of 16 for rules alone. Synthetic cases; full method and failures are in docs/RESULTS.md.

## One pitch slide
Upload `docs/submission/slide.png` (or `slide.pdf`) to Google Slides:
1. Go to slides.new and choose a blank slide.
2. Insert → Image → Upload from computer, pick `slide.png`, and stretch it to fill the slide.
3. Share → General access → "Anyone with the link" → Viewer. Copy the link.

## GitHub repo
https://github.com/hadi-ce04/Lotara

## Demo link
https://01a16320-7504-70fc-b08b-06bc2a4c1c84-8080.eur-1.aiven.app/welcome

The public page has an interactive delivery checker and the measured results, and needs no login. The manager demo is at /login and needs the demo password. Give it to the judges only if the form has a private notes field.
