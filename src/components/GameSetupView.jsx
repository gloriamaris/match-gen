import React from 'react'

const baseButton =
  'w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition'
const inactiveButton =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
const activeButton =
  'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100'

export default function GameSetupView({
  gameType,
  playerFormat,
  sessionStarted,
  isStartingSession,
  isEndingSession,
  onSelectGameType,
  onSelectPlayerFormat,
  onStartSession,
  onEndSession,
}) {
  const disableClaimTheThrone = false
  const disableRandomTeams = gameType === 'round-robin'
  const disableCustomTeams = gameType === 'claim'
  const selectionDisabled =
    sessionStarted || isStartingSession || isEndingSession
  const selectionClasses = selectionDisabled ? 'opacity-60' : ''
  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={sessionStarted ? onEndSession : onStartSession}
          disabled={isStartingSession || isEndingSession}
          className={`rounded-2xl border px-5 py-2 text-sm font-semibold shadow-sm transition ${
            sessionStarted
              ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
              : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
          } ${
            isStartingSession || isEndingSession
              ? 'cursor-not-allowed opacity-60'
              : ''
          }`}
        >
          {sessionStarted ? 'End Session' : 'Start Session'}
        </button>
      </div>

      <section className={`space-y-3 ${selectionClasses}`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Game Type
        </h2>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelectGameType('claim')}
            disabled={selectionDisabled || disableClaimTheThrone}
            className={`${baseButton} ${
              gameType === 'claim' ? activeButton : inactiveButton
            } ${
              selectionDisabled || disableClaimTheThrone
                ? 'cursor-not-allowed opacity-60'
                : ''
            }`}
          >
            Split & Stay
          </button>
          <button
            type="button"
            onClick={() => onSelectGameType('round-robin')}
            disabled={selectionDisabled}
            className={`${baseButton} ${
              gameType === 'round-robin' ? activeButton : inactiveButton
            } ${selectionDisabled ? 'cursor-not-allowed' : ''}`}
          >
            Round Robin
          </button>
        </div>
      </section>

      <section className={`space-y-3 ${selectionClasses}`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Player Format
        </h2>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelectPlayerFormat('random')}
            disabled={selectionDisabled || disableRandomTeams}
            className={`${baseButton} ${
              playerFormat === 'random' ? activeButton : inactiveButton
            } ${
              selectionDisabled || disableRandomTeams
                ? 'cursor-not-allowed opacity-60'
                : ''
            }`}
          >
            Randomly generated teams
          </button>
          <button
            type="button"
            onClick={() => onSelectPlayerFormat('custom')}
            disabled={selectionDisabled || disableCustomTeams}
            className={`${baseButton} ${
              playerFormat === 'custom' ? activeButton : inactiveButton
            } ${
              selectionDisabled || disableCustomTeams ? 'cursor-not-allowed' : ''
            }`}
          >
            Custom teams
          </button>
        </div>
      </section>
    </div>
  )
}
