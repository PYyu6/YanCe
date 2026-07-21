# YanCe (岩策)

**One wall. Your body. Your beta.** YanCe turns a calibrated photo of an indoor bouldering wall into a route plan shaped by a climber's height, arm span, grade, and experience. It detects a route, lets the climber correct every hold, and compares how two bodies may solve the same wall differently.

The full-body beta shows every move as a separate four-contact stance: one clearly labeled **MOVED** hand or foot plus three **SUPPORT** contacts. Hold contacts and wall smears/flags are distinguished, and the suggested order explains why the next move is comparatively natural from the current stance.

## Live demo

- [Judge-ready seeded walkthrough](https://yan-ce.vercel.app/?demo=1&mode=classic) — no account or API key required.
- [Full photo workflow](https://yan-ce.vercel.app/?mode=classic) — upload, calibrate, correct holds, and plan.

## Run locally

```bash
cd app
npm ci
npm run dev
```

Open `http://localhost:5173/?mode=classic`. For a judge-ready seeded walkthrough, use `http://localhost:5173/?demo=1&mode=classic`. Optional fused mode at `/?mode=fused&dev=1` uses server-side `OPENAI_API_KEY` and `ROBOFLOW_API_KEY` values; see `app/.env.example`.

## How it works

- Deterministic calibration, reach geometry, graph search, and grounding own coordinates and legal moves.
- GPT-5.6 performs bounded candidate verification and explains only the graph-selected sequence.
- Model stages fail open to the zero-key classic planner.
- The full-body planner emits complete before/after hand-and-foot stances, with exactly one moving limb per step and explicit wall-contact labels.
- Uncertain recorded contacts require confirmation before replanning and create a private Beta Receipt.

Codex accelerated the typed implementation, refactors, tests, failure tracing, and release preparation. Human decisions kept geometry deterministic, model roles bounded, corrections visible, and recorded fixtures honestly labeled.

Build Week Codex session: `019f8605-7bd7-7fe0-b311-9c59d5490c49`.

Verification: **113 unit/integration tests**, **17 Chromium flows**, TypeScript, and the production build pass.

Current boundary: the starting stance is inferred rather than visually edited, the main wall canvas does not yet overlay all four contacts, and the planner is a conservative upward-first heuristic rather than a physics simulator. Live-camera pose/contact perception and representative real-gym validation are future work. YanCe is not a spotter, medical tool, or safety guarantee.

[MIT licensed](LICENSE). The bundled sample clip retains its original CC BY-SA 3.0 attribution in `app/public/samples/ATTRIBUTION.txt`.
