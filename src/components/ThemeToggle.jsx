import { Sun, Moon } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useData()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors motion-reduce:transition-none hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
