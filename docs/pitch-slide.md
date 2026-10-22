# Pitch slide (one slide)

**Lotara: which of our kitchens received the recalled batch, and has someone acted?**

| | |
|---|---|
| **User** | The operations or food-safety lead at a catering operator that serves several nursery kitchens. (This is our buyer hypothesis. We have not yet validated it with an operator.) |
| **Problem** | A recall names specific batches (GTIN + lot + date), not a brand. Delivery records are incomplete, for example when no lot was captured at delivery. Matching on the product name sends false alerts to some kitchens and misses the real question at others. Then someone still has to collect evidence from each kitchen and track responses. |
| **Why now** | Official recall data is published as open data (RappelConso). Vision-capable models can now read a label photo into structured fields, and a bounded tool-using agent can chase the one missing piece of evidence. Decisions stay with deterministic rules and a person. |
| **Differentiation** | We don't build another traceability database. Lotara investigates *incomplete evidence* and follows through across sites. Exact batch rules decide the match status. The AI investigates, requests a targeted label photo and transcribes it. A person confirms critical identifiers. Staff reports are kept separate from proof, and every step is in an auditable event history. Existing recall and traceability products mean this is not an empty market. |
| **Evidence so far** | A working prototype on Aiven Runtime + Aiven PostgreSQL. It uses one real, replayed RappelConso notice and three **synthetic** kitchens. Measured prototype results against a name-only baseline are in [RESULTS.md](RESULTS.md). They come from synthetic cases only, and we claim no time or cost savings. |
| **Route to first pilot** | 1) Interview one operator who owns the recall workflow. Observe their current procedure and what their existing tools already do. 2) Ask for a historical recall drill or anonymized delivery records. 3) Run a supervised exercise alongside their procedure, measuring missed sites, false alerts, human effort, evidence completeness and time to acknowledgment. 4) Discuss paid continuation only if those results are useful. |
| **Biggest risk** | Capturing batch data at delivery may be the real adoption cost. If operators can't supply evidence economically, or incumbents already solve this, the hypothesis needs revising. |

Footer: *Prototype. Not a food-safety system. It does not certify food as safe or verify physical removal. Replayed
notice, synthetic deliveries.*
