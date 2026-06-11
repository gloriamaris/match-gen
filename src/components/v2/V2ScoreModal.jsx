import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const MIN_SCORE = 0
const MAX_SCORE = 30

const ADMIN_VERIFIERS = ['Admin - Monique', 'Admin - John']

const EMPTY_ERRORS = { scoreA: '', scoreB: '', verifiedBy: '' }

const validateScore = (value) => {
  if (value === '') return 'Score is required'
  if (!/^\d+$/.test(value)) {
    return `Enter a whole number between ${MIN_SCORE} and ${MAX_SCORE}`
  }
  const parsed = Number.parseInt(value, 10)
  if (parsed < MIN_SCORE || parsed > MAX_SCORE) {
    return `Score must be between ${MIN_SCORE} and ${MAX_SCORE}`
  }
  return ''
}

const sanitizeScoreInput = (value) => {
  if (value === '') return ''
  if (!/^\d+$/.test(value)) return null

  const parsed = Number.parseInt(value, 10)
  if (parsed > MAX_SCORE) return String(MAX_SCORE)
  return String(parsed)
}

export default function V2ScoreModal({
  isOpen,
  courtIndex,
  teamA,
  teamB,
  onClose,
  onSubmit,
}) {
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [enteredBy, setEnteredBy] = useState('')
  const [errors, setErrors] = useState(EMPTY_ERRORS)

  useEffect(() => {
    if (!isOpen) return
    setScoreA('')
    setScoreB('')
    setEnteredBy('')
    setErrors(EMPTY_ERRORS)
  }, [isOpen, courtIndex])

  if (!isOpen || !teamA || !teamB) return null

  const teamANames = teamA.map((p) => p.name).join(' / ')
  const teamBNames = teamB.map((p) => p.name).join(' / ')

  const verifierOptions = [...teamA, ...teamB]
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((player) => player.name)

  const handleScoreChange = (setter) => (event) => {
    const nextValue = sanitizeScoreInput(event.target.value)
    if (nextValue === null) return
    setter(nextValue)
  }

  const blockNonIntegerKeys = (event) => {
    if (['.', ',', 'e', 'E', '-', '+'].includes(event.key)) {
      event.preventDefault()
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const parsedA = Number.parseInt(scoreA, 10)
    const parsedB = Number.parseInt(scoreB, 10)
    const trimmedVerifier = enteredBy.trim()

    const nextErrors = {
      scoreA: validateScore(scoreA),
      scoreB: validateScore(scoreB),
      verifiedBy: trimmedVerifier ? '' : 'Select a verifier',
    }

    if (!nextErrors.scoreA && !nextErrors.scoreB && parsedA === parsedB) {
      nextErrors.scoreA = 'Scores cannot be tied'
      nextErrors.scoreB = 'Scores cannot be tied'
    }

    setErrors(nextErrors)

    if (nextErrors.scoreA || nextErrors.scoreB || nextErrors.verifiedBy) {
      return
    }

    onSubmit({
      scoreA: parsedA,
      scoreB: parsedB,
      enteredBy: trimmedVerifier,
    })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Court {(courtIndex ?? 0) + 1} — Enter Match Score
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close score modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Team A
            </p>
            <p className="text-sm font-medium text-slate-800">{teamANames}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={scoreA}
              onChange={handleScoreChange(setScoreA)}
              onKeyDown={blockNonIntegerKeys}
              placeholder="Enter score"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
            />
            {errors.scoreA ? (
              <p className="text-xs text-red-500">{errors.scoreA}</p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Team B
            </p>
            <p className="text-sm font-medium text-slate-800">{teamBNames}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={scoreB}
              onChange={handleScoreChange(setScoreB)}
              onKeyDown={blockNonIntegerKeys}
              placeholder="Enter score"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
            />
            {errors.scoreB ? (
              <p className="text-xs text-red-500">{errors.scoreB}</p>
            ) : null}
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Verified by
            <select
              value={enteredBy}
              onChange={(event) => setEnteredBy(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
            >
              <option value="">Select player</option>
              {verifierOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {ADMIN_VERIFIERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {errors.verifiedBy ? (
              <p className="text-xs text-red-500">{errors.verifiedBy}</p>
            ) : null}
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
            >
              Save Scores
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
