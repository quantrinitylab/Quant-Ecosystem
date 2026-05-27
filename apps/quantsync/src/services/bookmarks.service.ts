// ============================================================================
// QuantSync - Bookmarks Service
// Organize saved posts into collections with privacy controls
// ============================================================================

export interface BookmarkCollection {
  id: string;
  name: string;
  description: string;
  postIds: string[];
  isPrivate: boolean;
  createdAt: number;
}

export class BookmarksService {
  private collections: Map<string, BookmarkCollection> = new Map();
  private userCollections: Map<string, string[]> = new Map();
  private collectionCounter = 0;

  createCollection(name: string, description?: string, isPrivate?: boolean): BookmarkCollection {
    this.collectionCounter += 1;
    const collection: BookmarkCollection = {
      id: `collection-${this.collectionCounter}`,
      name,
      description: description ?? '',
      postIds: [],
      isPrivate: isPrivate ?? false,
      createdAt: Date.now(),
    };

    this.collections.set(collection.id, collection);
    return collection;
  }

  addToCollection(postId: string, collectionId: string): boolean {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return false;
    }

    if (collection.postIds.includes(postId)) {
      return false; // Already bookmarked
    }

    collection.postIds.push(postId);
    this.collections.set(collectionId, collection);
    return true;
  }

  removeFromCollection(postId: string, collectionId: string): boolean {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return false;
    }

    const index = collection.postIds.indexOf(postId);
    if (index === -1) {
      return false;
    }

    collection.postIds.splice(index, 1);
    this.collections.set(collectionId, collection);
    return true;
  }

  deleteCollection(collectionId: string): boolean {
    const exists = this.collections.has(collectionId);
    if (!exists) {
      return false;
    }

    this.collections.delete(collectionId);

    // Remove from user collections mapping
    for (const [userId, ids] of this.userCollections.entries()) {
      const filtered = ids.filter((id) => id !== collectionId);
      this.userCollections.set(userId, filtered);
    }

    return true;
  }

  getCollection(collectionId: string): BookmarkCollection | null {
    return this.collections.get(collectionId) ?? null;
  }

  listCollections(userId: string): BookmarkCollection[] {
    const ids = this.userCollections.get(userId) ?? [];
    const result: BookmarkCollection[] = [];

    for (const id of ids) {
      const collection = this.collections.get(id);
      if (collection) {
        result.push(collection);
      }
    }

    return result;
  }

  isBookmarked(postId: string): boolean {
    for (const collection of this.collections.values()) {
      if (collection.postIds.includes(postId)) {
        return true;
      }
    }
    return false;
  }

  // Helper to associate a collection with a user
  assignToUser(userId: string, collectionId: string): void {
    const ids = this.userCollections.get(userId) ?? [];
    if (!ids.includes(collectionId)) {
      ids.push(collectionId);
      this.userCollections.set(userId, ids);
    }
  }
}
