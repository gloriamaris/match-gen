import React from 'react'
import { V2_GAME_TYPES } from './v2Storage'

const baseButton =
  'w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition'
const activeButton = 'border-emerald-200 bg-emerald-50 text-emerald-700'
const inactiveButton =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'

const GAME_TYPE_OPTIONS = [
  {
    id: V2_GAME_TYPES.PROGRESSIVE_PLAY,
    label: 'Progressive Play',
    description:
      'Players are grouped by skill level, and after each round, winners are matched with winners and vice versa.',
  },
  {
    id: V2_GAME_TYPES.THRONE_RUN,
    label: 'Throne Run',
    description:
      'One winner holds the court after each match, gets new partners each round, and may leave after hitting the win streak limit.',
  },
]

export default function V2GameTypeSection({
  gameType,
  onSelectGameType,
  disabled = false,
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Game Type
      </h2>
      <div className="space-y-3">
        {GAME_TYPE_OPTIONS.map(({ id, label, description }) => {
          const isActive = gameType === id
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectGameType(id)}
              className={`${baseButton} ${
                isActive ? activeButton : inactiveButton
              } ${disabled ? 'cursor-not-allowed' : ''}`}
            >
              {label}
              <p
                className={`mt-1 text-sm font-normal ${
                  isActive ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {description}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
