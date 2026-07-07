import React, { useState } from 'react'
import {
  dismissV2Announcement,
  loadV2DismissedAnnouncements,
  V2_ANNOUNCEMENT_IDS,
} from './v2Storage'

export default function V2AnnouncementsPane() {
  const [dismissed, setDismissed] = useState(() =>
    loadV2DismissedAnnouncements().has(V2_ANNOUNCEMENT_IDS.NEW_GAME_TYPES)
  )

  if (dismissed) return null

  const handleDismiss = () => {
    dismissV2Announcement(V2_ANNOUNCEMENT_IDS.NEW_GAME_TYPES)
    setDismissed(true)
  }

  return (
    <section className="relative rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 pr-10 text-sm text-blue-900">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-3 rounded-lg p-1 text-blue-700 transition hover:bg-blue-100 hover:text-blue-900"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ×
        </span>
      </button>
      <h2 className="font-semibold text-blue-950">Announcements 🎉</h2>
      <p className="mt-2 font-medium text-blue-900">New game types:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-blue-800">
        <li>
          Ladder Run: like Progressive Play with skill demotion/promotion if
          enabled.
        </li>
        <li>League: Round Robin format</li>
      </ul>
    </section>
  )
}
