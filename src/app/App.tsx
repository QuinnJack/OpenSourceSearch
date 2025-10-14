import "./App.css";

import { useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool } from "@/features/media-verification";
import { Draggable, FileUploader, type UploadedFile } from "@/features/uploads";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";

function App() {
  const [view, setView] = useState<'upload' | 'analyze'>("upload");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);

  const handleContinue = (file: UploadedFile) => {
    setSelectedFile(file);
    setView('analyze');
  };

  const handleBack = () => {
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
          />
        )}
      </div>
    </ThemeProvider>
  )
}

export default App
