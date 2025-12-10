/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import pdfMake from "pdfmake/build/pdfmake";
import type { Content, StyleDictionary, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";

import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type { GeolocationAnalysis } from "@/features/media-verification/api/geolocation";
import type { FactCheckState } from "@/features/media-verification/hooks/useFactCheckSearch";
import { rankWebMaps } from "@/features/media-verification/constants/experienceMaps";
import type { MediaVerificationFile } from "@/features/media-verification/components/media-verification-tool/MediaVerificationTool.types";
import { getReadableFileSize } from "@/features/uploads/utils/getReadableFileSize";
import type { AnalysisData, MetadataEntry, CirculationWebMatch } from "@/shared/types/analysis";

type MaybeContent = Content | undefined | null | false;

export interface ReportExportOptions {
  includeOverview: boolean;
  includePreviewImage: boolean;
  includeValidity: {
    aiDetection: boolean;
    metadata: boolean;
    factCheck: boolean;
    aiSynthesis: boolean;
  };
  includeCirculation: {
    webMatches: boolean;
    visualMatches: boolean;
  };
  includeContext: {
    geolocation: boolean;
    visionSummary: boolean;
    mapRecommendations: boolean;
  };
  includeForensics: boolean;
  title?: string;
  fileName?: string;
}

export interface ReportExportParams {
  file: MediaVerificationFile;
  analysis: AnalysisData;
  visionResult?: GoogleVisionWebDetectionResult;
  geolocationAnalysis?: GeolocationAnalysis;
  factCheckState: FactCheckState;
  options?: Partial<ReportExportOptions>;
}

export const DEFAULT_REPORT_OPTIONS: ReportExportOptions = {
  includeOverview: true,
  includePreviewImage: true,
  includeValidity: {
    aiDetection: true,
    metadata: true,
    factCheck: true,
    aiSynthesis: true,
  },
  includeCirculation: {
    webMatches: true,
    visualMatches: true,
  },
  includeContext: {
    geolocation: true,
    visionSummary: true,
    mapRecommendations: true,
  },
  includeForensics: false,
  title: "Media Verification Report",
  fileName: undefined,
};

const styles: StyleDictionary = {
  title: { fontSize: 20, bold: true, color: "#0f172a", margin: [0, 0, 0, 8] },
  subtitle: { fontSize: 10, color: "#475569", margin: [0, 0, 0, 12] },
  h2: { fontSize: 14, bold: true, color: "#111827", margin: [0, 12, 0, 6] },
  h3: { fontSize: 11, bold: true, color: "#111827", margin: [0, 8, 0, 4] },
  label: { fontSize: 10, bold: true, color: "#0f172a" },
  value: { fontSize: 10, color: "#1f2937" },
  subtle: { fontSize: 9, color: "#475569" },
  tableHeader: { fillColor: "#f1f5f9", bold: true, color: "#0f172a", margin: [0, 4, 0, 4] },
  tableCell: { margin: [0, 3, 0, 3], fontSize: 9, color: "#111827" },
};

let fontsRegistered = false;
const ensurePdfFonts = async () => {
  if (fontsRegistered) return;
  const pdfFonts = await import("pdfmake/build/vfs_fonts");
  const vfs = (pdfFonts as unknown as { vfs?: any; pdfMake?: { vfs?: any } }).vfs ?? pdfFonts?.pdfMake?.vfs;
  if (!vfs) {
    throw new Error("PDF fonts could not be loaded. Ensure vfs_fonts is bundled correctly.");
  }
  (pdfMake as any).vfs = vfs;
  fontsRegistered = true;
};

const formatDateTime = (value: Date) =>
  value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const asDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image data"));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read image data"));
    reader.readAsDataURL(blob);
  });

const resolvePreviewImage = async (file: MediaVerificationFile): Promise<string | null> => {
  if (file.base64Content) {
    return `data:image/jpeg;base64,${file.base64Content}`;
  }

  const candidateUrl = file.previewUrl || file.sourceUrl;
  if (!candidateUrl) {
    return null;
  }

  try {
    const response = await fetch(candidateUrl, { mode: "cors" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return await asDataUrl(blob);
  } catch {
    return null;
  }
};

const buildKeyValueRow = (label: string, value?: string | number | null): TableCell[] => [
  { text: label, style: "label" },
  { text: value == null || value === "" ? "Not available" : String(value), style: "value" },
];

const buildMetadataRows = (entries: MetadataEntry[] = [], limit = 12): TableCell[][] => {
  const rows: TableCell[][] = [["Property", "Value"].map((text) => ({ text, style: "tableHeader" }))];
  entries.slice(0, limit).forEach((entry) => {
    rows.push([
      { text: entry.label, style: "tableCell" },
      { text: entry.value, style: "tableCell" },
    ]);
  });
  return rows;
};

const buildWebMatchRows = (matches: CirculationWebMatch[], limit = 8): TableCell[][] => {
  const rows: TableCell[][] = [
    [
      { text: "Title / URL", style: "tableHeader" },
      { text: "Match", style: "tableHeader" },
      { text: "First seen", style: "tableHeader" },
    ],
  ];
  matches.slice(0, limit).forEach((match) => {
    const label = match.pageTitle?.trim() || match.url;
    rows.push([
      { text: `${label}\n${match.url}`, style: "tableCell" },
      { text: match.matchType ?? "—", style: "tableCell" },
      { text: match.dateDetected ?? match.lastSeen ?? "—", style: "tableCell" },
    ]);
  });
  return rows;
};

const buildFactCheckRows = (state: FactCheckState, limit = 6): TableCell[][] => {
  const rows: TableCell[][] = [
    [
      { text: "Claim / Review", style: "tableHeader" },
      { text: "Publisher", style: "tableHeader" },
      { text: "Rating / Date", style: "tableHeader" },
    ],
  ];

  let added = 0;
  state.claims.forEach((claim) => {
    claim.reviews.forEach((review) => {
      if (added >= limit) return;
      rows.push([
        { text: [claim.text, review.title, review.url].filter(Boolean).join("\n"), style: "tableCell" },
        { text: review.publisherName ?? review.publisherSite ?? "Unknown", style: "tableCell" },
        { text: `${review.textualRating ?? "—"}${review.reviewDate ? ` • ${review.reviewDate}` : ""}`, style: "tableCell" },
      ]);
      added += 1;
    });
  });

  if (rows.length === 1) {
    rows.push([{ text: "No fact check results available", colSpan: 3, style: "tableCell" } as TableCell, {}, {}]);
  }

  return rows;
};

const buildEntitiesList = (visionResult?: GoogleVisionWebDetectionResult): Content[] => {
  if (!visionResult) return [];
  const bestGuesses = visionResult.bestGuesses ?? [];
  const entities = [...(visionResult.entities ?? [])]
    .filter((entity) => entity.description)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  const content: Content[] = [];
  if (bestGuesses.length) {
    content.push({ text: "Best guesses", style: "h3" });
    content.push({
      ul: bestGuesses.map((guess) => ({ text: guess, style: "value" })),
      margin: [0, 0, 0, 6],
    });
  }
  if (entities.length) {
    content.push({ text: "Top entities", style: "h3" });
    content.push({
      ul: entities.map((entity) => ({
        text: `${entity.description}${typeof entity.score === "number" ? ` (${Math.round(entity.score * 100)}%)` : ""}`,
        style: "value",
      })),
    });
  }
  return content;
};

const buildMapRecommendations = (
  visionResult?: GoogleVisionWebDetectionResult,
): Content | undefined => {
  if (!visionResult) return undefined;
  const ranked = rankWebMaps(visionResult.entities, visionResult.bestGuesses).slice(0, 4);
  if (!ranked.length) return undefined;
  return {
    ul: ranked.map((entry) => ({
      text: `${entry.map.title} • matched: ${entry.matchedTerms.join(", ")}`,
      link: entry.map.baseUrl,
      style: "value",
    })),
  };
};

const buildVisualMatchList = (urls: string[], title: string): MaybeContent => {
  if (!urls.length) return null;
  return {
    stack: [
      { text: title, style: "h3" },
      {
        ul: urls.slice(0, 10).map((url) => ({ text: url, link: url, style: "value" })),
      },
    ],
  };
};

const mergeOptions = (options?: Partial<ReportExportOptions>): ReportExportOptions => ({
  ...DEFAULT_REPORT_OPTIONS,
  ...options,
  includeValidity: { ...DEFAULT_REPORT_OPTIONS.includeValidity, ...options?.includeValidity },
  includeCirculation: { ...DEFAULT_REPORT_OPTIONS.includeCirculation, ...options?.includeCirculation },
  includeContext: { ...DEFAULT_REPORT_OPTIONS.includeContext, ...options?.includeContext },
});

export const exportVerificationReport = async ({
  file,
  analysis,
  visionResult,
  geolocationAnalysis,
  factCheckState,
  options,
}: ReportExportParams): Promise<void> => {
  await ensurePdfFonts();
  const resolvedOptions = mergeOptions(options);
  const previewImage = resolvedOptions.includePreviewImage ? await resolvePreviewImage(file) : null;
  const generatedAt = new Date();

  const content: Content[] = [
    { text: resolvedOptions.title ?? DEFAULT_REPORT_OPTIONS.title, style: "title" },
    { text: `Generated ${formatDateTime(generatedAt)}`, style: "subtitle" },
  ];

  if (resolvedOptions.includeOverview) {
    const overviewDetails: TableCell[][] = [
      buildKeyValueRow("File name", file.name),
      buildKeyValueRow("Size", getReadableFileSize(file.size)),
      buildKeyValueRow("Source URL", file.sourceUrl ?? "Uploaded file"),
    ];

    content.push({
      columns: [
        {
          width: "*",
          stack: [
            { text: "Overview", style: "h2" },
            {
              table: { widths: ["35%", "*"], body: overviewDetails },
              layout: "noBorders",
            },
          ],
        },
        previewImage
          ? {
              width: 180,
              image: previewImage,
              fit: [180, 180],
              margin: [12, 8, 0, 0],
            }
          : { width: 0, text: "" },
      ],
      columnGap: 12,
    });
  }

  if (resolvedOptions.includeValidity.aiDetection || resolvedOptions.includeValidity.metadata || resolvedOptions.includeValidity.factCheck || resolvedOptions.includeValidity.aiSynthesis) {
    content.push({ text: "Validity", style: "h2" });
  }

  if (resolvedOptions.includeValidity.aiDetection) {
    const detection = analysis.aiDetection;
    const breakdown = detection.confidenceBreakdown ?? [];
    const providerRows =
      breakdown.length > 0
        ? breakdown.map((entry) => [entry.label, `${Math.round(entry.value)}%`])
        : detection.sightengineConfidence != null
          ? [["SightEngine", `${Math.round(detection.sightengineConfidence)}%`]]
          : [];

    content.push({ text: "Automated Detection", style: "h3" });
    content.push({
      table: {
        widths: ["40%", "*"],
        body: [
          buildKeyValueRow("Status", detection.label || detection.status),
          buildKeyValueRow("Average confidence", `${Math.round(detection.confidence ?? 0)}%`),
          buildKeyValueRow("Details", detection.details || "Not available"),
        ],
      },
      layout: "noBorders",
    });

    if (providerRows.length > 0) {
      content.push({
        table: {
          widths: ["70%", "30%"],
          body: [
            [
              { text: "Provider", style: "tableHeader" },
              { text: "Confidence", style: "tableHeader" },
            ],
            ...providerRows.map((row) => row.map((value) => ({ text: value, style: "tableCell" })) as TableCell[]),
          ],
        },
        layout: { fillColor: (rowIndex: number) => (rowIndex % 2 === 0 ? null : "#f8fafc") },
        margin: [0, 6, 0, 0],
      });
    }
  }

  if (resolvedOptions.includeValidity.metadata) {
    const groups = analysis.metadata.groups ?? [];
    const entries = groups.flatMap((group) => group.entries.map<MetadataEntry>((entry) => ({ ...entry, label: `${group.title} – ${entry.label}` })));
    const fallbackEntries = analysis.metadata.entries ?? [];
    const rows = buildMetadataRows(entries.length ? entries : fallbackEntries);
    content.push({ text: "Metadata", style: "h3" });
    content.push({
      table: { widths: ["45%", "*"], body: rows },
      layout: {
        fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f8fafc" : rowIndex % 2 === 0 ? "#f8fafc" : null),
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => "#e2e8f0",
        vLineColor: () => "#e2e8f0",
      },
      margin: [0, 2, 0, 0],
    });
  }

  if (resolvedOptions.includeValidity.factCheck) {
    content.push({ text: "Fact Check", style: "h3" });
    if (factCheckState.loading) {
      content.push({ text: "Fact check search is still running…", style: "subtle" });
    } else if (factCheckState.error) {
      content.push({ text: factCheckState.error, style: "subtle" });
    } else {
      const rows = buildFactCheckRows(factCheckState);
      content.push({
        table: { widths: ["45%", "25%", "30%"], body: rows },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f8fafc" : rowIndex % 2 === 0 ? "#f8fafc" : null),
        },
      });
    }
  }

  if (resolvedOptions.includeValidity.aiSynthesis) {
    content.push({ text: "AI Synthesis", style: "h3" });
    content.push({
      text: analysis.synthesis.details || "AI synthesis analysis is not yet available for this upload.",
      style: "value",
    });
  }

  if (resolvedOptions.includeCirculation.webMatches || resolvedOptions.includeCirculation.visualMatches) {
    content.push({ text: "Circulation", style: "h2" });
  }

  if (resolvedOptions.includeCirculation.webMatches) {
    const matches = analysis.circulation.webMatches ?? [];
    const rows = buildWebMatchRows(matches);
    content.push({
      table: { widths: ["55%", "15%", "30%"], body: rows },
      layout: {
        fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f8fafc" : rowIndex % 2 === 0 ? "#f8fafc" : null),
      },
    });
  }

  if (resolvedOptions.includeCirculation.visualMatches) {
    const partials = analysis.circulation.partialMatchingImages ?? [];
    const similar = analysis.circulation.visuallySimilarImages ?? [];
    const partialList = buildVisualMatchList(
      partials.map((item) => item.url),
      "Partial matches",
    );
    const similarList = buildVisualMatchList(
      similar.map((item) => item.url),
      "Visually similar images",
    );

    if (partialList) {
      content.push(partialList);
    }
    if (similarList) {
      content.push(similarList);
    }
  }

  if (resolvedOptions.includeContext.geolocation || resolvedOptions.includeContext.visionSummary || resolvedOptions.includeContext.mapRecommendations) {
    content.push({ text: "Context", style: "h2" });
  }

  if (resolvedOptions.includeContext.geolocation) {
    content.push({ text: "Geolocation analysis", style: "h3" });
    if (!geolocationAnalysis) {
      content.push({ text: "No geolocation analysis has been run for this file.", style: "subtle" });
    } else {
      content.push({
        table: {
          widths: ["35%", "*"],
          body: [
            buildKeyValueRow("Location", geolocationAnalysis.locationLine ?? "Unknown"),
            buildKeyValueRow("Confidence", geolocationAnalysis.confidenceScore != null ? `${geolocationAnalysis.confidenceScore}/10` : "Not available"),
            buildKeyValueRow("Summary", geolocationAnalysis.explanation ?? geolocationAnalysis.answer ?? "Not available"),
          ],
        },
        layout: "noBorders",
      });
      if (geolocationAnalysis.sources?.length) {
        content.push({
          ul: geolocationAnalysis.sources.slice(0, 6).map((source) => ({
            text: `${source.index}. ${source.title ?? source.uri}`,
            link: source.uri,
            style: "value",
          })),
          margin: [0, 4, 0, 0],
        });
      }
    }
  }

  if (resolvedOptions.includeContext.visionSummary) {
    content.push(...buildEntitiesList(visionResult));
  }

  if (resolvedOptions.includeContext.mapRecommendations) {
    const mapList = buildMapRecommendations(visionResult);
    if (mapList) {
      content.push({ text: "Relevant situational maps", style: "h3" });
      content.push(mapList);
    }
  }

  if (resolvedOptions.includeForensics) {
    content.push({ text: "Forensics", style: "h2" });
    content.push({
      text: "Use the in-app Photo Forensics workspace for interactive error level, clone, and metadata inspection. The live tool is not embedded in the PDF.",
      style: "value",
    });
  }

  const documentDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 42],
    content,
    styles,
    defaultStyle: { fontSize: 10 },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: resolvedOptions.title ?? DEFAULT_REPORT_OPTIONS.title, style: "subtle" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", style: "subtle" },
      ],
      margin: [36, 0, 36, 24],
    }),
  };

  const pdf = pdfMake.createPdf(documentDefinition);
  const fallbackName = `${file.name ? file.name.replace(/\.[^.]+$/, "") : "media-verification"}-report-${generatedAt
    .toISOString()
    .slice(0, 10)}`;
  const rawFileName = (resolvedOptions.fileName ?? fallbackName).trim();
  const fileName = rawFileName.toLowerCase().endsWith(".pdf") ? rawFileName : `${rawFileName}.pdf`;

  await new Promise<void>((resolve, reject) => {
    try {
      pdf.download(fileName, () => resolve());
    } catch (error) {
      reject(error);
    }
  });
};


