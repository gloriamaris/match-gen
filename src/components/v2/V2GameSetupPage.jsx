import React from 'react'
import V2AdjacentSkillMixingSection from './V2AdjacentSkillMixingSection'
import V2AnnouncementsPane from './V2AnnouncementsPane'
import V2CourtsSection from './V2CourtsSection'
import V2GameModeSection from './V2GameModeSection'
import V2GameTypeSection from './V2GameTypeSection'
import V2SkillAdjustmentSection from './V2SkillAdjustmentSection'
import V2WinStreakSection from './V2WinStreakSection'
import { V2_GAME_TYPES } from './v2Storage'

export default function V2GameSetupPage({
  gameType,
  gameMode,
  numberOfCourts,
  winStreak,
  skillAdjustment,
  allowAdjacentSkillMixing,
  sessionStarted,
  isStartingSession,
  isEndingSession,
  onSelectGameType,
  onSelectGameMode,
  onSelectNumberOfCourts,
  onSelectWinStreak,
  onSelectSkillAdjustment,
  onToggleAdjacentSkillMixing,
  onStartSession,
  onEndSession,
}) {
  const sessionBusy = isStartingSession || isEndingSession
  const selectionDisabled = sessionStarted || sessionBusy

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={sessionStarted ? onEndSession : onStartSession}
          disabled={sessionBusy}
          className={`rounded-2xl border px-5 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
            sessionStarted
              ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
              : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
          } ${sessionBusy ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          {sessionStarted ? 'End Session' : 'Start Session'}
        </button>
      </div>

      <div className={selectionDisabled ? 'space-y-8 opacity-60' : 'space-y-8'}>
        <V2AnnouncementsPane />
        <V2GameTypeSection
          gameType={gameType}
          onSelectGameType={onSelectGameType}
          disabled={selectionDisabled}
        />
        <V2GameModeSection
          gameMode={gameMode}
          onSelectGameMode={onSelectGameMode}
          disabled={selectionDisabled}
        />
        <V2CourtsSection
          numberOfCourts={numberOfCourts}
          onSelectNumberOfCourts={onSelectNumberOfCourts}
          disabled={selectionDisabled}
        />
        {gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY ||
        gameType === V2_GAME_TYPES.LADDER_RUN ? (
          <V2AdjacentSkillMixingSection
            allowAdjacentSkillMixing={allowAdjacentSkillMixing}
            onToggleAdjacentSkillMixing={onToggleAdjacentSkillMixing}
            disabled={selectionDisabled}
          />
        ) : null}
        {gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY ||
        gameType === V2_GAME_TYPES.LADDER_RUN ? (
          <V2SkillAdjustmentSection
            skillAdjustment={skillAdjustment}
            onSelectSkillAdjustment={onSelectSkillAdjustment}
            disabled={selectionDisabled}
          />
        ) : null}
        {gameType === V2_GAME_TYPES.THRONE_RUN ? (
          <V2WinStreakSection
            winStreak={winStreak}
            onSelectWinStreak={onSelectWinStreak}
            disabled={selectionDisabled}
          />
        ) : null}
      </div>
    </div>
  )
}
