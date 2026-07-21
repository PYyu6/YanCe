# YanCe (岩策)

**One wall. Your body. Your beta.** YanCe turns a calibrated photo of an indoor bouldering wall into a route plan shaped by a climber's height, arm span, grade, and experience. It detects a route, lets the climber correct every hold, and compares how two bodies may solve the same wall differently.

## Run locally

```bash
cd app
npm ci
npm run dev
```

Open `http://localhost:5173/?mode=classic`. Optional fused mode at `/?mode=fused&dev=1` uses server-side `OPENAI_API_KEY` and `ROBOFLOW_API_KEY` values; see `app/.env.example`.

## How it works

- Deterministic calibration, reach geometry, graph search, and grounding own coordinates and legal moves.
- GPT-5.6 performs bounded candidate verification and explains only the graph-selected sequence.
- Model stages fail open to the zero-key classic planner.
- Uncertain recorded contacts require confirmation before replanning and create a private Beta Receipt.

Codex accelerated the typed implementation, refactors, tests, failure tracing, and release preparation. Human decisions kept geometry deterministic, model roles bounded, corrections visible, and recorded fixtures honestly labeled.

Verification: **84 unit/integration tests**, **11 Chromium flows**, TypeScript, and the production build pass.

Current boundary: live-camera pose/contact perception and representative real-gym accuracy validation are future work. YanCe is not a spotter, medical tool, or safety guarantee.

MIT licensed. The bundled sample clip retains its original CC BY-SA 3.0 attribution in `app/public/samples/ATTRIBUTION.txt`.
