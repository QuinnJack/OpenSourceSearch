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
  // Ideally we should create a 'date-config.json', but for now we rely on 'pyscript.json' shared config.

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
