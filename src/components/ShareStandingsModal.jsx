import React from 'react'
import { X } from 'lucide-react'

const WIN_RATE_DECIMALS = 0
const MIN_ROWS = 8

const formatWinRate = (player) => {
  const totalGames =
    Number(player.gamesPlayed) > 0
      ? Number(player.gamesPlayed)
      : Number(player.wins) + Number(player.losses)

  if (!totalGames) return '0%'
  const rawWinRate = (Number(player.wins) / totalGames) * 100
  return `${rawWinRate.toFixed(WIN_RATE_DECIMALS)}%`
}

export default function ShareStandingsModal({
  isOpen,
  onClose,
  onSaveImage,
  standings,
  nameColumnLabel = 'Player Name',
  eventName = 'Event Name',
  onEventNameChange,
  eventDate,
  onEventDateChange,
  coverPhotoSrc,
  primaryPhotoSrc,
  coverPhotoName,
  primaryPhotoName,
  onCoverPhotoUpload,
  onPrimaryPhotoUpload,
}) {
  if (!isOpen) return null

  const shareCardRef = React.useRef(null)
  const [saveMenuOpen, setSaveMenuOpen] = React.useState(false)
  const rows = [...standings]
  while (rows.length < MIN_ROWS) {
    rows.push(null)
  }

  const formattedDate = eventDate
    ? new Date(`${eventDate}T00:00:00`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : ''
  const displayEventName = `${(eventName || 'Event Name').replace(/\s*·\s*Rankings$/i, '')} · Rankings`

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Share standings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close standings share modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <div
            ref={shareCardRef}
            className="mx-auto w-full max-w-md rounded-[2.5rem] border border-slate-300 bg-[#F4F5F0] shadow-sm"
          >
            <div className="overflow-hidden rounded-[2rem] border border-slate-300 bg-[#F4F5F0]">
              <div
                className="relative h-44 border-b border-slate-400 bg-[#F4F5F0]"
                style={
                  coverPhotoSrc
                    ? {
                        backgroundImage: `url(${coverPhotoSrc})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              >
                <div
                  className="absolute bottom-0 left-1/2 h-24 w-24 -translate-x-1/2 translate-y-1/2 rounded-full border border-slate-400 bg-[#F4F5F0]"
                  style={
                    primaryPhotoSrc
                      ? {
                          backgroundImage: `url(${primaryPhotoSrc})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                />
              </div>
              <div className="px-5 pb-8 pt-16 text-center">
                <h3 className="text-2xl font-semibold text-slate-700">
                  {displayEventName}
                </h3>
                {formattedDate ? (
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {formattedDate}
                  </p>
                ) : null}
                <div className="mx-auto mt-4 w-[94%] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                  <table className="w-full table-fixed text-left text-xs text-slate-700">
                    <thead className="bg-emerald-600 text-[11px] font-semibold uppercase tracking-wide text-white">
                      <tr>
                        <th className="w-[18%] border-r border-slate-400 px-2 py-3">
                          Rank
                        </th>
                        <th className="w-[56%] border-r border-slate-400 px-2 py-3">
                          {nameColumnLabel}
                        </th>
                        <th className="w-[26%] px-2 py-3 text-center">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((player, index) => (
                        <tr key={player?.id ?? `empty-row-${index}`}>
                          <td
                            className="h-9 border-r border-t border-slate-300 px-2 py-2 text-center"
                          >
                            {player ? index + 1 : ''}
                          </td>
                          <td
                            className={`h-9 border-r border-t border-slate-300 px-2 py-2 ${
                              player && index < 4 ? 'font-semibold' : ''
                            }`}
                          >
                            <span className="block truncate">
                              {player
                                ? `${['🥇', '🥈', '🥉', '🏅'][index] ? `${['🥇', '🥈', '🥉', '🏅'][index]} ` : ''}${player.name}`
                                : ''}
                            </span>
                          </td>
                          <td
                            className="h-9 border-t border-slate-300 px-2 py-2 text-center"
                          >
                            {player ? formatWinRate(player) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm text-slate-600">Thank you for playing!</p>
                <p className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-[#1877F2]"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.02 4.388 11.01 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.017 1.792-4.686 4.533-4.686 1.313 0 2.686.235 2.686.235v2.963h-1.514c-1.492 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.083 24 18.093 24 12.073z"
                    />
                  </svg>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#16A34A" />
                    <path
                      d="M8 6h5.8c2.3 0 3.9 1.5 3.9 3.6 0 1.5-.8 2.7-2.2 3.2l2.4 5.2h-3.2l-2.1-4.7H11V18H8V6zm3 2.7v2.6h2.4c.9 0 1.4-.5 1.4-1.3 0-.8-.5-1.3-1.4-1.3H11z"
                      fill="#fff"
                    />
                  </svg>
                  Happy Picklers Club  ᥫ᭡.
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 lg:max-w-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">Customize</p>
              <p className="mt-1 text-sm text-slate-600">
                Upload photos for the share card. For permanent app assets, save
                files in <span className="font-mono">public/img</span>.
              </p>

              <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Event Name
                <input
                  type="text"
                  value={eventName}
                  onChange={onEventNameChange}
                  placeholder="Enter event name"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Event Date
                <input
                  type="date"
                  value={eventDate}
                  onChange={onEventDateChange}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Cover Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={onCoverPhotoUpload}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                <span className="text-xs font-normal text-slate-500">
                  Current: {coverPhotoName || 'No file selected'}
                </span>
              </label>

              <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Primary Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPrimaryPhotoUpload}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                <span className="text-xs font-normal text-slate-500">
                  Current: {primaryPhotoName || 'No file selected'}
                </span>
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
              >
                Close
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSaveMenuOpen((prev) => !prev)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Save as...
                </button>
                {saveMenuOpen ? (
                  <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        onSaveImage('jpg', shareCardRef.current)
                        setSaveMenuOpen(false)
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      JPEG
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveImage('png', shareCardRef.current)
                        setSaveMenuOpen(false)
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      PNG
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
