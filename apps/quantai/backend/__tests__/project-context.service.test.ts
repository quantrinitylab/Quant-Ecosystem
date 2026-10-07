// ============================================================================
// QuantAI — ProjectContextService Unit Tests (Task W39-A04)
// Memory Isolation Boundaries ('Default memory' vs 'Project-only memory')
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProjectContextService,
  ProjectBoundaryViolationError,
  type ProjectWorkspace,
} from '../services/project-context.service';

describe('ProjectContextService (Task W39-A04 Enterprise Memory Isolation)', () => {
  let service: ProjectContextService;
  const userAlpha = 'user-quant-alpha';
  const userBeta = 'user-quant-beta';

  beforeEach(() => {
    service = new ProjectContextService();
  });

  // ==========================================================================
  // 1. Project Workspace Lifecycle
  // ==========================================================================
  describe('1. Project Workspace Lifecycle', () => {
    it('creates project with strict isolation defaults (inheritDefaultMemory: false, PROJECT_ONLY)', () => {
      const project = service.createProject(userAlpha, {
        name: 'Algorithmic Execution Engine',
        description: 'Ultra-low latency execution strategies',
        customInstructions: 'Strictly generate TypeScript with zero allocations.',
      });

      expect(project.id).toMatch(/^proj-/);
      expect(project.userId).toBe(userAlpha);
      expect(project.name).toBe('Algorithmic Execution Engine');
      expect(project.description).toBe('Ultra-low latency execution strategies');
      expect(project.customInstructions).toBe(
        'Strictly generate TypeScript with zero allocations.',
      );
      expect(project.inheritDefaultMemory).toBe(false);
      expect(project.memoryIsolationMode).toBe('PROJECT_ONLY');
      expect(project.retentionPolicy).toBe('indefinite');
      expect(project.sensitivityLevel).toBe('internal');
      expect(project.complianceTags).toContain('PROPRIETARY');
      expect(project.filesCount).toBe(0);
      expect(project.memoryCount).toBe(0);
    });

    it('rejects creation when name is empty or exceeds 200 characters', () => {
      expect(() => service.createProject(userAlpha, { name: '   ' })).toThrow(
        'Project name is required and cannot be empty',
      );

      expect(() => service.createProject(userAlpha, { name: 'A'.repeat(201) })).toThrow(
        'Project name exceeds maximum length of 200 characters',
      );
    });

    it('rejects creation when userId is missing or blank', () => {
      expect(() => service.createProject('  ', { name: 'Valid Project' })).toThrow(
        ProjectBoundaryViolationError,
      );
    });

    it('retrieves project by id and enforces multi-tenant boundary', () => {
      const project = service.createProject(userAlpha, { name: 'Alpha Secret Ops' });

      // Owner can retrieve
      const found = service.getProject(project.id, userAlpha);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Alpha Secret Ops');

      // Alternative parameter order (userId, projectId)
      const foundAlt = service.getProject(userAlpha, project.id);
      expect(foundAlt).toBeDefined();
      expect(foundAlt?.id).toBe(project.id);

      // Foreign user gets undefined (Strict Multi-Tenant Isolation)
      const foreign = service.getProject(project.id, userBeta);
      expect(foreign).toBeUndefined();
    });

    it('lists projects for a specific user with sensitivity and search filters', () => {
      service.createProject(userAlpha, {
        name: 'Finance Risk Models',
        sensitivityLevel: 'restricted',
      });
      service.createProject(userAlpha, {
        name: 'Public Documentation',
        sensitivityLevel: 'public',
      });
      service.createProject(userBeta, {
        name: 'Beta Workspace',
        sensitivityLevel: 'restricted',
      });

      const alphaAll = service.listProjects(userAlpha);
      expect(alphaAll).toHaveLength(2);

      const alphaRestricted = service.listProjects(userAlpha, { sensitivity: 'restricted' });
      expect(alphaRestricted).toHaveLength(1);
      expect(alphaRestricted[0]?.name).toBe('Finance Risk Models');

      const alphaSearch = service.listProjects(userAlpha, { search: 'risk' });
      expect(alphaSearch).toHaveLength(1);
      expect(alphaSearch[0]?.name).toBe('Finance Risk Models');
    });

    it('updates project settings including retention and compliance tags', () => {
      const project = service.createProject(userAlpha, { name: 'Initial Name' });

      const updated = service.updateProject(project.id, userAlpha, {
        name: 'Updated Enterprise Workspace',
        retentionPolicy: '90_days',
        sensitivityLevel: 'confidential',
        complianceTags: ['SOC2', 'HIPAA'],
        exportRestrictions: 'restricted',
      });

      expect(updated.name).toBe('Updated Enterprise Workspace');
      expect(updated.retentionPolicy).toBe('90_days');
      expect(updated.sensitivityLevel).toBe('confidential');
      expect(updated.complianceTags).toEqual(['SOC2', 'HIPAA']);
      expect(updated.exportRestrictions).toBe('restricted');
    });

    it('deletes project and purges its storage completely', () => {
      const project = service.createProject(userAlpha, { name: 'To Be Deleted' });
      service.recordProjectMemory(project.id, userAlpha, { content: 'Secret detail' });

      const deleted = service.deleteProject(project.id, userAlpha);
      expect(deleted).toBe(true);

      expect(service.getProject(project.id, userAlpha)).toBeUndefined();
      expect(service.listProjects(userAlpha)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 2. Memory Isolation Boundaries ('Default' vs 'Project-Only')
  // ==========================================================================
  describe('2. Memory Isolation Boundaries', () => {
    let projA: ProjectWorkspace;
    let projB: ProjectWorkspace;

    beforeEach(() => {
      projA = service.createProject(userAlpha, {
        name: 'Project Alpha (Fintech Core)',
        inheritDefaultMemory: false, // Strict isolation
      });

      projB = service.createProject(userAlpha, {
        name: 'Project Beta (Social Media)',
        inheritDefaultMemory: false, // Strict isolation
      });
    });

    it('records memories strictly isolated to a specific projectId', () => {
      const memA = service.recordProjectMemory(projA.id, userAlpha, {
        content: 'Alpha API uses HMAC-SHA256 with 30s window',
        category: 'architecture',
        tags: ['security', 'api'],
      });

      expect(memA.id).toMatch(/^mem-/);
      expect(memA.projectId).toBe(projA.id);
      expect(memA.userId).toBe(userAlpha);
      expect(memA.scope).toBe('project');
      expect(memA.category).toBe('architecture');
      expect(memA.content).toBe('Alpha API uses HMAC-SHA256 with 30s window');
    });

    it('rejects recording project memory with projectId === "default"', () => {
      expect(() =>
        service.recordProjectMemory('default', userAlpha, {
          content: 'This should fail',
        }),
      ).toThrow(ProjectBoundaryViolationError);
    });

    it('INVARIANT: Project memories NEVER leak into global default user memories', () => {
      // 1. Record a global default memory (e.g. user tone preference)
      const defaultMem = service.recordDefaultMemory(userAlpha, {
        content: 'User prefers concise responses with bullet points',
        category: 'preference',
      });
      expect(defaultMem.projectId).toBe('default');
      expect(defaultMem.scope).toBe('default');

      // 2. Record a confidential project memory in Project Alpha
      service.recordProjectMemory(projA.id, userAlpha, {
        content: 'Project Alpha DB password hash salt: 0x99AABBCC',
        category: 'fact',
      });

      // 3. Retrieve Project Alpha context under Strict Isolation
      const contextA = service.retrieveProjectContext(projA.id, userAlpha);

      // Context A contains Project Alpha memory
      expect(contextA.projectMemories).toHaveLength(1);
      expect(contextA.projectMemories[0]?.content).toContain('Project Alpha DB password');

      // Under strict isolation, global default memories are ZERO
      expect(contextA.defaultMemoriesIncluded).toHaveLength(0);
      expect(contextA.scope).toBe('project_isolated');
      expect(contextA.boundaryEnforced).toBe(true);
    });

    it('INVARIANT: Project memories NEVER cross-pollinate across projects', () => {
      // Memory in Project Alpha
      service.recordProjectMemory(projA.id, userAlpha, {
        content: 'Confidential Fintech algorithm code: O(log N) orderbook',
        category: 'code_snippet',
      });

      // Memory in Project Beta
      service.recordProjectMemory(projB.id, userAlpha, {
        content: 'Social video reel player snapping physics: velocity threshold 0.3',
        category: 'architecture',
      });

      // Retrieve Project Alpha context
      const ctxA = service.retrieveProjectContext(projA.id, userAlpha);
      expect(ctxA.projectMemories).toHaveLength(1);
      expect(ctxA.projectMemories[0]?.content).toContain('Fintech algorithm');
      // Crucial check: Project Beta memory is NOT in Project Alpha
      expect(ctxA.projectMemories.some((m) => m.content.includes('reel player'))).toBe(false);

      // Retrieve Project Beta context
      const ctxB = service.retrieveProjectContext(projB.id, userAlpha);
      expect(ctxB.projectMemories).toHaveLength(1);
      expect(ctxB.projectMemories[0]?.content).toContain('reel player');
      // Crucial check: Project Alpha memory is NOT in Project Beta
      expect(ctxB.projectMemories.some((m) => m.content.includes('Fintech algorithm'))).toBe(false);
    });

    it('supports UNIFIED mode with safe read-only fallback to global default memory', () => {
      // Create Project Gamma with inheritDefaultMemory: true (UNIFIED mode)
      const projGamma = service.createProject(userAlpha, {
        name: 'Project Gamma (General Workspace)',
        inheritDefaultMemory: true,
      });

      // Global default memory
      service.recordDefaultMemory(userAlpha, {
        content: 'User primary language is TypeScript',
        category: 'preference',
      });

      // Project Gamma memory
      service.recordProjectMemory(projGamma.id, userAlpha, {
        content: 'Project Gamma uses Next.js 15 App Router',
        category: 'architecture',
      });

      // Another project's memory
      service.recordProjectMemory(projA.id, userAlpha, {
        content: 'Alpha secret data that must never leak into Gamma',
        category: 'fact',
      });

      const ctxGamma = service.retrieveProjectContext(projGamma.id, userAlpha);
      expect(ctxGamma.scope).toBe('project_with_default_read_fallback');
      expect(ctxGamma.inheritDefaultMemory).toBe(true);

      // Contains Gamma's own memory
      expect(ctxGamma.projectMemories).toHaveLength(1);
      expect(ctxGamma.projectMemories[0]?.content).toContain('Next.js 15 App Router');

      // Reads global default memory as read-only supplementary context
      expect(ctxGamma.defaultMemoriesIncluded).toHaveLength(1);
      expect(ctxGamma.defaultMemoriesIncluded[0]?.content).toContain(
        'primary language is TypeScript',
      );

      // NEVER contains Project Alpha's memories
      const containsAlpha = [...ctxGamma.projectMemories, ...ctxGamma.defaultMemoriesIncluded].some(
        (m) => m.content.includes('Alpha secret data'),
      );
      expect(containsAlpha).toBe(false);
    });

    it('generates cryptographic SHA-256 isolation hash for verification', () => {
      service.recordProjectMemory(projA.id, userAlpha, {
        content: 'Key architectural decision: Use BLAKE3 hashing',
      });

      const context = service.retrieveProjectContext(projA.id, userAlpha);
      expect(context.isolationHash).toBeDefined();
      expect(context.isolationHash).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256
    });

    it('purges project memory completely while leaving global and other projects untouched', () => {
      service.recordDefaultMemory(userAlpha, { content: 'Global preference' });
      service.recordProjectMemory(projA.id, userAlpha, { content: 'Alpha memory 1' });
      service.recordProjectMemory(projA.id, userAlpha, { content: 'Alpha memory 2' });
      service.recordProjectMemory(projB.id, userAlpha, { content: 'Beta memory' });

      const purgeResult = service.purgeProjectMemory(projA.id, userAlpha);
      expect(purgeResult.status).toBe('PURGED');
      expect(purgeResult.purgedCount).toBe(2);
      expect(purgeResult.projectId).toBe(projA.id);

      // Project Alpha memories are completely gone
      const ctxA = service.retrieveProjectContext(projA.id, userAlpha);
      expect(ctxA.projectMemories).toHaveLength(0);

      // Project Beta memory is 100% intact
      const ctxB = service.retrieveProjectContext(projB.id, userAlpha);
      expect(ctxB.projectMemories).toHaveLength(1);
      expect(ctxB.projectMemories[0]?.content).toBe('Beta memory');
    });

    it('performs comprehensive memory isolation audit and detects zero leaks', () => {
      service.recordDefaultMemory(userAlpha, { content: 'Global fact' });
      service.recordProjectMemory(projA.id, userAlpha, { content: 'Alpha fact' });
      service.recordProjectMemory(projB.id, userAlpha, { content: 'Beta fact' });

      const audit = service.verifyMemoryIsolation(userAlpha, projA.id);
      expect(audit.status).toBe('ISOLATED');
      expect(audit.leaksDetected).toBe(false);
      expect(audit.projectMemoryCount).toBe(1);
      expect(audit.defaultMemoryCount).toBe(1);
      expect(audit.otherProjectsMemoryCount).toBe(1);
      expect(audit.leakDetails).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. Enterprise Retention, Sensitivity & Export Restrictions
  // ==========================================================================
  describe('3. Enterprise Retention, Sensitivity & Export Restrictions', () => {
    it('sets expiresAt according to project retention policy (30_days)', () => {
      const proj30 = service.createProject(userAlpha, {
        name: '30-Day Scratchpad',
        retentionPolicy: '30_days',
      });

      const mem = service.recordProjectMemory(proj30.id, userAlpha, {
        content: 'Temporary project memory',
      });

      expect(mem.expiresAt).toBeDefined();
      const expiry = new Date(mem.expiresAt!).getTime();
      const now = Date.now();
      const approx30Days = 30 * 24 * 60 * 60 * 1000;
      expect(expiry - now).toBeGreaterThan(approx30Days - 10000);
      expect(expiry - now).toBeLessThan(approx30Days + 10000);
    });

    it('exports project context with cryptographic integrity hash', () => {
      const project = service.createProject(userAlpha, {
        name: 'Exportable Workspace',
        exportRestrictions: 'allowed',
      });
      service.recordProjectMemory(project.id, userAlpha, { content: 'Exportable memo' });
      service.addProjectFile(project.id, userAlpha, {
        name: 'notes.txt',
        size: 15,
        mimeType: 'text/plain',
        content: 'hello notes',
      });

      const exported = service.exportProjectContext(project.id, userAlpha);
      expect(exported.project.id).toBe(project.id);
      expect(exported.memories).toHaveLength(1);
      expect(exported.files).toHaveLength(1);
      expect(exported.exportedBy).toBe(userAlpha);
      expect(exported.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('blocks export when project exportRestrictions === "blocked"', () => {
      const project = service.createProject(userAlpha, {
        name: 'Strict Secret Enclave',
        exportRestrictions: 'blocked',
      });

      expect(() => service.exportProjectContext(project.id, userAlpha)).toThrow(
        'Export blocked by enterprise compliance policy',
      );
    });
  });

  // ==========================================================================
  // 4. Project Pinned Files & Context Prompt
  // ==========================================================================
  describe('4. Project Pinned Files & Context Prompt', () => {
    it('attaches and lists files in project workspace', () => {
      const project = service.createProject(userAlpha, { name: 'File Vault' });

      const file = service.addProjectFile(project.id, userAlpha, {
        name: 'schema.sql',
        size: 256,
        mimeType: 'text/x-sql',
        content: 'CREATE TABLE orders (id UUID PRIMARY KEY);',
      });

      expect(file.id).toMatch(/^file-/);
      expect(file.name).toBe('schema.sql');
      expect(file.mimeType).toBe('text/x-sql');

      const files = service.listProjectFiles(project.id, userAlpha);
      expect(files).toHaveLength(1);
      expect(files[0]?.name).toBe('schema.sql');
    });

    it('generates formatted system prompt context with files and instructions', () => {
      const project = service.createProject(userAlpha, {
        name: 'Risk Engine',
        customInstructions: 'Always calculate standard deviation using Bessel correction.',
      });

      service.addProjectFile(project.id, userAlpha, {
        name: 'params.json',
        size: 30,
        mimeType: 'application/json',
        content: '{"confidence": 0.99}',
      });

      const prompt = service.getProjectContextPrompt(userAlpha, project.id);
      expect(prompt).not.toBeNull();
      expect(prompt?.customInstructions).toContain('Bessel correction');
      expect(prompt?.pinnedFilesContext).toContain('params.json');
      expect(prompt?.pinnedFilesContext).toContain('{"confidence": 0.99}');
      expect(prompt?.isolationMode).toBe('PROJECT_ONLY');
    });

    it('deletes pinned file from project', () => {
      const project = service.createProject(userAlpha, { name: 'File Cleanup' });
      const file = service.addProjectFile(project.id, userAlpha, {
        name: 'temp.txt',
        size: 10,
        mimeType: 'text/plain',
      });

      expect(service.listProjectFiles(project.id, userAlpha)).toHaveLength(1);

      const deleted = service.deleteProjectFile(project.id, file.id, userAlpha);
      expect(deleted).toBe(true);
      expect(service.listProjectFiles(project.id, userAlpha)).toHaveLength(0);
    });
  });
});
