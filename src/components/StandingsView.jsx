import React from 'react'

export default function StandingsView({
  players,
  playerFormat,
  standingsTableRef,
  exportMenuOpen,
  setExportMenuOpen,
  onExportCsv,
  onExportPdf,
}) {
  const showTeams = playerFormat === 'custom'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Standings</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setExportMenuOpen((prev) =>
                  prev === 'standings' ? null : 'standings'
                )
              }
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Export
            </button>
            {exportMenuOpen === 'standings' ? (
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
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table
          ref={standingsTableRef}
          className="w-full text-left text-sm text-slate-700"
        >
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player</th>
              {showTeams ? <th className="px-4 py-3">Team</th> : null}
              <th className="px-4 py-3 text-center">Wins</th>
              <th className="px-4 py-3 text-center">Losses</th>
              <th className="px-4 py-3 text-center">PD</th>
              <th className="px-4 py-3 text-center">Games</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {players.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={showTeams ? 7 : 6}
                >
                  No standings yet.
                </td>
              </tr>
            ) : (
              [...players]
                .sort((a, b) => {
                  if (b.wins !== a.wins) return b.wins - a.wins
                  if (b.pointDifferential !== a.pointDifferential) {
                    return b.pointDifferential - a.pointDifferential
                  }
                  return 0
                })
                .map((player, index) => {
                  const hasStats =
                    player.wins > 0 ||
                    player.losses > 0 ||
                    player.pointDifferential !== 0 ||
                    player.gamesPlayed > 0

                  return (
                    <tr key={player.id}>
                      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          index < 4 && hasStats
                            ? 'text-emerald-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {player.name}
                      </td>
                      {showTeams ? (
                        <td className="px-4 py-3 text-slate-600">
                          {player.teamName || '—'}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-center">{player.wins}</td>
                      <td className="px-4 py-3 text-center">{player.losses}</td>
                      <td className="px-4 py-3 text-center">
                        {player.pointDifferential}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {player.gamesPlayed}
                      </td>
                    </tr>
                  )
                })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
