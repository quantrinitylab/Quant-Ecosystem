'use client';

import React from 'react';
import type { ProjectCard } from '../types';

export interface ProjectsTabProps {
  projects: ProjectCard[];
  handleMoveKanban: (cardId: string, targetCol: 'todo' | 'in_progress' | 'done') => void;
}

export function ProjectsTab({ projects, handleMoveKanban }: ProjectsTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
      {(['todo', 'in_progress', 'done'] as const).map((col) => {
        const colCards = projects.filter((c) => c.column === col);
        const title = col === 'todo' ? 'To do' : col === 'in_progress' ? 'In progress' : 'Done';
        return (
          <div key={col} className="bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] rounded-md p-3 space-y-3">
 <div className="flex items-center justify-between font-bold text-white pb-2">
              <span>{title}</span>
              <span className="px-2 py-px rounded-full bg-black text-[#7D8590] text-[10px]">
                {colCards.length}
              </span>
            </div>
            <div className="space-y-2">
              {colCards.map((card) => (
                <div
                  key={card.id}
                  className="p-3 rounded bg-black border border-[var(--quant-border)] space-y-2 shadow-sm"
                >
                  <span className="px-1.5 py-px rounded bg-black text-[#8B5CF6] text-[10px] font-bold">
                    {card.tag}
                  </span>
                  <h5 className="font-bold text-white">{card.title}</h5>
                  <div className="flex items-center justify-between text-[10px] text-[#7D8590] pt-1">
                    <span>👤 {card.assignee}</span>
                    {col !== 'done' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleMoveKanban(card.id, col === 'todo' ? 'in_progress' : 'done')
                        }
                        className="text-[var(--app-accent)] hover:underline font-bold"
                      >
                        Move →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
