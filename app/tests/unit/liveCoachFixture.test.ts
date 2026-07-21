/**
 * Unit coverage for the recorded contact-state contract.
 * These tests validate state semantics, not pose-model accuracy.
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
  return { beta, session: createRecordedLiveCoachSession(FIXTURE_HOLDS, beta) };
}

describe('recorded live-coach contact contract', () => {
  it('starts with four confirmed limb contacts and an explicit fixture source', () => {
    const { session } = fixture();
    expect(session.phase).toBe('watching');
    expect(session.source).toBe('recorded_fixture');
    expect(Object.keys(session.contacts)).toEqual([
      'leftHand', 'rightHand', 'leftFoot', 'rightFoot',
    ]);
  });

  it('keeps an observation proposed until confirmation, then replans', () => {
    const { beta, session } = fixture();
    const proposed = proposeRecordedFootSwitch(session, FIXTURE_HOLDS);
    expect(proposed.phase).toBe('uncertain');
    expect(proposed.contacts.leftFoot.holdId).toBe(session.contacts.leftFoot.holdId);

    const confirmed = confirmRecordedContact(proposed, beta);
    expect(confirmed.phase).toBe('replanned');
    expect(confirmed.contacts.leftFoot.holdId).toBe(proposed.proposedContact?.toHoldId);
    expect(confirmed.activeSuggestion).not.toEqual(confirmed.previousSuggestion);
  });

  it('rejects an observation without mutating confirmed contacts or suggestion', () => {
    const { session } = fixture();
    const proposed = proposeRecordedFootSwitch(session, FIXTURE_HOLDS);
    const rejected = rejectRecordedContact(proposed);
    expect(rejected.phase).toBe('watching');
    expect(rejected.contacts).toEqual(session.contacts);
    expect(rejected.activeSuggestion).toEqual(session.previousSuggestion);
  });
});
