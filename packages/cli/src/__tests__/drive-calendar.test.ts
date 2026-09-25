import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import {
  formatBytes,
  formatGigabytes,
  renderProgressBar,
  getDriveItemIcon,
  registerDriveCommands,
} from '../commands/drive.js';
import {
  formatEventTime,
  formatEventDate,
  registerCalendarCommands,
} from '../commands/calendar.js';
import { stripAnsi } from '../git-utils.js';

describe('QuantDrive CLI Helpers', () => {
  describe('formatBytes', () => {
    it('handles zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes, kilobytes, megabytes, and gigabytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('handles fractional values with custom decimal places', () => {
      expect(formatBytes(1536, 2)).toBe('1.5 KB');
      expect(formatBytes(5 * 1024 * 1024 + 512 * 1024, 2)).toBe('5.5 MB');
    });

    it('handles negative or invalid numbers safely', () => {
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
    });
  });

  describe('formatGigabytes', () => {
    it('formats bytes in gigabytes with 2 decimal places', () => {
      expect(formatGigabytes(0)).toBe('0.00 GB');
      expect(formatGigabytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatGigabytes(15 * 1024 * 1024 * 1024)).toBe('15.00 GB');
      expect(formatGigabytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });

    it('handles negative numbers safely', () => {
      expect(formatGigabytes(-500)).toBe('0.00 GB');
    });
  });

  describe('renderProgressBar', () => {
    it('renders a full progress bar at 100%', () => {
      const bar = renderProgressBar(100, 100, 20);
      const clean = stripAnsi(bar);
      expect(clean).toContain('[████████████████████] 100.0%');
    });

    it('renders a half-filled progress bar at 50%', () => {
      const bar = renderProgressBar(50, 100, 20);
      const clean = stripAnsi(bar);
      expect(clean).toContain('[██████████░░░░░░░░░░] 50.0%');
    });

    it('renders an empty progress bar at 0%', () => {
      const bar = renderProgressBar(0, 100, 20);
      const clean = stripAnsi(bar);
      expect(clean).toContain('[░░░░░░░░░░░░░░░░░░░░] 0.0%');
    });
  });

  describe('getDriveItemIcon', () => {
    it('returns folder icon for directories', () => {
      expect(getDriveItemIcon(true)).toBe('📁');
    });

    it('returns specific icons for various file types', () => {
      expect(getDriveItemIcon(false, 'application/pdf', 'doc.pdf')).toBe('📕');
      expect(getDriveItemIcon(false, 'image/png', 'photo.png')).toBe('🖼️');
      expect(getDriveItemIcon(false, 'video/mp4', 'clip.mp4')).toBe('🎬');
      expect(getDriveItemIcon(false, 'audio/mpeg', 'song.mp3')).toBe('🎵');
      expect(getDriveItemIcon(false, 'text/csv', 'data.csv')).toBe('📊');
      expect(getDriveItemIcon(false, 'text/plain', 'notes.txt')).toBe('📝');
      expect(getDriveItemIcon(false, 'application/zip', 'archive.zip')).toBe('📦');
      expect(getDriveItemIcon(false, 'application/octet-stream', 'unknown.xyz')).toBe('📄');
    });
  });

  describe('registerDriveCommands', () => {
    it('registers drive command with all required subcommands', () => {
      const program = new Command();
      registerDriveCommands(program);

      const driveCmd = program.commands.find((c) => c.name() === 'drive');
      expect(driveCmd).toBeDefined();

      const subcommands = driveCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('ls');
      expect(subcommands).toContain('upload');
      expect(subcommands).toContain('download');
      expect(subcommands).toContain('quota');
      expect(subcommands).toContain('duplicates');
    });
  });
});

describe('QuantCalendar CLI Helpers', () => {
  describe('formatEventTime', () => {
    it('formats a date time into 12-hour AM/PM string', () => {
      const date = new Date('2026-09-25T14:30:00.000Z');
      const timeStr = formatEventTime(date);
      expect(timeStr).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
    });

    it('handles invalid date input safely', () => {
      expect(formatEventTime('invalid-date')).toBe('invalid-date');
    });
  });

  describe('formatEventDate', () => {
    it('formats a date into readable weekday and month string', () => {
      const date = new Date('2026-09-25T14:30:00.000Z');
      const dateStr = formatEventDate(date);
      expect(dateStr).toContain('2026');
      expect(dateStr).toContain('Sep');
    });

    it('handles invalid date input safely', () => {
      expect(formatEventDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('registerCalendarCommands', () => {
    it('registers calendar command with all required subcommands', () => {
      const program = new Command();
      registerCalendarCommands(program);

      const calCmd = program.commands.find((c) => c.name() === 'calendar');
      expect(calCmd).toBeDefined();

      const subcommands = calCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('agenda');
      expect(subcommands).toContain('book');
    });
  });
});

describe('QuantDrive & Calendar Command Invocation with Mocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates potential reclaimable space from duplicate groups accurately', () => {
    const mockGroups = [
      {
        hash: 'hash-aaa-111',
        files: [
          { id: 'f1', name: 'photo.jpg', size: 1024 * 1024 * 3 }, // 3 MB (keep)
          { id: 'f2', name: 'photo_copy.jpg', size: 1024 * 1024 * 3 }, // 3 MB (redundant)
          { id: 'f3', name: 'photo_bak.jpg', size: 1024 * 1024 * 3 }, // 3 MB (redundant)
        ],
      },
      {
        hash: 'hash-bbb-222',
        files: [
          { id: 'f4', name: 'report.pdf', size: 1024 * 1024 * 5 }, // 5 MB (keep)
          { id: 'f5', name: 'report_old.pdf', size: 1024 * 1024 * 5 }, // 5 MB (redundant)
        ],
      },
    ];

    let totalReclaimableBytes = 0;
    let totalDuplicates = 0;

    for (const group of mockGroups) {
      if (group.files.length > 1) {
        const redundant = group.files.slice(1);
        totalDuplicates += redundant.length;
        totalReclaimableBytes += redundant.reduce((sum, f) => sum + f.size, 0);
      }
    }

    expect(totalDuplicates).toBe(3); // 2 in group 1 + 1 in group 2
    expect(totalReclaimableBytes).toBe(11 * 1024 * 1024); // 6 MB + 5 MB = 11 MB
    expect(formatBytes(totalReclaimableBytes)).toBe('11 MB');
  });

  it('correctly maps quota calculation and progress ratio', () => {
    const used = 3 * 1024 * 1024 * 1024; // 3 GB
    const total = 15 * 1024 * 1024 * 1024; // 15 GB
    const ratio = used / total;
    expect(ratio).toBeCloseTo(0.2, 5);

    const bar = renderProgressBar(used, total, 10);
    expect(stripAnsi(bar)).toBe('[██░░░░░░░░] 20.0%');
  });
});
