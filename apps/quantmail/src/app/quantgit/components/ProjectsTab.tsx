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
          <div key={col} className="bg-[#161B22] border border-[#30363D] rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between font-bold text-white border-b border-[#21262D] pb-2">
              <span>{title}</span>
              <span className="px-2 py-0.2 rounded-full bg-[#21262D] text-[#7D8590] text-[10px]">
                {colCards.length}
              </span>
            </div>
            <div className="space-y-2">
              {colCards.map((card) => (
                <div
                  key={card.id}
                  className="p-3 rounded bg-[#0D1117] border border-[#30363D] space-y-2 shadow-sm"
                >
                  <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] text-[10px] font-bold">
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
                        className="text-[#FF8C42] hover:underline font-bold"
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
