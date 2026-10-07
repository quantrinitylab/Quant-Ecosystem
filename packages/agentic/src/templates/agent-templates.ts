export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  personality: string;
  defaultTools: string[];
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: 'executive-assistant',
    name: 'Executive Assistant',
    description: 'High-level assistant for busy professionals',
    category: 'Productivity',
    capabilities: ['calendar', 'email', 'tasks', 'research'],
    personality: 'Professional, proactive, and highly organized',
    defaultTools: ['quantmail_send', 'quantmeet_create_room'],
  },
  {
    id: 'content-creator',
    name: 'Content Creator',
    description: 'Helps with writing, editing, and content strategy',
    category: 'Creative',
    capabilities: ['writing', 'editing', 'seo', 'social'],
    personality: 'Creative, detail-oriented, and trend-aware',
    defaultTools: ['quantsync_create_post'],
  },
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    description: 'Deep research and data analysis specialist',
    category: 'Research',
    capabilities: ['web_search', 'data_analysis', 'summarization'],
    personality: 'Analytical, thorough, and objective',
    defaultTools: ['quantai_reason'],
  },
  {
    id: 'social-media-manager',
    name: 'Social Media Manager',
    description: 'Manages your entire social media presence',
    category: 'Marketing',
    capabilities: ['posting', 'engagement', 'analytics', 'scheduling'],
    personality: 'Social, creative, and data-driven',
    defaultTools: ['quantsync_create_post', 'quantchat_send'],
  },
];

export class AgentTemplateService {
  getAllTemplates(): AgentTemplate[] {
    return agentTemplates;
  }

  getTemplate(id: string): AgentTemplate | undefined {
    return agentTemplates.find((t) => t.id === id);
  }

  getTemplatesByCategory(category: string): AgentTemplate[] {
    return agentTemplates.filter((t) => t.category === category);
  }
}

export const templateService = new AgentTemplateService();
