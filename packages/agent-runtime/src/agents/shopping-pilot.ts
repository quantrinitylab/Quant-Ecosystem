import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  store: string;
  rating: number;
  inStock: boolean;
}

export interface ShoppingResult {
  query: string;
  products: Product[];
  bestDeal: Product | null;
  comparison: Array<{ store: string; price: number; savings: number }>;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based product recommendations
 * Production path: Integrate LLM + e-commerce APIs
 */
export class ShoppingPilot extends IntelligentAgent {
  private lastResult: ShoppingResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'shopping-pilot',
      name: 'Shopping Pilot',
      icon: 'shopping-cart',
      defaultPermission: PermissionLevel.ACT_HIGH,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerShoppingTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('shopping');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent shopping assistant. Compare products across stores, find the ' +
      'best deals, and provide purchase recommendations based on price, ratings, and ' +
      'availability. Use available tools: shopping.search to find products, shopping.compare ' +
      'to compare options, shopping.add_to_cart to add items.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const query = (task.params?.['query'] as string) ?? '';
    const products = (task.params?.['products'] as Product[] | undefined) ?? [];

    this.lastResult = await this.analyzeWithAI(query, products);

    await super.execute(task);
  }

  getShoppingResult(): ShoppingResult | null {
    return this.lastResult;
  }

  private async analyzeWithAI(query: string, products: Product[]): Promise<ShoppingResult> {
    const inStockProducts = products.filter((p) => p.inStock);

    if (inStockProducts.length === 0) {
      return { query, products: [], bestDeal: null, comparison: [] };
    }

    const prompt =
      `Analyze these products for query "${query}" and recommend the best deal:\n` +
      `${JSON.stringify(inStockProducts.map((p) => ({ name: p.name, price: p.price, store: p.store, rating: p.rating })))}\n\n` +
      `Respond with JSON: { "bestDealId": "...", "reasoning": "..." }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    // Use AI recommendation but fall back to price-based ranking
    const sortedByPrice = [...inStockProducts].sort((a, b) => a.price - b.price);
    let bestDeal = sortedByPrice[0] ?? null;

    try {
      const parsed = JSON.parse(result.content) as { bestDealId?: string };
      if (parsed.bestDealId) {
        const aiPick = inStockProducts.find((p) => p.id === parsed.bestDealId);
        if (aiPick) bestDeal = aiPick;
      }
    } catch {
      // Fall back to cheapest
    }

    const maxPrice = sortedByPrice.length > 0 ? sortedByPrice[sortedByPrice.length - 1]!.price : 0;
    const comparison = inStockProducts.map((p) => ({
      store: p.store,
      price: p.price,
      savings: maxPrice - p.price,
    }));

    return { query, products: inStockProducts, bestDeal, comparison };
  }

  private registerShoppingTools(): void {
    const searchTool: ToolDefinition = {
      name: 'shopping.search',
      description: 'Search for products across multiple stores',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'maxPrice', type: 'number', description: 'Maximum price filter', required: false },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'shopping',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { results: [], query: args['query'] }, undoable: false };
      },
    };

    const compareTool: ToolDefinition = {
      name: 'shopping.compare',
      description: 'Compare products by price, rating, and features',
      parameters: [
        {
          name: 'productIds',
          type: 'array',
          description: 'Product IDs to compare',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'shopping',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { comparison: args['productIds'] },
          undoable: false,
        };
      },
    };

    const addToCartTool: ToolDefinition = {
      name: 'shopping.add_to_cart',
      description: 'Add a product to the shopping cart',
      parameters: [
        { name: 'productId', type: 'string', description: 'Product ID to add', required: true },
        { name: 'quantity', type: 'number', description: 'Quantity', required: false },
      ],
      requiredTier: AgentActionTier.Tier3_HighRisk,
      category: 'shopping',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { added: args['productId'], quantity: args['quantity'] ?? 1 },
          undoable: true,
        };
      },
    };

    this.toolRegistry.registerTool(searchTool);
    this.toolRegistry.registerTool(compareTool);
    this.toolRegistry.registerTool(addToCartTool);
  }
}
