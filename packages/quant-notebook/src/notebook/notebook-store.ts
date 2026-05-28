import type { Notebook, Source } from '../types.js';

export class NotebookStore {
  private notebooks = new Map<string, Notebook>();

  create(title: string): Notebook {
    const id = crypto.randomUUID();
    const now = new Date();
    const notebook: Notebook = {
      id,
      title,
      sources: [],
      embeddingsReady: false,
      createdAt: now,
      updatedAt: now,
    };
    this.notebooks.set(id, notebook);
    return notebook;
  }

  get(id: string): Notebook {
    const nb = this.notebooks.get(id);
    if (!nb) throw new Error(`Notebook ${id} not found`);
    return nb;
  }

  list(): Notebook[] {
    return [...this.notebooks.values()];
  }

  update(id: string, partial: Partial<Pick<Notebook, 'title' | 'embeddingsReady'>>): Notebook {
    const nb = this.get(id);
    Object.assign(nb, partial, { updatedAt: new Date() });
    return nb;
  }

  delete(id: string): void {
    if (!this.notebooks.has(id)) throw new Error(`Notebook ${id} not found`);
    this.notebooks.delete(id);
  }

  addSource(notebookId: string, source: Source): Notebook {
    const nb = this.get(notebookId);
    if (nb.sources.some((s) => s.id === source.id)) {
      return nb;
    }
    nb.sources.push(source);
    nb.updatedAt = new Date();
    return nb;
  }

  removeSource(notebookId: string, sourceId: string): Notebook {
    const nb = this.get(notebookId);
    nb.sources = nb.sources.filter((s) => s.id !== sourceId);
    nb.updatedAt = new Date();
    return nb;
  }
}
