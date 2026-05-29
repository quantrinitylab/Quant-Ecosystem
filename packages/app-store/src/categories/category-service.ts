import { AppCategory } from '../types.js';

export class CategoryService {
  private categories: Map<string, AppCategory> = new Map();
  private appCategories: Map<string, Set<string>> = new Map(); // appId -> categoryIds

  create(category: AppCategory): AppCategory {
    this.categories.set(category.id, { ...category, appCount: 0 });
    return this.categories.get(category.id)!;
  }

  getTree(): AppCategory[] {
    const roots = Array.from(this.categories.values()).filter((c) => !c.parentId);
    return roots.map((root) => this.buildTree(root)).flat();
  }

  getChildren(parentId: string): AppCategory[] {
    return Array.from(this.categories.values()).filter((c) => c.parentId === parentId);
  }

  assignApp(appId: string, categoryId: string): boolean {
    if (!this.categories.has(categoryId)) return false;

    if (!this.appCategories.has(appId)) {
      this.appCategories.set(appId, new Set());
    }
    this.appCategories.get(appId)!.add(categoryId);

    const cat = this.categories.get(categoryId)!;
    this.categories.set(categoryId, { ...cat, appCount: cat.appCount + 1 });
    return true;
  }

  removeApp(appId: string, categoryId: string): boolean {
    const appCats = this.appCategories.get(appId);
    if (!appCats || !appCats.has(categoryId)) return false;

    appCats.delete(categoryId);

    const cat = this.categories.get(categoryId)!;
    this.categories.set(categoryId, { ...cat, appCount: Math.max(0, cat.appCount - 1) });
    return true;
  }

  getPopular(limit: number): AppCategory[] {
    return Array.from(this.categories.values())
      .sort((a, b) => b.appCount - a.appCount)
      .slice(0, limit);
  }

  getCategory(id: string): AppCategory | null {
    return this.categories.get(id) ?? null;
  }

  getAppCategories(appId: string): AppCategory[] {
    const categoryIds = this.appCategories.get(appId);
    if (!categoryIds) return [];
    return Array.from(categoryIds)
      .map((id) => this.categories.get(id))
      .filter((c): c is AppCategory => c !== undefined);
  }

  private buildTree(category: AppCategory): AppCategory[] {
    const children = this.getChildren(category.id);
    const result: AppCategory[] = [category];
    for (const child of children) {
      result.push(...this.buildTree(child));
    }
    return result;
  }
}
