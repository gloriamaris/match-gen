import React from 'react'

export default function V2Layout({ sidebar, children, sessionOverlay }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden sm:flex-row">
        {sessionOverlay}
        <aside className="flex w-full items-center gap-3 border-b border-slate-200 px-4 py-3 sm:w-20 sm:flex-col sm:justify-start sm:gap-5 sm:border-b-0 sm:border-r sm:px-3 sm:py-6">
          {sidebar}
        </aside>
        <main className="relative flex-1 px-4 py-6 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
