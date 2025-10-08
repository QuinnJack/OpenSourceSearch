import './App.css';

import { Draggable } from './components/application/file-upload/draggable';
import { FileUploader } from './components/application/file-upload/file-uploader';
import { MediaVerificationTool } from './pages/MediaVerificationTool';
import { ThemeProvider } from '@/providers/theme-provider';
import { ThemeToggle } from './components/application/ThemeToggle';
import { useState } from 'react';

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
        <ThemeToggle></ThemeToggle>
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
