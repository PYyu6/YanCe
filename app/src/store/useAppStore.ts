/**
 * App State Management (Zustand)
 * ──────────────────────────────
 * Central store managing the 5-step user flow:
 * profile → camera → calibrate → detect → analyze
 */

import { create } from 'zustand';
import {
  AppState,
  AppStep,
  ClimberProfile,
  CalibrationResult,
  DetectedHold,
  RouteAnalysis,
  Point,
} from '../types';
import { computeMeasurements } from '../engine/climberModel';
import { buildRouteGraph } from '../engine/graphBuilder';
import { generateBetas } from '../engine/betaGenerator';
import { parseRoute } from '../detection/routeParser';

interface AppActions {
  // Navigation
  setStep: (step: AppStep) => void;
  goBack: () => void;

  // Profile
  setProfile: (profile: ClimberProfile) => void;

  // Camera
  setCapturedImage: (dataUrl: string, width: number, height: number) => void;

  // Calibration
  setCalibration: (cal: CalibrationResult) => void;

  // Hold detection
  setHolds: (holds: DetectedHold[]) => void;
  addHold: (hold: DetectedHold) => void;
  removeHold: (id: string) => void;
  toggleHoldStart: (id: string) => void;
  toggleHoldTop: (id: string) => void;
  setSelectedRouteColor: (color: string | null) => void;

  // Analysis
  runAnalysis: () => void;
  setCurrentBeta: (index: number) => void;
  setCurrentMove: (step: number) => void;

  // Reset
  reset: () => void;
}

const STEP_ORDER: AppStep[] = ['profile', 'camera', 'calibrate', 'detect', 'analyze'];

const initialState: AppState = {
  step: 'profile',
  profile: null,
  capturedImage: null,
  imageSize: null,
  calibration: null,
  holds: [],
  selectedRouteColor: null,
  analysis: null,
  currentBetaIndex: 0,
  currentMoveStep: 0,
};

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  goBack: () => {
    const { step } = get();
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      set({ step: STEP_ORDER[idx - 1] });
    }
  },

  setProfile: (profile) => set({ profile, step: 'camera' }),

  setCapturedImage: (dataUrl, width, height) =>
    set({
      capturedImage: dataUrl,
      imageSize: { width, height },
      step: 'calibrate',
    }),

  setCalibration: (cal) => set({ calibration: cal, step: 'detect' }),

  setHolds: (holds) => set({ holds }),

  addHold: (hold) =>
    set((state) => ({ holds: [...state.holds, hold] })),

  removeHold: (id) =>
    set((state) => ({ holds: state.holds.filter((h) => h.id !== id) })),

  toggleHoldStart: (id) =>
    set((state) => ({
      holds: state.holds.map((h) =>
        h.id === id ? { ...h, isStart: !h.isStart } : h,
      ),
    })),

  toggleHoldTop: (id) =>
    set((state) => ({
      holds: state.holds.map((h) =>
        h.id === id ? { ...h, isTop: !h.isTop } : h,
      ),
    })),

  setSelectedRouteColor: (color) => set({ selectedRouteColor: color }),

  runAnalysis: () => {
    const { holds, calibration, profile } = get();
    if (!calibration || !profile || holds.length < 3) return;

    const measurements = computeMeasurements(profile);
    const routeInfo = parseRoute(holds, calibration);
    const graph = buildRouteGraph(routeInfo.holds, measurements);
    const betas = generateBetas(graph, measurements, profile.experience);

    // Build reach map from start holds
    const reachMap: Record<string, string> = {};
    for (const hold of holds) {
      // Default: classify based on distance from nearest start hold
      const startHolds = holds.filter((h) => h.isStart);
      if (startHolds.length === 0) continue;

      let minDist = Infinity;
      for (const sh of startHolds) {
        const dx = hold.worldCenter.x - sh.worldCenter.x;
        const dy = hold.worldCenter.y - sh.worldCenter.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }

      const ratio = minDist / measurements.armLength;
      if (ratio < 0.5) reachMap[hold.id] = 'easy';
      else if (ratio < 0.75) reachMap[hold.id] = 'moderate';
      else if (ratio < 1.0) reachMap[hold.id] = 'limit';
      else if (ratio < 1.4) reachMap[hold.id] = 'dynamic';
      else reachMap[hold.id] = 'unreachable';
    }

    set({
      holds: routeInfo.holds,
      analysis: {
        holds: routeInfo.holds,
        calibration,
        climber: profile,
        measurements,
        betas,
        reachMap: reachMap as any,
      },
      currentBetaIndex: 0,
      currentMoveStep: 0,
      step: 'analyze',
    });
  },

  setCurrentBeta: (index) => set({ currentBetaIndex: index, currentMoveStep: 0 }),
  setCurrentMove: (step) => set({ currentMoveStep: step }),

  reset: () => set(initialState),
}));
