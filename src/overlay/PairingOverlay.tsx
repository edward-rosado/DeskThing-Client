import { useEffect, useState } from 'react'

/**
 * Fullscreen pairing code display, shown when the computer initiates
 * Bluetooth pairing with this device — the original Car Thing flow: the
 * code appears here, the person confirms it on the computer.
 *
 * State comes from the on-device pairing agent's local endpoint, which
 * exists only on provisioned hardware; anywhere else the fetch fails once
 * and the overlay stays dormant.
 */

const AGENT_URL = 'http://127.0.0.1:8892/pairing'
const POLL_MS = 2000

type PairingState = {
  active: boolean
  passkey: string | null
  result: 'ok' | 'failed' | null
}

export const PairingOverlay = () => {
  const [state, setState] = useState<PairingState | null>(null)
  const [dead, setDead] = useState(false)
  const [flash, setFlash] = useState<'ok' | 'failed' | null>(null)

  useEffect(() => {
    if (dead) return
    let cancelled = false
    let misses = 0

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(AGENT_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as PairingState
        if (cancelled) return
        misses = 0
        setState((prev) => {
          // Show a brief success/failure flash when a pairing round ends.
          if (prev?.active && !data.active && data.result) setFlash(data.result)
          return data
        })
      } catch {
        if (cancelled) return
        // No agent (not a provisioned Car Thing) — stop polling entirely.
        if (++misses >= 2) setDead(true)
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [dead])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(id)
  }, [flash])

  if (flash) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
        <p className={`text-4xl font-bold ${flash === 'ok' ? 'text-green-400' : 'text-rose-400'}`}>
          {flash === 'ok' ? 'Paired!' : 'Pairing failed'}
        </p>
        {flash === 'ok' && (
          <p className="text-neutral-400 mt-3 text-xl">Connecting to your computer…</p>
        )}
      </div>
    )
  }

  if (!state?.active || !state.passkey) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95">
      <p className="text-neutral-300 text-2xl mb-6">Bluetooth pairing request</p>
      <p className="text-white font-mono text-8xl tracking-[0.3em] mb-8">{state.passkey}</p>
      <p className="text-neutral-400 text-xl max-w-lg text-center">
        Confirm this code on your computer to finish pairing
      </p>
    </div>
  )
}

export default PairingOverlay
