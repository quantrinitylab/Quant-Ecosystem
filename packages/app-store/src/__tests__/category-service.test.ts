import { describe, it, expect, beforeEach } from 'vitest';
import { CategoryService } from '../categories/category-service.js';
import { AppCategory } from '../types.js';

describe('CategoryService', () => {
  let service: CategoryService;

  const createCategory = (overrides: Partial<AppCategory> = {}): AppCategory => ({
    id: `cat-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Category',
    slug: 'test-category',
    description: 'A test category',
    appCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    service = new CategoryService();
  });

  describe('create', () => {
    it('should create a category', () => {
      const category = createCategory({ id: 'cat-1', name: 'Productivity' });
      const result = service.create(category);

      expect(result.id).toBe('cat-1');
      expect(result.name).toBe('Productivity');
      expect(result.appCount).toBe(0);
    });

    it('should be retrievable after creation', () => {
      service.create(createCategory({ id: 'cat-2', name: 'Games' }));
      const retrieved = service.getCategory('cat-2');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Games');
    });
  });

  describe('getTree', () => {
    it('should return root categories and their children', () => {
      service.create(createCategory({ id: 'root-1', name: 'Root 1', slug: 'root-1' }));
      service.create(createCategory({ id: 'root-2', name: 'Root 2', slug: 'root-2' }));
      service.create(
        createCategory({ id: 'child-1', name: 'Child 1', slug: 'child-1', parentId: 'root-1' }),
      );
      service.create(
        createCategory({ id: 'child-2', name: 'Child 2', slug: 'child-2', parentId: 'root-1' }),
      );

      const tree = service.getTree();
      expect(tree.length).toBe(4); // flat tree includes all
    });

    it('should include nested children in tree', () => {
      service.create(createCategory({ id: 'r', name: 'Root', slug: 'root' }));
      service.create(createCategory({ id: 'c1', name: 'Child', slug: 'child', parentId: 'r' }));
      service.create(
        createCategory({ id: 'gc1', name: 'Grandchild', slug: 'grandchild', parentId: 'c1' }),
      );

      const tree = service.getTree();
      expect(tree.length).toBe(3);
      expect(tree.map((c) => c.id)).toContain('gc1');
    });
  });

  describe('getChildren', () => {
    it('should return direct children', () => {
      service.create(createCategory({ id: 'parent', name: 'Parent', slug: 'parent' }));
      service.create(
        createCategory({ id: 'child-a', name: 'Child A', slug: 'child-a', parentId: 'parent' }),
      );
      service.create(
        createCategory({ id: 'child-b', name: 'Child B', slug: 'child-b', parentId: 'parent' }),
      );
      service.create(
        createCategory({ id: 'other', name: 'Other', slug: 'other', parentId: 'another' }),
      );

      const children = service.getChildren('parent');
      expect(children.length).toBe(2);
      expect(children.every((c) => c.parentId === 'parent')).toBe(true);
    });

    it('should return empty for leaf categories', () => {
      service.create(createCategory({ id: 'leaf', name: 'Leaf', slug: 'leaf' }));
      expect(service.getChildren('leaf')).toEqual([]);
    });
  });

  describe('assignApp', () => {
    it('should assign an app to a category', () => {
      service.create(createCategory({ id: 'cat-a', name: 'Cat A', slug: 'cat-a' }));
      const result = service.assignApp('app-1', 'cat-a');

      expect(result).toBe(true);
    });

    it('should increment appCount on assign', () => {
      service.create(createCategory({ id: 'cat-b', name: 'Cat B', slug: 'cat-b' }));
      service.assignApp('app-1', 'cat-b');
      service.assignApp('app-2', 'cat-b');

      const cat = service.getCategory('cat-b');
      expect(cat!.appCount).toBe(2);
    });

    it('should return false for non-existent category', () => {
      expect(service.assignApp('app-1', 'non-existent')).toBe(false);
    });

    it('should track app categories correctly', () => {
      service.create(createCategory({ id: 'cat-x', name: 'X', slug: 'x' }));
      service.create(createCategory({ id: 'cat-y', name: 'Y', slug: 'y' }));
      service.assignApp('app-1', 'cat-x');
      service.assignApp('app-1', 'cat-y');

      const categories = service.getAppCategories('app-1');
      expect(categories.length).toBe(2);
    });
  });

  describe('removeApp', () => {
    it('should remove app from category and decrement count', () => {
      service.create(createCategory({ id: 'cat-r', name: 'R', slug: 'r' }));
      service.assignApp('app-1', 'cat-r');
      service.removeApp('app-1', 'cat-r');

      const cat = service.getCategory('cat-r');
      expect(cat!.appCount).toBe(0);
    });

    it('should return false if app not in category', () => {
      service.create(createCategory({ id: 'cat-empty', name: 'Empty', slug: 'empty' }));
      expect(service.removeApp('app-1', 'cat-empty')).toBe(false);
    });
  });

  describe('getPopular', () => {
    it('should return categories sorted by app count', () => {
      service.create(createCategory({ id: 'pop-1', name: 'Pop 1', slug: 'pop-1' }));
      service.create(createCategory({ id: 'pop-2', name: 'Pop 2', slug: 'pop-2' }));
      service.create(createCategory({ id: 'pop-3', name: 'Pop 3', slug: 'pop-3' }));

      service.assignApp('a1', 'pop-1');
      service.assignApp('a2', 'pop-2');
      service.assignApp('a3', 'pop-2');
      service.assignApp('a4', 'pop-3');
      service.assignApp('a5', 'pop-3');
      service.assignApp('a6', 'pop-3');

      const popular = service.getPopular(2);
      expect(popular.length).toBe(2);
      expect(popular[0]!.id).toBe('pop-3');
      expect(popular[1]!.id).toBe('pop-2');
    });
  });
});
