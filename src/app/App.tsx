import "./App.css";

import { useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool, DEFAULT_ANALYSIS_DATA } from "@/features/media-verification";
import { Draggable, FileUploader, type UploadedFile } from "@/features/uploads";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";
import type { AnalysisData } from "@/shared/types/analysis";

const buildAnalysisDataFromFile = (file: UploadedFile): AnalysisData => {
  const base = DEFAULT_ANALYSIS_DATA;

  const summary = file.exifSummary;

  const metadata = summary
    ? {
      status: summary.status,
      exifStripped: summary.exifStripped,
      gpsData: summary.gpsData,
      details: summary.details,
      entries: summary.entries,
      groups: summary.groups,
      bigEndian: summary.bigEndian,
      error: summary.error,
    }
    : {
      ...base.metadata,
      entries: base.metadata.entries ? [...base.metadata.entries] : undefined,
      groups: base.metadata.groups ? [...base.metadata.groups] : undefined,
      bigEndian: base.metadata.bigEndian,
      error: base.metadata.error,
    };

  const aiConfidence = file.sightengineConfidence;
  const confidence = aiConfidence ?? base.aiDetection.confidence;

  let status = base.aiDetection.status;
  if (typeof aiConfidence === "number") {
    status = aiConfidence >= 80 ? "error" : aiConfidence >= 45 ? "warning" : "info";
  }

  let label = base.aiDetection.label;
  if (typeof aiConfidence === "number") {
    label =
      status === "error"
        ? "Likely AI-generated"
        : status === "warning"
          ? "Possible Manipulation"
          : "Likely Authentic";
  }

  const aiDetails =
    typeof aiConfidence === "number"
      ? `SightEngine reports a ${aiConfidence}% likelihood that this media was AI-generated.`
      : base.aiDetection.details;

  return {
    aiDetection: {
      ...base.aiDetection,
      status,
      label,
      confidence,
      sightengineConfidence: aiConfidence,
      details: aiDetails,
    },
    metadata,
    synthesis: {
      ...base.synthesis,
    },
  };
};

function App() {
  const [view, setView] = useState<'upload' | 'analyze'>("upload");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>(undefined);

  const handleContinue = (file: UploadedFile) => {
    setSelectedFile(file);
    setAnalysisData(buildAnalysisDataFromFile(file));
    setView('analyze');
  };

  const handleBack = () => {
    setSelectedFile(null);
    setAnalysisData(undefined);
    setView('upload');
  };

  return (
    <ThemeProvider>
      <ThemeToggle />
      {view === 'upload' && (
        <div className="w-2xl mx-auto">

          <div data-drag-constraint className="mb-4 flex">
            <Draggable name="image.jpeg" type="image" size={1024 * 1024 * 0.5} />
            <Draggable name="video.mp4" type="video" size={1024 * 1024 * 2.2} />
            <Draggable name="Invoice #876.pdf" type="application/pdf" size={1024 * 1024 * 1.2} />
          </div>
          <div className="w-2xl mx-auto">
            <FileUploader onContinue={handleContinue} />
          </div>
        </div>
      )}
      {view === 'analyze' && selectedFile && (
        <div className="mx-auto w-full max-w-6xl">
          <MediaVerificationTool

            file={{ name: selectedFile.name, size: selectedFile.size, previewUrl: selectedFile.previewUrl }}
            onBack={handleBack}
            data={analysisData}

          />
        </div>
      )}

    </ThemeProvider >
  )
}

export default App
