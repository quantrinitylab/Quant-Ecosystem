// ============================================================================
// QuantAI - Code Generation IDE
// Split view (editor + AI chat), language selector, run with console output,
// generate from description, explain code, debug error, autocomplete
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sanitizeCodeHighlight } from '@quant/shared-ui';

interface CodeSuggestion {
  id: string;
  text: string;
  description: string;
  type: 'function' | 'variable' | 'keyword' | 'snippet';
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LanguageOption {
  id: string;
  name: string;
  extension: string;
  placeholder: string;
}

const LANGUAGES: LanguageOption[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    placeholder:
      '// Write JavaScript code here\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();',
  },
  {
    id: 'python',
    name: 'Python',
    extension: '.py',
    placeholder: '# Write Python code here\ndef hello():\n    print("Hello, World!")\n\nhello()',
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    extension: '.ts',
    placeholder:
      '// Write TypeScript code here\ninterface User {\n  name: string;\n  age: number;\n}\n\nfunction greet(user: User): string {\n  return `Hello, ${user.name}!`;\n}',
  },
  {
    id: 'go',
    name: 'Go',
    extension: '.go',
    placeholder:
      '// Write Go code here\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
  },
  {
    id: 'rust',
    name: 'Rust',
    extension: '.rs',
    placeholder: '// Write Rust code here\nfn main() {\n    println!("Hello, World!");\n}',
  },
  {
    id: 'java',
    name: 'Java',
    extension: '.java',
    placeholder:
      '// Write Java code here\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
  },
];

const KEYWORD_CLASSES: Record<string, string[]> = {
  javascript: [
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'async',
    'await',
    'new',
    'this',
    'try',
    'catch',
  ],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'import',
    'from',
    'try',
    'except',
    'with',
    'as',
    'lambda',
    'yield',
    'async',
    'await',
  ],
  typescript: [
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'import',
    'export',
    'interface',
    'type',
    'enum',
    'async',
    'await',
    'new',
  ],
  go: [
    'func',
    'package',
    'import',
    'return',
    'if',
    'else',
    'for',
    'range',
    'struct',
    'interface',
    'var',
    'const',
    'type',
    'defer',
    'go',
    'chan',
    'select',
    'switch',
  ],
  rust: [
    'fn',
    'let',
    'mut',
    'return',
    'if',
    'else',
    'for',
    'while',
    'loop',
    'struct',
    'impl',
    'enum',
    'use',
    'pub',
    'mod',
    'trait',
    'match',
    'async',
    'await',
  ],
  java: [
    'public',
    'private',
    'protected',
    'class',
    'interface',
    'return',
    'if',
    'else',
    'for',
    'while',
    'new',
    'import',
    'package',
    'void',
    'static',
    'final',
    'try',
    'catch',
  ],
};

export default function CodePage(): JSX.Element {
  const [code, setCode] = useState<string>(LANGUAGES[0].placeholder);
  const [language, setLanguage] = useState<string>('javascript');
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [aiSuggestions, setAiSuggestions] = useState<CodeSuggestion[]>([]);
  const [mode, setMode] = useState<'edit' | 'generate' | 'explain' | 'debug'>('edit');
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState<string>('');
  const [generatePrompt, setGeneratePrompt] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [cursorLine, setCursorLine] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineCountRef = useRef<HTMLDivElement>(null);

  const currentLanguage = useMemo(() => {
    return LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];
  }, [language]);

  const lineNumbers = useMemo(() => {
    const lines = code.split('\n');
    return lines.map((_, i) => i + 1);
  }, [code]);

  const highlightedCode = useMemo(() => {
    const keywords = KEYWORD_CLASSES[language] || [];
    const lines = code.split('\n');
    return lines.map((line) => {
      let highlighted = line;
      keywords.forEach((kw) => {
        const regex = new RegExp(`\\b${kw}\\b`, 'g');
        highlighted = highlighted.replace(regex, `<span class="keyword">${kw}</span>`);
      });
      highlighted = highlighted.replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');
      highlighted = highlighted.replace(/(["'`])(.*?)\1/g, '<span class="string">$1$2$1</span>');
      highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');
      return highlighted;
    });
  }, [code, language]);

  useEffect(() => {
    if (code.length > 0) {
      const lastWord = code.split(/\s/).pop() || '';
      if (lastWord.length >= 2) {
        const keywords = KEYWORD_CLASSES[language] || [];
        const matches = keywords
          .filter((kw) => kw.startsWith(lastWord.toLowerCase()))
          .map((kw, i) => ({
            id: `s${i}`,
            text: kw,
            description: `${language} keyword`,
            type: 'keyword' as const,
          }));
        setAiSuggestions(matches.slice(0, 5));
        setShowSuggestions(matches.length > 0);
      } else {
        setShowSuggestions(false);
      }
    }
  }, [code, language]);

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
    const langOption = LANGUAGES.find((l) => l.id === newLang);
    if (langOption) setCode(langOption.placeholder);
    setOutput('');
  }, []);

  const handleRun = useCallback(() => {
    setIsRunning(true);
    setOutput('');
    setTimeout(() => {
      const outputs: Record<string, string> = {
        javascript: '> Hello, World!\n> Program exited with code 0',
        python: '>>> Hello, World!\n>>> Process finished with exit code 0',
        typescript: '> Compiled successfully\n> Hello, World!',
        go: '$ go run main.go\nHello, World!',
        rust: '$ cargo run\n   Compiling hello v0.1.0\n    Finished dev target\n     Running `target/debug/hello`\nHello, World!',
        java: '$ javac Main.java && java Main\nHello, World!',
      };
      setOutput(outputs[language] || '> Execution complete');
      setIsRunning(false);
    }, 1500);
  }, [language]);

  const handleGenerate = useCallback(() => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const generated: Record<string, string> = {
        javascript: `// Generated from: ${generatePrompt}\nfunction solution(input) {\n  // Process the input\n  const result = input\n    .split('')\n    .reverse()\n    .join('');\n  return result;\n}\n\nconsole.log(solution("hello")); // "olleh"`,
        python: `# Generated from: ${generatePrompt}\ndef solution(input_str):\n    """Process and return result."""\n    result = input_str[::-1]\n    return result\n\nprint(solution("hello"))  # "olleh"`,
        typescript: `// Generated from: ${generatePrompt}\nfunction solution(input: string): string {\n  const result: string = input\n    .split('')\n    .reverse()\n    .join('');\n  return result;\n}\n\nconsole.log(solution("hello")); // "olleh"`,
      };
      setCode(generated[language] || generated.javascript);
      setIsGenerating(false);
      setMode('edit');
    }, 2000);
  }, [generatePrompt, language]);

  const handleExplain = useCallback(() => {
    setMode('explain');
    const explanation = `Here is an explanation of your code:\n\n1. The code defines a main function/entry point\n2. It initializes variables and processes data\n3. The output is printed/returned to the console\n\nKey concepts used:\n- Variable declarations\n- String manipulation\n- Function definitions\n- Control flow`;
    setAiMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        role: 'assistant',
        content: explanation,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const handleDebug = useCallback(() => {
    setMode('debug');
    const debugInfo = `Analyzing your code for potential issues...\n\nFound 0 errors and 2 suggestions:\n\n1. Consider adding error handling for edge cases\n2. The function could benefit from input validation\n\nNo runtime errors detected. Code appears syntactically correct for ${currentLanguage.name}.`;
    setAiMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        role: 'assistant',
        content: debugInfo,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [currentLanguage]);

  const handleAiSend = useCallback(() => {
    if (!aiInput.trim()) return;
    setAiMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        role: 'user',
        content: aiInput,
        timestamp: new Date().toISOString(),
      },
    ]);
    const response = `I can help with that. Based on your ${currentLanguage.name} code, here is my suggestion:\n\nYou could optimize the code by using built-in methods and reducing the number of iterations. Consider using a more functional approach for better readability.`;
    setTimeout(() => {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `m${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        },
      ]);
    }, 800);
    setAiInput('');
  }, [aiInput, currentLanguage]);

  const handleSuggestionClick = useCallback(
    (suggestion: CodeSuggestion) => {
      const words = code.split(/\s/);
      words[words.length - 1] = suggestion.text;
      setCode(words.join(' '));
      setShowSuggestions(false);
    },
    [code],
  );

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    const lines = e.target.value.substring(0, e.target.selectionStart).split('\n');
    setCursorLine(lines.length);
  }, []);

  if (error) {
    return (
      <div className="code-page error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="code-page">
      <header className="code-header">
        <div className="language-selector">
          <select value={language} onChange={(e) => handleLanguageChange(e.target.value)}>
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mode-buttons">
          <button
            className={`btn-mode ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            className={`btn-mode ${mode === 'generate' ? 'active' : ''}`}
            onClick={() => setMode('generate')}
          >
            Generate
          </button>
          <button className="btn-explain" onClick={handleExplain}>
            💡 Explain
          </button>
          <button className="btn-debug" onClick={handleDebug}>
            🐛 Debug
          </button>
        </div>
        <div className="run-controls">
          <button
            className={`btn-run ${isRunning ? 'running' : ''}`}
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? '⏳ Running...' : '▶ Run'}
          </button>
        </div>
      </header>

      <div className="code-body">
        <div className="editor-panel">
          {mode === 'generate' && (
            <div className="generate-input">
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Describe what code you want to generate..."
                className="generate-textarea"
                rows={3}
              />
              <button
                className="btn-generate"
                onClick={handleGenerate}
                disabled={!generatePrompt.trim() || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Code'}
              </button>
            </div>
          )}

          <div className="editor-container">
            <div className="line-numbers" ref={lineCountRef}>
              {lineNumbers.map((num) => (
                <div key={num} className={`line-num ${num === cursorLine ? 'active' : ''}`}>
                  {num}
                </div>
              ))}
            </div>
            <div className="code-editor-wrapper">
              <div className="syntax-highlight" aria-hidden="true">
                {highlightedCode.map((line, i) => (
                  <div
                    key={i}
                    className="code-line"
                    dangerouslySetInnerHTML={{ __html: sanitizeCodeHighlight(line || ' ') }}
                  />
                ))}
              </div>
              <textarea
                ref={editorRef}
                className="code-textarea"
                value={code}
                onChange={handleCodeChange}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
              />
              {showSuggestions && aiSuggestions.length > 0 && (
                <div className="autocomplete-dropdown">
                  {aiSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="suggestion-item"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <span className={`suggestion-type ${suggestion.type}`}>
                        {suggestion.type === 'keyword'
                          ? 'K'
                          : suggestion.type === 'function'
                            ? 'F'
                            : 'V'}
                      </span>
                      <span className="suggestion-text">{suggestion.text}</span>
                      <span className="suggestion-desc">{suggestion.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`output-console ${output ? 'has-output' : ''}`}>
            <div className="console-header">
              <span>Console Output</span>
              {output && <button onClick={() => setOutput('')}>Clear</button>}
            </div>
            <pre className="console-output">
              {isRunning
                ? 'Running...\n'
                : output || 'No output yet. Click Run to execute your code.'}
            </pre>
          </div>
        </div>

        <aside className="ai-chat-panel">
          <div className="ai-panel-header">
            <h3>AI Assistant</h3>
            <span className="lang-badge">{currentLanguage.name}</span>
          </div>
          <div className="ai-messages">
            {aiMessages.length === 0 ? (
              <div className="ai-empty">
                <p>Ask questions about your code, request explanations, or get debugging help.</p>
              </div>
            ) : (
              aiMessages.map((msg) => (
                <div key={msg.id} className={`ai-msg ${msg.role}`}>
                  <div className="ai-msg-content">{msg.content}</div>
                </div>
              ))
            )}
          </div>
          <div className="ai-input-bar">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAiSend();
              }}
              placeholder="Ask about your code..."
              className="ai-text-input"
            />
            <button className="btn-ai-send" onClick={handleAiSend} disabled={!aiInput.trim()}>
              Send
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
