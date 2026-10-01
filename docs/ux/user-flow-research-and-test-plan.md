# User-flow research and test plan

**Status:** proposed research and validation plan. It records hypotheses and evidence to collect; it does not claim unperformed user research.

## Research posture

Coeus is for self-directed readers who prefer a deliberate, finite reading stack to an opaque engagement feed. The main risk is not a lack of controls; it is making the control surface compete with the reading task. We will test task completion and comprehension with moderated, think-aloud sessions, then use product telemetry only for aggregate journey health—not behavioral ranking or hidden personalization.

This method is deliberately task-based: [GOV.UK’s moderated-testing guidance](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) recommends observing people attempt realistic goals and using think-aloud to understand their choices. Its [benchmarking guidance](https://www.gov.uk/service-manual/measuring-success/usability-benchmarking-a-website-or-whole-service) supports measuring success, time, abandonment, confidence, and perceived difficulty against clear task outcomes.

## Participants and protocol

- Recruit 8–10 likely users across heavy RSS/news readers and people returning to intentional web reading; include keyboard users and at least two participants who use zoom, high contrast, or assistive technology.
- Run 45–60 minute remote moderated sessions. Do not describe the intended navigation in the prompt.
- Test no more than five tasks per participant; rotate non-dependent tasks to reduce learning effects.
- Record task success (unassisted / assisted / failed), time, first-click/location, errors, confidence (1–5), difficulty (1–5), and verbatim comprehension signals.
- Establish a baseline on the present Sources layout before testing the progressive-disclosure prototype. Compare the same tasks and success criteria.

## Priority flows

| Flow | User goal and success definition | Rationale / hypothesis | Test prompt | Measures and decision rule |
| --- | --- | --- | --- | --- |
| F1: First reading session | Read a finite cross-source session and open one original article | The product’s core promise is deliberate reading, not a feed that never ends. | “You have ten minutes to catch up on science and technology. Show me what you would read and open one story.” | Success: reaches an appropriate filtered/view state and opens original without help. Watch whether finite-session language is understood. Investigate if fewer than 80% succeed. |
| F2: Discover a source | Find a publication about a stated subject, inspect why it fits, add it | Browse subjects should aid exploration without delaying a directed search. | “You want a thoughtful climate source. Find one you would add to your Reader and explain why.” | Compare time, subject-browser interaction, query use, and rationale. The collapsed-browser design wins only if it maintains discovery success while lowering time/cognitive load for directed search. |
| F3: Refine the directory | Narrow source results by region/language/type, then reset | Advanced filters should be powerful but not dominate the first scan. | “Find a daily English-language primary source covering US policy. Then show all sources again.” | Success includes correctly identifying active filters and clearing them. If people miss active constraints or cannot reset unaided, keep visible chips/clear-all and revise filter entry. |
| F4: Add a custom source | Add a known RSS/Atom URL rather than search the catalog | Creation is conceptually separate from filtering. | “This publication is not in the directory. Add this feed to your Reader.” | Measure whether participants choose the custom-source entry without first attempting search/filter. Require 80% unassisted discovery before shipping new label/treatment. |
| F5: Personal preference without editorial confusion | Set a personal source rating, then understand Featured ordering | Ratings must not imply that Coeus is algorithmically changing editorial rank. | “Mark this source as one you especially value. Now explain what ‘Featured’ and ‘Your rating’ mean.” | Success requires both action and accurate explanation. If fewer than 80% explain the distinction, revise placement/copy—not just tooltip text. |
| F6: Save and retrieve context | Save an article, find it later, add a note and export it | Archive value is retrieval plus portability, not merely a bookmark count. | “Keep this article with a note for an essay, put it in a collection, and export that collection.” | Track completed chain and recovery from mistakes. Any ambiguity around export scope, privacy, or save confirmation is release-blocking. |
| F7: Share with attribution | Publish or share a sourced clip without detaching original URL | Attribution is a hard product rule and public sharing has higher consequence. | “Share the passage you found useful and explain what readers will see.” | Success requires source attached and accurate expectation of audience/visibility. Misunderstanding public versus local preview is a release blocker. |
| F8: Optional account | Sign in after local use and state what changes | Account must enrich—not coerce—the local-first experience. | “You want access to your archive on another device. What would you do, and what stays on this device?” | Success: finds sign-in and explains local/cloud boundary. Review all claims that suggest account is required. |

## Design hypotheses to validate

1. **Progressive subject browsing:** an initially open, collapsible subject index helps exploratory arrivals; collapsing it after an active search/filter improves directed-task speed without reducing discovery confidence.
2. **One row action:** exposing only Add/Added on source rows reduces scanning burden; rating/preview remain findable in row details.
3. **Separate custom-source entry:** a bordered creation trigger prevents users from treating a missing directory result as a broken search.
4. **Explicit context beats clever icons:** labeled or reliably tooled controls improve first-use comprehension more than visual minimalism harms it.
5. **Transparent state earns trust:** readers can explain ranking, preview, private/public, and local/synced states when the interface surfaces the explanation at the decision point.

## Evaluation matrix

| Dimension | Instrument | Target |
| --- | --- | --- |
| Task effectiveness | Moderated task success | ≥80% unassisted on F1–F6; 100% correct comprehension of public/private action before F7 completion |
| Efficiency | Median time and excess interactions vs. baseline | Sources F2/F3/F4 improve or hold time while difficulty does not worsen |
| Confidence | Post-task 1–5 rating | Median ≥4 for F1–F6 |
| Findability | First meaningful click/location | ≥80% begin each task in the intended area without moderator cue |
| Accessibility | Keyboard, screen-reader, 200% zoom, contrast audit | No keyboard trap; all actions named; AA contrast/focus issues fixed before release |
| Product honesty | Comprehension probes | ≥80% accurately state source attribution, account optionality, and editorial-vs-personal ordering |

## Instrumentation boundaries

Permitted aggregate events: `source_search_started`, `source_filter_changed`, `source_added`, `custom_source_started/completed/failed`, `article_saved`, `archive_exported`, `collection_published`, and flow completion/error counts. Do **not** capture article content, notes, queries, raw URLs, or use events to rank people or sources. Provide a documented opt-out/consent posture before collecting production telemetry.

## Test artifacts and release gate

For each tested flow, retain: task script, prototype/build version, participant segment, observation notes, success/time table, accessibility findings, and the decision taken. A design is ready for implementation only when it has an owner, states/edge cases, acceptance criteria, and no unresolved high-severity comprehension or accessibility issue. Re-run the benchmark after material changes; usability testing should be continuous alongside technical QA, consistent with [GOV.UK’s service-quality guidance](https://www.gov.uk/service-manual/technology/quality-assurance-testing-your-service-regularly).
