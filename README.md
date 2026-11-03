# Endurance Canvas — frontend

A responsive studio for turning endurance concepts into interactive explanations. The first working release builds one three-zone cycling-power lesson, with fictional thresholds, a live explorer, manual editing, and a guided conversation.

**Current stage: a usable guided demo.** Conversation responses are prepared by the backend. This release does not call a live AI model or create training recommendations. Drafts stay in the current browser; there are no accounts or cloud saves yet.

## Run locally

Use **Node.js 24** and npm. The lockfile pins Next.js 16.4.4, React 19.3.1, Tailwind CSS 4.3.4, and the supporting build dependencies.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The canvas, editor, local library, and exports work without a backend. Conversation needs the [backend](https://github.com/mkmilan/endurance-canva-backend) running separately.

```dotenv
BACKEND_API_URL=http://127.0.0.1:4000
BACKEND_SERVICE_TOKEN=replace-with-the-backend-service-token
```

For a local backend that has no service token configured, leave `BACKEND_SERVICE_TOKEN` empty. For deployment, put the same secret in the frontend's server environment and the backend's `BACKEND_SERVICE_TOKEN`. Never use a `NEXT_PUBLIC_` prefix for this token or a model key.

```sh
npm test        # Data-model, boundary, import, and revision checks
npm run build  # Production build
npm start      # Run that build on port 3000
```

## What works

- **Explore:** move the power slider, inspect the exact LT1/LT2 boundaries, reset, or explicitly use the explored value as the lesson's starting value. Exploring by itself does not change the authored default.
- **Create through conversation:** ask for the three-zone explanation, simpler wording, more detail, a different power example, a threshold change, or an accent colour. Suggestions are previewed before acceptance. Unsupported requests explain the available scope.
- **Edit:** change title, paragraph text, threshold values, starting power, audience label, and accent. Changing the audience label is metadata; ask the conversation to simplify or expand the actual wording. Applied changes create a new revision.
- **Keep control:** stop generation, reject a suggestion, undo up to 12 content revisions, duplicate a lesson, or start a new one. Late responses cannot overwrite newer edits.
- **Save locally:** IndexedDB keeps lessons and the last open draft. The app saves after edits and offers an explicit Save lesson action. Switching lessons flushes the current draft first. Storage failures leave the draft open and point to export.
- **Back up and export:** JSON preserves the full editable lesson and a source catalogue snapshot. PNG creates a 1080 × 1350 visual summary of the currently displayed power. Import validates the schema/version, creates a new unreviewed draft, and reconciles evidence against the bundled catalogue rather than trusting imported URLs or review flags.
- **Review evidence:** Sources explains the fictional inputs, display conventions, and precise scope of the research reference. Mark as reviewed records a local author check for that revision; any content edit invalidates it.
- **Use a phone:** switch between conversation and canvas, with readable diagram labels, touch/keyboard slider controls, and accessible names on compact buttons.

Example prompts:

- `Explain three training zones`
- `Make it simpler`
- `Add more detail`
- `Explain LT1`
- `Show an example above LT2`
- `Set power to 220 W`
- `Set LT1 to 170 W`
- `Use a blue accent`

## Project layout

| Location | Responsibility |
| --- | --- |
| `app/page.js`, `app/layout.js`, `app/globals.css` | Next.js application shell and responsive styles |
| `app/api/status/route.js` | Server-side backend status check; allows time for a free Render service to wake |
| `app/api/generate/route.js` | Same-origin server proxy with body limits, timeouts, and service-token authentication |
| `src/components/Studio.js` | Conversation, draft state, revision controls, library, and export actions |
| `src/components/ZoneCanvas.js` | Deterministic SVG display and temporary exploration state |
| `src/components/EditPanel.js`, `SourcesPanel.js` | Manual editing and evidence review |
| `src/lib/lessons.js`, `storage.js` | Validated lesson transformations, import/export, and IndexedDB adapter |
| `src/lib/export-image.js` | Standalone canvas-based PNG export |
| `src/generated/contracts/` | Exact contract files copied from the backend, with SHA-256 provenance |
| `tests/lessons.test.js` | Meaningful model, boundary, validation, and import checks |

## Shared contract

The backend owns the lesson schema, validator, evidence catalogue, and example. The frontend does not maintain a second handwritten version. Four exact copies and a provenance manifest are committed under `src/generated/contracts/`.

When the sibling backend checkout changes, run:

```sh
npm run sync:contracts
# Or specify another checkout:
npm run sync:contracts -- /absolute/path/to/endurance-canva-backend
npm test
npm run build
```

`provenance.json` records the backend commit, whether its contracts had uncommitted changes, and each file's SHA-256 hash. Release copies should come from a clean, published backend commit. The build itself does not need a backend checkout or network access to GitHub.

The classifier deliberately includes equality in Zone 2: below LT1 is Zone 1, LT1 through LT2 is Zone 2, and above LT2 is Zone 3. Exact thresholds also receive an explicit boundary label. This is a display convention, documented in the lesson assumptions.

The cited Seiler and Kjerland study used ventilatory thresholds. Its citation supplies context for a three-zone approach; it does not validate the demo's fictional LT1/LT2 wattages. The interface and PNG say so explicitly.

## Vercel testing deployment

Import this repository as a Next.js project, use Node.js 24, and set the two server environment variables above. `BACKEND_API_URL` should be the Render HTTPS service origin. Keep test deployment access controls enabled while developing. Test builds are marked `noindex`.

`/api/status` reports backend availability. The diagram remains usable while Render wakes, and the conversation shows connection status and Retry. Generation errors preserve the current draft.

The public testing proxy **permits guided-demo mode only**. If the backend reports live mode, it refuses generation. Enabling a paid model later requires owner access controls and an explicit implementation change; adding an API key alone does not open a public model endpoint.

## Current limits and next steps

There is one supported lesson type and a fixed source catalogue. PNG is a visual summary, while JSON is the complete editable backup. Review status is an author's local record, not independent scientific approval. Clearing browser data removes local drafts; moving between devices requires JSON export/import.

Next work is owner access and real model integration behind the same validated contract, followed by additional useful lesson types. Cloud storage, website embeds, and public publishing can follow a tested authoring workflow. MongoDB Atlas is not needed or connected for this local-draft stage.

## Shared project documents

The plan lives in [mkmilan/endurance-canva-dosc](https://github.com/mkmilan/endurance-canva-dosc). The repository is named `dosc`; links intentionally use that spelling.

- [Product and scope](https://github.com/mkmilan/endurance-canva-dosc/blob/main/01-product-and-scope.md)
- [Architecture and stack](https://github.com/mkmilan/endurance-canva-dosc/blob/main/02-architecture-and-stack.md)
- [Features and build order](https://github.com/mkmilan/endurance-canva-dosc/blob/main/03-features-and-build-plan.md)
- [Current progress](https://github.com/mkmilan/endurance-canva-dosc/blob/main/04-progress.md)
- [Quality and later publishing](https://github.com/mkmilan/endurance-canva-dosc/blob/main/05-quality-and-publishing.md)
