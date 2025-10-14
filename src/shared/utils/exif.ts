"use client";

import type { MetadataEntry, MetadataGroup, ValidityStatus } from "@/shared/types/analysis";

import type { exif as ExifNamespace } from "exif-reader";

export interface ExifSummary {
  status: ValidityStatus;
  exifStripped: boolean;
  gpsData: boolean;
  details: string;
  entries: MetadataEntry[];
  groups: MetadataGroup[];
  bigEndian?: boolean;
  raw?: ExifNamespace.Exif | null;
  error?: string;
}

type ExifReaderFn = (buffer: Uint8Array) => ExifNamespace.Exif;
type ExifReaderLike = (buffer: unknown) => ExifNamespace.Exif;

type BufferLike = Uint8Array & {
  toString: (encoding?: string, start?: number, end?: number) => string;
  readUInt16BE: (offset: number) => number;
  readUInt16LE: (offset: number) => number;
  readUInt32BE: (offset: number) => number;
  readUInt32LE: (offset: number) => number;
  readInt8: (offset: number) => number;
  readInt16BE: (offset: number) => number;
  readInt16LE: (offset: number) => number;
  readInt32BE: (offset: number) => number;
  readInt32LE: (offset: number) => number;
  slice: (start?: number, end?: number) => BufferLike;
};

let cachedReader: ExifReaderFn | null = null;

export async function extractExifSummaryFromFile(file: File): Promise<ExifSummary> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const segment = extractExifSegment(bytes);
    if (!segment) {
      return buildEmptySummary(
        "EXIF may be absent due to social platform scrubbing, screenshots, AI/graphics output, or export settings that remove metadata."
      );
    }

    const reader = await loadExifReader();
    const buffer = augmentBuffer(segment);
    const raw = reader(buffer);
    return buildSummary(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while extracting EXIF metadata.";
    return buildEmptySummary(message, message);
  }
}

function buildSummary(raw: ExifNamespace.Exif): ExifSummary {
  const image = raw.Image ?? {};
  const photo = raw.Photo ?? {};
  const gps = raw.GPSInfo ?? {};
  const thumbnail = raw.Thumbnail ?? {};
  const iop = raw.Iop ?? {};

  const hasExif = hasMeaningfulExif(raw);
  const gpsCoordinates = buildGpsCoordinate(gps);
  const gpsTimestamp = buildGpsTimestamp(gps);
  const gpsAltitude =
    typeof gps.GPSAltitude === "number"
      ? `${gps.GPSAltitude.toFixed(1)} m${gps.GPSAltitudeRef ? ` (${gps.GPSAltitudeRef === 1 ? "Below" : "Above"} sea level)` : ""}`
      : null;
  const gpsData = Boolean(gpsCoordinates || gpsAltitude || gpsTimestamp);

  const captureDate = formatDate(photo.DateTimeOriginal ?? image.DateTime);
  const cameraLabel = buildCameraLabel(image.Make, image.Model);
  const lensLabel = photo.LensModel ?? photo.LensMake ?? null;
  const exposure = formatExposure(photo.ExposureTime);
  const aperture = formatAperture(photo.FNumber);
  const isoSetting = formatIso(photo.ISOSpeedRatings ?? photo.ISOSpeed);
  const focalLength = formatFocalLength(photo.FocalLength);
  const whiteBalance = formatWhiteBalance(photo.WhiteBalance);
  const software = image.Software ?? null;
  const dimensions = formatDimensions(
    image.ImageWidth ?? photo.PixelXDimension,
    image.ImageLength ?? photo.PixelYDimension,
  );
  const orientation =
    typeof image.Orientation === "number" ? describeOrientation(image.Orientation) : null;
  const colorSpace = typeof photo.ColorSpace === "number" ? describeColorSpace(photo.ColorSpace) : null;

  const locationSummary =
    gpsCoordinates?.text ?? (gpsData ? "GPS metadata found" : "Not embedded");

  const entries: MetadataEntry[] = [
    {
      label: "EXIF Data",
      value: hasExif ? "Present" : "Missing",
      tone: hasExif ? "success" : "error",
    },
    {
      label: "Endianness",
      value: raw.bigEndian ? "Big-endian" : "Little-endian",
      tone: "neutral",
    },
    {
      label: "GPS",
      value: gpsData ? locationSummary : "Not embedded",
      tone: gpsData ? "success" : "warning",
    },
  ];

  if (cameraLabel) {
    entries.push({ label: "Camera", value: cameraLabel });
  }
  if (captureDate) {
    entries.push({ label: "Captured", value: captureDate });
  }
  const exposureHighlight = [exposure, aperture, isoSetting].filter(Boolean).join(" • ");
  if (exposureHighlight) {
    entries.push({ label: "Exposure", value: exposureHighlight });
  }
  if (dimensions) {
    entries.push({ label: "Resolution", value: dimensions });
  }

  const groups: MetadataGroup[] = [];

  const imageGroup: MetadataEntry[] = [];
  if (cameraLabel) imageGroup.push({ label: "Camera", value: cameraLabel });
  if (image.Make) imageGroup.push({ label: "Make", value: String(image.Make) });
  if (image.Model) imageGroup.push({ label: "Model", value: String(image.Model) });
  if (lensLabel) imageGroup.push({ label: "Lens", value: lensLabel });
  if (software) imageGroup.push({ label: "Software", value: software });
  if (dimensions) imageGroup.push({ label: "Resolution", value: dimensions });
  if (orientation) imageGroup.push({ label: "Orientation", value: orientation });
  if (colorSpace) imageGroup.push({ label: "Color Space", value: colorSpace });
  if (captureDate) imageGroup.push({ label: "Timestamp", value: captureDate });
  if (imageGroup.length) {
    groups.push({ title: "Image", entries: imageGroup });
  }

  const photoGroup: MetadataEntry[] = [];
  if (exposure) photoGroup.push({ label: "Exposure Time", value: exposure });
  if (aperture) photoGroup.push({ label: "Aperture", value: aperture });
  if (isoSetting) photoGroup.push({ label: "ISO", value: isoSetting });
  if (focalLength) photoGroup.push({ label: "Focal Length", value: focalLength });
  if (whiteBalance) photoGroup.push({ label: "White Balance", value: whiteBalance });
  if (typeof photo.ExposureProgram === "number") {
    photoGroup.push({
      label: "Exposure Program",
      value: describeExposureProgram(photo.ExposureProgram),
    });
  }
  if (typeof photo.ExposureBiasValue === "number") {
    photoGroup.push({
      label: "Exposure Bias",
      value: `${photo.ExposureBiasValue > 0 ? "+" : ""}${photo.ExposureBiasValue} EV`,
    });
  }
  if (typeof photo.SubjectDistance === "number") {
    photoGroup.push({
      label: "Subject Distance",
      value: `${photo.SubjectDistance.toFixed(2)} m`,
    });
  }
  if (photoGroup.length) {
    groups.push({ title: "Photo", entries: photoGroup });
  }

  const gpsGroup: MetadataEntry[] = [];
  if (gpsCoordinates?.decimalLatitude != null) {
    gpsGroup.push({ label: "Latitude", value: gpsCoordinates.displayLatitude });
  }
  if (gpsCoordinates?.decimalLongitude != null) {
    gpsGroup.push({ label: "Longitude", value: gpsCoordinates.displayLongitude });
  }
  if (gpsAltitude) {
    gpsGroup.push({ label: "Altitude", value: gpsAltitude });
  }
  if (gpsTimestamp) {
    gpsGroup.push({ label: "Timestamp", value: gpsTimestamp });
  }
  if (typeof gps.GPSImgDirection === "number") {
    gpsGroup.push({
      label: "Image Direction",
      value: `${gps.GPSImgDirection.toFixed(1)}° ${gps.GPSImgDirectionRef ?? ""}`.trim(),
    });
  }
  if (gpsGroup.length) {
    groups.push({ title: "GPS Info", entries: gpsGroup });
  }

  const thumbnailGroup: MetadataEntry[] = [];
  const thumbDimensions = formatDimensions(thumbnail.ImageWidth, thumbnail.ImageLength);
  if (thumbDimensions) thumbnailGroup.push({ label: "Resolution", value: thumbDimensions });
  if (typeof thumbnail.Orientation === "number") {
    thumbnailGroup.push({ label: "Orientation", value: describeOrientation(thumbnail.Orientation) });
  }
  if (typeof thumbnail.Compression === "number") {
    thumbnailGroup.push({
      label: "Compression",
      value: `Type ${thumbnail.Compression}`,
    });
  }
  if (thumbnailGroup.length) {
    groups.push({ title: "Thumbnail", entries: thumbnailGroup });
  }

  const iopGroup: MetadataEntry[] = [];
  if (iop.InteroperabilityIndex) {
    iopGroup.push({ label: "Index", value: stringifyRaw(iop.InteroperabilityIndex) });
  }
  if (iop.RelatedImageFileFormat) {
    iopGroup.push({
      label: "Related Format",
      value: stringifyRaw(iop.RelatedImageFileFormat),
    });
  }
  if (typeof iop.RelatedImageWidth === "number" && typeof iop.RelatedImageLength === "number") {
    iopGroup.push({
      label: "Related Resolution",
      value: `${iop.RelatedImageWidth} × ${iop.RelatedImageLength}px`,
    });
  }
  if (iopGroup.length) {
    groups.push({ title: "Iop", entries: iopGroup });
  }

  const status: ValidityStatus = hasExif ? (gpsData ? "info" : "warning") : "error";
  const details = hasExif
    ? gpsData
      ? "Camera metadata and GPS coordinates were detected in the image."
      : "EXIF metadata was found, but no GPS coordinates were embedded."
    : "EXIF metadata appears to be stripped from the image.";

  return {
    status,
    exifStripped: !hasExif,
    gpsData,
    details,
    entries,
    groups,
    bigEndian: raw.bigEndian ?? undefined,
    raw,
  };
}

function buildEmptySummary(details: string, error?: string): ExifSummary {
  return {
    status: "error",
    exifStripped: true,
    gpsData: false,
    details,
    entries: [
      { label: "EXIF Data", value: "Missing", tone: "error" },
      { label: "Endianness", value: "Unknown", tone: "neutral" },
      { label: "GPS", value: "Not embedded", tone: "warning" },
    ],
    groups: [],
    raw: null,
    error,
  };
}

function hasMeaningfulExif(raw: ExifNamespace.Exif): boolean {
  const imageKeys = raw.Image ? Object.keys(raw.Image).length : 0;
  const photoKeys = raw.Photo ? Object.keys(raw.Photo).length : 0;
  const gpsKeys = raw.GPSInfo ? Object.keys(raw.GPSInfo).length : 0;
  return imageKeys + photoKeys + gpsKeys > 0;
}

interface CoordinateSummary {
  decimalLatitude: number | null;
  decimalLongitude: number | null;
  displayLatitude: string;
  displayLongitude: string;
  text: string;
}

function buildGpsCoordinate(gps: Partial<ExifNamespace.GPSInfoTags>): CoordinateSummary | null {
  const latitude = toDecimalDegrees(gps.GPSLatitude, gps.GPSLatitudeRef);
  const longitude = toDecimalDegrees(gps.GPSLongitude, gps.GPSLongitudeRef);

  if (latitude == null || longitude == null) {
    return null;
  }

  const displayLatitude = formatCoordinate(latitude, gps.GPSLatitudeRef, "lat");
  const displayLongitude = formatCoordinate(longitude, gps.GPSLongitudeRef, "lon");

  return {
    decimalLatitude: latitude,
    decimalLongitude: longitude,
    displayLatitude,
    displayLongitude,
    text: `${displayLatitude}, ${displayLongitude}`,
  };
}

function buildGpsTimestamp(gps: Partial<ExifNamespace.GPSInfoTags>): string | null {
  if (!Array.isArray(gps.GPSTimeStamp) || !gps.GPSDateStamp) {
    return null;
  }
  const [hours = 0, minutes = 0, seconds = 0] = gps.GPSTimeStamp;
  const timeParts = [hours, minutes, seconds].map((part) =>
    Math.floor(part).toString().padStart(2, "0"),
  );
  return `${gps.GPSDateStamp} ${timeParts.join(":")} UTC`;
}

function toDecimalDegrees(values?: number[], ref?: string): number | null {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }

  const [degrees = 0, minutes = 0, seconds = 0] = values;
  const sign = ref === "S" || ref === "W" ? -1 : 1;
  const decimal = sign * (degrees + minutes / 60 + seconds / 3600);
  return Number.isFinite(decimal) ? Number(decimal.toFixed(6)) : null;
}

function formatCoordinate(decimal: number, ref: string | undefined, axis: "lat" | "lon"): string {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  const defaultDirection = axis === "lat" ? (decimal < 0 ? "S" : "N") : decimal < 0 ? "W" : "E";
  const direction = ref ?? defaultDirection;
  const formattedSeconds = seconds.toFixed(seconds >= 10 ? 1 : 2);
  return `${decimal.toFixed(6)}° ${direction ?? ""} (${degrees}° ${minutes}' ${formattedSeconds}")`.trim();
}

function formatDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatExposure(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  const reciprocal = 1 / value;
  if (reciprocal > 1) {
    const rounded = Math.round(reciprocal);
    if (Math.abs(reciprocal - rounded) < 0.01) {
      return `1/${rounded}s`;
    }
  }
  return `${value.toFixed(4)}s`;
}

function formatAperture(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  const rounded = Math.round(value * 10) / 10;
  return `ƒ/${rounded}`;
}

function formatIso(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  return `ISO ${Math.round(value)}`;
}

function formatFocalLength(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? Math.round(rounded) : rounded}mm`;
}

function formatWhiteBalance(value?: number | null): string | null {
  if (value == null) return null;
  switch (value) {
    case 0:
      return "Auto";
    case 1:
      return "Manual";
    default:
      return `Mode ${value}`;
  }
}

function formatDimensions(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null;
  return `${width} × ${height}px`;
}

function describeOrientation(value: number): string {
  const map: Record<number, string> = {
    1: "Normal (0°)",
    2: "Mirrored horizontal",
    3: "Rotated 180°",
    4: "Mirrored vertical",
    5: "Mirrored + rotated 90° CW",
    6: "Rotated 90° CW",
    7: "Mirrored + rotated 90° CCW",
    8: "Rotated 90° CCW",
  };
  return map[value] ?? `Orientation ${value}`;
}

function describeColorSpace(value: number): string {
  switch (value) {
    case 1:
      return "sRGB";
    case 65535:
      return "Uncalibrated";
    default:
      return `Color Space ${value}`;
  }
}

function describeExposureProgram(value: number): string {
  const map: Record<number, string> = {
    0: "Not defined",
    1: "Manual",
    2: "Program AE",
    3: "Aperture priority",
    4: "Shutter priority",
    5: "Creative",
    6: "Action",
    7: "Portrait",
    8: "Landscape",
  };
  return map[value] ?? `Program ${value}`;
}

function stringifyRaw(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (value instanceof Date) {
    return formatDate(value) ?? value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "number" ? (Number.isInteger(item) ? item.toString() : item.toFixed(2)) : String(item)))
      .join(", ");
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value)
      .slice(0, 16)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}${value.length > 16 ? "…" : ""}`;
  }
  return String(value);
}

function buildCameraLabel(make?: unknown, model?: unknown): string | null {
  const makeStr = typeof make === "string" ? make.trim() : null;
  const modelStr = typeof model === "string" ? model.trim() : null;
  if (makeStr && modelStr) {
    if (modelStr.toLowerCase().startsWith(makeStr.toLowerCase())) {
      return modelStr;
    }
    return `${makeStr} ${modelStr}`;
  }
  return modelStr ?? makeStr ?? null;
}

async function loadExifReader(): Promise<ExifReaderFn> {
  if (cachedReader) {
    return cachedReader;
  }

  const mod = await import("exif-reader");
  const candidate = mod as unknown;

  let readerLike: ExifReaderLike | null = null;

  if (typeof candidate === "function") {
    readerLike = candidate as ExifReaderLike;
  } else if (
    candidate &&
    typeof (candidate as { default?: unknown }).default === "function"
  ) {
    readerLike = ((candidate as { default: unknown }).default ?? null) as ExifReaderLike | null;
  }

  if (!readerLike) {
    throw new Error("Failed to load exif-reader module.");
  }

  cachedReader = (buffer: Uint8Array) => readerLike(buffer);
  return cachedReader;
}

function extractExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4) {
    return null;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return extractFromJpeg(bytes);
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return extractFromPng(bytes);
  }

  return null;
}

function extractFromJpeg(bytes: Uint8Array): Uint8Array | null {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2) {
      break;
    }
    if (marker === 0xe1) {
      const start = offset + 4;
      const dataLength = size - 2;
      const end = start + dataLength;
      if (end <= bytes.length) {
        return bytes.slice(start, end);
      }
      break;
    }
    offset += 2 + size;
  }
  return null;
}

function extractFromPng(bytes: Uint8Array): Uint8Array | null {
  let offset = 8; // PNG signature length
  while (offset + 8 <= bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );

    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) {
      break;
    }

    if (type === "eXIf") {
      return bytes.slice(dataStart, dataEnd);
    }

    offset = dataEnd + 4; // Skip data + CRC
  }
  return null;
}

function augmentBuffer(view: Uint8Array): BufferLike {
  const buffer = view as BufferLike;
  buffer.toString = bufferToString;
  buffer.readUInt16BE = readUInt16BE;
  buffer.readUInt16LE = readUInt16LE;
  buffer.readUInt32BE = readUInt32BE;
  buffer.readUInt32LE = readUInt32LE;
  buffer.readInt8 = readInt8;
  buffer.readInt16BE = readInt16BE;
  buffer.readInt16LE = readInt16LE;
  buffer.readInt32BE = readInt32BE;
  buffer.readInt32LE = readInt32LE;
  buffer.slice = bufferSlice;
  return buffer;
}

function bufferToString(this: Uint8Array, encoding?: string, start?: number, end?: number): string {
  const format = encoding ?? "utf8";
  if (format !== "ascii" && format !== "utf8") {
    throw new Error(`Unsupported encoding: ${format}`);
  }
  const from = Math.max(0, start ?? 0);
  const to = Math.min(this.length, end ?? this.length);
  let result = "";
  for (let index = from; index < to; index++) {
    result += String.fromCharCode(this[index]);
  }
  return result;
}

function readUInt16BE(this: Uint8Array, offset: number): number {
  return (this[offset] << 8) | this[offset + 1];
}

function readUInt16LE(this: Uint8Array, offset: number): number {
  return this[offset] | (this[offset + 1] << 8);
}

function readUInt32BE(this: Uint8Array, offset: number): number {
  return (
    this[offset] * 0x1000000 +
    (this[offset + 1] << 16) +
    (this[offset + 2] << 8) +
    this[offset + 3]
  );
}

function readUInt32LE(this: Uint8Array, offset: number): number {
  return (
    this[offset] +
    (this[offset + 1] << 8) +
    (this[offset + 2] << 16) +
    this[offset + 3] * 0x1000000
  );
}

function readInt8(this: Uint8Array, offset: number): number {
  const value = this[offset];
  return value & 0x80 ? value - 0x100 : value;
}

function readInt16BE(this: Uint8Array, offset: number): number {
  const value = (this[offset] << 8) | this[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}

function readInt16LE(this: Uint8Array, offset: number): number {
  const value = this[offset] | (this[offset + 1] << 8);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readInt32BE(this: Uint8Array, offset: number): number {
  return (
    (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3]
  );
}

function readInt32LE(this: Uint8Array, offset: number): number {
  return (
    this[offset] |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
  );
}

function bufferSlice(this: Uint8Array, start?: number, end?: number): BufferLike {
  const sliced = Uint8Array.prototype.slice.call(this, start, end) as Uint8Array;
  return augmentBuffer(sliced);
}
