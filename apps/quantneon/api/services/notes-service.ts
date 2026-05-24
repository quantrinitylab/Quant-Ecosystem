// ============================================================================
// QuantNeon API - Notes Service
// Short text updates, expiry management, visibility
// ============================================================================

interface Note {
  id: string;
  userId: string;
  text: string;
  emoji: string | null;
  createdAt: string;
  expiresAt: string;
  visibility: 'followers' | 'close_friends' | 'mutual';
  viewCount: number;
}

interface NoteReply {
  id: string;
  noteId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
}

const MAX_NOTE_LENGTH = 60;
const NOTE_DURATION_MS = 24 * 60 * 60 * 1000;

class NotesService {
  private notes: Map<string, Note> = new Map();
  private replies: Map<string, NoteReply[]> = new Map();
  private userNotes: Map<string, string> = new Map();

  async createNote(userId: string, data: { text: string; emoji?: string; visibility?: 'followers' | 'close_friends' | 'mutual' }): Promise<Note> {
    if (data.text.length > MAX_NOTE_LENGTH) throw new Error(`Note must be ${MAX_NOTE_LENGTH} characters or less`);
    const existingNoteId = this.userNotes.get(userId);
    if (existingNoteId) {
      this.notes.delete(existingNoteId);
      this.replies.delete(existingNoteId);
    }
    const now = new Date();
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId,
      text: data.text,
      emoji: data.emoji || null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + NOTE_DURATION_MS).toISOString(),
      visibility: data.visibility || 'followers',
      viewCount: 0,
    };
    this.notes.set(note.id, note);
    this.userNotes.set(userId, note.id);
    this.replies.set(note.id, []);
    return note;
  }

  async getUserNote(userId: string): Promise<Note | null> {
    const noteId = this.userNotes.get(userId);
    if (!noteId) return null;
    const note = this.notes.get(noteId);
    if (!note) return null;
    if (new Date(note.expiresAt) < new Date()) {
      this.notes.delete(noteId);
      this.userNotes.delete(userId);
      return null;
    }
    return note;
  }

  async getFeedNotes(userId: string, followingIds: string[]): Promise<Note[]> {
    this.cleanExpiredNotes();
    return followingIds
      .map(id => this.userNotes.get(id))
      .filter((noteId): noteId is string => noteId !== undefined)
      .map(noteId => this.notes.get(noteId))
      .filter((note): note is Note => note !== undefined)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async deleteNote(userId: string): Promise<void> {
    const noteId = this.userNotes.get(userId);
    if (noteId) {
      this.notes.delete(noteId);
      this.replies.delete(noteId);
      this.userNotes.delete(userId);
    }
  }

  async replyToNote(noteId: string, fromUserId: string, text: string): Promise<NoteReply> {
    const note = this.notes.get(noteId);
    if (!note) throw new Error('Note not found');
    const reply: NoteReply = {
      id: `reply_${Date.now()}`,
      noteId,
      fromUserId,
      text,
      createdAt: new Date().toISOString(),
    };
    const noteReplies = this.replies.get(noteId) || [];
    noteReplies.push(reply);
    this.replies.set(noteId, noteReplies);
    return reply;
  }

  async getNoteReplies(noteId: string): Promise<NoteReply[]> {
    return this.replies.get(noteId) || [];
  }

  async recordView(noteId: string): Promise<void> {
    const note = this.notes.get(noteId);
    if (note) note.viewCount++;
  }

  private cleanExpiredNotes(): void {
    const now = new Date();
    this.notes.forEach((note, id) => {
      if (new Date(note.expiresAt) < now) {
        this.notes.delete(id);
        this.userNotes.delete(note.userId);
        this.replies.delete(id);
      }
    });
  }
}

export const notesService = new NotesService();
export default NotesService;
