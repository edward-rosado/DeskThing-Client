import { useMemo } from 'react'
import { useAppStore, useSettingsStore } from '@src/stores'

/**
 * Does the focused app draw its own transport?
 *
 * An app that IS the audio source (Spotify sets `isAudioSource` in its
 * manifest) draws its own controls, so the shell's mini-player would be a
 * second set of the same controls — and, because the collapsed bar is still a
 * progress strip, a second scrub bar under the first. It also swallows the
 * volume wheel while it is up.
 *
 * ONE home for this knowledge. It is looked up from the app LIST, never from
 * `currentView.manifest`: currentView is persisted preferences —
 * `{name, enabled, running, ...}` — and carries no manifest at all once a view
 * change has rewritten it, so a manifest read there holds only until the first
 * app switch. (Miniplayer.tsx still carries that dead read internally; it is
 * masked because Overlays unmounts it over audio apps — migrate it here if it
 * is ever surfaced elsewhere.)
 *
 * FAILS CLOSED: "we do not know yet" is not "no". The app list arrives
 * asynchronously after a connect, so on a fresh attach an open-on-unknown gate
 * showed the bar over Spotify — a duplicate transport and a dead volume knob
 * on every reconnect. Assuming the focused app owns its transport until told
 * otherwise costs a weather app a second without the bar instead.
 */
export function useFocusedAppOwnsTransport(): boolean {
  const apps = useAppStore((store) => store.apps)
  const current = useSettingsStore((store) => store.preferences.currentView?.name)

  return useMemo(() => {
    if (!current || !apps || apps.length === 0) return true

    const match = apps.find(
      (app) => app.name === current || app.manifest?.id === current
    )
    // A known app whose manifest has not loaded is equally unknown.
    if (!match || !match.manifest) return true

    return Boolean(match.manifest.isAudioSource)
  }, [apps, current])
}
