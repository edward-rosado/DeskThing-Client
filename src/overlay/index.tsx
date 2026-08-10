import { useAppStore, useSettingsStore, useWebSocketStore } from '@src/stores'
import AppTray from './AppTray'
import Miniplayer from './Miniplayer/Miniplayer'
import NotificationOverlay from './Notification'
import SelectionWheel from './SelectionWheel'
import VolumeOverlay from './Volume'
import { useActionStore } from '@src/stores/actionStore'
import { useEffect, useMemo, useState } from 'react'
import YouAreHere from './YouAreHere'
import { ServerStatus } from './ConnectionStatus'
import { PairingOverlay } from './PairingOverlay'
import ScreenSaverWrapper from './ScreenSaver/ScreenSaverWrapper'

interface OverlayProps {
  children: React.ReactNode
}

/**
 * The `Overlays` component is a React functional component that renders various overlays and UI elements on top of the main application content.
 *
 * It manages the state and visibility of the following overlays:
 * - AppTray
 * - Miniplayer
 * - NotificationOverlay
 * - VolumeOverlay
 * - SelectionWheel
 * - YouAreHere
 *
 * The component also adjusts the height and margin of the main content based on the user's preferences, such as the theme scale and miniplayer visibility.
 */
const Overlays: React.FC<OverlayProps> = ({ children }) => {
  const wheelState = useActionStore((store) => store.wheelState)
  const preferences = useSettingsStore((store) => store.preferences)
  const isConnected = useWebSocketStore((state) => state.isConnected)
  const [showHelp, setShowHelp] = useState(true)
  const height = useMemo(() => {
    return preferences.theme.scale == 'small'
      ? 'pb-16'
      : preferences.theme.scale == 'medium'
        ? 'pb-32'
        : 'pb-48'
  }, [preferences.theme.scale])

  /**
   * An app that IS the audio source draws its own transport, so the shell's
   * mini-player would be a second set of the same controls and — because the
   * collapsed bar is still a progress strip — a second scrub bar under the
   * first.
   *
   * Driven by the focused app's own manifest rather than by a global setting,
   * so the bar stays available everywhere else: a weather or photo app has no
   * transport of its own and genuinely wants it. Apps declare this with
   * `isAudioSource` in their manifest, which Spotify already sets.
   *
   * Looked up from the app LIST rather than read off `currentView.manifest`.
   * currentView is persisted preferences — `{name, enabled, running, ...}` —
   * and carries no manifest at all once a view change has rewritten it, so the
   * manifest reading held only until the first app switch and the bar came
   * back the moment you returned to Spotify.
   */
  const apps = useAppStore((store) => store.apps)
  const appOwnsTransport = useMemo(() => {
    const current = preferences.currentView?.name

    // FAIL CLOSED. "We do not know yet" is not "no".
    //
    // The app list arrives asynchronously after a connect, so on every fresh
    // USB or Bluetooth attach this ran with an empty list, `find` returned
    // undefined, and the bar came back over Spotify — which is also when it
    // swallows the volume wheel, so the two symptoms are one bug. Assuming the
    // focused app owns its transport until told otherwise costs a weather app
    // a second without the bar; the other way round costs Spotify a duplicate
    // transport and a dead volume knob on every reconnect.
    if (!current || !apps || apps.length === 0) return true

    const match = apps.find(
      (app) => app.name === current || app.manifest?.id === current
    )
    // A known app whose manifest has not loaded is equally unknown.
    if (!match || !match.manifest) return true

    return Boolean(match.manifest.isAudioSource)
  }, [apps, preferences.currentView?.name])

  const showMiniplayer =
    preferences.miniplayer.visible && preferences.onboarding && !appOwnsTransport

  const margin = useMemo(() => {
    return preferences.miniplayer.state !== 'hidden'
  }, [preferences.miniplayer.state])
  const memoChildren = useMemo(() => children, [children])

  return (
    <div className="flex bg-black flex-col w-screen max-h-screen h-screen items-center justify-end">
      {!preferences.onboarding || <AppTray />}
      <ServerStatus />
      <PairingOverlay />
      <NotificationOverlay />
      <VolumeOverlay />
      {!isConnected && <ScreenSaverWrapper />}
      {showHelp && <YouAreHere setShow={setShowHelp} />}
      {wheelState && <SelectionWheel />}
      <div
        className={`h-full w-full transition-[padding] ${showMiniplayer && margin && height}`}
      >
        {memoChildren}
      </div>
      {showMiniplayer && <Miniplayer />}
    </div>
  )
}

export default Overlays
