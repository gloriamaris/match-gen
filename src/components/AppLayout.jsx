import React from 'react'

export default function AppLayout({ sidebar, children }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:min-h-[560px] sm:flex-row">
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
