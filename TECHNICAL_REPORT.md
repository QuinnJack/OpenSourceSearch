# OpenSourceSearch: Technical Architecture & Implementation Specification

**Version**: 1.2.0
**Context**: Engineering Documentation
**Scope**: Frontend Architecture, Signal Processing, Geospatial Systems

---

## 1. System Architecture Analysis

OpenSourceSearch functions as a **thick client** application. The architectural invariant is that no user data (uploaded media) is transmitted to a backend owned by the host. All compute intensity is offloaded to the client browser (Main Thread + Web Workers) or delegated directly to third-party endpoints (Google/SightEngine) via client-side API calls.

### 1.1. Runtime Environment
*   **Host**: Static file serving (SPA context).
*   **Core Runtime**: React 19 on the Main Thread.
*   **Computational Runtime**: PyScript (CPython compiled to WebAssembly) running in a dedicated Web Worker.
*   **Persistence Strategy**: `localStorage` is used exclusively for API credentials. Application state is volatile and resides in memory (React Context/Heap), ensuring a "hard wipe" on session termination.

### 1.2. Security Posture: The "Zero-Server" Model
We operate under a threat model where the central server cannot be trusted.
*   **Client-Side Secrets (BYOK)**: API keys for Google Vision or SightEngine are stored in `localStorage` (sandboxed to origin), read into memory only during execution, and sent directly to the vendor usage endpoints (e.g., `https://vision.googleapis.com/...`). No intermediate proxy logs the key.
*   **CORS Tunneling**: Certain legacy government datasets (e.g., Ottawa Traffic Cameras) lack `Access-Control-Allow-Origin` headers. We route *only* these specific GET requests through a stateless CORS proxy (`src/shared/constants/network.ts`). The proxy does not inspect bodies, only headers.

---

## 2. Frontend State Architecture: The Workflow Engine

The application does not use Redux. Instead, it implements a **Finite State Machine (FSM)** pattern encapsulated within a composite custom hook: `useVerificationWorkflow`.

### 2.1. The Composite Hook Pattern
The `useVerificationWorkflow.ts` hook acts as the centralized controller for the verification pipeline. It manages:
1.  **File Ingestion**: Blobs are converted to `objectURL` for zero-copy preview rendering.
2.  **Analysis Queues**: Manages the `loading`, `success`, and `error` states for parallel asynchronous analysis tasks (Vision API, Geolocation, EXIF extraction).
3.  **Frame Context**: For video files, it maintains a dictionary of extracted frames, effectively treating video analysis as a batch operation of `N` images.

### 2.2. Functional State Mutation
To avoid race conditions when multiple async analysis threads return for different files simultaneously, the application utilizes functional state updates. The `applyFrameMutation` utility acts as an internal reducer, ensuring atomic updates to specific file records in the `videoContext` array without causing unnecessary re-renders of the entire tree.

```typescript
// src/features/media-verification/hooks/useVerificationWorkflow.ts

// The updater signature allows strict type-safe mutations of a single file entity.
// This decouples the mutation logic from the current state at the time of definition (closure safety).
const applyFrameMutation = useCallback(
  (frameId: string, updater: (frame: UploadedFile) => UploadedFile) => {
    setVideoContext((prev) => {
      // Logic to find frame index is unoptimized O(n), acceptable for <100 frames
      // Deep clone of the array for immutability
      const frames = [...prev.frames];
      const targetIndex = frames.findIndex(f => f.id === frameId);
      if (targetIndex === -1) return prev;
      
      frames[targetIndex] = updater(frames[targetIndex]);
      return { ...prev, frames };
    });
  },
  [],
);
```

---

## 3. Concurrency Control & Race Condition Mitigation

In a high-throughput environment where an analyst might drag-and-drop 50 images or scrub through a video rapidly, concurrency management is critical to prevent "State tearing" (where UI shows data from Request A but the image from Request B).

### 3.1. The AbortController Pattern
We implement the `AbortController` Web Standard rigorously across all asynchronous boundaries.

1.  **Lifecycle Association**: 
    Each asynchronous task, whether it is a `fetch` request for a map layer or a complex call to the Google Vision API, is explicitly associated with a unique `AbortController` instance. We utilize a `useRef` dictionary pattern (e.g., `abortControllersRef.current[jobId]`) to track these controllers. This allows for granular cancellation: canceling a specific map layer download without interrupting other parallel verification tasks.

2.  **Cleanup Trigger**: 
    The trigger mechanism relies on React's `useEffect` cleanup return function. When a user checks a layer off, navigates to a different tab, or unmounts the component, this cleanup function fires immediately. This is critical not just for network efficiency, but for application stability—it prevents the "Can't perform a React state update on an unmounted component" memory leak warning, ensuring no stale promise callbacks ever attempt to write to the state of a destroyed component.

3.  **Fetch Integration**: 
    This is not merely a conceptual "ignore". When the `.abort()` signal is passed to the browser's `fetch` API, the browser actively terminates the underlying TCP connection (or HTTP/2 stream). This frees up the browser's constrained connection pool (typically limited to 6 parallel connections per domain), allowing pending requests to start sooner. It effectively acts as a bandwidth-saver in mobile or low-latency environments typical of field OSINT work.

4.  **Error Filtering**: 
    Handling aborts requires distinguishing between a "Network Error" (bad internet) and a "User Cancelled" event. Our exception handling logic specifically checks `error.name === 'AbortError'`. If meaningful, this error is swallowed silently. This prevents the User Interface from being flooded with red "Operation Failed" toast notifications simply because the user toggled a switch quickly. A cancellation is a successful user intent, not a system failure.

```typescript
// Example from ContextTab.tsx layer management
useEffect(() => {
    // 1. Create Controller
    const controller = new AbortController();
    abortControllersRef.current[layerId] = controller;

    // 2. Pass Signal
    fetchLayerData(url, { signal: controller.signal })
       .then(data => setData(data))
       .catch(err => {
           // 3. Ignore Abort Errors
           if (err.name !== 'AbortError') console.error(err); 
       });
       
    // 4. Cleanup
    return () => controller.abort();
}, [layerId]);
```

### 3.2. Request Deduping
To spare API quota and bandwidth, we implement cached-based deduping in `useVerificationWorkflow`. Before initiating a request (e.g., `requestVisionForFile`), the system checks three gates:
1.  **Is Data Cached?**: Checks `visionDataCache[fileId]`. If present, instant return.
2.  **Is Request In-Flight?**: Checks `visionLoadingCache[fileId]`. If true, the call is a no-op (idempotency).
3.  **Is API Enabled?**: Checks the user's toggle setting.

### 3.3. Video Frame Threading
When analyzing a video, the application treats it as a batch of independent images. However, we do not blast 100 API calls simultaneously (which would trigger Rate Limits from Google). 
*   **Current State**: The system essentially processes frames "on demand" as the user clicks them.
*   **Future Work**: Implementing a `p-limit` style queue to allow background processing of the entire video with a concurrency limit of 3-5 concurrent requests.

---

## 4. Geospatial System: Declarative Layer Abstraction

The Context Tab utilizes a **Declarative Layer Registry** pattern to decouple data fetching logic from map rendering logic. This addresses the "Massive View Controller" problem common in map applications.

### 4.1. The Registry Pattern (`map-layer-config.ts`)
The `DATA_LAYER_CONFIGS` array acts as the single source of truth. It adheres to the `DataMapLayerConfig` interface, enforcing strict contracts for:
*   `fetcher`: A pure async function returning data (GeoJSON/TopoJSON).
*   `accessors`: Logic for extracting centroids for fly-to operations.
*   `renderer`: (Implicit) definitions of paint properties in the consuming component.

The system handles diverse data formats (ArcGIS REST endpoints, static GeoJSON, OGC WFS) by normalizing them into a standard feature array *before* they reach the React render cycle.

### 4.2. Layer Cycle Management (`useDataLayerManager`)
The `ContextTab.tsx` component delegates map state management to `useDataLayerManager`.

**Mechanism**:
1.  **Change Detection**: The hook monitors the `layerVisibility` dictionary.
2.  **State Transition**: When a layer toggles `true`, it checks a memory cache.
3.  **Fetch & Memoize**: If uncached, it executes the `fetcher` defined in the config.
4.  **Signal Propagation**: The resulting data is passed to `Mapbox GL` sources via `react-map-gl`.

---

## 5. Extensibility and Scaling Protocol

### 5.1. Adding Geospatial Data Sources
The system is designed to allow adding new map layers without modifying UI code.
1.  **Schema Definition**: Extend `map-layer-config.ts` with a new `DataMapLayerConfig` object.
2.  **Normalization**: Write a transformer function to map source attributes (which vary wildly between agencies) to the strict application feature types.
3.  **Rendering**: Update `ContextTab.tsx` to map the layer ID to a Mapbox Style Specification.

### 5.2. Integrating New AI Models
1.  **Interface**: Define the response type in `src/shared/types/analysis.ts`.
2.  **Client**: Implement the fetch wrapper in `features/media-verification/api/`.
3.  **Integration**: Add a new standard boolean toggle in `useVerificationWorkflow` state and the Settings UI.

---

## 6. Performance Optimization Techniques

1.  **Code Splitting**: Routes and heavy components (`ForensicsTool`) are wrapped in `React.lazy`.
2.  **Mapbox Instance Recycling**: The GL context is expensive to initialize. We persist the map instance across tab switches where possible, or use strict cleanup to prevent WebGL context loss.
3.  **Memoization**: `useMemo` is aggressively used for geospatial computations (e.g., `computeGeoCentroid`) to prevent recalculation on every mouse-move event over the map.

---

## 7. Workflow Hook Decomposition
`useVerificationWorkflow.ts` fills every prop required by `<MediaVerificationTool />`. The hook tracks caches keyed by upload IDs so Vision, Gemini, layer recommendation, and geocode calls only run once per file, and exposes helpers that coordinate UI transitions.

```tsx
const requestVisionForFile = useCallback(
  async (file: UploadedFile): Promise<void> => {
    if (!enableGoogleVision) return;
    const cacheKey = file.id;
    if (visionDataCache[cacheKey] || visionLoadingCache[cacheKey]) return;

    const base64Content = file.base64Content;
    const imageUri = base64Content ? undefined : file.sourceUrl ?? file.previewUrl;
    if (!base64Content && !imageUri) return;

    setVisionLoadingCache((prev) => ({ ...prev, [cacheKey]: true }));
    applyFrameMutation(cacheKey, (frame) => ({
      ...frame,
      visionLoading: true,
      visionRequested: true,
    }));

    try {
      const result = await fetchVisionWebDetection({ base64Content, imageUri, maxResults: 24 });
      setVisionDataCache((prev) => ({ ...prev, [cacheKey]: result }));
      applyFrameMutation(cacheKey, (frame) => ({
        ...frame,
        visionWebDetection: result,
        visionLoading: false,
      }));
      /* ... */
    } finally {
      setVisionLoadingCache((prev) => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
    }
  },
  [enableGoogleVision, visionDataCache, visionLoadingCache, applyFrameMutation],
);
```

Because the hook splits responsibilities into caches such as `visionLoadingCache`, `geolocationDataCache`, `layerRecommendationCache`, and `geolocationCoordinatesCache`, the UI never retries an API unless required—this is the mechanism that prevents state tearing when analysts rapidly select frames or toggles.

## 8. Upload + Video Frame Handling
The uploader translates files dropped into the canvas into `UploadedFile` entries. Video files call `extractVideoFrames` so that each screenshot appears as its own entry (with timestamp labels), and metadata extraction happens immediately thereafter.

```tsx
const handleDropFiles = (files: FileList) => {
  const newFilesWithIds: UploadedFile[] = Array.from(files).map((file) => {
    const video = isVideoFile(file);
    return {
      id: Math.random().toString(),
      name: file.name,
      mediaType: video ? "video" : "image",
      previewUrl: video ? undefined : URL.createObjectURL(file),
      videoPreviewUrl: video ? URL.createObjectURL(file) : undefined,
      analysisState: "idle",
      exifLoading: true,
      geolocationRequested: false,
      sightengineConfidence: undefined,
      // ...
    };
  });

  setUploadedFiles((prev) => [...newFilesWithIds, ...prev]);
  newFilesWithIds.forEach(({ id }) => startSimulatedUpload(id));
};
```

`handleAnalyzeFile` (same file) ensures a public URL is available by calling `ensureSourceUrl`, toggles the `htmldate` worker, and dispatches SightEngine/Vision/Geolocation requests concurrently while falling back gracefully if credentials are missing.

## 9. Gemini Prompts & Map Layer Recommendations
Gemini receives a heavily scaffolded prompt so the answer is predictable—three lines, citations, and a confidence score (0-10). The helper first builds the prompt parts, optionally attaches base64 content, and sends the request via `GoogleGenAI`.

```ts
const PROMPT_TEXT = [
  "Where was this photo taken? Bias to Canadian specific context.",
  "Be as specific as possible: landmark/building + neighborhood/street + city + province/territory + country, when available.",
  "Respond with exactly three lines:",
  "1) Line 1 – only the best-guess location (e.g., 'Rideau Canal, Ottawa, Ontario').",
  "2) Line 2 – a concise explanation citing the evidence with inline citations.",
  "3) Line 3 – 'Confidence: <number>/10'. Treat this as the map zoom signal: 10 = very precise, 5 = regional.",
  "Do not include any additional text before or after these lines.",
].join(" ");
```

The adapter also offers layer recommendations: after Gemini returns a JSON blob, `parseRecommendedLayers` sanitizes IDs against `LOCATION_LAYER_MANIFEST` derived from `MAP_LAYER_CONFIGS`. The workflow then caches the recommendation and lets the map auto-toggle the suggested overlays (fire danger, highways, etc.).

## 10. Future Work (expanded)
* Add more context layers (NRC traffic cameras, perimeter/historical fire data, indigenous & remote community overlays) and allow analysts to hide/show various cards per their workflow.
* Batch video uploads via a queue (e.g., `p-limit`) so Vision/Gemini calls run with a concurrency limit of 3-5, preventing token exhaustion.
* Implement a “Write BLUF / Export PDF” workflow that compiles cards across Validity, Circulation, Context, and Forensics into a single shareable narrative.
* Surface a consolidated AI insight card that merges Gemini context, nearby map markers, circulation matches, and fact checks into one summary (maybe in the Forensics tab).
* Extend caching for GeoJSON viewers by pre-generating files with `scripts/fetch-map-layers.js` and hydrating them from `/public/data` to keep the map snappy offline.
