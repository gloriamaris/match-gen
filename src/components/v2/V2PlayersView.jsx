import React, { useRef, useState } from 'react'
import V2AddPlayerModal from './V2AddPlayerModal'
import V2TeamBadge from './V2TeamBadge'
import V2TeamWithModal from './V2TeamWithModal'
import {
  allocateNextTeamMetadata,
  createV2Player,
  loadV2Players,
  saveV2Players,
} from './v2Storage'

const noop = () => {}
const SKILL_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced']
const EMPTY_PLAYER_FORM_VALUES = {
  name: '',
  gender: 'Female',
  skillLevel: 'Beginner',
}

const escapeCsvValue = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const parseCsvRow = (row) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvRow)

const normalizeGender = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'm' || normalized === 'male') return 'Male'
  if (normalized === 'f' || normalized === 'female') return 'Female'
  return ''
}

const normalizeSkillLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  const match = SKILL_LEVELS.find(
    (level) => level.toLowerCase() === normalized
  )
  return match || 'Beginner'
}

export default function V2PlayersView({ onCheckOut: externalCheckOut }) {
  const importInputRef = useRef(null)
  const playersTableRef = useRef(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(null)
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false)
  const [playerModalMode, setPlayerModalMode] = useState('add')
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [playerModalInitialValues, setPlayerModalInitialValues] = useState(
    EMPTY_PLAYER_FORM_VALUES
  )
  const [teamWithPlayerId, setTeamWithPlayerId] = useState(null)
  const [players, setPlayers] = useState(() => {
    const loaded = loadV2Players()
    saveV2Players(loaded)
    return loaded
  })

  const handleSavePlayer = (formValues) => {
    const normalizedValues = {
      name: formValues.name?.trim() || '',
      gender: formValues.gender ?? '',
      skillLevel: formValues.skillLevel ?? 'Beginner',
    }

    setPlayers((prev) => {
      const nextPlayers =
        playerModalMode === 'edit' && editingPlayerId
          ? prev.map((player) =>
              player.id === editingPlayerId
                ? {
                    ...player,
                    name: normalizedValues.name || player.name,
                    gender: normalizedValues.gender,
                    skillLevel: normalizedValues.skillLevel,
                  }
                : player
            )
          : [...prev, createV2Player(normalizedValues)]

      saveV2Players(nextPlayers)
      return nextPlayers
    })
  }

  const openAddPlayerModal = () => {
    setPlayerModalMode('add')
    setEditingPlayerId(null)
    setPlayerModalInitialValues(EMPTY_PLAYER_FORM_VALUES)
    setIsAddPlayerModalOpen(true)
  }

  const openEditPlayerModal = (player) => {
    setPlayerModalMode('edit')
    setEditingPlayerId(player.id)
    setPlayerModalInitialValues({
      name: player.name ?? '',
      gender: player.gender ?? '',
      skillLevel: player.skillLevel ?? 'Beginner',
    })
    setIsAddPlayerModalOpen(true)
  }

  const closePlayerModal = () => {
    setIsAddPlayerModalOpen(false)
    setPlayerModalMode('add')
    setEditingPlayerId(null)
    setPlayerModalInitialValues(EMPTY_PLAYER_FORM_VALUES)
  }

  const handleSavePair = ({ playerId, teammateId }) => {
    if (!playerId) return

    setPlayers((prev) => {
      const nextPlayers = prev.map((player) => ({ ...player }))
      const playersById = new Map(nextPlayers.map((player) => [player.id, player]))

      const clearPair = (id) => {
        const currentPlayer = playersById.get(id)
        if (!currentPlayer) return
        const currentTeammateId = currentPlayer.teammateId
        currentPlayer.teammateId = null
        currentPlayer.teamCode = null
        currentPlayer.teamColor = null

        if (!currentTeammateId) return
        const teammate = playersById.get(currentTeammateId)
        if (teammate?.teammateId === id) {
          teammate.teammateId = null
          teammate.teamCode = null
          teammate.teamColor = null
        }
      }

      if (!teammateId) {
        clearPair(playerId)
        saveV2Players(nextPlayers)
        return nextPlayers
      }

      if (playerId === teammateId) return prev

      const anchorBeforePair = playersById.get(playerId)
      const preservedTeam =
        anchorBeforePair?.teamCode && anchorBeforePair?.teamColor
          ? {
              teamCode: anchorBeforePair.teamCode,
              teamColor: anchorBeforePair.teamColor,
            }
          : null

      clearPair(playerId)
      clearPair(teammateId)

      const playerA = playersById.get(playerId)
      const playerB = playersById.get(teammateId)
      if (!playerA || !playerB) return prev

      const teamMeta =
        preservedTeam ?? allocateNextTeamMetadata(nextPlayers)

      playerA.teammateId = playerB.id
      playerB.teammateId = playerA.id
      playerA.teamCode = teamMeta.teamCode
      playerA.teamColor = teamMeta.teamColor
      playerB.teamCode = teamMeta.teamCode
      playerB.teamColor = teamMeta.teamColor

      saveV2Players(nextPlayers)
      return nextPlayers
    })
  }

  const handleDelete = (playerId) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this player?')
    ) {
      return
    }

    setPlayers((prev) => {
      const nextPlayers = prev
        .map((player) => ({ ...player }))
        .filter((player) => player.id !== playerId)
      const deletedPlayer = prev.find((player) => player.id === playerId)

      if (deletedPlayer?.teammateId) {
        const teammate = nextPlayers.find(
          (player) => player.id === deletedPlayer.teammateId
        )
        if (teammate) {
          teammate.teammateId = null
          teammate.teamCode = null
          teammate.teamColor = null
        }
      }

      saveV2Players(nextPlayers)
      return nextPlayers
    })
  }

  const handleCheckIn = (playerId) => {
    setPlayers((prev) => {
      const maxQueueOrder = prev.reduce((max, player) => {
        const order = Number(player.queueOrder) || 0
        return order > max ? order : max
      }, 0)

      const nextPlayers = prev.map((player) => {
        if (player.id !== playerId) return player
        return {
          ...player,
          checkedIn: true,
          queueOrder: maxQueueOrder + 1,
        }
      })

      saveV2Players(nextPlayers)
      return nextPlayers
    })
  }

  const handleCheckOut = (playerId) => {
    setPlayers((prev) => {
      const nextPlayers = prev.map((player) =>
        player.id === playerId ? { ...player, checkedIn: false } : player
      )
      saveV2Players(nextPlayers)
      return nextPlayers
    })
    if (externalCheckOut) externalCheckOut(playerId)
  }
  const selectedTeamWithPlayer =
    players.find((player) => player.id === teamWithPlayerId) || null

  const exportPlayersCsv = () => {
    const rows = [
      ['Player Name', 'Gender', 'Skill Level', 'Status'],
      ...players.map((player) => [
        player.name,
        player.gender || '',
        player.skillLevel || '',
        player.checkedIn ? 'Checked In' : 'Checked Out',
      ]),
    ]
    downloadCsv('players.csv', rows)
  }

  const exportTableAsPdf = (title, tableRef, filename) => {
    if (!tableRef.current) return
    const tableHtml = tableRef.current.outerHTML
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { font-size: 18px; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
            td.text-center, th.text-center { text-align: center; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${tableHtml}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    if (filename) {
      try {
        printWindow.document.title = filename
      } catch {
        // noop
      }
    }
  }

  const exportPlayersPdf = () => {
    exportTableAsPdf('Players', playersTableRef, 'players.pdf')
  }

  const handleImportPlayers = async (file) => {
    if (!file) return
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      window.alert('No player rows found in that file')
      return
    }

    const headers = rows[0].map((header) => header.trim().toLowerCase())
    const findHeaderIndex = (candidates) =>
      headers.findIndex((header) => candidates.includes(header))
    const nameIndex = findHeaderIndex(['player', 'player name', 'name'])
    const genderIndex = findHeaderIndex(['gender', 'sex'])
    const skillIndex = findHeaderIndex(['skill level', 'skill', 'level'])
    const statusIndex = findHeaderIndex(['status'])

    if (nameIndex === -1) {
      window.alert('CSV must include a Player Name column')
      return
    }

    if (genderIndex === -1) {
      window.alert('CSV must include a Gender column')
      return
    }

    const invalidGenderRows = []
    const imported = []
    let nextQueueOrder = 0

    rows.slice(1).forEach((row, rowOffset) => {
      const name = row[nameIndex]?.trim()
      if (!name) return

      const gender = normalizeGender(row[genderIndex]?.trim())
      if (!gender) {
        invalidGenderRows.push({ rowNumber: rowOffset + 2, name })
        return
      }

      const skillLevel = normalizeSkillLevel(
        skillIndex !== -1 ? row[skillIndex]?.trim() : 'Beginner'
      )
      const statusValue =
        statusIndex !== -1 ? row[statusIndex]?.trim().toLowerCase() : ''
      const checkedIn =
        statusValue.includes('checked in') || statusValue === 'in'
      if (checkedIn) {
        nextQueueOrder += 1
      }

      imported.push({
        ...createV2Player({ name, gender, skillLevel }),
        checkedIn,
        queueOrder: checkedIn ? nextQueueOrder : 0,
      })
    })

    if (invalidGenderRows.length > 0) {
      const preview = invalidGenderRows
        .slice(0, 3)
        .map(({ rowNumber, name }) => `row ${rowNumber} (${name})`)
        .join(', ')
      const more =
        invalidGenderRows.length > 3
          ? ` and ${invalidGenderRows.length - 3} more`
          : ''
      window.alert(
        `Import cancelled — ${invalidGenderRows.length} player${
          invalidGenderRows.length === 1 ? '' : 's'
        } missing or invalid gender (Male/Female): ${preview}${more}`
      )
      return
    }

    if (imported.length === 0) {
      window.alert('No valid players found in that file')
      return
    }

    setPlayers(imported)
    saveV2Players(imported)
  }

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
            onChange={async (event) => {
              const [file] = event.target.files || []
              await handleImportPlayers(file)
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
                    exportPlayersCsv()
                    setExportMenuOpen(null)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Export as CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportPlayersPdf()
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
            onClick={openAddPlayerModal}
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
              <th className="px-4 py-3">Skill Level</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {players.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-sm text-slate-500"
                  colSpan={6}
                >
                  No players added yet.
                </td>
              </tr>
            ) : (
              players.map((player, index) => (
                <tr key={player.id}>
                  <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {player.name}
                      {player.teammateId ? (
                        <V2TeamBadge teamCode={player.teamCode} />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {player.gender || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {player.skillLevel || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {player.checkedIn ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Checked In
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCheckOut(player.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                        >
                          Check Out
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCheckIn(player.id)}
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
                        onClick={() => setTeamWithPlayerId(player.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {player.teammateId ? 'Edit Pair' : 'Pair with'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditPlayerModal(player)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      {player.gamesPlayed > 0 || player.checkedIn ? null : (
                        <button
                          type="button"
                          onClick={() => handleDelete(player.id)}
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
      <V2AddPlayerModal
        isOpen={isAddPlayerModalOpen}
        mode={playerModalMode}
        initialValues={playerModalInitialValues}
        onClose={closePlayerModal}
        onSave={handleSavePlayer}
      />
      <V2TeamWithModal
        isOpen={Boolean(selectedTeamWithPlayer)}
        player={selectedTeamWithPlayer}
        players={players}
        onClose={() => setTeamWithPlayerId(null)}
        onSave={handleSavePair}
      />
    </div>
  )
}
