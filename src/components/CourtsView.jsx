import React from 'react'
import { Check, Pencil, RefreshCw } from 'lucide-react'

const getDefaultTeamsForCourt = (index) => {
  const a = index * 4 + 1
  const b = index * 4 + 2
  const c = index * 4 + 3
  const d = index * 4 + 4
  return [`Player ${a} / Player ${b}`, `Player ${c} / Player ${d}`]
}

const getGridClasses = (visibleCount) => {
  if (visibleCount <= 1) return 'grid gap-6 grid-cols-1'
  if (visibleCount === 2) return 'grid gap-6 md:grid-cols-2'
  if (visibleCount === 3) return 'grid gap-6 md:grid-cols-2 xl:grid-cols-3'
  return 'grid gap-6 md:grid-cols-2 xl:grid-cols-3'
}

export default function CourtsView({
  visibleCourtCount,
  courtMatchups,
  courtStatus,
  onGenerateCourts,
  onEditCourt,
  onOpenScore,
}) {
  if (visibleCourtCount <= 0) {
    return null
  }

  const courts = Array.from({ length: visibleCourtCount }, (_, index) => ({
    index,
    name: `Court ${index + 1}`,
  }))

  return (
    <div className={getGridClasses(visibleCourtCount)}>
      {courts.map((court) => {
        const matchup = courtMatchups[court.index] ?? null
        const status = courtStatus[court.index] ?? 'idle'
        const isWaiting = status === 'waiting'
        const teams = matchup && matchup.length
          ? matchup.map((team) =>
              team.map((player) => player.name).join(' / ')
            )
          : isWaiting
            ? ['Waiting for players', 'Click refresh to generate']
            : getDefaultTeamsForCourt(court.index)
        const hasMatchup = Boolean(matchup && matchup.length)
        return (
          <div key={court.index} className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-stretch">
                <div className="grid flex-1 grid-rows-2 divide-y divide-slate-200 text-sm font-medium text-slate-700">
                  {teams.map((team, teamIndex) => (
                    <div
                      key={`${court.index}-${teamIndex}`}
                      className={`flex items-center px-4 py-4 sm:px-5 ${
                        isWaiting ? 'text-slate-400' : ''
                      }`}
                    >
                      {team}
                    </div>
                  ))}
                </div>
                <div className="flex w-12 flex-col items-center justify-center gap-3 border-l border-slate-200 bg-slate-50 py-4 text-slate-600">
                  <button
                    type="button"
                    onClick={() => onGenerateCourts(court.index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditCourt(court.index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenScore(court.index)}
                    disabled={!hasMatchup}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
                      hasMatchup
                        ? 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
                        : 'cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-sm font-semibold text-slate-600">
              {court.name}
            </p>
          </div>
        )
      })}
    </div>
  )
}
