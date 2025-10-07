import { useState } from 'react'
import './App.css'
import { FileUploader } from './components/FileUploader'
import { ThemeToggle } from './components/ThemeToggle'
import { ThemeProvider } from '@/providers/theme-provider';

function App() {

  return (
    <ThemeProvider>
      <div className="w-2xl mx-auto">
        <ThemeToggle></ThemeToggle>
        <br />
        <br />
        <FileUploader> </FileUploader>
      </div>
    </ThemeProvider>
  )
}

export default App
