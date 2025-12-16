const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|m4v|webm|ogg|ogv|avi|mpeg|mpg|3gp)$/i;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = (event) => {
      reject(event instanceof Error ? event : new Error("Unable to convert blob to base64"));
    };
    reader.readAsDataURL(blob);
  });

const waitForEvent = (element: HTMLMediaElement, eventName: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleError = () => {
      element.removeEventListener(eventName, handleComplete);
      element.removeEventListener("error", handleError);
      reject(new Error(`Failed to load video for event ${eventName}`));
    };

    const handleComplete = () => {
      element.removeEventListener(eventName, handleComplete);
      element.removeEventListener("error", handleError);
      resolve();
    };

    element.addEventListener(eventName, handleComplete, { once: true });
    element.addEventListener("error", handleError, { once: true });
  });

const seekVideo = (video: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to seek video to requested frame"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });

    try {
      video.currentTime = time;
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Unable to update video playback position"));
    }
  });

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to export video frame"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });

export interface CapturedFrame {
  index: number;
  timestampMs: number;
  blob: Blob;
  base64: string;
  previewUrl: string;
}

export interface VideoFrameExtractionResult {
  frames: CapturedFrame[];
  durationMs: number;
}

const determineFrameTimes = (duration: number, frameCount: number): number[] => {
  if (frameCount <= 1 || !Number.isFinite(duration) || duration <= 0) {
    return [0];
  }

  const times: number[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const ratio = index / frameCount;
    const targetTime = Math.min(duration * ratio, Math.max(duration - 0.05, 0));
    times.push(targetTime);
  }
  return times;
};

const DEFAULT_FRAME_COUNT = 2;

export const extractVideoFrames = async (
  file: File,
  frameCount: number = DEFAULT_FRAME_COUNT,
): Promise<VideoFrameExtractionResult> => {
  if (typeof document === "undefined") {
    throw new Error("Video processing is only supported in the browser");
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  const sourceUrl = URL.createObjectURL(file);
  video.src = sourceUrl;

  try {
    await waitForEvent(video, "loadedmetadata");
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }

  const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error("Unable to capture frames from video");
  }

  const times = determineFrameTimes(durationSec, Math.max(1, frameCount));
  const frames: CapturedFrame[] = [];

  for (let index = 0; index < times.length; index += 1) {
    const timestamp = times[index];
    try {
      await seekVideo(video, timestamp);
    } catch (error) {
      console.warn("Video seek failed", error);
      continue;
    }
    context.drawImage(video, 0, 0, width, height);
    // eslint-disable-next-line no-await-in-loop
    const blob = await canvasToBlob(canvas);
    // eslint-disable-next-line no-await-in-loop
    const base64 = await blobToBase64(blob);
    const previewUrl = URL.createObjectURL(blob);
    frames.push({
      index,
      timestampMs: Math.round(timestamp * 1000),
      blob,
      base64,
      previewUrl,
    });
  }

  URL.revokeObjectURL(sourceUrl);

  return {
    frames,
    durationMs: Math.round(durationSec * 1000),
  };
};

export const isVideoFile = (file: File): boolean => {
  if (file.type && file.type.startsWith("video/")) {
    return true;
  }
  return VIDEO_EXTENSION_PATTERN.test(file.name);
};
