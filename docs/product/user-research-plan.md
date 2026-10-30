# User research plan — target segment validation

**Task:** PROD-001
**Status:** Protocol prepared; interviews not yet conducted. No participant responses or product findings are fabricated.
**Purpose:** Validate the first customer segment, operational pain points, and MVP workflow priorities before fixing product and architecture policy.

## Sampling plan

Interview 5–8 people across at least two target segments, with at least two people per segment where possible. Seek day-to-day operators, not only owners. Suggested segments:

1. Retail/wholesale stockroom or distribution.
2. Industrial/electrical/automotive parts supplier or construction materials supplier.

Include at least one owner/manager and one person who receives, counts, transfers, or fulfills stock per segment. Ask about business scale and tools in broad terms; do not collect customer lists, credentials, personal financial data, or confidential supplier prices.

## Interview opening

Explain that this is exploratory product research, participation is voluntary, and the goal is to understand current inventory work. Ask permission before taking notes or recording. Do not promise a product, pricing, or a launch date. Anonymize notes with participant IDs (P1…P8); store only what is needed for product decisions.

## 30-minute interview guide

### Context (5 minutes)
1. What products or materials do you track, and how many locations do you operate?
2. Which roles handle purchasing, receiving, stock counts, sales, and dispatch?
3. What systems or tools do you use today? What still happens on paper or in chat?

### Recent real workflow (12 minutes)
4. Tell me about the most recent time you received stock. What happened from supplier confirmation through putting it away?
5. Tell me about the most recent sale or issue of stock. How did staff check availability, pick it, and record what left?
6. When was the last time the recorded quantity did not match the physical quantity? How did you find and correct the difference?
7. How do you move stock between branches/warehouses? When do you consider it available at the destination?
8. How do you decide to reorder? Which incoming orders, customer commitments, lead times, or units affect that decision?

### Consequences and priorities (8 minutes)
9. What goes wrong most often? How frequently, and what is the practical impact (delay, lost sale, rush delivery, write-off, rework)?
10. Which stock/order reports do you rely on? How do you check that the numbers are trustworthy?
11. If one step could become easier this month, which step would you choose and why?
12. What device and connectivity are available where stock is handled? Do staff use barcode labels/scanners?

### Close (5 minutes)
13. What did I not ask that matters to inventory work?
14. May we contact you once to clarify a note or show a prototype? Record contact details only with permission and separately from anonymized notes.

Avoid leading questions such as “Would an inventory app help?” Prefer specific recent behavior, frequency, workarounds, and consequences. Ask for an example rather than an idealized answer.

## Notes template

```text
Participant ID:
Segment and role:
Business size/location count (broad range only):
Current tools/workarounds:
Most recent receive workflow:
Most recent stock-out/sale workflow:
Most recent count discrepancy and correction:
Transfer workflow and availability point:
Reorder method and influencing quantities:
Top pain points (frequency + consequence):
Devices/connectivity/scanning:
Reports and trust/reconciliation method:
Direct quotes (only with consent; anonymized):
Observed behavior vs participant opinion:
Follow-up permission:
Researcher confidence / open questions:
```

## Synthesis and decision rule

After interviews, create a de-identified findings table with columns: theme, number of participants mentioning it, segments/roles, example evidence, current workaround, operational consequence, confidence, and product implication. Do not turn a single anecdote into a universal requirement. Select the first segment only if its needs and operational urgency recur across participants and can be served by the MVP without changing the ledger/tenant safety foundations. If segments diverge, record the trade-off for owner review instead of silently widening MVP scope.

## Completion criteria for PROD-001

- 5–8 completed interviews spanning at least two target segments.
- Notes are anonymized and distinguish observed past behavior from opinions.
- A segment choice and first workflow are supported by repeated evidence.
- Success metrics have a baseline or are explicitly deferred where participants cannot provide one.
- Findings and open questions are added to `user-personas.md`, `user-stories.md`, `product-requirements.md`, and `decisions.md`.
- Owner reviews the segment recommendation before PROD-002 is marked complete.

Until these criteria are met, PROD-001 stays IN_PROGRESS and dependent policy approval does not start.
