/**
 * P1 contract tests written before the receipt implementation.
 *
 * These tests protect four non-negotiable behaviors:
 *  1. the session begins with an inspectable state snapshot;
 *  2. an observation is recorded without mutating the earlier snapshot;
 *  3. confirmation records both invalidation and replacement;
 *  4. rejection counts as a correction, not a replan.
 *
 * They intentionally avoid UI text so the pure event semantics remain usable
 * by a future real pose/contact producer.
 */
import { describe, expect, it } from 'vitest';
import {
  confirmRecordedContact,
  createRecordedLiveCoachSession,
  proposeRecordedFootSwitch,
  rejectRecordedContact,
} from '../../src/services/liveCoachFixture';
import { computeBetaForProfile } from '../../src/services/betaForProfile';
import { FIXTURE_HOLDS, TALL_PROFILE } from '../fixtures/wallSimple';

function fixture() {
  const beta = computeBetaForProfile(FIXTURE_HOLDS, TALL_PROFILE).betas[0];
  const session = createRecordedLiveCoachSession(FIXTURE_HOLDS, beta);
  return { beta, session };
}

describe('P1 beta receipt event history', () => {
  it('starts with one structured snapshot and stores no raw media', () => {
    const { session } = fixture();
    expect(session.receipt.source).toBe('recorded_fixture');
    expect(session.receipt.events.map((event) => event.type)).toEqual(['session_started']);
    expect(session.receipt.events[0].snapshot.contacts).toEqual(session.contacts);
    expect(session.receipt.privacy).toEqual({ rawVideoStored: false, rawAudioStored: false });
  });

  it('appends an observation without mutating the earlier confirmed snapshot', () => {
    const { session } = fixture();
    const firstSnapshot = session.receipt.events[0].snapshot;
    const proposed = proposeRecordedFootSwitch(session, FIXTURE_HOLDS);

    expect(proposed.receipt.events.map((event) => event.type)).toEqual([
      'session_started',
      'contact_observed',
    ]);
    expect(firstSnapshot.contacts).toEqual(session.contacts);
    expect(firstSnapshot.contacts.leftFoot.holdId).toBe(session.contacts.leftFoot.holdId);
    expect(proposed.receipt.events[1].confidence).toBe(proposed.proposedContact?.confidence);
    expect(proposed.receipt.events[1].confidence).toBeCloseTo(0.8617, 3);
  });

  it('records confirmation, stale-suggestion invalidation, and replacement in order', () => {
    const { beta, session } = fixture();
    const proposed = proposeRecordedFootSwitch(session, FIXTURE_HOLDS);
    const confirmed = confirmRecordedContact(proposed, beta);

    expect(confirmed.receipt.events.map((event) => event.type)).toEqual([
      'session_started',
      'contact_observed',
      'contact_confirmed',
      'suggestion_invalidated',
      'suggestion_created',
    ]);
    expect(confirmed.receipt.replanCount).toBe(1);
    expect(confirmed.receipt.correctionCount).toBe(0);
    expect(confirmed.receipt.events.map((event) => event.order)).toEqual([0, 1, 2, 3, 4]);
    expect(confirmed.receipt.events.at(-1)?.snapshot.suggestion).toEqual(
      confirmed.activeSuggestion,
    );
  });

  it('records a rejected observation as one correction and zero replans', () => {
    const { session } = fixture();
    const rejected = rejectRecordedContact(proposeRecordedFootSwitch(session, FIXTURE_HOLDS));

    expect(rejected.receipt.events.map((event) => event.type)).toEqual([
      'session_started',
      'contact_observed',
      'contact_rejected',
    ]);
    expect(rejected.receipt.correctionCount).toBe(1);
    expect(rejected.receipt.replanCount).toBe(0);
    expect(rejected.receipt.events.at(-1)?.snapshot.contacts).toEqual(session.contacts);
  });
});
