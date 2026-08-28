'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  IconBolt,
  IconCode,
  IconFile,
  IconLayers,
  IconMonitor,
  IconSparkle,
  IconTerminal,
} from './icons';

interface ScaffoldTemplate {
  id: string;
  name: string;
  /**
   * The template's glyph. A component rather than a string: emoji renders
   * differently on every platform and ignores `currentColor`, so a picker built
   * from them never matches the surrounding type.
   */
  Icon: (props: { size?: number }) => ReactElement;
  description: string;
  stack: string[];
  files: string[];
}

interface AIProjectScaffoldProps {
  onGenerate: (template: ScaffoldTemplate, customPrompt: string) => Promise<void>;
}

const TEMPLATES: ScaffoldTemplate[] = [
  {
    id: 'nextjs-api',
    name: 'Next.js API',
    Icon: IconLayers,
    description: 'Full-stack Next.js app with API routes, auth, and database',
    stack: ['Next.js 15', 'TypeScript', 'Prisma', 'Tailwind'],
    files: [
      'src/app/page.tsx',
      'src/app/api/route.ts',
      'prisma/schema.prisma',
      'tailwind.config.ts',
    ],
  },
  {
    id: 'express-api',
    name: 'Express REST API',
    Icon: IconBolt,
    description: 'Production-ready Express.js API with middleware and validation',
    stack: ['Express', 'TypeScript', 'Zod', 'Prisma'],
    files: ['src/server.ts', 'src/routes/index.ts', 'src/middleware/auth.ts', 'src/types.ts'],
  },
  {
    id: 'react-component',
    name: 'React Component Library',
    Icon: IconCode,
    description: 'Reusable component library with Storybook and tests',
    stack: ['React', 'TypeScript', 'Storybook', 'Vitest'],
    files: ['src/Button.tsx', 'src/Button.stories.tsx', 'src/Button.test.tsx', 'src/index.ts'],
  },
  {
    id: 'python-fastapi',
    name: 'Python FastAPI',
    Icon: IconTerminal,
    description: 'Async Python API with type safety and auto-docs',
    stack: ['FastAPI', 'Python 3.12', 'Pydantic', 'SQLAlchemy'],
    files: ['main.py', 'models.py', 'routes/users.py', 'requirements.txt'],
  },
  {
    id: 'cli-tool',
    name: 'CLI Tool',
    Icon: IconMonitor,
    description: 'Command-line tool with argument parsing and colored output',
    stack: ['Node.js', 'TypeScript', 'Commander', 'Chalk'],
    files: ['src/cli.ts', 'src/commands/init.ts', 'src/utils.ts', 'package.json'],
  },
  {
    id: 'custom',
    name: 'Custom Project',
    Icon: IconSparkle,
    description: 'Describe what you want and AI generates the project structure',
    stack: ['Any'],
    files: ['AI-generated'],
  },
];

/**
 * AI Project Scaffold — generates entire project structures from templates or natural language.
 * This is what Codex/Claude do best — going from "I want a REST API" to a full working project.
 * We make it a visual picker with instant preview of generated files.
 */
export function AIProjectScaffold({ onGenerate }: AIProjectScaffoldProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ScaffoldTemplate | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    try {
      await onGenerate(selectedTemplate, customPrompt);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTemplate, customPrompt, onGenerate]);

  return (
    <div className="ai-scaffold">
      <header className="scaffold-header">
        <span className="scaffold-icon inline-flex">
          <IconSparkle size={14} />
        </span>
        <div>
          <h3>AI Project Generator</h3>
          <p>Choose a template or describe your project. AI generates the full structure.</p>
        </div>
      </header>

      <div className="scaffold-templates">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`scaffold-template ${selectedTemplate?.id === template.id ? 'is-selected' : ''}`}
            onClick={() => setSelectedTemplate(template)}
          >
            <span className="scaffold-template-icon inline-flex">
              <template.Icon size={18} />
            </span>
            <div className="scaffold-template-info">
              <strong>{template.name}</strong>
              <p>{template.description}</p>
              <div className="scaffold-stack">
                {template.stack.map((tech) => (
                  <span key={tech} className="scaffold-tech">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {selectedTemplate && (
          <motion.div
            className="scaffold-config"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {selectedTemplate.id !== 'custom' && (
              <div className="scaffold-preview">
                <p className="scaffold-preview-label">Files that will be generated:</p>
                <div className="scaffold-file-list">
                  {selectedTemplate.files.map((file) => (
                    <span key={file} className="scaffold-file inline-flex items-center gap-1">
                      <IconFile size={11} />
                      {file}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <textarea
              className="scaffold-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={
                selectedTemplate.id === 'custom'
                  ? 'Describe what you want to build... e.g., "A REST API for a todo app with user authentication, CRUD operations, and PostgreSQL storage"'
                  : 'Optional: Add specific requirements... e.g., "Add rate limiting and Redis caching"'
              }
              rows={3}
            />
            <button
              type="button"
              className="scaffold-generate-btn inline-flex items-center justify-center gap-1.5"
              onClick={handleGenerate}
              disabled={isGenerating || (selectedTemplate.id === 'custom' && !customPrompt.trim())}
            >
              {isGenerating ? (
                'Generating...'
              ) : (
                <>
                  <IconSparkle size={13} />
                  Generate {selectedTemplate.name}
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
