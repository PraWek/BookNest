import { Route, Routes } from 'react-router-dom'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'
import { AppearanceProvider } from './lib/theme'

export default function App() {
  return (
    <AppearanceProvider>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:bookId" element={<ReaderPage />} />
        <Route path="*" element={<LibraryPage />} />
      </Routes>
    </AppearanceProvider>
  )
}
