/**
 * Returns a human-readable file size string (e.g., 2 MB).
 */
export function getReadableFileSize(bytes: number): string {
  if (bytes === 0) return "0 KB";

  const suffixes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${Math.floor(bytes / Math.pow(1024, index))} ${suffixes[index]}`;
}

