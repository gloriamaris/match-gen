import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'

const SCORE_OPTIONS = Array.from({ length: 16 }, (_, i) => i)

const EMPTY_FORM = {
  court: 'Court 1',
  teamAIds: ['', ''],
  teamBIds: ['', ''],
  scoreA: '',
  scoreB: '',
  verifiedBy: '',
}

const EMPTY_ERRORS = {
  court: '',
  teamA: '',
  teamB: '',
  scoreA: '',
  scoreB: '',
  duplicate: '',
}

export default function V2HistoryView({
  matchHistory = [],
  players = [],
  onAddMatch,
  historyTableRef,
  exportMenuOpen,
  setExportMenuOpen,
  onExportCsv,
  onExportPdf,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState(EMPTY_ERRORS)

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  )

  const selectedIds = useMemo(
    () => new Set([...form.teamAIds, ...form.teamBIds].filter(Boolean)),
    [form.teamAIds, form.teamBIds]
  )

  const getAvailablePlayers = (currentId) =>
    sortedPlayers.filter(
      (player) => player.id === currentId || !selectedIds.has(player.id)
    )

  const openModal = () => {
    setForm(EMPTY_FORM)
    setErrors(EMPTY_ERRORS)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
  }

  const updateTeamId = (team, slot, value) => {
    setForm((prev) => ({
      ...prev,
      [team]: prev[team].map((v, i) => (i === slot ? value : v)),
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const scoreA = Number.parseInt(form.scoreA, 10)
    const scoreB = Number.parseInt(form.scoreB, 10)
    const teamAIds = form.teamAIds.filter(Boolean)
    const teamBIds = form.teamBIds.filter(Boolean)
    const allIds = [...teamAIds, ...teamBIds]
    const hasDuplicates = new Set(allIds).size !== allIds.length

    const nextErrors = {
      court: form.court.trim() ? '' : 'Court is required',
      teamA: teamAIds.length === 2 ? '' : 'Select two players',
      teamB: teamBIds.length === 2 ? '' : 'Select two players',
      scoreA: Number.isNaN(scoreA) ? 'Score is required' : '',
      scoreB: Number.isNaN(scoreB) ? 'Score is required' : '',
      duplicate: hasDuplicates ? 'Players can only appear once' : '',
    }

    setErrors(nextErrors)

    if (Object.values(nextErrors).some(Boolean)) return

    onAddMatch?.({
      court: form.court.trim(),
      teamAIds,
      teamBIds,
      scoreA,
      scoreB,
      enteredBy: form.verifiedBy.trim(),
    })

    closeModal()
  }

  const sortedHistory = [...matchHistory].sort((a, b) =>
    String(a.teamA ?? '').localeCompare(String(b.teamA ?? ''))
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setExportMenuOpen((prev) => (prev === 'history' ? null : 'history'))
            }
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            Export
          </button>
          {exportMenuOpen === 'history' ? (
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
          onClick={openModal}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
        >
          Add match
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table ref={historyTableRef} className="w-full text-left text-sm text-slate-700">
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
            {sortedHistory.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={6}
                >
                  No games recorded yet.
                </td>
              </tr>
            ) : (
              sortedHistory.map((match, index) => {
                const scoreString = match.score ?? ''
                const [rawA, rawB] = scoreString
                  .split('-')
                  .map((value) => Number.parseInt(value.trim(), 10))
                const hasWinner =
                  !Number.isNaN(rawA) && !Number.isNaN(rawB) && rawA !== rawB
                const teamAClass =
                  hasWinner && rawA > rawB
                    ? 'text-emerald-600 font-semibold'
                    : ''
                const teamBClass =
                  hasWinner && rawB > rawA
                    ? 'text-emerald-600 font-semibold'
                    : ''

                return (
                  <tr key={match.id ?? `${match.signature}-${index}`}>
                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {match.court ?? '—'}
                    </td>
                    <td className={`px-4 py-3 ${teamAClass}`}>
                      {match.teamA ?? '—'}
                    </td>
                    <td className={`px-4 py-3 ${teamBClass}`}>
                      {match.teamB ?? '—'}
                    </td>
                    <td className="px-4 py-3">{scoreString || '—'}</td>
                    <td className="px-4 py-3">{match.enteredBy || '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Manual Match Entry
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close manual match modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Court
                <input
                  type="text"
                  value={form.court}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, court: e.target.value }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Court 1"
                />
                {errors.court ? (
                  <p className="text-xs text-red-500">{errors.court}</p>
                ) : null}
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team A</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`team-a-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 1}
                      <select
                        value={form.teamAIds[slot]}
                        onChange={(e) =>
                          updateTeamId('teamAIds', slot, e.target.value)
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailablePlayers(form.teamAIds[slot]).map(
                          (player) => (
                            <option key={player.id} value={player.id}>
                              {player.name}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  ))}
                </div>
                {errors.teamA ? (
                  <p className="text-xs text-red-500">{errors.teamA}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team B</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`team-b-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 3}
                      <select
                        value={form.teamBIds[slot]}
                        onChange={(e) =>
                          updateTeamId('teamBIds', slot, e.target.value)
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailablePlayers(form.teamBIds[slot]).map(
                          (player) => (
                            <option key={player.id} value={player.id}>
                              {player.name}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  ))}
                </div>
                {errors.teamB ? (
                  <p className="text-xs text-red-500">{errors.teamB}</p>
                ) : null}
                {errors.duplicate ? (
                  <p className="text-xs text-red-500">{errors.duplicate}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Score A
                  <select
                    value={form.scoreA}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, scoreA: e.target.value }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="">Select score</option>
                    {SCORE_OPTIONS.map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                  {errors.scoreA ? (
                    <p className="text-xs text-red-500">{errors.scoreA}</p>
                  ) : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Score B
                  <select
                    value={form.scoreB}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, scoreB: e.target.value }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="">Select score</option>
                    {SCORE_OPTIONS.map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                  {errors.scoreB ? (
                    <p className="text-xs text-red-500">{errors.scoreB}</p>
                  ) : null}
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Verified by
                <input
                  type="text"
                  value={form.verifiedBy}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      verifiedBy: e.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Optional"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Add match
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
