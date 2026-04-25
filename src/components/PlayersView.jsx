import React, { useRef } from 'react'

export default function PlayersView({
  players,
  playerFormat,
  gameType,
  onAdd,
  exportMenuOpen,
  setExportMenuOpen,
  onExportCsv,
  onExportPdf,
  onImportPlayers,
  playersTableRef,
  onCheckIn,
  onCheckOut,
  onEdit,
  onDelete,
}) {
  const importInputRef = useRef(null)
  const showTeamName = playerFormat === 'custom' && gameType !== 'claim'
  const showRatings = !showTeamName
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Players</h2>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const [file] = event.target.files || []
              if (file) {
                onImportPlayers(file)
              }
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            Import
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setExportMenuOpen((prev) => (prev === 'players' ? null : 'players'))
              }
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Export
            </button>
            {exportMenuOpen === 'players' ? (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    onExportCsv()
                    setExportMenuOpen(null)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Export as CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportPdf()
                    setExportMenuOpen(null)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Export as PDF
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            Add player
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table
          ref={playersTableRef}
          className="w-full text-left text-sm text-slate-700"
        >
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player Name</th>
              <th className="px-4 py-3">Gender</th>
              {showTeamName ? (
                <th className="px-4 py-3">Team Name</th>
              ) : null}
              {showRatings ? (
                <>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Type</th>
                </>
              ) : null}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {players.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={showTeamName ? 8 : 7}
                >
                  No players added yet.
                </td>
              </tr>
            ) : (
              players.map((player, index) => (
                <tr key={player.id}>
                  <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {player.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {player.gender || '—'}
                  </td>
                  {showTeamName ? (
                    <td className="px-4 py-3 text-slate-600">
                      {player.teamName || '—'}
                    </td>
                  ) : null}
                  {showRatings ? (
                    <>
                      <td className="px-4 py-3">{player.rating}</td>
                      <td className="px-4 py-3">{player.type}</td>
                    </>
                  ) : null}
                  <td className="px-4 py-3">
                    {player.checkedIn ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-slate-400">
                          Checked In
                        </span>
                        <button
                          type="button"
                          onClick={() => onCheckOut(player.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                        >
                          Check Out
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCheckIn(player.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        Check In
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(player)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      {player.gamesPlayed > 0 || player.checkedIn ? null : (
                        <button
                          type="button"
                          onClick={() => onDelete(player.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
