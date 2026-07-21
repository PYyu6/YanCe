/**
 * Unit: roboflowClient — prediction mapping and fetch behavior (mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  classToHoldType,
  predictionsToCandidates,
  detectWithRoboflow,
} from '../../src/services/roboflowClient';

describe('classToHoldType', () => {
  it('maps known classes and tolerates casing/whitespace', () => {
    expect(classToHoldType('Jug')).toBe('jug');
    expect(classToHoldType(' crimp ')).toBe('crimp');
    expect(classToHoldType('big-volume')).toBe('volume');
  });
  it('never throws on unrecognized labels — community models rename classes', () => {
    expect(classToHoldType('weird_new_class_v3')).toBe('unknown');
  });
});

describe('predictionsToCandidates', () => {
  it('keeps Roboflow center-coordinates and derives radius from the smaller box side', () => {
    const [c] = predictionsToCandidates([
      { x: 120, y: 340, width: 40, height: 60, confidence: 0.91, class: 'jug' },
    ]);
    expect(c.pixelCenter).toEqual({ x: 120, y: 340 }); // center convention, not top-left
    expect(c.pixelRadius).toBe(20); // min(40,60)/2 — elongated boxes don't inflate match radius
    expect(c.source).toBe('yolo');
    expect(c.holdType).toBe('jug');
  });
});

describe('detectWithRoboflow', () => {
  it('POSTs to the proxy and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [{ x: 1, y: 2, width: 10, height: 10, confidence: 0.7, class: 'crimp' }],
      }),
    });
    const out = await detectWithRoboflow('data:image/jpeg;base64,xxx', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/vlm-proxy', expect.objectContaining({ method: 'POST' }));
    expect(out).toHaveLength(1);
    expect(out[0].holdType).toBe('crimp');
  });

  it('returns [] on a malformed body instead of crashing detection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    const out = await detectWithRoboflow('data:...', fetchMock as unknown as typeof fetch);
    expect(out).toEqual([]);
  });

  it('throws on HTTP errors so the fusion orchestrator can degrade explicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(detectWithRoboflow('data:...', fetchMock as unknown as typeof fetch)).rejects.toThrow('502');
  });
});
