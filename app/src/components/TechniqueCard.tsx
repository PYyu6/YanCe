/**
 * TechniqueCard — Expandable technique explanation
 * ─────────────────────────────────────────────────
 * Shows a technique name + brief info from the knowledge base.
 * Expandable to show full description and how-to.
 */

import { useState } from 'react';
import { getTechniqueById } from '../engine/techniqueAdvisor';

interface Props {
  techniqueId: string;
}

export default function TechniqueCard({ techniqueId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tech = getTechniqueById(techniqueId);
  if (!tech) return null;

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="technique-card w-full text-left rounded-lg p-3 transition-all hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-rock-400 text-xs uppercase tracking-wide">
            {tech.category.replace('_', ' ')}
          </span>
          <span className="text-rock-100 font-medium text-sm">
            {tech.name}
          </span>
          <span className="text-rock-500 text-xs">
            {tech.nameCn}
          </span>
        </div>
        <span className="text-rock-500 text-xs">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-rock-300">{tech.description}</p>
          <div className="bg-rock-900/50 rounded-lg p-2">
            <p className="text-rock-400 text-xs font-medium mb-1">How to:</p>
            <p className="text-rock-200 text-xs leading-relaxed">{tech.howTo}</p>
          </div>
          <div className="flex gap-4 text-xs text-rock-400">
            <span>Reach benefit: {(tech.reachBenefit * 100).toFixed(0)}%</span>
            <span>Energy saving: {(tech.energySaving * 100).toFixed(0)}%</span>
            <span className="capitalize">Level: {tech.minLevel}</span>
          </div>
        </div>
      )}
    </button>
  );
}
