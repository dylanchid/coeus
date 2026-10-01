# Coeus UX documentation

**Purpose:** turn the product intent in [PRD.md](../PRD.md) into an implementation-ready map of the experience. These documents preserve the quiet editorial visual system while making its power-user controls easier to reveal as needed.

## How to use this set

| Document | Answers | Primary audience |
| --- | --- | --- |
| [Information architecture](./information-architecture.md) | What exists, how it is organized, and where a route belongs | Product, design, engineering |
| [Screen specifications](./screen-specifications.md) | What each screen contains, does, and says in every important state | Design, engineering, QA |
| [User-flow research and test plan](./user-flow-research-and-test-plan.md) | Why the priority journeys are shaped this way and how to validate them | Product, research, QA |
| [Requirements traceability](./requirements-traceability.md) | Which product principle and requirement each surface fulfills, and what remains | Product, engineering |

## Source of truth and notation

The PRD remains the source of product intent. `HANDOFF.md` remains the source of engineering delivery status. This set is a UX contract; it does not silently promote roadmap work to shipped functionality.

- **Live** — implemented in the current application.
- **Proposed** — a documented interaction/design change, not yet an implementation commitment.
- **Planned** — already present in the PRD roadmap or an explicitly identified gap.
- **Decision needed** — a meaningful product choice that should not be guessed during implementation.

## Design direction carried forward

Keep the paper ground, near-black rules, mono/editorial type, muted metadata, numbered lists, restrained blue link/tag treatment, and strong vocabulary. The governing interaction principle is **progressive disclosure**: show the action that moves the reader forward, reveal infrequent configuration only when it is relevant, and retain advanced control without making every row compete for attention.

The immediate application is the Sources directory: collapse subject browsing after a query/filter becomes active; compact the advanced filter rail; keep one persistent source action; move rating to a details state or overflow menu; distinguish custom-source creation from directory search; and audit the muted text, icon buttons, and focus indicators.
