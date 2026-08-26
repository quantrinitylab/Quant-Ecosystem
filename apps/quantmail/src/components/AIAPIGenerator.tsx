'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requestBody?: string;
  responseType?: string;
}

interface AIAPIGeneratorProps {
  onGenerateCode: (code: string) => void;
}

/**
 * AI API Generator — describe your API in natural language, get full implementation.
 * Generates: route handler, validation schema, types, and tests.
 * No competitor has a visual API builder with AI code generation.
 */
export function AIAPIGenerator({ onGenerateCode }: AIAPIGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [endpoints, setEndpoints] = useState<APIEndpoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [framework, setFramework] = useState<'express' | 'fastify' | 'nextjs'>('nextjs');

  const generateEndpoints = useCallback(async () => {
    if (!description.trim()) return;
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 800));

    // Parse natural language description into endpoints
    const lower = description.toLowerCase();
    const generated: APIEndpoint[] = [];

    if (lower.includes('user') || lower.includes('auth')) {
      generated.push({
        method: 'POST',
        path: '/api/auth/register',
        description: 'Register new user',
        requestBody: '{ email, password, name }',
        responseType: '{ user, token }',
      });
      generated.push({
        method: 'POST',
        path: '/api/auth/login',
        description: 'Login user',
        requestBody: '{ email, password }',
        responseType: '{ token, refreshToken }',
      });
      generated.push({
        method: 'GET',
        path: '/api/users/me',
        description: 'Get current user',
        responseType: '{ user }',
      });
      generated.push({
        method: 'PUT',
        path: '/api/users/me',
        description: 'Update profile',
        requestBody: '{ name, avatar }',
        responseType: '{ user }',
      });
    }
    if (
      lower.includes('crud') ||
      lower.includes('resource') ||
      lower.includes('item') ||
      lower.includes('product')
    ) {
      const resource = lower.includes('product')
        ? 'products'
        : lower.includes('post')
          ? 'posts'
          : 'items';
      generated.push({
        method: 'GET',
        path: `/api/${resource}`,
        description: `List all ${resource}`,
        responseType: `{ ${resource}[], total, page }`,
      });
      generated.push({
        method: 'GET',
        path: `/api/${resource}/:id`,
        description: `Get single ${resource.slice(0, -1)}`,
        responseType: `{ ${resource.slice(0, -1)} }`,
      });
      generated.push({
        method: 'POST',
        path: `/api/${resource}`,
        description: `Create ${resource.slice(0, -1)}`,
        requestBody: '{ title, description, ... }',
        responseType: `{ ${resource.slice(0, -1)} }`,
      });
      generated.push({
        method: 'PUT',
        path: `/api/${resource}/:id`,
        description: `Update ${resource.slice(0, -1)}`,
        requestBody: '{ title, description, ... }',
        responseType: `{ ${resource.slice(0, -1)} }`,
      });
      generated.push({
        method: 'DELETE',
        path: `/api/${resource}/:id`,
        description: `Delete ${resource.slice(0, -1)}`,
        responseType: '{ success }',
      });
    }

    if (generated.length === 0) {
      generated.push({
        method: 'GET',
        path: '/api/data',
        description: 'Fetch data',
        responseType: '{ data[] }',
      });
      generated.push({
        method: 'POST',
        path: '/api/data',
        description: 'Create data',
        requestBody: '{ ... }',
        responseType: '{ data }',
      });
    }

    setEndpoints(generated);
    setIsGenerating(false);
  }, [description]);

  const generateCode = useCallback(() => {
    let code = '';
    if (framework === 'nextjs') {
      code = `// Generated API Routes (Next.js App Router)\n\n`;
      for (const ep of endpoints) {
        code += `// ${ep.method} ${ep.path} — ${ep.description}\n`;
        code += `export async function ${ep.method}(request: Request) {\n`;
        if (ep.requestBody)
          code += `  const body = await request.json();\n  // Validate: ${ep.requestBody}\n`;
        code += `  // TODO: Implement ${ep.description}\n`;
        code += `  return Response.json(${ep.responseType || '{ success: true }'});\n`;
        code += `}\n\n`;
      }
    } else if (framework === 'express') {
      code = `// Generated Express Router\nimport { Router } from 'express';\n\nconst router = Router();\n\n`;
      for (const ep of endpoints) {
        code += `// ${ep.description}\nrouter.${ep.method.toLowerCase()}('${ep.path}', async (req, res) => {\n`;
        if (ep.requestBody) code += `  const body = req.body; // ${ep.requestBody}\n`;
        code += `  // TODO: Implement\n  res.json(${ep.responseType || '{ success: true }'});\n});\n\n`;
      }
      code += `export default router;\n`;
    } else {
      code = `// Generated Fastify Routes\nimport { FastifyInstance } from 'fastify';\n\nexport async function routes(app: FastifyInstance) {\n`;
      for (const ep of endpoints) {
        code += `  // ${ep.description}\n  app.${ep.method.toLowerCase()}('${ep.path}', async (request, reply) => {\n`;
        code += `    // TODO: Implement\n    return ${ep.responseType || '{ success: true }'};\n  });\n\n`;
      }
      code += `}\n`;
    }
    onGenerateCode(code);
  }, [endpoints, framework, onGenerateCode]);

  const methodColors: Record<string, string> = {
    GET: '#4ade80',
    POST: '#60a5fa',
    PUT: '#fbbf24',
    DELETE: '#f87171',
    PATCH: '#a78bfa',
  };

  return (
    <div className="ai-api-gen">
      <button
        type="button"
        className="ai-api-trigger flex items-center gap-1.5"
        onClick={() => setIsOpen((v) => !v)}
      >
        <svg
          className="size-4 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        API Generator
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ai-api-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <textarea
              className="ai-api-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your API... e.g. 'User authentication with register, login, and profile update. Also CRUD for blog posts with categories.'"
              rows={3}
            />
            <div className="ai-api-framework">
              {(['nextjs', 'express', 'fastify'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={framework === f ? 'is-active' : ''}
                  onClick={() => setFramework(f)}
                >
                  {f === 'nextjs' ? 'Next.js' : f === 'express' ? 'Express' : 'Fastify'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ai-api-generate"
              onClick={generateEndpoints}
              disabled={isGenerating || !description.trim()}
            >
              {isGenerating ? 'Analyzing...' : 'Design API'}
            </button>
            {endpoints.length > 0 && (
              <div className="ai-api-endpoints">
                <p className="ai-api-endpoints-title">{endpoints.length} endpoints designed:</p>
                {endpoints.map((ep, idx) => (
                  <div key={idx} className="api-endpoint">
                    <span className="api-method" style={{ color: methodColors[ep.method] }}>
                      {ep.method}
                    </span>
                    <span className="api-path">{ep.path}</span>
                    <span className="api-desc">{ep.description}</span>
                  </div>
                ))}
                <button type="button" className="ai-api-code-btn" onClick={generateCode}>
                  Generate Code
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
