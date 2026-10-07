// ============================================================================
// Search - Faceted Search
// Multi-dimensional faceted navigation with filter combination
// ============================================================================

import type {
  FacetDefinition,
  FacetResult,
  FacetBucket,
  FacetRange,
  SearchFilter,
  FilterOperator,
  IndexDocument,
} from '../types';

/** Internal facet data */
interface FacetData {
  definition: FacetDefinition;
  values: Map<string, Set<string>>; // value -> documentIds
  numericValues: Map<string, number>; // documentId -> numeric value
}

/**
 * FacetedSearch - Multi-dimensional faceted navigation
 *
 * Enables drill-down filtering across multiple dimensions
 * (categories, price ranges, dates, attributes). Supports
 * terms facets, range facets, and combined filter trees.
 */
export class FacetedSearch {
  private facets: Map<string, FacetData>;
  private documents: Map<string, IndexDocument>;
  private activeFilters: Map<string, SearchFilter[]>;

  constructor() {
    this.facets = new Map();
    this.documents = new Map();
    this.activeFilters = new Map();
  }

  /**
   * Add a facet definition
   */
  public addFacet(definition: FacetDefinition): void {
    if (this.facets.has(definition.name)) {
      throw new Error(`Facet already exists: ${definition.name}`);
    }

    this.facets.set(definition.name, {
      definition,
      values: new Map(),
      numericValues: new Map(),
    });

    // Index existing documents for this facet
    for (const [, doc] of this.documents) {
      this.indexDocumentForFacet(doc, definition.name);
    }
  }

  /**
   * Add a document to the faceted search index
   */
  public addDocument(document: IndexDocument): void {
    this.documents.set(document.id, document);

    // Index for all facets
    for (const [facetName] of this.facets) {
      this.indexDocumentForFacet(document, facetName);
    }
  }

  /**
   * Add multiple documents
   */
  public addDocuments(documents: IndexDocument[]): void {
    for (const doc of documents) {
      this.addDocument(doc);
    }
  }

  /**
   * Apply filters and get matching document IDs
   */
  public applyFilters(filters: SearchFilter[]): string[] {
    if (filters.length === 0) {
      return Array.from(this.documents.keys());
    }

    let resultSet: Set<string> | null = null;

    for (const filter of filters) {
      const matchingDocs = this.evaluateFilter(filter);

      if (resultSet === null) {
        resultSet = matchingDocs;
      } else {
        // Intersection - AND logic
        const intersection = new Set<string>();
        for (const docId of matchingDocs) {
          if (resultSet.has(docId)) {
            intersection.add(docId);
          }
        }
        resultSet = intersection;
      }
    }

    return resultSet ? Array.from(resultSet) : [];
  }

  /**
   * Get facet counts (optionally filtered)
   */
  public getFacetCounts(facetName: string, activeFilters?: SearchFilter[]): FacetResult {
    const facetData = this.facets.get(facetName);
    if (!facetData) {
      throw new Error(`Facet not found: ${facetName}`);
    }

    // Get the set of documents that match current filters (excluding this facet)
    const otherFilters = activeFilters
      ? activeFilters.filter((f) => f.field !== facetData.definition.field)
      : [];
    const eligibleDocs = new Set(this.applyFilters(otherFilters));

    const definition = facetData.definition;
    let buckets: FacetBucket[] = [];

    switch (definition.type) {
      case 'terms':
        buckets = this.buildTermsBuckets(facetData, eligibleDocs, definition.size || 20);
        break;
      case 'range':
      case 'numeric_range':
        buckets = this.buildRangeBuckets(facetData, eligibleDocs, definition.ranges || []);
        break;
      case 'date_histogram':
        buckets = this.buildDateBuckets(facetData, eligibleDocs);
        break;
    }

    // Apply minCount filter
    if (definition.minCount && definition.minCount > 0) {
      buckets = buckets.filter((b) => b.count >= definition.minCount!);
    }

    // Mark selected buckets
    if (activeFilters) {
      for (const bucket of buckets) {
        bucket.selected = activeFilters.some(
          (f) => f.field === definition.field && String(f.value) === bucket.key,
        );
      }
    }

    return {
      name: definition.name,
      field: definition.field,
      type: definition.type,
      buckets,
      total: buckets.reduce((sum, b) => sum + b.count, 0),
    };
  }

  /**
   * Build a filter tree for hierarchical facets
   */
  public buildFilterTree(
    facetName: string,
    separator: string = '/',
  ): {
    tree: Map<string, { count: number; children: Map<string, unknown> }>;
    totalDocs: number;
  } {
    const facetData = this.facets.get(facetName);
    if (!facetData) {
      throw new Error(`Facet not found: ${facetName}`);
    }

    const tree = new Map<string, { count: number; children: Map<string, unknown> }>();

    for (const [value, docIds] of facetData.values) {
      const parts = value.split(separator);
      let currentLevel = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (!currentLevel.has(part)) {
          currentLevel.set(part, { count: 0, children: new Map() });
        }
        const node = currentLevel.get(part)!;
        if (i === parts.length - 1) {
          node.count = docIds.size;
        }
        currentLevel = node.children as Map<
          string,
          { count: number; children: Map<string, unknown> }
        >;
      }
    }

    return { tree, totalDocs: this.documents.size };
  }

  /**
   * Combine facet results for multiple facets
   */
  public combineFacets(facetNames: string[], filters?: SearchFilter[]): FacetResult[] {
    const results: FacetResult[] = [];
    for (const name of facetNames) {
      results.push(this.getFacetCounts(name, filters));
    }
    return results;
  }

  /**
   * Get currently active filters
   */
  public getActiveFilters(): SearchFilter[] {
    const all: SearchFilter[] = [];
    for (const [, filters] of this.activeFilters) {
      all.push(...filters);
    }
    return all;
  }

  /**
   * Set active filters for a facet
   */
  public setActiveFilter(facetName: string, filters: SearchFilter[]): void {
    this.activeFilters.set(facetName, filters);
  }

  /**
   * Clear active filters for a facet
   */
  public clearFilter(facetName: string): void {
    this.activeFilters.delete(facetName);
  }

  /**
   * Clear all active filters
   */
  public clearAllFilters(): void {
    this.activeFilters.clear();
  }

  /**
   * Remove a document from the index
   */
  public removeDocument(documentId: string): boolean {
    if (!this.documents.has(documentId)) return false;

    // Remove from all facet value maps
    for (const [, facetData] of this.facets) {
      for (const [, docIds] of facetData.values) {
        docIds.delete(documentId);
      }
      facetData.numericValues.delete(documentId);
    }

    this.documents.delete(documentId);
    return true;
  }

  /**
   * Get all facet definitions
   */
  public getFacetDefinitions(): FacetDefinition[] {
    return Array.from(this.facets.values()).map((f) => f.definition);
  }

  /**
   * Get index statistics
   */
  public getStats(): {
    documentCount: number;
    facetCount: number;
    activeFilterCount: number;
    facetDetails: Array<{ name: string; uniqueValues: number }>;
  } {
    const facetDetails = Array.from(this.facets.entries()).map(([name, data]) => ({
      name,
      uniqueValues: data.values.size,
    }));

    return {
      documentCount: this.documents.size,
      facetCount: this.facets.size,
      activeFilterCount: this.getActiveFilters().length,
      facetDetails,
    };
  }

  /**
   * Remove a facet definition and all its data
   */
  public removeFacet(facetName: string): boolean {
    this.activeFilters.delete(facetName);
    return this.facets.delete(facetName);
  }

  // ---- Private Methods ----

  private indexDocumentForFacet(document: IndexDocument, facetName: string): void {
    const facetData = this.facets.get(facetName);
    if (!facetData) return;

    const fieldValue = document.fields[facetData.definition.field];
    if (fieldValue === undefined || fieldValue === null) return;

    if (typeof fieldValue === 'number') {
      facetData.numericValues.set(document.id, fieldValue);
      // Also store as string for range buckets
      const valueStr = String(fieldValue);
      if (!facetData.values.has(valueStr)) {
        facetData.values.set(valueStr, new Set());
      }
      facetData.values.get(valueStr)!.add(document.id);
    } else if (Array.isArray(fieldValue)) {
      for (const val of fieldValue) {
        const valueStr = String(val);
        if (!facetData.values.has(valueStr)) {
          facetData.values.set(valueStr, new Set());
        }
        facetData.values.get(valueStr)!.add(document.id);
      }
    } else {
      const valueStr = String(fieldValue);
      if (!facetData.values.has(valueStr)) {
        facetData.values.set(valueStr, new Set());
      }
      facetData.values.get(valueStr)!.add(document.id);
    }
  }

  private evaluateFilter(filter: SearchFilter): Set<string> {
    const matching = new Set<string>();

    for (const [docId, doc] of this.documents) {
      const fieldValue = doc.fields[filter.field];
      if (this.matchesFilter(fieldValue, filter.operator, filter.value)) {
        matching.add(docId);
      }
    }

    return matching;
  }

  private matchesFilter(
    fieldValue: unknown,
    operator: FilterOperator,
    filterValue: unknown,
  ): boolean {
    if (operator === 'exists') {
      return fieldValue !== undefined && fieldValue !== null;
    }

    if (fieldValue === undefined || fieldValue === null) return false;

    switch (operator) {
      case 'equals':
        return fieldValue === filterValue || String(fieldValue) === String(filterValue);
      case 'not_equals':
        return fieldValue !== filterValue && String(fieldValue) !== String(filterValue);
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'starts_with':
        return String(fieldValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'ends_with':
        return String(fieldValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'gt':
        return Number(fieldValue) > Number(filterValue);
      case 'gte':
        return Number(fieldValue) >= Number(filterValue);
      case 'lt':
        return Number(fieldValue) < Number(filterValue);
      case 'lte':
        return Number(fieldValue) <= Number(filterValue);
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);
      case 'not_in':
        return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
      case 'between':
        if (Array.isArray(filterValue) && filterValue.length === 2) {
          const num = Number(fieldValue);
          return num >= Number(filterValue[0]) && num <= Number(filterValue[1]);
        }
        return false;
      default:
        return false;
    }
  }

  private buildTermsBuckets(
    facetData: FacetData,
    eligibleDocs: Set<string>,
    size: number,
  ): FacetBucket[] {
    const buckets: FacetBucket[] = [];

    for (const [value, docIds] of facetData.values) {
      let count = 0;
      for (const docId of docIds) {
        if (eligibleDocs.has(docId)) count++;
      }

      if (count > 0) {
        buckets.push({ key: value, count, label: value });
      }
    }

    buckets.sort((a, b) => b.count - a.count);
    return buckets.slice(0, size);
  }

  private buildRangeBuckets(
    facetData: FacetData,
    eligibleDocs: Set<string>,
    ranges: FacetRange[],
  ): FacetBucket[] {
    const buckets: FacetBucket[] = [];

    for (const range of ranges) {
      let count = 0;

      for (const [docId, numValue] of facetData.numericValues) {
        if (!eligibleDocs.has(docId)) continue;

        const inRange =
          (range.from === undefined || numValue >= range.from) &&
          (range.to === undefined || numValue < range.to);
        if (inRange) count++;
      }

      buckets.push({
        key: range.label,
        count,
        label: range.label,
        from: range.from,
        to: range.to,
      });
    }

    return buckets;
  }

  private buildDateBuckets(facetData: FacetData, eligibleDocs: Set<string>): FacetBucket[] {
    // Group by month
    const monthBuckets: Map<string, number> = new Map();

    for (const [docId, timestamp] of facetData.numericValues) {
      if (!eligibleDocs.has(docId)) continue;

      const date = new Date(timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets.set(key, (monthBuckets.get(key) || 0) + 1);
    }

    return Array.from(monthBuckets.entries())
      .map(([key, count]) => ({ key, count, label: key }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
}
