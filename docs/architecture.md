# OpenSourceSearch Architecture & Delivery Plan

## Goals
- Deliver a privacy-preserving verification experience that keeps user-supplied API keys on-device for as long as possible.
- Support rapid iteration on new analysis capabilities without destabilising the core upload and review workflow.
- Maintain a modular codebase that scales with additional providers, analyses, and collaboration tooling.

## High-Level System Overview
- **Client Application (React + Vite)**: Renders the workspace, orchestrates uploads, manages state, and coordinates background jobs.
- **Integration Layer (client-side SDKs)**: Adapter wrappers around third-party APIs (OpenAI, Vision APIs, search providers) instantiated with user-provided keys.
- **Local Persistence**: IndexedDB (via `idb` or similar) for large artefacts (files, analysis results), `localStorage`/`sessionStorage` for small preferences, in-memory caches for volatile state.
- **Web Workers**: Offload heavy computation (hashing, EXIF extraction, media preprocessing) to keep the UI responsive.
- **Optional Relay (future)**: Minimal backend only when required for workflow features that cannot stay client-only (shared workspaces, audit trails).

### Layered Architecture
1. **App Shell**: Entry point, routing, React providers (theme, query caching, feature flags).
2. **Feature Modules**: Vertical slices (media verification, circulation search, key management) exposing pages, widgets, and business logic.
3. **Shared Libraries**: Cross-cutting utilities (design system, storage, analytics, hooks, types).
4. **Service Adapters**: Thin clients that abstract provider-specific requests and response normalisation; accept API keys at call time or from a client-side vault.

### Core Client Data Flow
1. **User uploads media** → validated locally and stored in memory / IndexedDB.
2. **User enters API keys** → stored via secure client-side vault (AES via Web Crypto) and loaded into the integration layer on demand.
3. **Analysis pipeline runs** → orchestrator dispatches to enabled providers through adapters; results streamed back and cached.
4. **UI updates** → React Query (or equivalent) manages async status, optimistic updates, and background refresh.

### Key & Secrets Handling
- Never persist keys in plaintext; derive an encryption key from a user-provided passphrase when possible.
- Encapsulate key access through a dedicated `KeyStore` service that exposes `getClient(providerId)` for feature modules.
- Maintain an in-memory mirror that is cleared on tab close or inactivity timeout.

### API Integration Strategy
- Define provider contracts in `src/services/providers/types.ts`.
- Implement adapters in `src/services/providers/{provider}/client.ts`, each returning typed responses.
- Introduce a pipeline controller (`src/features/media-verification/services/pipeline.ts`) responsible for sequencing provider calls, fallbacks, and merging outputs.

### State Management & Communication
- Use React Query (or TanStack Query) for async data fetching and caching; fallback to React context for global ephemeral state (theme, active workspace).
- Share feature state through colocated hooks inside each module.
- Standardise events (e.g., analysis completed, upload failed) via a lightweight event emitter to decouple UI elements.

### Performance & Resilience
- Implement lazy loading for feature bundles.
- Use Web Workers for CPU intensive tasks (perceptual hashing, metadata parsing).
- Provide retry/backoff utilities and graceful degradation when providers are unavailable.

### Testing & Quality
- Unit tests per feature module; contract tests for provider adapters using recorded fixtures.
- Smoke E2Es scripting the client app against mocked adapters to guarantee offline determinism.
- Snapshot visual regression coverage for critical UI states (upload, analysis summary).

## Delivery Roadmap

### Epic 1 — API Key Management, Security, Frontend Skeleton
- Build key vault service with encryption helpers and inactivity timers.
- Create onboarding flow for entering, validating, and testing provider keys.
- Surface provider status indicators in the UI shell.
- Document security posture, handling guidelines, and fallback behaviours.

### Epic 2 — Media Upload & Workspace Experience
- Finalise drag-and-drop, file validation, and compression heuristics.
- Persist uploads to IndexedDB and hydrate state on reload.
- Introduce a workspace timeline showing upload history and status.
- Add error recovery flows (re-try upload, replace file).

### Epic 3 — Analysis Pipeline Foundation
- Create provider adapter interfaces and implement initial provider clients.
- Build analysis orchestrator with progress tracking and cancellation support.
- Normalise provider responses into shared domain models.
- Render analysis results with loading skeletons and empty states.

### Epic 4 — Insights & Collaboration
- Implement circulation/context panels with saved searches and external linkouts.
- Add annotation/commenting primitives on media artefacts.
- Support export (PDF/report) and shareable snapshots once backend is introduced.
- Integrate activity log for provenance and auditability.

### Epic 5 — Observability & Tooling
- Add telemetry hooks (performance timers, error boundaries, logging).
- Configure storybook (or similar) for design system components.
- Set up automated testing pipelines (unit + integration).
- Establish release checklist (feature toggles, migration scripts for storage).

