export const getHostnameFromUrl = (rawUrl?: string): string => {
  if (!rawUrl) {
    return "Unknown host";
  }

  try {
    const { hostname } = new URL(rawUrl);
    return hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
};

export const stripDataUrlPrefix = (dataUrl: string): { mimeType: string | null; base64: string } => {
  const match = /^data:(?<mime>[^;]+);base64,(?<content>.+)$/u.exec(dataUrl);
  if (!match || !match.groups) {
    return { mimeType: null, base64: dataUrl };
  }

  return {
    mimeType: match.groups.mime || null,
    base64: match.groups.content,
  };
};
