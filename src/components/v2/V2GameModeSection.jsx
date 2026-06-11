import React from 'react'

const baseButton =
  'w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition'
const activeButton = 'border-emerald-200 bg-emerald-50 text-emerald-700'
const inactiveButton =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'

export default function V2GameModeSection({
  gameMode,
  onSelectGameMode,
  disabled = false,
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Game Mode
      </h2>
      <div className="space-y-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectGameMode('doubles')}
          className={`${baseButton} ${
            gameMode === 'doubles' ? activeButton : inactiveButton
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          Doubles
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectGameMode('singles')}
          className={`${baseButton} ${
            gameMode === 'singles' ? activeButton : inactiveButton
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          Singles
        </button>
      </div>
    </section>
  )
}
