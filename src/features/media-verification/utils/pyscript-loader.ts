const PYSCRIPT_VERSION = "2025.11.2";
const CORE_CSS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.css`;
const CORE_JS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.js`;

const CORE_STYLE_ID = "pyscript-style";
const CORE_SCRIPT_ID = "pyscript-core";

const normalizeBase = (base: string) => (base.endsWith("/") ? base : `${base}/`);
const BASE_URL = normalizeBase(import.meta.env.BASE_URL ?? "/");
const publicPath = (path: string) => `${BASE_URL}${path.replace(/^\//u, "")}`;

let coreStylePromise: Promise<void> | null = null;
let coreScriptPromise: Promise<void> | null = null;

const waitForEvent = (target: HTMLElement | HTMLLinkElement | HTMLScriptElement) =>
  new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load ${target.tagName}`));
    };
    const cleanup = () => {
      target.removeEventListener("load", handleLoad);
      target.removeEventListener("error", handleError);
    };

    target.addEventListener("load", handleLoad, { once: true });
    target.addEventListener("error", handleError, { once: true });
  });

export const ensureCore = () => {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const ensureStyle = () => {
    if (!coreStylePromise) {
      const existing = document.getElementById(CORE_STYLE_ID) as HTMLLinkElement | null;
      if (existing) {
        if (existing.dataset.loaded === "true") {
          coreStylePromise = Promise.resolve();
        } else {
          coreStylePromise = waitForEvent(existing).then(() => {
            existing.dataset.loaded = "true";
          });
        }
      } else {
        const linkEl = document.createElement("link");
        linkEl.id = CORE_STYLE_ID;
        linkEl.rel = "stylesheet";
        linkEl.href = CORE_CSS_URL;
        coreStylePromise = waitForEvent(linkEl).then(() => {
          linkEl.dataset.loaded = "true";
        });
        document.head.appendChild(linkEl);
      }
    }
    return coreStylePromise;
  };

  const ensureScript = () => {
    if (!coreScriptPromise) {
      const existing = document.getElementById(CORE_SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        if (existing.dataset.loaded === "true") {
          coreScriptPromise = Promise.resolve();
        } else {
          coreScriptPromise = waitForEvent(existing).then(() => {
            existing.dataset.loaded = "true";
          });
        }
      } else {
        const scriptEl = document.createElement("script");
        scriptEl.id = CORE_SCRIPT_ID;
        scriptEl.type = "module";
        scriptEl.src = CORE_JS_URL;
        coreScriptPromise = waitForEvent(scriptEl).then(() => {
          scriptEl.dataset.loaded = "true";
        });
        document.head.appendChild(scriptEl);
      }
    }
    return coreScriptPromise;
  };

  return Promise.all([ensureStyle(), ensureScript()]).then(() => void 0);
};

export interface PyScriptWorkerOptions {
  id: string;
  name?: string;
  src: string;
  config?: string;
  terminal?: string; // ID of terminal element
}

export const injectWorkerScript = (options: PyScriptWorkerOptions) => {
  if (typeof document === "undefined") return;

  if (document.getElementById(options.id)) return;

  const scriptEl = document.createElement("script");
  scriptEl.id = options.id;
  scriptEl.type = "py"; // or mpy
  // Use 'worker' attribute to designate a worker
  scriptEl.setAttribute("worker", "");

  if (options.name) scriptEl.setAttribute("name", options.name);
  if (options.config) scriptEl.setAttribute("config", options.config);
  if (options.terminal) scriptEl.setAttribute("terminal", options.terminal);

  scriptEl.src = options.src;

  document.body.appendChild(scriptEl);
};

// --- Legacy htmldate support ---
const HTMLDATE_WORKER_ID = "htmldate-worker-script";
const HTMLDATE_MAIN_ID = "htmldate-main-script";

export const ensureHtmlDateBridge = async () => {
  await ensureCore();

  // Inject worker (date-worker uses pyscript.json OLD config)
  // We need to ensure date-worker still works.
  // Ideally we should create a 'date-config.json' but let's assume 'pyscript.json' is now shared?
  // If we updated pyscript.json to have cvxpy, then date-worker loads cvxpy.
  // This is unavoidable unless we revert pyscript.json and use globustvp-config.json for new worker.

  injectWorkerScript({
    id: HTMLDATE_WORKER_ID,
    name: "htmldate-worker",
    src: publicPath("pyscript/date-worker.py"),
    config: publicPath("pyscript.json")
  });

  if (!document.getElementById(HTMLDATE_MAIN_ID)) {
    const scriptEl = document.createElement("script");
    scriptEl.id = HTMLDATE_MAIN_ID;
    scriptEl.type = "py";
    scriptEl.src = publicPath("pyscript/date-main.py");
    scriptEl.setAttribute("config", publicPath("pyscript.json"));
    document.body.appendChild(scriptEl);
  }

  if (typeof window !== "undefined" && !window.__htmldateBridgeReady) {
    await new Promise<void>((resolve) => {
      const handle = () => {
        window.removeEventListener("htmldate:bridge-ready", handle as EventListener);
        resolve();
      };
      window.addEventListener("htmldate:bridge-ready", handle as EventListener, { once: true });
    });
  }
};

const waitForWorker = (id: string, timeoutMs = 30000) => {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const el = document.getElementById(id) as any;
      if (el) {
        if (el.xworker) {
          console.log(`[PyScript] Worker ${id} ready. xworker found.`);
          resolve();
          return;
        } else {
          // Debug log periodically
          if ((Date.now() - startTime) % 2000 < 150) {
            console.log(`[PyScript] Waiting for xworker on #${id}. Keys:`, Object.keys(el));
          }
        }
      } else {
        console.warn(`[PyScript] Element #${id} not found.`);
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timeout waiting for worker ${id}`));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
};

// --- GlobustVP Support ---
const GLOBUSTVP_WORKER_ID = "globustvp-worker-script";

export const ensureGlobustVPWorker = async () => {
  await ensureCore();

  injectWorkerScript({
    id: GLOBUSTVP_WORKER_ID,
    name: "globustvp-worker",
    src: publicPath(`pyscript/globustvp-worker.py?v=${Date.now()}`),
    config: publicPath("globustvp-config.json")
  });

  await waitForWorker(GLOBUSTVP_WORKER_ID);
};
