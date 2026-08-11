/**
 * The volume wheel's anti-bounce rule, isolated so it can be tested without the
 * store, the websocket, or a device.
 *
 * The bug it exists to kill: the hardware wheel's VolUp/VolDown compute the next
 * notch from `song.volume`, and every server push merges its own volume back
 * over that. Because a poll's volume can LAG (Spotify reports the pre-change
 * level for a beat) or be a default, the display snaps back and the NEXT notch
 * re-seeds from the wrong base — turn down and it jumps up, turn up and it jumps
 * down. Observed live on the device: requests ping-ponged 45 <-> 100.
 *
 * The rule: while the wheel was touched within the last VOLUME_HOLD_MS, the
 * LOCAL value is authoritative and the incoming (server) volume is ignored for
 * the merge. Once the turn has been quiet that long, the server takes over again
 * so a change made elsewhere (a phone) still lands.
 */

/**
 * How long after a wheel touch the local volume stays authoritative.
 *
 * DERIVED FROM THE SERVER, not tuned independently: the stale echoes this
 * guards against live for the server's request-cache TTL plus its confirm
 * window — deskthing-apps/spotify's `PUBLIC_API_CONFIG.cacheMs` (3s) + the
 * VolumeWriter margin (500ms), see volumeWriter.ts `confirmAfterMs`. 4000ms =
 * that horizon with a beat of slack. If the server's cache TTL or poll cadence
 * changes, this must follow — there is no import across the repos to enforce
 * it, only this note (and its twin on the server side).
 */
export const VOLUME_HOLD_MS = 4000

/** One wheel notch. Matches the hardware VolUp/VolDown step. */
export const VOLUME_STEP = 5

/**
 * Is the wheel still "warm" — touched recently enough that its local value
 * should win over an incoming server echo?
 *
 * `undefined` (never touched) is NOT turning — the initial state must let the
 * first real server volume through.
 */
export function isWheelTurning(
  volumeTouchedAt: number | undefined,
  now: number,
  holdMs: number = VOLUME_HOLD_MS
): boolean {
  return volumeTouchedAt !== undefined && now - volumeTouchedAt < holdMs
}

/**
 * The volume to keep when a server push arrives: the local value while the wheel
 * is warm, otherwise the incoming one. This is the single decision that breaks
 * the feedback loop.
 */
export function resolveVolumeOnPush(
  localVolume: number | undefined,
  incomingVolume: number | undefined,
  volumeTouchedAt: number | undefined,
  now: number,
  holdMs: number = VOLUME_HOLD_MS
): number | undefined {
  return isWheelTurning(volumeTouchedAt, now, holdMs) ? localVolume : incomingVolume
}

/**
 * The next volume for one wheel notch, or null if the step would leave 0..100.
 * `dir` is +1 (up) or -1 (down). Mirrors the guards the wheel handler used
 * (`<= 95` up, `>= 5` down) so the arithmetic lives in one tested place.
 */
export function nextWheelVolume(
  current: number,
  dir: 1 | -1,
  step: number = VOLUME_STEP
): number | null {
  if (dir === 1) return current <= 100 - step ? current + step : null
  return current >= step ? current - step : null
}
