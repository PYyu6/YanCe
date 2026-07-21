/**
 * Unit: graphBuilder — edge classification and the new hold-type modifier.
 */
import { describe, it, expect } from 'vitest';
import { buildRouteGraph, HOLD_TYPE_COST_MODIFIER } from '../../src/engine/graphBuilder';
import { computeMeasurements } from '../../src/engine/climberModel';
import { FIXTURE_HOLDS, TALL_PROFILE } from '../fixtures/wallSimple';

const tallM = computeMeasurements(TALL_PROFILE);

describe('buildRouteGraph', () => {
  it('creates no edges for unreachable pairs', () => {
    const graph = buildRouteGraph(FIXTURE_HOLDS, tallM);
    // start (y=0) → top (y=110): 110cm upward > tall dynamic ceiling (~108cm)
    const startEdges = graph.edges.get('hold-start')!;
    expect(startEdges.some((e) => e.toId === 'hold-top')).toBe(false);
  });

  it('classifies a mid-band reach (start→l3, 49.5cm up) as moderate for the tall body', () => {
    const graph = buildRouteGraph(FIXTURE_HOLDS, tallM);
    const toL3 = graph.edges.get('hold-start')!.find((e) => e.toId === 'hold-l3')!;
    expect(toL3.difficulty).toBe('moderate'); // 49.5/77.2 = 0.64
    expect(toL3.weight).toBe(3);
  });

  it('classifies the off-axis decoy (start→M, 71.1cm) as limit for the tall body', () => {
    const graph = buildRouteGraph(FIXTURE_HOLDS, tallM);
    const toM = graph.edges.get('hold-start')!.find((e) => e.toId === 'hold-M')!;
    expect(toM.difficulty).toBe('limit'); // 71.1/77.2 = 0.92
  });

  it('registers start and top holds', () => {
    const graph = buildRouteGraph(FIXTURE_HOLDS, tallM);
    expect(graph.startIds).toEqual(['hold-start']);
    expect(graph.topId).toBe('hold-top');
  });

  describe('hold-type cost modifier (fusion extension)', () => {
    it('is bit-for-bit identical to the classic engine when no types are given', () => {
      const classic = buildRouteGraph(FIXTURE_HOLDS, tallM);
      const withEmptyTypes = buildRouteGraph(FIXTURE_HOLDS, tallM, {});
      const edgeWeights = (g: typeof classic) =>
        [...g.edges.values()].flat().map((e) => `${e.fromId}>${e.toId}:${e.weight}`);
      // The safe-rollback guarantee: absence of type info must not change anything.
      expect(edgeWeights(withEmptyTypes)).toEqual(edgeWeights(classic));
    });

    it('raises the cost of moves ONTO a crimp and lowers onto a jug', () => {
      const crimpGraph = buildRouteGraph(FIXTURE_HOLDS, tallM, { 'hold-M': 'crimp' });
      const jugGraph = buildRouteGraph(FIXTURE_HOLDS, tallM, { 'hold-M': 'jug' });
      const classic = buildRouteGraph(FIXTURE_HOLDS, tallM);

      const w = (g: typeof classic) =>
        g.edges.get('hold-start')!.find((e) => e.toId === 'hold-M')!.weight;

      expect(w(crimpGraph)).toBeCloseTo(w(classic) * HOLD_TYPE_COST_MODIFIER.crimp, 5);
      expect(w(jugGraph)).toBeCloseTo(w(classic) * HOLD_TYPE_COST_MODIFIER.jug, 5);
    });

    it('applies the modifier to the TARGET hold only', () => {
      // Typing the FROM hold must not change the edge's weight.
      const classic = buildRouteGraph(FIXTURE_HOLDS, tallM);
      const fromTyped = buildRouteGraph(FIXTURE_HOLDS, tallM, { 'hold-start': 'crimp' });
      const w = (g: typeof classic) =>
        g.edges.get('hold-start')!.find((e) => e.toId === 'hold-M')!.weight;
      expect(w(fromTyped)).toBe(w(classic));
    });
  });
});
