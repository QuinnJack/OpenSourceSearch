export {};

declare global {
  interface Window {
    __htmldateBridgeReady?: boolean;
    __CORS_PROXY_ORIGIN?: string;
  }

  interface HtmlDateWorkerResponseDetail {
    id?: string;
    url?: string;
    originalDate?: string | null;
    lastUpdate?: string | null;
    error?: string | null;
  }
}
