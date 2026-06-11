import React from 'react'
import {
  ClipboardList,
  Home,
  Info,
  LayoutGrid,
  Trophy,
  Users,
} from 'lucide-react'

export default function V2Sidebar({ activeView, sessionStarted, onNavigate }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate('setup')}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
        aria-label="Home"
        title="Home"
      >
        <Home className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate('courts')}
        disabled={!sessionStarted}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
          sessionStarted
            ? 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
            : 'cursor-not-allowed opacity-40'
        }`}
        aria-label="Courts"
        title="Courts"
      >
        <LayoutGrid className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate('players')}
        disabled={!sessionStarted}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
          activeView === 'players' ? 'bg-slate-100 text-slate-900' : ''
        } ${
          sessionStarted
            ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
            : 'cursor-not-allowed opacity-40'
        }`}
        aria-label="Players"
        title="Players"
      >
        <Users className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate('history')}
        disabled={!sessionStarted}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
          activeView === 'history' ? 'bg-slate-100 text-slate-900' : ''
        } ${
          sessionStarted
            ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
            : 'cursor-not-allowed opacity-40'
        }`}
        aria-label="Match history"
        title="Match history"
      >
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate('standings')}
        disabled={!sessionStarted}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
          activeView === 'standings' ? 'bg-slate-100 text-slate-900' : ''
        } ${
          sessionStarted
            ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
            : 'cursor-not-allowed opacity-40'
        }`}
        aria-label="Standings"
        title="Standings"
      >
        <Trophy className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate('docs')}
        disabled={!sessionStarted}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
          activeView === 'docs' ? 'bg-slate-100 text-slate-900' : ''
        } ${
          sessionStarted
            ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
            : 'cursor-not-allowed opacity-40'
        }`}
        aria-label="Documentation"
        title="Documentation"
      >
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  )
}
