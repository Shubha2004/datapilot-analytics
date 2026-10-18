import { useState } from 'react'
import { useData } from './context/DataContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import Dashboard from './pages/Dashboard'
import DatasetExplorer from './pages/DatasetExplorer'
import DataQuality from './pages/DataQuality'
import ChartBuilder from './pages/ChartBuilder'
import Statistics from './pages/Statistics'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

const PAGES = {
  overview: Dashboard,
  explorer: DatasetExplorer,
  quality: DataQuality,
  charts: ChartBuilder,
  stats: Statistics,
  reports: Reports,
  settings: Settings,
}

export default function App() {
  const { page } = useData()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const Page = PAGES[page] ?? Dashboard

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileNavOpen(true)} mobileOpen={mobileNavOpen} />
        <main
          id="main-content"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
        >
          <div className="mx-auto max-w-7xl">
            <Page />
          </div>
        </main>
      </div>
    </div>
  )
}
