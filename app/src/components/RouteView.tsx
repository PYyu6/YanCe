/**
 * RouteView — Analysis Visualization
 * ───────────────────────────────────
 * Shows the captured wall image with overlaid:
 * - Hold markers (numbered, color-coded by reach difficulty)
 * - Move arrows for the current beta step
 * - Reach circles showing what's reachable from current position
 *
 * This is the main visualization component of the analysis step.
 */

import { useEffect, useRef } from 'react';
import { DetectedHold, Move, ReachDifficulty } from '../types';
import { DIFFICULTY_COLORS } from '../utils/colors';

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  holds: DetectedHold[];
  currentMove: Move | null;
  reachMap: Record<string, ReachDifficulty>;
  showReachCircles: boolean;
  armLengthPx: number;  // arm length in image pixels (for reach circles)
}

export default function RouteView({
  imageUrl, imageWidth, imageHeight, holds, currentMove, reachMap, showReachCircles, armLengthPx,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw when state changes
  useEffect(() => { draw(); }, [holds, currentMove, reachMap, showReachCircles]);

  function draw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const container = canvas.parentElement!;
    const scale = Math.min(
      container.clientWidth / imageWidth,
      container.clientHeight / imageHeight,
    );
    canvas.width = imageWidth * scale;
    canvas.height = imageHeight * scale;
    const ctx = canvas.getContext('2d')!;

    // Draw base image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Semi-transparent overlay to make markers pop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw reach circles from current position
    if (showReachCircles && currentMove) {
      const fromHold = holds.find((h) => h.id === currentMove.fromHoldId);
      if (fromHold) {
        const cx = fromHold.pixelCenter.x * scale;
        const cy = fromHold.pixelCenter.y * scale;
        const r = armLengthPx * scale;

        // Easy reach
        ctx.strokeStyle = DIFFICULTY_COLORS.easy + '40';
        ctx.fillStyle = DIFFICULTY_COLORS.easy + '10';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Moderate reach
        ctx.strokeStyle = DIFFICULTY_COLORS.moderate + '40';
        ctx.fillStyle = DIFFICULTY_COLORS.moderate + '08';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Limit reach
        ctx.strokeStyle = DIFFICULTY_COLORS.limit + '40';
        ctx.fillStyle = DIFFICULTY_COLORS.limit + '06';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw move arrow
    if (currentMove) {
      const fromHold = holds.find((h) => h.id === currentMove.fromHoldId);
      const toHold = holds.find((h) => h.id === currentMove.toHoldId);
      if (fromHold && toHold) {
        const fx = fromHold.pixelCenter.x * scale;
        const fy = fromHold.pixelCenter.y * scale;
        const tx = toHold.pixelCenter.x * scale;
        const ty = toHold.pixelCenter.y * scale;

        // Arrow line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const angle = Math.atan2(ty - fy, tx - fx);
        const headLen = 14;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - headLen * Math.cos(angle - Math.PI / 6),
          ty - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          tx - headLen * Math.cos(angle + Math.PI / 6),
          ty - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw holds
    for (let i = 0; i < holds.length; i++) {
      const hold = holds[i];
      const x = hold.pixelCenter.x * scale;
      const y = hold.pixelCenter.y * scale;
      const r = Math.max(hold.pixelRadius * scale, 10);
      const difficulty = reachMap[hold.id] ?? 'moderate';
      const color = DIFFICULTY_COLORS[difficulty] ?? DIFFICULTY_COLORS.moderate;

      const isFrom = currentMove?.fromHoldId === hold.id;
      const isTo = currentMove?.toHoldId === hold.id;

      // Hold circle
      ctx.strokeStyle = isTo ? '#ffffff' : color;
      ctx.lineWidth = isTo ? 4 : isFrom ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Filled center for active holds
      if (isFrom || isTo) {
        ctx.fillStyle = isTo ? '#ffffff30' : color + '30';
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulsing ring on target hold
      if (isTo) {
        ctx.strokeStyle = '#ffffff60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${isTo ? '14' : '11'}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Show start/top labels or step number
      let label: string;
      if (hold.isStart) label = 'S';
      else if (hold.isTop) label = 'T';
      else label = String(i + 1);

      // Background pill for label
      const metrics = ctx.measureText(label);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(x - metrics.width / 2 - 4, y - r - 18, metrics.width + 8, 16, 4);
      ctx.fill();

      ctx.fillStyle = isTo ? '#ffffff' : color;
      ctx.fillText(label, x, y - r - 10);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} className="max-w-full max-h-full" />
    </div>
  );
}
