import React from 'react'

const BADGE_BASE =
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase'

const TEAM_BADGE_CLASSES = {
  A: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  B: 'border-blue-200 bg-blue-50 text-blue-700',
  C: 'border-violet-200 bg-violet-50 text-violet-700',
  D: 'border-amber-200 bg-amber-50 text-amber-700',
  E: 'border-rose-200 bg-rose-50 text-rose-700',
  F: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  G: 'border-orange-200 bg-orange-50 text-orange-700',
  H: 'border-indigo-200 bg-indigo-50 text-indigo-700',
}

function getBadgeClasses(teamCode) {
  if (!teamCode) return 'border-slate-200 bg-slate-50 text-slate-700'
  return (
    TEAM_BADGE_CLASSES[teamCode] ??
    TEAM_BADGE_CLASSES[
      String.fromCharCode(65 + ((teamCode.charCodeAt(0) - 65) % 8))
    ] ??
    'border-slate-200 bg-slate-50 text-slate-700'
  )
}

export default function V2TeamBadge({ teamCode }) {
  if (!teamCode) return null

  return (
    <span className={`${BADGE_BASE} ${getBadgeClasses(teamCode)}`}>
      TEAM {teamCode}
    </span>
  )
}
