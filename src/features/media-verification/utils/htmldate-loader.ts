const PYSCRIPT_VERSION = "2025.11.2";
const CORE_CSS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.css`;
const CORE_JS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.js`;

const CORE_STYLE_ID = "htmldate-pyscript-style";
const CORE_SCRIPT_ID = "htmldate-pyscript-core";
const WORKER_SCRIPT_ID = "htmldate-worker-script";
const MAIN_SCRIPT_ID = "htmldate-main-script";
const BRIDGE_EVENT = "htmldate:bridge-ready";

const normalizeBase = (base: string) => (base.endsWith("/") ? base : `${base}/`);
const BASE_URL = normalizeBase(import.meta.env.BASE_URL ?? "/");
const publicPath = (path: string) => `${BASE_URL}${path.replace(/^\//u, "")}`;

let loadPromise: Promise<void> | null = null;
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

const ensureCoreStyle = () => {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
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

const ensureCoreScript = () => {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
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

const ensureWorkerScripts = () => {
  if (typeof document === "undefined") {
    return;
  }
  const ensureScript = (id: string, attrs: Record<string, string>) => {
    if (document.getElementById(id)) {
      return;
    }
    const scriptEl = document.createElement("script");
    scriptEl.id = id;
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === "") {
        scriptEl.setAttribute(key, "");
      } else {
        scriptEl.setAttribute(key, value);
      }
    });
    document.body.appendChild(scriptEl);
  };

  ensureScript(WORKER_SCRIPT_ID, {
    type: "py",
    worker: "",
    name: "htmldate-worker",
    src: publicPath("pyscript/date-worker.py"),
    config: publicPath("pyscript.json"),
  });

  ensureScript(MAIN_SCRIPT_ID, {
    type: "py",
    src: publicPath("pyscript/date-main.py"),
    config: publicPath("pyscript.json"),
  });
};

const waitForBridgeReady = () =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (window.__htmldateBridgeReady) {
      resolve();
      return;
    }
    const handleReady = () => {
      window.removeEventListener(BRIDGE_EVENT, handleReady as EventListener);
      resolve();
    };
    window.addEventListener(BRIDGE_EVENT, handleReady as EventListener, { once: true });
  });

export const ensureHtmlDateBridge = () => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.__htmldateBridgeReady) {
    return Promise.resolve();
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      await Promise.all([ensureCoreStyle(), ensureCoreScript()]);
      ensureWorkerScripts();
      await waitForBridgeReady();
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
};
