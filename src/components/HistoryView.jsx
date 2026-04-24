import React from 'react'

export default function HistoryView({
  matchHistory,
  historyTableRef,
  exportMenuOpen,
  setExportMenuOpen,
  onExportCsv,
  onExportPdf,
  onAddMatch,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Match History</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddMatch}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            Add match
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setExportMenuOpen((prev) =>
                  prev === 'history' ? null : 'history'
                )
              }
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Export
            </button>
            {exportMenuOpen === 'history' ? (
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
          ref={historyTableRef}
          className="w-full text-left text-sm text-slate-700"
        >
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Court</th>
              <th className="px-4 py-3">Team A</th>
              <th className="px-4 py-3">Team B</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {matchHistory.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={6}
                >
                  No games recorded yet.
                </td>
              </tr>
            ) : (
              [...matchHistory]
                .sort((a, b) => a.teamA.localeCompare(b.teamA))
                .map((match, index) => {
                const [scoreA, scoreB] = match.score
                  .split('-')
                  .map((value) => Number.parseInt(value.trim(), 10))
                const hasWinner =
                  !Number.isNaN(scoreA) &&
                  !Number.isNaN(scoreB) &&
                  scoreA !== scoreB
                const teamAClass =
                  hasWinner && scoreA > scoreB
                    ? 'text-emerald-600 font-semibold'
                    : ''
                const teamBClass =
                  hasWinner && scoreB > scoreA
                    ? 'text-emerald-600 font-semibold'
                    : ''

                return (
                  <tr key={match.id}>
                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {match.court}
                    </td>
                    <td className={`px-4 py-3 ${teamAClass}`}>
                      {match.teamA}
                    </td>
                    <td className={`px-4 py-3 ${teamBClass}`}>
                      {match.teamB}
                    </td>
                    <td className="px-4 py-3">{match.score}</td>
                    <td className="px-4 py-3">
                      {match.enteredBy || '—'}
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
