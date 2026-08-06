import React from 'react'

export default function V2GroupedBySkillLevelSection({
  groupedBySkillLevel,
  onToggleGroupedBySkillLevel,
  disabled = false,
}) {
  const handleChange = (event) => {
    onToggleGroupedBySkillLevel(event.target.value === 'on')
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Grouped by Skill Level
      </h2>
      <p className="text-xs text-slate-500">
        When Off, Allow Adjacent Skill Mixing and Skill Adjustment are hidden.
      </p>
      <select
        value={groupedBySkillLevel ? 'on' : 'off'}
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
