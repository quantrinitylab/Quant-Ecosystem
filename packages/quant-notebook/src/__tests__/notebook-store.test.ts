import { NotebookStore } from '../notebook/notebook-store.js';
import type { Source } from '../types.js';

describe('NotebookStore', () => {
  let store: NotebookStore;

  beforeEach(() => {
    store = new NotebookStore();
  });

  it('creates a notebook with title', () => {
    const nb = store.create('Test Notebook');
    expect(nb.title).toBe('Test Notebook');
    expect(nb.id).toBeDefined();
    expect(nb.sources).toEqual([]);
    expect(nb.embeddingsReady).toBe(false);
  });

  it('gets a notebook by id', () => {
    const nb = store.create('My NB');
    expect(store.get(nb.id)).toEqual(nb);
  });

  it('lists all notebooks', () => {
    store.create('A');
    store.create('B');
    expect(store.list()).toHaveLength(2);
  });

  it('updates a notebook', () => {
    const nb = store.create('Old');
    const updated = store.update(nb.id, { title: 'New' });
    expect(updated.title).toBe('New');
  });

  it('deletes a notebook', () => {
    const nb = store.create('Delete me');
    store.delete(nb.id);
    expect(store.list()).toHaveLength(0);
  });

  it('throws on get non-existent', () => {
    expect(() => store.get('bad-id')).toThrow();
  });

  it('throws on delete non-existent', () => {
    expect(() => store.delete('bad-id')).toThrow();
  });

  it('adds a source to notebook', () => {
    const nb = store.create('NB');
    const source: Source = { id: 's1', type: 'pdf', uri: '/file.pdf', title: 'Doc' };
    store.addSource(nb.id, source);
    expect(store.get(nb.id).sources).toHaveLength(1);
    expect(store.get(nb.id).sources[0]!.id).toBe('s1');
  });

  it('removes a source from notebook', () => {
    const nb = store.create('NB');
    const source: Source = { id: 's1', type: 'pdf', uri: '/file.pdf', title: 'Doc' };
    store.addSource(nb.id, source);
    store.removeSource(nb.id, 's1');
    expect(store.get(nb.id).sources).toHaveLength(0);
  });

  it('does not add duplicate source with same id', () => {
    const nb = store.create('NB');
    const source: Source = { id: 's1', type: 'pdf', uri: '/file.pdf', title: 'Doc' };
    store.addSource(nb.id, source);
    store.addSource(nb.id, source);
    expect(store.get(nb.id).sources).toHaveLength(1);
  });
});
