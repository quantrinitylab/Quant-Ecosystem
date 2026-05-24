// ============================================================================
// QuantNeon API - Notes Routes
// ============================================================================

interface RouteConfig { method: string; path: string; handler: string; middleware?: string[]; }

export const notesRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/notes/feed', handler: 'NotesController.getFeedNotes', middleware: ['auth'] },
  { method: 'GET', path: '/api/notes/me', handler: 'NotesController.getMyNote', middleware: ['auth'] },
  { method: 'POST', path: '/api/notes', handler: 'NotesController.createNote', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/notes', handler: 'NotesController.deleteNote', middleware: ['auth'] },
  { method: 'POST', path: '/api/notes/:id/reply', handler: 'NotesController.replyToNote', middleware: ['auth'] },
  { method: 'GET', path: '/api/notes/:id/replies', handler: 'NotesController.getReplies', middleware: ['auth'] },
  { method: 'POST', path: '/api/notes/:id/view', handler: 'NotesController.recordView', middleware: ['auth'] },
];

export default notesRoutes;
