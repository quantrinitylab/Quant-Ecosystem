// ============================================================================
// @quant/shared-ui - Advanced Command Palette (Cmd+K)
// ============================================================================

import {
  CommandItem,
  CommandGroup,
  CommandPaletteConfig,
  CommandSearchResult,
  MatchRange,
} from './types';

interface RecentCommand {
  id: string;
  timestamp: number;
  frequency: number;
}

interface PaletteState {
  isOpen: boolean;
  query: string;
  results: CommandSearchResult[];
  selectedIndex: number;
  activeGroup: string | null;
  nestedStack: CommandItem[];
}

type PaletteListener = (state: PaletteState) => void;

export class CommandPalette {
  private config: CommandPaletteConfig;
  private commands: Map<string, CommandItem> = new Map();
  private groups: Map<string, CommandGroup> = new Map();
  private recentCommands: Map<string, RecentCommand> = new Map();
  private state: PaletteState;
  private listeners: Set<PaletteListener> = new Set();
  private contextFilter: ((command: CommandItem) => boolean) | null = null;
  private maxRecent: number;

  constructor(config: CommandPaletteConfig = {}) {
    this.config = {
      inputHint: 'Type a command...',
      maxResults: 20,
      recentCount: 5,
      ...config,
    };
    this.maxRecent = this.config.recentCount || 5;
    this.state = {
      isOpen: false,
      query: '',
      results: [],
      selectedIndex: 0,
      activeGroup: null,
      nestedStack: [],
    };
    this.contextFilter = config.contextFilter || null;

    // Register initial groups
    if (config.groups) {
      for (const group of config.groups) {
        this.registerGroup(group);
      }
    }
  }

  // Register a command
  registerCommand(command: CommandItem): void {
    this.commands.set(command.id, command);
  }

  // Register multiple commands
  registerCommands(commands: CommandItem[]): void {
    for (const command of commands) {
      this.commands.set(command.id, command);
    }
  }

  // Unregister a command
  unregisterCommand(id: string): void {
    this.commands.delete(id);
  }

  // Register a command group
  registerGroup(group: CommandGroup): void {
    this.groups.set(group.id, group);
    for (const command of group.commands) {
      command.category = group.label;
      this.commands.set(command.id, command);
    }
  }

  // Open the palette
  open(): void {
    this.state.isOpen = true;
    this.state.query = '';
    this.state.selectedIndex = 0;
    this.state.nestedStack = [];
    this.state.results = this.getInitialResults();
    this.notifyListeners();
  }

  // Close the palette
  close(): void {
    this.state.isOpen = false;
    this.state.query = '';
    this.state.results = [];
    this.state.nestedStack = [];
    this.notifyListeners();
  }

  // Toggle open/close
  toggle(): void {
    if (this.state.isOpen) this.close();
    else this.open();
  }

  // Update search query
  search(query: string): void {
    this.state.query = query;
    this.state.selectedIndex = 0;

    if (!query.trim()) {
      this.state.results = this.getInitialResults();
    } else {
      this.state.results = this.fuzzySearch(query);
    }

    this.notifyListeners();
  }

  // Fuzzy search algorithm
  private fuzzySearch(query: string): CommandSearchResult[] {
    const results: CommandSearchResult[] = [];
    const queryLower = query.toLowerCase();
    const availableCommands = this.getAvailableCommands();

    for (const command of availableCommands) {
      if (command.disabled) continue;

      const labelScore = this.fuzzyMatch(queryLower, command.label.toLowerCase());
      const descScore = command.description
        ? this.fuzzyMatch(queryLower, command.description.toLowerCase()) * 0.7
        : 0;
      const keywordScore = command.keywords
        ? Math.max(...command.keywords.map((k) => this.fuzzyMatch(queryLower, k.toLowerCase()))) *
          0.8
        : 0;

      const score = Math.max(labelScore, descScore, keywordScore);

      if (score > 0) {
        const matches = this.getMatchRanges(queryLower, command.label.toLowerCase());

        // Boost by recency and frequency
        const recent = this.recentCommands.get(command.id);
        let boostedScore = score;
        if (recent) {
          const recencyBoost = Math.max(0, 1 - (Date.now() - recent.timestamp) / 86400000); // Decay over 24h
          boostedScore += recencyBoost * 0.3 + Math.min(recent.frequency * 0.1, 0.5);
        }

        results.push({ item: command, score: boostedScore, matches });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, this.config.maxResults || 20);
  }

  // Fuzzy matching with gap penalty
  private fuzzyMatch(query: string, target: string): number {
    if (query.length === 0) return 0;
    if (target.length === 0) return 0;
    if (query === target) return 1;
    if (target.includes(query)) return 0.9; // Substring match

    let queryIdx = 0;
    let score = 0;
    let consecutiveMatches = 0;
    let lastMatchIdx = -1;

    for (let i = 0; i < target.length && queryIdx < query.length; i++) {
      if (target[i] === query[queryIdx]) {
        // Base match score
        score += 1;

        // Bonus for consecutive matches
        if (lastMatchIdx === i - 1) {
          consecutiveMatches++;
          score += consecutiveMatches * 0.5;
        } else {
          consecutiveMatches = 0;
        }

        // Bonus for match at start of word
        if (i === 0 || target[i - 1] === ' ' || target[i - 1] === '-' || target[i - 1] === '_') {
          score += 0.5;
        }

        // Penalty for gaps between matches
        if (lastMatchIdx >= 0 && i - lastMatchIdx > 1) {
          score -= (i - lastMatchIdx - 1) * 0.1;
        }

        lastMatchIdx = i;
        queryIdx++;
      }
    }

    // All query chars must match
    if (queryIdx < query.length) return 0;

    // Normalize by lengths
    const maxPossibleScore = query.length * 2;
    return Math.max(0, Math.min(1, score / maxPossibleScore));
  }

  // Get match ranges for highlighting
  private getMatchRanges(query: string, target: string): MatchRange[] {
    const ranges: MatchRange[] = [];
    let queryIdx = 0;
    let rangeStart = -1;

    for (let i = 0; i < target.length && queryIdx < query.length; i++) {
      if (target[i] === query[queryIdx]) {
        if (rangeStart === -1) rangeStart = i;
        queryIdx++;
        // Check if next char doesn't match (end of range)
        if (
          i + 1 >= target.length ||
          queryIdx >= query.length ||
          target[i + 1] !== query[queryIdx]
        ) {
          ranges.push({ start: rangeStart, end: i + 1 });
          rangeStart = -1;
        }
      } else {
        if (rangeStart !== -1) {
          ranges.push({ start: rangeStart, end: i });
          rangeStart = -1;
        }
      }
    }

    return ranges;
  }

  // Get available commands (filtered by context)
  private getAvailableCommands(): CommandItem[] {
    const commands = Array.from(this.commands.values());
    if (this.contextFilter) {
      return commands.filter(this.contextFilter);
    }
    return commands;
  }

  // Get initial results (recent + popular)
  private getInitialResults(): CommandSearchResult[] {
    const results: CommandSearchResult[] = [];

    // Recent commands first
    const recentEntries = Array.from(this.recentCommands.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, this.maxRecent);

    for (const [id, _recent] of recentEntries) {
      const command = this.commands.get(id);
      if (command && !command.disabled) {
        results.push({ item: command, score: 1, matches: [] });
      }
    }

    // Fill with remaining commands grouped by category
    const remaining = this.getAvailableCommands()
      .filter((c) => !results.some((r) => r.item.id === c.id) && !c.disabled)
      .slice(0, (this.config.maxResults || 20) - results.length);

    for (const command of remaining) {
      results.push({ item: command, score: 0, matches: [] });
    }

    return results;
  }

  // Keyboard navigation
  selectNext(): void {
    if (this.state.results.length === 0) return;
    this.state.selectedIndex = (this.state.selectedIndex + 1) % this.state.results.length;
    this.notifyListeners();
  }

  selectPrevious(): void {
    if (this.state.results.length === 0) return;
    this.state.selectedIndex =
      (this.state.selectedIndex - 1 + this.state.results.length) % this.state.results.length;
    this.notifyListeners();
  }

  // Execute selected command
  executeSelected(): void {
    const selected = this.state.results[this.state.selectedIndex];
    if (!selected) return;
    this.executeCommand(selected.item);
  }

  // Execute a specific command
  executeCommand(command: CommandItem): void {
    if (command.disabled) return;

    // If command has children, enter nested mode
    if (command.children && command.children.length > 0) {
      this.state.nestedStack.push(command);
      this.state.query = '';
      this.state.selectedIndex = 0;
      this.state.results = command.children.map((child) => ({
        item: child,
        score: 1,
        matches: [],
      }));
      this.notifyListeners();
      return;
    }

    // Execute action
    command.action();

    // Record in recent
    const recent = this.recentCommands.get(command.id);
    if (recent) {
      recent.timestamp = Date.now();
      recent.frequency++;
    } else {
      this.recentCommands.set(command.id, {
        id: command.id,
        timestamp: Date.now(),
        frequency: 1,
      });
    }

    // Trim recent list
    if (this.recentCommands.size > 50) {
      const sorted = Array.from(this.recentCommands.entries()).sort(
        (a, b) => b[1].timestamp - a[1].timestamp,
      );
      this.recentCommands = new Map(sorted.slice(0, 50));
    }

    this.close();
  }

  // Go back in nested navigation
  goBack(): boolean {
    if (this.state.nestedStack.length === 0) return false;
    this.state.nestedStack.pop();
    this.state.query = '';
    this.state.selectedIndex = 0;

    if (this.state.nestedStack.length > 0) {
      const parent = this.state.nestedStack[this.state.nestedStack.length - 1]!;
      this.state.results = (parent.children || []).map((child) => ({
        item: child,
        score: 1,
        matches: [],
      }));
    } else {
      this.state.results = this.getInitialResults();
    }

    this.notifyListeners();
    return true;
  }

  // Set context filter
  setContextFilter(filter: (command: CommandItem) => boolean): void {
    this.contextFilter = filter;
    if (this.state.isOpen) {
      this.search(this.state.query);
    }
  }

  // Get results grouped by category
  getGroupedResults(): Map<string, CommandSearchResult[]> {
    const grouped = new Map<string, CommandSearchResult[]>();

    for (const result of this.state.results) {
      const category = result.item.category || 'Other';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category)!.push(result);
    }

    return grouped;
  }

  // Generate highlighted label
  getHighlightedLabel(result: CommandSearchResult): Array<{ text: string; highlighted: boolean }> {
    const { label } = result.item;
    const { matches } = result;
    if (matches.length === 0) return [{ text: label, highlighted: false }];

    const segments: Array<{ text: string; highlighted: boolean }> = [];
    let lastEnd = 0;

    for (const range of matches) {
      if (range.start > lastEnd) {
        segments.push({ text: label.slice(lastEnd, range.start), highlighted: false });
      }
      segments.push({ text: label.slice(range.start, range.end), highlighted: true });
      lastEnd = range.end;
    }

    if (lastEnd < label.length) {
      segments.push({ text: label.slice(lastEnd), highlighted: false });
    }

    return segments;
  }

  // Get state
  getState(): PaletteState {
    return { ...this.state };
  }

  // Subscribe
  subscribe(listener: PaletteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  destroy(): void {
    this.listeners.clear();
    this.commands.clear();
    this.groups.clear();
    this.recentCommands.clear();
  }
}

export default CommandPalette;
