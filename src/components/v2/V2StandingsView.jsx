import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Share2 } from 'lucide-react'

const DEFAULT_SORT = { key: 'wins', dir: 'desc' }

const compareStandings = (a, b, sortKey, sortDir) => {
  const dir = sortDir === 'asc' ? 1 : -1

  const compareByKey = (key) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name)
    }
    return (a[key] ?? 0) - (b[key] ?? 0)
  }

  const primary = compareByKey(sortKey) * dir
  if (primary !== 0) return primary

  if (sortKey !== 'wins') {
    const byWins = b.wins - a.wins
    if (byWins !== 0) return byWins
  }
  if (sortKey !== 'pointDifferential') {
    const byPd = b.pointDifferential - a.pointDifferential
    if (byPd !== 0) return byPd
  }
  if (sortKey !== 'name') {
    return a.name.localeCompare(b.name)
  }
  return 0
}

const SortableHeader = ({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = 'left',
}) => {
  const isActive = activeSortKey === sortKey
  const alignClass = align === 'center' ? 'justify-center' : 'justify-start'

  return (
    <th className={`px-4 py-3 ${align === 'center' ? 'text-center' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full items-center gap-1 ${alignClass} transition hover:text-slate-700 ${
          isActive ? 'text-slate-700' : ''
        }`}
        aria-sort={
          isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        <span>{label}</span>
        {isActive ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown
            className="h-3.5 w-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  )
}

export const computeStandings = (players, matchHistory) => {
  const byId = new Map(
    (players ?? []).map((player) => [
      player.id,
      {
        id: player.id,
        name: player.name,
        wins: Number(player.wins) || 0,
        losses: Number(player.losses) || 0,
        gamesPlayed: Number(player.gamesPlayed) || 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  )

  ;(matchHistory ?? []).forEach((entry) => {
    if (!entry?.score) return
    const [rawA, rawB] = String(entry.score)
      .split('-')
      .map((value) => Number.parseInt(value.trim(), 10))
    if (Number.isNaN(rawA) || Number.isNaN(rawB)) return

    entry.teamAIds?.forEach((id) => {
      const player = byId.get(id)
      if (!player) return
      player.pointsFor += rawA
      player.pointsAgainst += rawB
    })
    entry.teamBIds?.forEach((id) => {
      const player = byId.get(id)
      if (!player) return
      player.pointsFor += rawB
      player.pointsAgainst += rawA
    })
  })

  return Array.from(byId.values()).map((player) => ({
    ...player,
    pointDifferential: player.pointsFor - player.pointsAgainst,
  }))
}

export default function V2StandingsView({
  players = [],
  matchHistory = [],
  onShare,
  standingsTableRef,
  exportMenuOpen,
  setExportMenuOpen,
  onExportCsv,
  onExportPdf,
}) {
  const [sortKey, setSortKey] = useState(DEFAULT_SORT.key)
  const [sortDir, setSortDir] = useState(DEFAULT_SORT.dir)

  const standings = useMemo(
    () => computeStandings(players, matchHistory),
    [players, matchHistory]
  )

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDir(key === 'name' ? 'asc' : 'desc')
  }

  const sortedStandings = useMemo(
    () =>
      [...standings].sort((a, b) => compareStandings(a, b, sortKey, sortDir)),
    [standings, sortKey, sortDir]
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    onExportCsv?.()
                    setExportMenuOpen(null)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Export as CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportPdf?.()
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
          onClick={onShare}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          title="Share standings"
          aria-label="Share standings"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
        </button>
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
              <SortableHeader
                label="Player"
                sortKey="name"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader
                label="Wins"
                sortKey="wins"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="center"
              />
              <SortableHeader
                label="Losses"
                sortKey="losses"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="center"
              />
              <SortableHeader
                label="PD"
                sortKey="pointDifferential"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="center"
              />
              <SortableHeader
                label="Games"
                sortKey="gamesPlayed"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="center"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedStandings.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={6}
                >
                  No standings yet.
                </td>
              </tr>
            ) : (
              sortedStandings.map((player, index) => {
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
