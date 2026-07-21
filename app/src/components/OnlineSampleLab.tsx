/**
 * Immediately viewable online-video lab.
 *
 * Product honesty is part of this component's acceptance contract. It places
 * the media license, label provenance, and “pixels are not read” limitation
 * beside the run button, so the sample cannot be mistaken for live perception.
 */
import { useRef, useState } from 'react';
import { SampleContactRun } from '../types';
import {
  ONLINE_CLIMBING_SAMPLE,
  runOnlineClimbingSampleTrace,
} from '../samples/onlineClimbingSample';

interface Props {
  onBack: () => void;
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export default function OnlineSampleLab({ onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [run, setRun] = useState<SampleContactRun | null>(null);
  const sample = ONLINE_CLIMBING_SAMPLE;
  const label = sample.labels[0];

  const jumpToWindow = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = label.startMs / 1000;
  };

  const runSample = () => {
    jumpToWindow();
    setRun(runOnlineClimbingSampleTrace());
  };

  const final = run?.finalEstimate;
  const downloadableData = encodeURIComponent(
    JSON.stringify(
      {
        sampleId: sample.id,
        label: sample.labels[0],
        observations: sample.observations,
        disclaimer: 'Hand-authored YanCe demo data; not extracted from video pixels.',
      },
      null,
      2,
    ),
  );

  return (
    <main
      data-testid="online-sample-lab"
      className="min-h-screen bg-[#0d1716] px-4 py-5 text-white sm:px-6 lg:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Public sample lab
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              Try a real climbing video
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              Watch an openly licensed indoor bouldering clip, jump to the inspected
              21-second window, and run four sample observations through YanCe's
              time-based contact check.
            </p>
          </div>
          <button
            onClick={onBack}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Back to YanCe
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
            <div className="overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                data-testid="sample-video"
                src={sample.mediaPath}
                controls
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={jumpToWindow}
                className="mx-auto aspect-[9/16] max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">{sample.title}</div>
                <div data-testid="sample-license" className="text-xs text-slate-400">
                  Unchanged video by{' '}
                  <a
                    className="text-emerald-300 underline"
                    href={sample.license.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {sample.license.creator}
                  </a>{' '}
                  ·{' '}
                  <a
                    className="text-emerald-300 underline"
                    href={sample.license.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {sample.license.name}
                  </a>
                </div>
              </div>
              <button
                data-testid="jump-sample-window"
                onClick={jumpToWindow}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15"
              >
                Jump to {seconds(label.startMs)}
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div
              data-testid="sample-disclosure"
              className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-relaxed text-amber-100"
            >
              <b>What this proves:</b> playback, ordered sample data, the contact
              check, and its explanation are connected. <b>This page does not read
              the video pixels.</b> The four values below were written by YanCe for
              a UI exercise; they are not pose-model output or published truth.
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Visible sample data
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-black/20 p-3"><span className="text-slate-400">Limb</span><br/><b>Left foot</b></div>
                <div className="rounded-lg bg-black/20 p-3"><span className="text-slate-400">Frames</span><br/><b>4 observations</b></div>
                <div className="rounded-lg bg-black/20 p-3"><span className="text-slate-400">Window</span><br/><b>{seconds(label.startMs)} → {seconds(label.endMs)}</b></div>
                <div className="rounded-lg bg-black/20 p-3"><span className="text-slate-400">Label source</span><br/><b>Hand-authored demo</b></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                {sample.observations.map((observation) => (
                  <span key={observation.timestampMs} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                    {seconds(observation.timestampMs)}
                  </span>
                ))}
              </div>
              <a
                className="mt-3 inline-block text-xs font-semibold text-sky-300 underline"
                href={`data:application/json;charset=utf-8,${downloadableData}`}
                download="yance-online-climbing-demo-trace.json"
              >
                Download these four observations (.json)
              </a>
            </div>

            <button
              data-testid="run-online-sample"
              onClick={runSample}
              className="w-full rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-400"
            >
              Run sample data through contact check
            </button>

            <div
              data-testid="online-sample-result"
              className={`rounded-xl border p-4 ${
                final
                  ? 'border-emerald-300/30 bg-emerald-300/10'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              {final ? (
                <>
                  <div className="text-lg font-black text-emerald-200">Proposal ready · left foot</div>
                  <div className="mt-1 text-sm text-emerald-100">
                    {final.dwellMs} ms on one hold · {Math.round(final.probability * 100)}% evidence score
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-emerald-100/75">
                    80% overlap · 20 px/s motion · 90% visible. This is still a
                    proposal; the person must confirm it before YanCe changes the plan.
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">No sample run yet.</div>
              )}
            </div>

            <div className="rounded-xl border border-violet-300/20 bg-violet-300/10 p-4 text-sm leading-relaxed text-violet-100">
              <b>For real accuracy next:</b>{' '}
              <a
                href={sample.groundTruthDataset.url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-violet-200 underline"
              >
                The Way Up hold-usage dataset
              </a>{' '}
              has 22 coach-labeled videos with hold-use time and occlusion labels.
              Its full public archive is 20.9 GB, so it is linked rather than bundled.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
