import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const SKILL_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced']
const GENDERS = ['Female', 'Male']

const emptyFormValues = {
  name: '',
  gender: 'Female',
  skillLevel: 'Beginner',
}

export default function V2AddPlayerModal({
  isOpen,
  onClose,
  onSave,
  mode = 'add',
  initialValues = emptyFormValues,
}) {
  const [formValues, setFormValues] = useState(emptyFormValues)

  useEffect(() => {
    if (!isOpen) return
    setFormValues({
      name: initialValues.name ?? '',
      gender: initialValues.gender ?? '',
      skillLevel: initialValues.skillLevel ?? 'Beginner',
    })
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const handleClose = () => {
    setFormValues(emptyFormValues)
    onClose()
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSave?.(formValues)
    setFormValues(emptyFormValues)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'edit' ? 'Edit Player' : 'Add Player'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Player Name
            <input
              type="text"
              placeholder="e.g. Happy Pickler"
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Gender</legend>
            <div className="flex flex-wrap gap-4">
              {GENDERS.map((gender) => (
                <label
                  key={gender}
                  className="flex items-center gap-2 text-sm font-medium text-slate-700"
                >
                  <input
                    type="radio"
                    name="gender"
                    value={gender}
                    checked={formValues.gender === gender}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        gender: event.target.value,
                      }))
                    }
                    className="h-4 w-4 border-slate-300 text-slate-900"
                  />
                  {gender}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Skill Level
            <select
              value={formValues.skillLevel}
              onChange={(event) =>
                setFormValues((prev) => ({
                  ...prev,
                  skillLevel: event.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
            >
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
            >
              {mode === 'edit' ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
