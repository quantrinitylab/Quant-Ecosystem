'use client';

import React, { useState } from 'react';
import { showToast } from '../../../components/InboxToast';

export interface CalendarQuantMeetViewProps {
  className?: string;
}

function VideoCameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

export function CalendarQuantMeetView({ className = '' }: CalendarQuantMeetViewProps) {
  const [meetingCode, setMeetingCode] = useState('');
  const [activeInstantMeeting, setActiveInstantMeeting] = useState<string | null>(null);

  const upcomingCalls = [
    {
      id: 'call-1',
      title: 'Weekly Ecosystem Architecture Sync',
      time: 'Today · 11:00 AM - 12:00 PM',
      host: 'Kundan Singh',
      attendees: 6,
      roomCode: 'arch-sync-42',
    },
    {
      id: 'call-2',
      title: 'Sprint 42 Retrospective & Tripartite Handover',
      time: 'Today · 03:30 PM - 04:15 PM',
      host: 'Node B (Agent OS)',
      attendees: 9,
      roomCode: 'sprint-42-retro',
    },
    {
      id: 'call-3',
      title: 'Public Roadmap Strategy & Q&A',
      time: 'Tomorrow · 10:00 AM - 11:00 AM',
      host: 'Sarah Connor',
      attendees: 14,
      roomCode: 'roadmap-qa',
    },
  ];

  const handleStartInstantMeeting = () => {
    const code = `meet-${Math.random().toString(36).substring(2, 8)}`;
    setActiveInstantMeeting(code);
    showToast({
      text: `Instant meeting started: room #${code}`,
      type: 'success',
    });
  };

  const handleJoinCall = (roomCode: string, title: string) => {
    showToast({
      text: `Connecting to "${title}" via HD WebRTC…`,
      type: 'info',
    });
  };

  return (
    <div
      id="subview-quantmeet"
      role="tabpanel"
      aria-labelledby="tab-quantmeet"
      className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Top Action Card: QuantMeet HD Video Meeting Launcher */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                QuantMeet HD Video
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                WebRTC 4K P2P
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5] mt-1">
              Zero-Latency Encrypted Video Conferencing
            </h2>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              Launch instant peer-to-peer HD video meetings or connect to scheduled company calls.
            </p>
          </div>

          {/* WebRTC Status Indicator Bar */}
          <div
            className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#090A0E] border border-[#232938] text-xs text-[#A1A4AC] shadow-inner"
            title="Real-time WebRTC Audio/Video Readiness"
          >
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <MicIcon className="size-3.5" />
            </span>
            <span className="text-[#F5F5F5] font-mono text-xs">
              Mic: Ready · Camera: Ready
            </span>
          </div>
        </div>

        {/* Action Controls: Molten Amber Button & Code Input */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Action card: [Start Instant Meeting] (molten amber button) */}
          <button
            type="button"
            onClick={handleStartInstantMeeting}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-black font-bold text-sm shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            <VideoCameraIcon className="size-5 text-black" />
            <span>Start Instant Meeting</span>
          </button>

          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              placeholder="Enter meeting link or code…"
              className="flex-1 bg-[#090A0E] border border-[#232938] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#A1A4AC]/60 focus:outline-none focus:border-[#F59E0B] transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                if (meetingCode.trim()) {
                  handleJoinCall(meetingCode, `Room ${meetingCode}`);
                }
              }}
              disabled={!meetingCode.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#161822] hover:bg-[#1f2230] disabled:opacity-50 text-xs font-semibold text-[#F59E0B] border border-[#232938] transition-all focus-visible:outline-none"
            >
              Join
            </button>
          </div>
        </div>

        {activeInstantMeeting && (
          <div className="p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#F59E0B] font-mono">
              <SparklesIcon className="size-4" />
              <span>Instant Room Active: https://quantmail.in/meet/{activeInstantMeeting}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `https://quantmail.in/meet/${activeInstantMeeting}`,
                );
                showToast({ text: 'Meeting URL copied', type: 'success' });
              }}
              className="px-2.5 py-1 rounded bg-[#F59E0B] text-black font-bold text-[11px]"
            >
              Copy Link
            </button>
          </div>
        )}
      </div>

      {/* Upcoming Video Calls List */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#232938] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#F5F5F5]">Upcoming Video Calls</h3>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              Synced with your calendar schedule and video room bindings
            </p>
          </div>
          <span className="text-xs font-medium text-[#F59E0B]">
            {upcomingCalls.length} scheduled calls
          </span>
        </div>

        <div className="space-y-3">
          {upcomingCalls.map((call) => (
            <div
              key={call.id}
              className="p-4 rounded-xl bg-[#090A0E] border border-[#232938] hover:border-[#F59E0B]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-[#F5F5F5]">{call.title}</h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161822] text-[#A1A4AC] border border-[#232938]">
                    #{call.roomCode}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-[#A1A4AC] flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[#F59E0B]">
                    <ClockIcon className="size-3.5 text-[#F59E0B]" />
                    <span>{call.time}</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon className="size-3.5 text-current" />
                    <span>
                      Host: {call.host} · {call.attendees} attendees
                    </span>
                  </span>
                </div>
              </div>

              {/* Action pill: [Join HD Call] */}
              <button
                type="button"
                onClick={() => handleJoinCall(call.roomCode, call.title)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#161822] hover:bg-[#F59E0B] hover:text-black text-xs font-bold text-[#F59E0B] border border-[#F59E0B]/40 hover:border-[#F59E0B] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
              >
                <VideoCameraIcon className="size-3.5 text-current" />
                <span>Join HD Call</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
