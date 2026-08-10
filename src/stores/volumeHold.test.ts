/**
 * The volume wheel must not bounce.
 *
 * These pin the exact rule that fixed the live bug where the wheel fought the
 * user — turn up, it jumped down; turn down, it jumped up — because each notch
 * re-seeded from a stale server echo. Remove the hold and the "reversal" test
 * below goes red.
 *
 *   node --loader tsm --test src/stores/volumeHold.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  VOLUME_HOLD_MS,
  VOLUME_STEP,
  isWheelTurning,
  resolveVolumeOnPush,
  nextWheelVolume,
} from "./volumeHold.ts";

test("a never-touched wheel is not turning — the first server volume must land", () => {
  // The initial state has no _volumeTouchedAt; if that read as "turning" the
  // real volume would never reach the screen.
  assert.equal(isWheelTurning(undefined, 1_000), false);
  assert.equal(resolveVolumeOnPush(50, 73, undefined, 1_000), 73);
});

test("within the hold window the wheel is warm; past it, cold", () => {
  const touched = 10_000;
  assert.equal(isWheelTurning(touched, touched + 1), true);
  assert.equal(isWheelTurning(touched, touched + VOLUME_HOLD_MS - 1), true);
  assert.equal(isWheelTurning(touched, touched + VOLUME_HOLD_MS), false, "the window is half-open");
  assert.equal(isWheelTurning(touched, touched + VOLUME_HOLD_MS + 1), false);
});

test("a warm wheel keeps the LOCAL value; a cold wheel takes the server's", () => {
  const touched = 10_000;
  // Warm: an incoming echo (even a plausible one) is ignored.
  assert.equal(resolveVolumeOnPush(45, 100, touched, touched + 500), 45);
  assert.equal(resolveVolumeOnPush(45, 50, touched, touched + 500), 45);
  // Cold: a change made elsewhere (a phone) must take over once the turn is quiet.
  assert.equal(resolveVolumeOnPush(45, 80, touched, touched + VOLUME_HOLD_MS + 1), 80);
});

test("one wheel notch steps by VOLUME_STEP and stops at the rails", () => {
  assert.equal(nextWheelVolume(40, 1), 45);
  assert.equal(nextWheelVolume(40, -1), 35);
  assert.equal(VOLUME_STEP, 5);
  // Up stops at 100, down at 0 — a step that would overshoot is refused (null),
  // matching the wheel handler's <=95 / >=5 guards.
  assert.equal(nextWheelVolume(95, 1), 100);
  assert.equal(nextWheelVolume(96, 1), null);
  assert.equal(nextWheelVolume(100, 1), null);
  assert.equal(nextWheelVolume(5, -1), 0);
  assert.equal(nextWheelVolume(4, -1), null);
  assert.equal(nextWheelVolume(0, -1), null);
});

test("THE REVERSAL: a stale echo mid-turn does not reverse the wheel", () => {
  // Reproduces the device log (requests ping-ponged 45 <-> 100). The user turns
  // DOWN twice; between the notches a poll replays the PRE-turn volume. With the
  // hold, each notch computes from the value actually set, so it keeps going
  // down. Without the hold it would snap back and the second notch would UNDO
  // the first — the bounce.
  const t = 10_000;
  let local = 50;

  // First notch down.
  local = nextWheelVolume(local, -1)!; // 45
  assert.equal(local, 45);
  const touchedAt = t; // setVolume stamps the touch

  // A stale server push arrives 300ms later carrying the OLD 50.
  local = resolveVolumeOnPush(local, 50, touchedAt, t + 300)!;
  assert.equal(local, 45, "the stale 50 must not win while the wheel is warm");

  // Second notch down computes from 45, not 50.
  local = nextWheelVolume(local, -1)!;
  assert.equal(local, 40, "the wheel keeps going down instead of bouncing back to 45");

  // Contrast: had the echo won (no hold), the base would be 50 and the second
  // notch would land on 45 — visibly reversing the user's turn.
  const bounced = nextWheelVolume(50, -1);
  assert.equal(bounced, 45, "documents the OLD broken behaviour the hold prevents");
});

test("after the turn settles, an external change is honoured", () => {
  // Turn ends at 40 at time t; 5s later someone sets 80 from a phone.
  const t = 10_000;
  const local = 40;
  assert.equal(resolveVolumeOnPush(local, 80, t, t + VOLUME_HOLD_MS + 1), 80);
});
