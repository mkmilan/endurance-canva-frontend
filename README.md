# Endurance Canvas — frontend

A mobile-friendly studio for creating interactive endurance explanations through conversation.

**Status: documentation baseline, 2026-11-03. Application code has not been scaffolded.** There are no installation/start commands or deployed frontend to use yet.

## Project documents

The shared plan lives in [mkmilan/endurance-canva-dosc](https://github.com/mkmilan/endurance-canva-dosc). The repository is named `dosc`; links intentionally use that spelling.

- [Product and scope](https://github.com/mkmilan/endurance-canva-dosc/blob/main/01-product-and-scope.md)
- [Architecture and stack](https://github.com/mkmilan/endurance-canva-dosc/blob/main/02-architecture-and-stack.md)
- [Features and build order](https://github.com/mkmilan/endurance-canva-dosc/blob/main/03-features-and-build-plan.md)
- [Current progress](https://github.com/mkmilan/endurance-canva-dosc/blob/main/04-progress.md)
- [Quality and later publishing](https://github.com/mkmilan/endurance-canva-dosc/blob/main/05-quality-and-publishing.md)

Backend: [mkmilan/endurance-canva-backend](https://github.com/mkmilan/endurance-canva-backend).

## Planned stack and responsibilities

Plain JavaScript, Next.js App Router, React, and Tailwind. Use React/SVG for the initial zone diagram and Recharts where plotted graphs justify it. Pin compatible current packages and the Node runtime at scaffolding; use npm and commit the lockfile.

This repository will contain the conversation interface, interactive preview, manual editing, browser draft storage, revisions, and JSON/PNG exports. AI calls pass through a thin server route to the backend; no provider credentials belong in client code. Viewer slider changes should remain local and separate from saved author defaults.

The backend owns the canonical lesson schema. Consume its generated contract artifact pinned to a backend commit; do not maintain an independent handwritten schema.

## First implementation

M1 builds one deterministic three-zone power scene with fictional inputs, readable boundary labels, keyboard/touch controls, and a mobile layout. M2 then proves prompt-based creation and a meaningful conversational refinement. The first useful studio is complete at M3 with editing, reliable save/reopen, undo, and export.

Add verified setup/run/test commands here when the scaffold exists. Keep feature status in the central progress document, and link frontend commits there when tasks are completed.
