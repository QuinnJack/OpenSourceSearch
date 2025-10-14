import "./App.css";

import { useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool, DEFAULT_ANALYSIS_DATA } from "@/features/media-verification";
import { Draggable, FileUploader, type UploadedFile } from "@/features/uploads";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";
import type { AnalysisData } from "@/shared/types/analysis";

const buildAnalysisDataFromFile = (file: UploadedFile): AnalysisData | undefined => {
  if (file.sightengineConfidence === undefined) {
    return undefined;
  }

  const confidence = file.sightengineConfidence;
  const base = DEFAULT_ANALYSIS_DATA;

  const status = confidence >= 80 ? "error" : confidence >= 45 ? "warning" : "info";

  const label =
    status === "error"
      ? "Likely AI-generated"
      : status === "warning"
        ? "Possible Manipulation"
        : "Likely Authentic";

  return {
    aiDetection: {
      ...base.aiDetection,
      status,
      label,
      confidence,
      sightengineConfidence: confidence,
      details: `SightEngine reports a ${confidence}% likelihood that this media was AI-generated.`,
    },
    metadata: {
      ...base.metadata,
      entries: base.metadata.entries ? [...base.metadata.entries] : undefined,
    },
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
      <div className="w-2xl mx-auto">
        <ThemeToggle />
        {view === 'upload' && (
          <>
            <div data-drag-constraint className="mb-4 flex">
              <Draggable name="image.jpeg" type="image" size={1024 * 1024 * 0.5} />
              <Draggable name="video.mp4" type="video" size={1024 * 1024 * 2.2} />
              <Draggable name="Invoice #876.pdf" type="application/pdf" size={1024 * 1024 * 1.2} />
            </div>
            <FileUploader onContinue={handleContinue} />
          </>
        )}
        {view === 'analyze' && selectedFile && (
          <MediaVerificationTool
            file={{ name: selectedFile.name, size: selectedFile.size, previewUrl: selectedFile.previewUrl }}
            onBack={handleBack}
            data={analysisData}
          />
        )}
      </div>
    </ThemeProvider>
  )
}

export default App
