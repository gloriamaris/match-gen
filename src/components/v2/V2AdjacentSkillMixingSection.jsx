import React from 'react'

export default function V2AdjacentSkillMixingSection({
  allowAdjacentSkillMixing,
  onToggleAdjacentSkillMixing,
  disabled = false,
}) {
  const handleChange = (event) => {
    onToggleAdjacentSkillMixing(event.target.value === 'on')
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Allow Adjacent Skill Mixing
      </h2>
      <p className="text-xs text-slate-500">
        When Off, players are matched strictly within the same skill level. When
        On, Beginner+Novice and Intermediate+Advanced can play together.
      </p>
      <select
        value={allowAdjacentSkillMixing ? 'on' : 'off'}
        disabled={disabled}
        onChange={handleChange}
        className={`w-1/8 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 ${
          disabled ? 'cursor-not-allowed' : ''
        }`}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </select>
    </section>
  )
}
