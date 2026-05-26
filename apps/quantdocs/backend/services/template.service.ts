export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface CreateFromTemplateResult {
  id: string;
  title: string;
  content: string;
  userId: string;
  templateId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Start with a blank page',
    content: '',
    metadata: { category: 'general' },
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Template for capturing meeting notes and action items',
    content: `<h1>Meeting Notes</h1>
<h2>Date</h2>
<p>[Date]</p>
<h2>Attendees</h2>
<ul><li>[Name]</li></ul>
<h2>Agenda</h2>
<ol><li>[Topic]</li></ol>
<h2>Discussion</h2>
<p>[Notes]</p>
<h2>Action Items</h2>
<ul><li>[ ] [Action] - [Owner] - [Due Date]</li></ul>
<h2>Next Meeting</h2>
<p>[Date and Time]</p>`,
    metadata: { category: 'business' },
  },
  {
    id: 'project-proposal',
    name: 'Project Proposal',
    description: 'Template for project proposals and plans',
    content: `<h1>Project Proposal</h1>
<h2>Executive Summary</h2>
<p>[Brief overview of the project]</p>
<h2>Problem Statement</h2>
<p>[What problem does this project solve?]</p>
<h2>Proposed Solution</h2>
<p>[How will the project address the problem?]</p>
<h2>Scope</h2>
<h3>In Scope</h3>
<ul><li>[Item]</li></ul>
<h3>Out of Scope</h3>
<ul><li>[Item]</li></ul>
<h2>Timeline</h2>
<p>[Project milestones and deadlines]</p>
<h2>Resources Required</h2>
<ul><li>[Resource]</li></ul>
<h2>Success Metrics</h2>
<ul><li>[Metric]</li></ul>`,
    metadata: { category: 'business' },
  },
  {
    id: 'technical-spec',
    name: 'Technical Specification',
    description: 'Template for technical design documents',
    content: `<h1>Technical Specification</h1>
<h2>Overview</h2>
<p>[High-level description]</p>
<h2>Goals and Non-Goals</h2>
<h3>Goals</h3>
<ul><li>[Goal]</li></ul>
<h3>Non-Goals</h3>
<ul><li>[Non-goal]</li></ul>
<h2>Architecture</h2>
<p>[System design and components]</p>
<h2>API Design</h2>
<p>[Endpoints, schemas, contracts]</p>
<h2>Data Model</h2>
<p>[Database schema and relationships]</p>
<h2>Security Considerations</h2>
<p>[Security measures and concerns]</p>
<h2>Testing Strategy</h2>
<p>[How the system will be tested]</p>
<h2>Rollout Plan</h2>
<p>[Deployment strategy]</p>`,
    metadata: { category: 'engineering' },
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Template for general reports',
    content: `<h1>Report Title</h1>
<h2>Summary</h2>
<p>[Executive summary of the report]</p>
<h2>Background</h2>
<p>[Context and background information]</p>
<h2>Findings</h2>
<h3>Key Finding 1</h3>
<p>[Details]</p>
<h3>Key Finding 2</h3>
<p>[Details]</p>
<h2>Analysis</h2>
<p>[Interpretation of findings]</p>
<h2>Recommendations</h2>
<ol><li>[Recommendation]</li></ol>
<h2>Conclusion</h2>
<p>[Final thoughts]</p>`,
    metadata: { category: 'general' },
  },
];

export class TemplateService {
  getTemplates(): Template[] {
    return BUILT_IN_TEMPLATES;
  }

  getTemplate(templateId: string): Template | undefined {
    return BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
  }

  createFromTemplate(
    templateId: string,
    userId: string,
    customizations?: { title?: string; metadata?: Record<string, unknown> },
  ): CreateFromTemplateResult {
    const template = this.getTemplate(templateId);
    if (!template) {
      return {
        id: crypto.randomUUID(),
        title: 'Untitled Document',
        content: '',
        userId,
        templateId: 'blank',
        metadata: {},
        createdAt: new Date(),
      };
    }

    return {
      id: crypto.randomUUID(),
      title: customizations?.title ?? template.name,
      content: template.content,
      userId,
      templateId: template.id,
      metadata: { ...template.metadata, ...customizations?.metadata },
      createdAt: new Date(),
    };
  }
}
