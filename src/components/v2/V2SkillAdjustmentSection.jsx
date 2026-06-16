import React from 'react'

export default function V2SkillAdjustmentSection({
  skillAdjustment,
  onSelectSkillAdjustment,
  disabled = false,
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Skill Adjustment
      </h2>
      <select
        value={skillAdjustment}
        disabled={disabled}
        onChange={(event) => onSelectSkillAdjustment(Number(event.target.value))}
        className={`w-1/8 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 ${
          disabled ? 'cursor-not-allowed' : ''
        }`}
      >
        {Array.from({ length: 5 }, (_, i) => i + 1).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
    </section>
  )
}
