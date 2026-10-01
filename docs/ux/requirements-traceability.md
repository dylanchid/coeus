# Requirements traceability

**Status:** product-to-surface map. It prevents polished UI changes from weakening Coeus’s core promises.

## Principle coverage

| ID | Product requirement | Primary surface(s) | Evidence / acceptance | Status |
| --- | --- | --- | --- | --- |
| P1 | Sources over algorithms | Sources, Reader Ranked, Settings | Sources are user-selected; ranking shows reasons and user-authored inputs | Live |
| P2 | Finite pages over endless feeds | Reader, Discover | Feed windows and bounded lists; no infinite-scroll affordance or engagement feed | Live Reader; Discover must preserve this as it is wired |
| P3 | Useful controls over decorative chrome | Global shell, Sources, Settings | Every control has a clear label/purpose and a consequence; ambiguous icon controls are named | Partly live; audit required |
| P4 | Open formats over locked platforms | Archive, collections | Markdown/CSV/JSON export; canonical source links; collection RSS | Live |
| P5 | Local-first, optional account | Read, Sources, Archive, Sign in | Core reading/source/archive use works signed out; account copy explains added sync/publication value | Live; test comprehension |
| P6 | Publisher-respecting preview | Reader preview | Original link prominent; policy-safe reader/metadata fallback is distinguished from publisher page | Live; ongoing policy QA |
| P7 | Human context with attribution | Discover, collection, profile | Clip/post cannot detach excerpt from canonical link; no global engagement rank | Partly live / integration in progress |

## Requirement-to-screen matrix

| Requirement | Screens / components | Key acceptance check | Gap or dependency |
| --- | --- | --- | --- |
| Select and organize sources | `/sources`, `/`, Settings → Sources | Add/remove, hide/order, and preferences remain coherent across all three locations | Source-row progressive disclosure proposed |
| Search/filter the directory | `/sources` | Query + category + advanced filters compose; result count and reset are visible | Compact/drawer presentation proposed |
| Separate editorial and personal judgment | `/sources` | Featured uses directory rank; Your rating uses private rating; explanatory copy is visible at point of use | Details placement to test |
| Read in four modes | `/` | Grid/Top/Focus/Ranked have intelligible selection and shared story actions | None identified |
| Recover from a failed source | `/` | One source’s failure has inline retry and does not blank working sources | None identified |
| Save, annotate, and retrieve | `/`, Share sheet, `/archive` | Save succeeds visibly; item supports state/star/note/tags/collection/search | None identified |
| Export without lock-in | `/archive` | Whole archive and collection scope/export format are explicit | Include in usability chain F6 |
| Publish/follow curated objects | `/archive`, `/discover`, `/c`, `/u/[handle]` | Visibility, attribution, follow state, and RSS are truthful and discoverable | Discover local preview still needs full account-backed wiring |
| Account lifecycle | `/signin`, `/welcome`, account menu | Optionality, profile creation, sign-out, deletion and local/cloud boundary are explicit | Validate F8 |
| Accessibility and responsive use | Every interactive screen | Named controls, keyboard equivalence, contrast/focus/reflow | Baseline audit required, especially muted metadata and icons |

## Decision log

| Decision | Why | Owner / next evidence |
| --- | --- | --- |
| Preserve the archival newsroom visual language | It supports calm scanning and product character | Design system; validate contrast without flattening hierarchy |
| Do not remove advanced source controls | Power users need them; the problem is timing and density | Prototype F2–F5 before implementation |
| Treat custom feed addition as creation | It has a different intent and error model than catalog search | Test F4 label and entry point |
| Reserve persistent source-row action for Add/Added | Repeated rows need a clear scan target | Test details/overflow discoverability for rating and preview |
| Keep ratings visibly private and distinct from featured rank | Protects the product’s transparent editorial model | Test F5 comprehension |

## Implementation handoff checklist

- Link the change to the applicable requirement and screen row above.
- Define loading, empty, error, success, signed-out, and narrow-layout states before coding.
- Add unit/component coverage for interaction logic; add end-to-end coverage for cross-page or persisted flows.
- Verify no change makes login mandatory for a previously local-first task.
- Run the accessibility release checks in the screen specification and complete the associated research task when the change affects a priority flow.
- Update this matrix, the PRD, and `HANDOFF.md` only when the stated behavior is actually shipped.
