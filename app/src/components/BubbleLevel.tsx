/**
 * BubbleLevel — Visual tilt indicator
 * ────────────────────────────────────
 * Shows a circular bubble level overlay on the camera feed.
 * Green when level, yellow/red when tilted.
 */

interface Props {
  angleOk: boolean;
  levelOk: boolean;
}

export default function BubbleLevel({ angleOk, levelOk }: Props) {
  const bothOk = angleOk && levelOk;

  return (
    <div
      className={`w-16 h-16 rounded-full border-2 flex items-center justify-center transition-colors ${
        bothOk
          ? 'border-green-400 bg-green-400/10'
          : 'border-yellow-400 bg-yellow-400/10'
      }`}
    >
      {/* Target circle (center) */}
      <div className="w-5 h-5 rounded-full border border-dashed border-white/30" />

      {/* Bubble dot */}
      <div
        className={`absolute w-3 h-3 rounded-full transition-all duration-200 ${
          bothOk ? 'bg-green-400' : 'bg-yellow-400'
        }`}
        style={{
          // When checks pass, bubble stays centered
          // This is a simplified visual — real offset would come from gyro data
          transform: bothOk ? 'translate(0, 0)' : 'translate(3px, -2px)',
        }}
      />

      {/* Label */}
      <div
        className={`absolute -bottom-5 text-[10px] font-medium ${
          bothOk ? 'text-green-400' : 'text-yellow-400'
        }`}
      >
        {bothOk ? 'Level' : 'Tilt'}
      </div>
    </div>
  );
}
