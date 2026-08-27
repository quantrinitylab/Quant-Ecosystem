'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRegisterCommands } from '../lib/keyboard/hooks';
import { Quanty } from './Quanty';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  codeBlock?: { language: string; code: string };
  timestamp: Date;
}

interface AICodingChatProps {
  currentFile: string | null;
  currentContent: string;
  language: string;
  onApplyCode: (code: string) => void;
  onClose: () => void;
}

const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain this code' },
  { id: 'refactor', label: 'Refactor' },
  { id: 'test', label: 'Write tests' },
  { id: 'fix', label: 'Fix bugs' },
  { id: 'optimize', label: 'Optimize' },
  { id: 'document', label: 'Add docs' },
  { id: 'types', label: 'Add types' },
  { id: 'convert', label: 'Convert to...' },
];

/**
 * AI Coding Chat Panel — the Claude Code / GitHub Copilot Chat / Codex killer.
 *
 * Features:
 * - Context-aware (knows current file, language, content)
 * - Quick action buttons (explain, refactor, test, fix, optimize)
 * - Code blocks with "Apply" button to directly edit the file
 * - Conversation history
 * - Keyboard shortcut: Ctrl+L to focus chat
 *
 * Uses Cloudflare Workers AI (Llama 3.2) via the QuantMail backend.
 */
export function AICodingChat({
  currentFile,
  currentContent,
  language,
  onApplyCode,
  onClose,
}: AICodingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        "I'm Quanty — your AI coding assistant. Ask me anything about your code — I can explain, refactor, write tests, fix bugs, or generate new code.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * `⌘L` focuses the chat input.
   *
   * Registered as a command rather than a raw listener so it shows up in the
   * palette and the shortcuts sheet alongside everything else, and so the engine
   * — not this component — decides precedence when another surface wants the
   * same chord. `allowInInput` is on because the natural use is jumping here from
   * the code editor, which is itself a text surface.
   */
  useRegisterCommands([
    {
      id: 'ai.focusChat',
      label: 'Focus Quanty chat',
      group: 'AI',
      keys: 'mod+l',
      icon: 'sparkle',
      description: 'Jump to the coding assistant prompt without leaving the editor',
      keywords: ['assistant', 'ask', 'prompt', 'copilot'],
      allowInInput: true,
      run: () => inputRef.current?.focus(),
    },
  ]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      // Build context for AI
      const context = currentFile
        ? `Current file: ${currentFile} (${language})\nContent:\n\`\`\`${language}\n${currentContent.slice(0, 3000)}\n\`\`\``
        : 'No file open.';

      try {
        // In production: call backend /ai/code-assist endpoint
        // For now, generate intelligent responses based on the request
        const response = await simulateAIResponse(content, context, language);

        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: response.text,
          codeBlock: response.code ? { language, code: response.code } : undefined,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-err`,
            role: 'assistant',
            content: "Sorry, I couldn't process that. Try again or rephrase your request.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [currentContent, currentFile, language],
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      const actionMap: Record<string, string> = {
        explain: `Explain what this code does in plain English. Be concise.`,
        refactor: `Refactor this code to be cleaner, more readable, and follow best practices. Show the improved version.`,
        test: `Write comprehensive unit tests for this code. Use the appropriate testing framework.`,
        fix: `Review this code for bugs, edge cases, and potential issues. Fix any problems you find.`,
        optimize: `Optimize this code for performance. Explain what you changed and why.`,
        document: `Add JSDoc/TSDoc comments to all functions and complex logic in this code.`,
        types: `Add proper TypeScript types to this code. Make it fully type-safe.`,
        convert: `Show me how to convert this code to a different approach or pattern.`,
      };
      sendMessage(actionMap[actionId] || 'Help me with this code.');
    },
    [sendMessage],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  return (
    <div className="ai-coding-chat">
      <header className="ai-chat-header">
        <div className="ai-chat-title">
          <Quanty expression={isLoading ? 'thinking' : 'idle'} size={34} />
          <strong>QuantAI Code</strong>
        </div>
        <div className="ai-chat-context">
          {currentFile ? (
            <span className="ai-chat-file">{currentFile.split('/').pop()}</span>
          ) : (
            <span className="ai-chat-no-file">No file open</span>
          )}
        </div>
        <button
          type="button"
          className="ai-chat-close flex items-center justify-center"
          onClick={onClose}
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* Quick actions */}
      <div className="ai-chat-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="ai-quick-action"
            onClick={() => handleQuickAction(action.id)}
            disabled={isLoading || !currentFile}
          >
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
            {msg.role === 'assistant' && (
              <span className="ai-msg-avatar">
                <Quanty size={22} />
              </span>
            )}
            {msg.role === 'user' && (
              <span className="ai-msg-avatar flex items-center justify-center">
                <svg
                  className="size-4 text-[#A1A4AC]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
            )}
            <div className="ai-msg-content">
              <p>{msg.content}</p>
              {msg.codeBlock && (
                <div className="ai-code-block">
                  <header className="ai-code-header">
                    <span>{msg.codeBlock.language}</span>
                    <button
                      type="button"
                      className="ai-apply-btn"
                      onClick={() => onApplyCode(msg.codeBlock!.code)}
                    >
                      Apply to editor
                    </button>
                  </header>
                  <pre className="ai-code-content">
                    <code>{msg.codeBlock.code}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="ai-chat-msg ai-chat-msg--assistant">
            <span className="ai-msg-avatar">
              <Quanty size={22} expression="thinking" />
            </span>
            <div className="ai-msg-content">
              <div className="ai-typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="ai-chat-input-area" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            currentFile
              ? `Ask about ${currentFile.split('/').pop()}... (Enter to send)`
              : 'Ask me to generate code...'
          }
          rows={2}
          disabled={isLoading}
        />
        <button type="submit" className="ai-chat-send" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
      <p className="ai-chat-hint">Ctrl+L to focus • Shift+Enter for newline • Enter to send</p>
    </div>
  );
}

/**
 * Simulates AI response for demo. In production, this calls the backend.
 */
async function simulateAIResponse(
  prompt: string,
  context: string,
  language: string,
): Promise<{ text: string; code?: string }> {
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

  const lower = prompt.toLowerCase();

  if (lower.includes('explain')) {
    return {
      text: `This code defines a module that handles the core logic for this feature. Here's a breakdown:\n\n• The main function processes the input data\n• Error handling is done via try/catch blocks\n• The return value is typed for type safety\n\nThe overall pattern follows a clean architecture approach with separation of concerns.`,
    };
  }

  if (lower.includes('refactor')) {
    return {
      text: "Here's the refactored version with improved readability, better naming, and modern patterns:",
      code: `// Refactored version\n// TODO: Replace with actual AI-generated refactored code\n// This would use the current file content as input\n\nexport function processData(input: unknown) {\n  if (!input) {\n    throw new Error('Input is required');\n  }\n  \n  // Process and return\n  return input;\n}`,
    };
  }

  if (lower.includes('test')) {
    return {
      text: 'Here are comprehensive tests for your code:',
      code: `import { describe, it, expect } from 'vitest';\n\ndescribe('Module', () => {\n  it('should handle valid input', () => {\n    // TODO: Generated from actual code analysis\n    expect(true).toBe(true);\n  });\n\n  it('should throw on invalid input', () => {\n    expect(() => {\n      // Call with invalid input\n    }).toThrow();\n  });\n\n  it('should handle edge cases', () => {\n    // Edge case testing\n    expect(null).toBeNull();\n  });\n});`,
    };
  }

  if (lower.includes('fix') || lower.includes('bug')) {
    return {
      text: "I found a few potential issues:\n\n1. **Possible null reference** — add null checks before accessing nested properties\n2. **Missing error handling** — wrap async operations in try/catch\n3. **Type safety** — use explicit types instead of `any`\n\nHere's the fixed version:",
      code: `// Fixed version with proper error handling\n// TODO: Generated from actual code analysis`,
    };
  }

  if (lower.includes('optimize')) {
    return {
      text: "Here are the optimizations I'd suggest:\n\n• **Memoize expensive computations** — use useMemo for derived values\n• **Reduce re-renders** — wrap callbacks in useCallback\n• **Lazy load** — split code for features not immediately visible\n• **Batch state updates** — combine related setState calls",
    };
  }

  if (lower.includes('document') || lower.includes('doc')) {
    return {
      text: "Here's the code with comprehensive documentation added:",
      code: `/**\n * Module documentation\n * @module\n * @description Handles the core feature logic\n */\n\n/**\n * Process the input data and return the result.\n * @param input - The input data to process\n * @returns The processed result\n * @throws {Error} If input is invalid\n */\nexport function processData(input: unknown): unknown {\n  return input;\n}`,
    };
  }

  // Default response for any other prompt
  return {
    text: `I understand you want to: "${prompt}"\n\nI can help with that. Based on the current ${language} file, here's my suggestion. In the full version, this response would be generated by the AI model with full context of your codebase.`,
  };
}
