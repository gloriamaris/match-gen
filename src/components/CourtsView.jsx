import React from 'react'
import { Check, Pencil, RefreshCw } from 'lucide-react'

export default function CourtsView({
  courts,
  defaultCourtTeams,
  courtMatchups,
  courtStatus,
  isBattlefieldDisabled,
  onGenerateCourts,
  onEditCourt,
  onOpenScore,
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {courts.map((court) => (
        <div key={court.name} className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-stretch">
              <div className="grid flex-1 grid-rows-2 divide-y divide-slate-200 text-sm font-medium text-slate-700">
                {(court.id === 'battlefield' && isBattlefieldDisabled
                  ? ['Waiting for more players', 'Need 8 checked-in players']
                  : court.id === 'champions' &&
                      courtStatus.champions === 'waiting'
                    ? ['Waiting for players', 'Click refresh to generate']
                    : court.id === 'battlefield' &&
                        courtStatus.battlefield === 'waiting'
                      ? ['Waiting for players', 'Click refresh to generate']
                      : (courtMatchups[court.id] ?? []).length
                        ? courtMatchups[court.id].map((team) =>
                            team.map((player) => player.name).join(' / ')
                          )
                        : defaultCourtTeams[court.id]
                ).map((team) => (
                  <div
                    key={team}
                    className={`flex items-center px-4 py-4 sm:px-5 ${
                      (court.id === 'battlefield' && isBattlefieldDisabled) ||
                      (court.id === 'champions' &&
                        courtStatus.champions === 'waiting') ||
                      (court.id === 'battlefield' &&
                        courtStatus.battlefield === 'waiting')
                        ? 'text-slate-400'
                        : ''
                    }`}
                  >
                    {team}
                  </div>
                ))}
              </div>
              <div className="flex w-12 flex-col items-center justify-center gap-3 border-l border-slate-200 bg-slate-50 py-4 text-slate-600">
                <button
                  type="button"
                  onClick={() => onGenerateCourts(court.id)}
                  disabled={court.id === 'battlefield' && isBattlefieldDisabled}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition ${
                    court.id === 'battlefield' && isBattlefieldDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditCourt(court.id)}
                  disabled={court.id === 'battlefield' && isBattlefieldDisabled}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition ${
                    court.id === 'battlefield' && isBattlefieldDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenScore(court.id)}
                  disabled={
                    !courtMatchups[court.id] ||
                    (court.id === 'battlefield' && isBattlefieldDisabled)
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
                    courtMatchups[court.id]
                      ? court.id === 'battlefield' && isBattlefieldDisabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
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
      ))}
    </div>
  )
}
