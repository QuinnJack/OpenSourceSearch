import { useState } from 'react'
import './App.css'
import { FileUploader } from './components/FileUploader'
import { ThemeToggle } from './components/ThemeToggle'
import { ThemeProvider } from '@/providers/theme-provider';
import { Draggable } from './components/application/file-upload/draggable';

function App() {

  return (
    <ThemeProvider>
      <div className="w-2xl mx-auto">
        <ThemeToggle></ThemeToggle>
        <div data-drag-constraint className="mb-4 flex">
          <Draggable name="image.jpeg" type="img" size={1024 * 1024 * 0.5} />
          <Draggable name="video.mp4" type="video/mp4" size={1024 * 1024 * 2.2} />
          <Draggable name="Invoice #876.pdf" type="application/pdf" size={1024 * 1024 * 1.2} />
        </div>
        <FileUploader> </FileUploader>
      </div>
    </ThemeProvider>
  )
}

export default App
