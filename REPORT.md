# OpenSourceSearch: Feature Showcase Report

## Executive Summary
OpenSourceSearch brings a privacy-first, browser-based workspace for analysts who must evaluate the authenticity, provenance, and context of media in fast-moving situations. The interface guides investigators from uploading content through layered intelligence cards, geospatial context, and forensic tooling without ever sending their raw artifacts to a central server. Every tab, toggle, and recommendation exists to help both new and experienced analysts tell the story of an image or video with confidence and traceability.

The following sections serve two audiences: analysts who need to understand what each service delivers and future engineers who will maintain or extend the platform. Where it helps, each feature description is followed by a short “Developer Notes” block that points to the relevant modules and data flows without cluttering the user-facing explanation.

---

## 1. Dashboard & Upload
**User overview:** The landing space invites you to drag-and-drop files, paste a public URL, or grab a sample asset from the built-in gallery. A graceful upload status delivers instant previews for JPGs, PNGs, GIFs, and PDFs, while video uploads automatically capture representative frames for inspection. Colorful badges and progress indicators guide analysts through the ingestion stage, which also extracts metadata, builds short-lived previews, and prepares every item for downstream analysis.

**Developer notes:** Upload state is managed inside the `FileUploader` component chain, which synthesizes `UploadedFile` records, sources base64 or public URLs, extracts EXIF data, and maintains simulated progress for a snappy experience. Video frames are split using a helper that seeks the media, captures canvasses, and converts each still into an independent entry.

**Clicking Analyze (flow):** When you click **Analyze** on an upload row, the UI immediately switches that row into a loading state so you can tell the system is working. From there the app launches multiple pipelines asynchronously—some run locally in the browser (like metadata parsing and frame preparation), and some call out to enabled providers (AI detection, web/circulation matching, and location analysis). Results appear as soon as each pipeline completes, rather than waiting for every step to finish, which is why you may see certain cards populate sooner than others.

The analysis flow starts by ensuring downstream services have what they need. If a service requires a public image URL (for example, certain fact-check and grounded location workflows), the app will first obtain or generate a usable reference. If the public URL isn’t available yet, it will fail gracefully and ask you to retry later—this avoids producing misleading “no results” outputs from providers that simply cannot see local-only files.

Once prerequisites are satisfied, OpenSourceSearch fans out the work: circulation matching can run early so those matches can become extra context for geolocation, while AI detection can run in parallel because it doesn’t depend on web matches. For videos, the same process is applied per extracted frame—frames behave like independent photos, so you can step through them and compare results over time without re-uploading the video.

When all started tasks have either succeeded or failed, the row transitions to “analysis complete” and you can continue into the full verification workspace. Importantly, a failure in one pipeline does not block the others: disabled toggles, missing API keys, rate limits, or unreachable URLs only affect that specific card or service, while the rest of the investigation still yields useful evidence.

The settings modal keeps all integrations under quick control: toggles remember whether SightEngine, Gemini, Google Vision, Google Images, or the PyScript “htmldate” worker should run, and a BYOK form sandbox keeps API credentials inside the browser with optional overrides and remote defaults. Theme and badge style preferences persist via context providers so every analyst can tailor the workspace without guessing where the controls live.

**Developer notes:** API toggles and key storage live in shared configuration helpers that read environment variables, localStorage overrides, and a remote base64 payload. The theme context simply toggles a `dark-mode` class, while badge preference is another small context that records the analyst’s chosen palette.

For publication date lookups, a PyScript worker listens for custom events, fetches the target HTML through configurable proxies, and runs the `htmldate` package to return original/last update timestamps. These timelines later enhance Circulation data without ever requiring a backend.

**Developer notes:** `usePublicationDates` listens for worker events, caches results, and shares them with downstream components responsible for sorting matches. PyScript’s bridge sits under `/public/pyscript` with a main script that forwards requests and a worker that installs `htmldate` lazily.

---

## 2. Validity Tab
**User overview:** The Validity tab is where you assess whether the media you are examining came from a camera, a generative model, or a manipulated source. Four stacked cards keep the most critical signals near the top of the investigation.

  * **AI Detection** watches the image for signs of generative content using the configured SightEngine call and highlights how confident the system is in that judgment. If the score is high, a cautionary badge appears; if it’s low, you see a calmer indicator. The progress bar stays visible so you can tell how much signal has been gathered while the API response is still streaming in.
  * **Metadata** reveals EXIF, GPS presence, and any values captured at the time of capture. When metadata is stripped, the card explains why that matters and what you can infer about how the file was shared.
  * **Fact Check** performs a Google Claim Review lookup against the image. If a match exists, it surfaces the publisher, rating, snippet, preview image, and link so you can quickly cite the facts already established by trusted outlets.
  * **AI Synthesis** presents a human-readable summary of what the platform thinks about the origin. If no source is known, it reminds you that you are still working through an unknown item.

**Developer notes:** Each card pulls from the shared `AnalysisData` model. SightEngine confidence is added in the upload hook, EXIF summaries are stored with metadata groups, fact checks fire after the analyst provides a public URL, and the synthesis card simply reflects what `buildAnalysisDataFromFile` reports back.

The fact-check card also implements graceful fallbacks—showing disabled messaging when the toggle is off, error text when the request fails, and placeholder guidance when no claims exist.

**Developer notes:** Fact-check searches use the helper that builds the Google Claim Review request, routes it optionally through the shared CORS proxy, normalizes the response, and caches claims so repeated requests don’t requery the API.

---

## 3. Circulation Tab
**User overview:** This tab helps you map where the image has appeared online. One card lists every relevant webpage that Google Vision found; another shows visually similar or near-matching images in a thumbnail grid.

  * **Found on Websites** organizes matches chronologically, surfaces publication date hints, and offers quick navigation to those pages. You can toggle between earliest and latest sightings and, when available, see precise crawl timestamps generated by the PyScript htmldate worker.
  * **Visually Similar Images** displays partial and similar matches with thumbnails that open the source when clicked. The grid respects responsive breakpoints and continues paginating so you can keep exploring without overloading the layout.

**Developer notes:** The Circulation cards consume Google Vision web detection output that is cached per uploaded file. Work on publication dates is delegated to the htmldate worker, while pagination helpers keep the UI responsive on both desktop and mobile.

Even without API keys, the cards remain informative: they show loading states, explain why results are missing, and maintain consistent padding so the analytics workflow never feels broken.

---

## 4. Context Tab (Geospatial)
**User overview:** Context blends map intelligence with Gemini-generated geolocation reasoning. A fully interactive map invites you to pan, zoom, and fly to the predicted coordinates, while cards beside the map summarize the answer, confidence, and supporting searches. Layers from hurricanes, wildfires, infrastructure, indigenous lands, traffic cameras, and weather alerts can be toggled to verify seasonality, landmarks, or hazard consistency.

Gemini produces both a location answer and suggested layers, so the map auto-enables overlays like national highways or perimeter polygons when they’re relevant. Clicking the “Visit” button or the textual location line flies the map to those coordinates. The map also includes a simple search control so analysts can compare the automatically inferred location to a manual geocode.

**Developer notes:** Map layers are configured in a shared manifest loaded from numerous government ArcGIS endpoints. Each layer describes its data source, view category (wildfires, hurricanes, etc.), and how to normalize its GeoJSON features. The Gemini integration builds structured prompts, parses the three-line responses, extracts citations, and feeds both the textual card and the layer recommender.

Traffic cameras fetch thumbnails via an Ottawa feed and optionally use the shared CORS proxy to avoid cross-origin issues, while First Alerts data requires a token that the settings modal exposes. Hover interactions compute distances between the camera/feature and the predicted location so you can explain why a particular overlay was relevant.

**Developer notes:** The map tab uses Mapbox GL via `react-map-gl`. Layer visibility is managed through caches that avoid redundant fetches, and computed centroids help the UI render hover cards with concise titles. The search control relies on the geocoding helper to translate text into coordinates, and `geolocationEnabled` ensures the map degrades gracefully when Gemini isn’t permitted.

---

## 5. Forensics Tab
**User overview:** When you need pixel-level assurance, the Forensics tab drops you into a mature analysis suite that performs error level analysis, noise checks, lighting consistency, clone detection, and perspective tools. It embeds the Photo Forensics application inside the page so you can keep your focus inside a single workspace.

Every time you select a different upload, the forensic engine receives the correct image, whether it originates from an uploaded file, a derived video frame, or a shared link. The integration rehabs the Photo Forensics UI so it mirrors the same preview card dimensions and corner radius, keeping the experience coherent.

**Developer notes:** The forensic UI is loaded lazily by fetching the static markup, injecting it through a helper component, and synchronizing the selected media file via simulated file inputs. CSS overrides keep the floating analysis panel aligned with the preview so the third-party bundle looks native inside the split-pane layout.

---

## 6. Verification Workflow
**User overview:** Behind the scenes, a single workflow orchestrator keeps track of the chosen file, its derived frames, and the analysis state for every integrator. When the analyst hits “Analyze,” the workflow stages the SightEngine request, then the Google Vision call, and finally the Gemini geolocation—only firing each step when its prerequisites are satisfied.

Caching prevents the same image from triggering duplicate API calls, while loaders and abort controllers keep the UI clean as analysts quickly switch tabs or files. Video uploads are treated as collections of frames, each tracked with its label and timestamp so you can slice through a sequence without leaving the tab.

**Developer notes:** The `useVerificationWorkflow` hook exposes handlers for continuing, backing out, toggling APIs, and selecting frames. It keeps dictionaries keyed by file ID for Vision, Gemini, layer recommendations, and geocoding results, ensuring that caches survive brief navigation. Mutations flow through `applyFrameMutation` so the selected file always matches the analysis data shown on the cards.

---

## 7. Platform & Supporting Infrastructure
**User overview:** OpenSourceSearch keeps everything inside the browser. API keys never leave your tab—they are stored locally and only used when you explicitly enable a service. The settings modal clearly documents whether a key comes from your browser, an environment variable, or a remote provider, and toggles let you disable entire categories of analysis if your current mission demands it.

Map styling adapts to light/dark themes, the split-pane resizes so preview and analysis stay visible, and the PyScript-backed publication-date pipeline keeps circulation timelines accurate without a backend relay. Every button, accordion, and badge follows the same design system, making it easy for returning analysts to find their next signal.

**Developer notes:** Scripts that prefetch data from ArcGIS endpoints into the `public/data` directory support offline previews or large map layers. Shared UI components live under the `/components/ui` tree, and the theme/badge preferences reside in small context providers that wrap the entire `App`.

---

## Developer Notes (Detailed References)
- Upload orchestration and metadata are handled in `/src/features/uploads/components/file-upload/`.
- API keys, toggles, and CORS proxy utilities live in `/src/shared/config/`.
- The verification workflow, Vision/Fact Check/Gemini adapters, and analysis data model are located under `/src/features/media-verification/`.
- Cards and controls for each tab are implemented beneath `/src/features/media-verification/components/media-verification-tool/` and `/src/components/analysis/`.
- PyScript workers for `htmldate` reside in `/public/pyscript/`, and forensic integration pulls the Photo Forensics build from `/photo-forensics/`.
- Map layers, view types, and layer fetchers are declared in `/src/features/media-verification/components/media-verification-tool/map-layer-config.ts`.
