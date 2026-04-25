import React from 'react'
import { X } from 'lucide-react'

export default function PasswordPrompt({
  isOpen,
  title,
  confirmLabel,
  isDanger = false,
  onClose,
  onSubmit,
  password,
  onPasswordChange,
  error,
  closeAriaLabel = 'Close modal',
}) {
  if (!isOpen) return null

  const confirmClass = isDanger
    ? 'rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700'
    : 'rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label={closeAriaLabel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={onPasswordChange}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
              placeholder="Enter password"
            />
          </label>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>
            <button type="submit" className={confirmClass}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
