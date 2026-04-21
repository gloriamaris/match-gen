import { useState } from 'react'
import {
  Check,
  ClipboardList,
  LayoutGrid,
  Plus,
  RefreshCw,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import playersData from './players.json'

const courts = [
  {
    name: 'Court 1',
    teams: ['Player 1 / Player 2', 'Player 3 / Player 4'],
  },
  {
    name: 'Court 2',
    teams: ['Player 1 / Player 2', 'Player 3 / Player 4'],
  },
]

const initialPlayers = playersData.map((player) => {
  const rating = player.duprRating || player.clubRating || ''
  const type = player.duprRating ? 'DUPR' : player.clubRating ? 'Self Rating' : 'DUPR'

  return {
    id: player.id,
    name: player.name,
    rating,
    type,
    court: player.court,
    checkedIn: false,
  }
})

const standings = [
  {
    id: 'match-1',
    teamA: 'Player 1 / Player 2',
    teamB: 'Player 3 / Player 4',
    score: '11 - 8',
  },
  {
    id: 'match-2',
    teamA: 'Player 5 / Player 6',
    teamB: 'Player 7 / Player 8',
    score: '9 - 11',
  },
]

function App() {
  const [players, setPlayers] = useState(initialPlayers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeView, setActiveView] = useState('courts')
  const [modalMode, setModalMode] = useState('add')
  const [editingId, setEditingId] = useState(null)
  const [formValues, setFormValues] = useState({
    name: '',
    rating: '',
    type: 'DUPR',
  })

  const openAddModal = () => {
    setModalMode('add')
    setEditingId(null)
    setFormValues({
      name: '',
      rating: '',
      type: 'DUPR',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (player) => {
    setModalMode('edit')
    setEditingId(player.id)
    setFormValues({
      name: player.name,
      rating: String(player.rating),
      type: player.type,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const handleSave = (event) => {
    event.preventDefault()
    const ratingValue = formValues.rating.trim()

    if (modalMode === 'add') {
      const newPlayer = {
        id: crypto.randomUUID(),
        name: formValues.name.trim() || 'New Player',
        rating: ratingValue,
        type: formValues.type,
        checkedIn: false,
      }
      setPlayers((prev) => [...prev, newPlayer])
    } else {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === editingId
            ? {
                ...player,
                name: formValues.name.trim() || player.name,
                rating: ratingValue,
                type: formValues.type,
              }
            : player
        )
      )
    }

    setIsModalOpen(false)
  }

  const handleDelete = (playerId) => {
    setPlayers((prev) => prev.filter((player) => player.id !== playerId))
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:min-h-[560px] sm:flex-row">
        <aside className="flex w-full items-center gap-3 border-b border-slate-200 px-4 py-3 sm:w-20 sm:flex-col sm:justify-start sm:gap-5 sm:border-b-0 sm:border-r sm:px-3 sm:py-6">
          <button
            type="button"
            onClick={() => setActiveView('courts')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('players')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 ${
              activeView === 'players' ? 'bg-slate-100 text-slate-900' : ''
            }`}
          >
            <Users className="h-5 w-5" aria-hidden="true" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('standings')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 ${
              activeView === 'standings' ? 'bg-slate-100 text-slate-900' : ''
            }`}
          >
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </button>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
          {activeView === 'players' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Players
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveView('courts')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Back to courts
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Player Name</th>
                      <th className="px-4 py-3">Rating</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {players.map((player) => (
                      <tr key={player.id}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {player.name}
                        </td>
                        <td className="px-4 py-3">{player.rating}</td>
                        <td className="px-4 py-3">{player.type}</td>
                        <td className="px-4 py-3">
                          {player.checkedIn ? (
                            <span className="text-xs font-semibold uppercase text-slate-400">
                              Checked In
                            </span>
                          ) : (
                            <button
                              type="button"
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
                              onClick={() => openEditModal(player)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(player.id)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeView === 'standings' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Standings
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveView('courts')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Back to courts
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Team A</th>
                      <th className="px-4 py-3">Team B</th>
                      <th className="px-4 py-3">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {standings.map((match) => {
                      const [scoreA, scoreB] = match.score
                        .split('-')
                        .map((value) => Number.parseInt(value.trim(), 10))
                      const isTie =
                        Number.isNaN(scoreA) ||
                        Number.isNaN(scoreB) ||
                        scoreA === scoreB
                      const winner =
                        !isTie && scoreA > scoreB
                          ? 'A'
                          : !isTie && scoreB > scoreA
                            ? 'B'
                            : null

                      return (
                        <tr key={match.id}>
                          <td
                            className={`px-4 py-3 font-medium ${
                              winner === 'A'
                                ? 'text-emerald-600'
                                : 'text-slate-800'
                            }`}
                          >
                            {match.teamA}
                          </td>
                          <td
                            className={`px-4 py-3 ${
                              winner === 'B'
                                ? 'font-medium text-emerald-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {match.teamB}
                          </td>
                          <td className="px-4 py-3">{match.score}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {courts.map((court) => (
                <div key={court.name} className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-stretch">
                      <div className="flex-1 divide-y divide-slate-200 text-sm font-medium text-slate-700">
                        {court.teams.map((team) => (
                          <div key={team} className="px-4 py-4 sm:px-5">
                            {team}
                          </div>
                        ))}
                      </div>
                      <div className="flex w-12 flex-col items-center justify-between border-l border-slate-200 bg-slate-50 py-3 text-slate-600">
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
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
          )}
        </main>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {modalMode === 'edit' ? 'Edit Player' : 'Add Player'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSave}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Player Name
                <input
                  type="text"
                  placeholder="e.g. Jordan Smith"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Rating
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 3.75"
                  value={formValues.rating}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      rating: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-slate-700">
                  Rating Type
                </legend>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="ratingType"
                    value="DUPR"
                    className="h-4 w-4 border-slate-300 text-slate-900"
                    checked={formValues.type === 'DUPR'}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        type: event.target.value,
                      }))
                    }
                  />
                  DUPR
                </label>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="ratingType"
                    value="Self Rating"
                    className="h-4 w-4 border-slate-300 text-slate-900"
                    checked={formValues.type === 'Self Rating'}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        type: event.target.value,
                      }))
                    }
                  />
                  Self Rating
                </label>
              </fieldset>

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
                  {modalMode === 'edit' ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
