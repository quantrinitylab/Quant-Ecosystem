import { describe, it, expect, beforeEach } from 'vitest';
import {
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  starMessage,
  unstarMessage,
  listStarredMessages,
  indexMediaItem,
  getChannelMedia,
  clearGalleryForTesting,
  ChatMediaGalleryService,
} from '../services/chat-media-gallery.service';

describe('Chatzy v1.0.14 Message Pinning, Starred Messages & Media Gallery Engine', () => {
  beforeEach(() => {
    clearGalleryForTesting();
  });

  describe('Pinned Messages Engine', () => {
    it('pins message and adds to channel pinned list with correct metadata and order', () => {
      const channelId = 'chan_engineering';
      const userId = 'user_alice';

      const pinnedList = pinMessage(channelId, 'msg_001', userId);

      expect(pinnedList).toHaveLength(1);
      expect(pinnedList[0]).toMatchObject({
        channelId: 'chan_engineering',
        messageId: 'msg_001',
        pinnedByUserId: 'user_alice',
        order: 1,
      });
      expect(pinnedList[0].pinnedAt).toBeDefined();

      const retrieved = getPinnedMessages(channelId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].messageId).toBe('msg_001');
    });

    it('maintains sequential order when pinning multiple messages', () => {
      const channelId = 'chan_general';
      const userId = 'user_bob';

      pinMessage(channelId, 'msg_1', userId);
      pinMessage(channelId, 'msg_2', userId);
      const pins = pinMessage(channelId, 'msg_3', userId);

      expect(pins).toHaveLength(3);
      expect(pins.map((p) => p.messageId)).toEqual(['msg_1', 'msg_2', 'msg_3']);
      expect(pins.map((p) => p.order)).toEqual([1, 2, 3]);
    });

    it('does not duplicate an already pinned message', () => {
      const channelId = 'chan_general';
      pinMessage(channelId, 'msg_alpha', 'user_1');
      pinMessage(channelId, 'msg_beta', 'user_2');

      // Attempt to pin msg_alpha again with different user
      const updated = pinMessage(channelId, 'msg_alpha', 'user_3');

      expect(updated).toHaveLength(2);
      expect(updated.map((p) => p.messageId)).toEqual(['msg_alpha', 'msg_beta']);
      const rePinned = updated.find((p) => p.messageId === 'msg_alpha');
      expect(rePinned?.pinnedByUserId).toBe('user_3');
    });

    it('enforces max pinned messages cap (FIFO purges oldest when limit is reached)', () => {
      const channelId = 'chan_announcements';
      const userId = 'user_admin';

      // Default maxPinned is 5
      pinMessage(channelId, 'msg_1', userId);
      pinMessage(channelId, 'msg_2', userId);
      pinMessage(channelId, 'msg_3', userId);
      pinMessage(channelId, 'msg_4', userId);
      const fivePins = pinMessage(channelId, 'msg_5', userId);
      expect(fivePins).toHaveLength(5);
      expect(fivePins.map((p) => p.messageId)).toEqual([
        'msg_1',
        'msg_2',
        'msg_3',
        'msg_4',
        'msg_5',
      ]);

      // Pin 6th message -> msg_1 should be purged (FIFO)
      const afterSixth = pinMessage(channelId, 'msg_6', userId);
      expect(afterSixth).toHaveLength(5);
      expect(afterSixth.map((p) => p.messageId)).toEqual([
        'msg_2',
        'msg_3',
        'msg_4',
        'msg_5',
        'msg_6',
      ]);
      expect(afterSixth.map((p) => p.order)).toEqual([1, 2, 3, 4, 5]);

      // Pin 7th message -> msg_2 should be purged
      const afterSeventh = pinMessage(channelId, 'msg_7', userId);
      expect(afterSeventh).toHaveLength(5);
      expect(afterSeventh.map((p) => p.messageId)).toEqual([
        'msg_3',
        'msg_4',
        'msg_5',
        'msg_6',
        'msg_7',
      ]);
    });

    it('supports custom maxPinned limit', () => {
      const channelId = 'chan_vip';
      pinMessage(channelId, 'm1', 'u1', 2);
      pinMessage(channelId, 'm2', 'u1', 2);
      const pins = pinMessage(channelId, 'm3', 'u1', 2);

      expect(pins).toHaveLength(2);
      expect(pins.map((p) => p.messageId)).toEqual(['m2', 'm3']);
      expect(pins.map((p) => p.order)).toEqual([1, 2]);
    });

    it('unpins message and removes from channel pinned list while normalizing orders', () => {
      const channelId = 'chan_dev';
      pinMessage(channelId, 'msg_a', 'user_1');
      pinMessage(channelId, 'msg_b', 'user_1');
      pinMessage(channelId, 'msg_c', 'user_1');

      // Unpin the middle message (msg_b)
      const unpinned = unpinMessage(channelId, 'msg_b');
      expect(unpinned).toBe(true);

      const remaining = getPinnedMessages(channelId);
      expect(remaining).toHaveLength(2);
      expect(remaining.map((p) => p.messageId)).toEqual(['msg_a', 'msg_c']);
      expect(remaining.map((p) => p.order)).toEqual([1, 2]);

      // Unpinning non-existent message returns false
      const unpinNonExistent = unpinMessage(channelId, 'msg_xyz');
      expect(unpinNonExistent).toBe(false);

      // Unpinning from non-existent channel returns false
      expect(unpinMessage('chan_non_existent', 'msg_a')).toBe(false);
    });

    it('returns empty array when getting pinned messages for non-existent channel', () => {
      expect(getPinnedMessages('chan_empty')).toEqual([]);
    });
  });

  describe('Starred / Bookmarked Messages Engine', () => {
    it('stars messages per user and retrieves them', () => {
      const userId = 'user_charlie';
      const channelId = 'chan_finance';

      const starred = starMessage(
        userId,
        channelId,
        'msg_budget_2026',
        'Q3 Cloud budget approved at $45,000',
      );

      expect(starred).toMatchObject({
        userId: 'user_charlie',
        channelId: 'chan_finance',
        messageId: 'msg_budget_2026',
        contentSnippet: 'Q3 Cloud budget approved at $45,000',
      });
      expect(starred.starredAt).toBeDefined();

      const userStars = listStarredMessages(userId);
      expect(userStars).toHaveLength(1);
      expect(userStars[0].messageId).toBe('msg_budget_2026');
    });

    it('isolates starred messages between different users', () => {
      starMessage('user_alpha', 'chan_1', 'msg_1', 'Snippet 1');
      starMessage('user_beta', 'chan_1', 'msg_2', 'Snippet 2');

      const alphaStars = listStarredMessages('user_alpha');
      const betaStars = listStarredMessages('user_beta');

      expect(alphaStars).toHaveLength(1);
      expect(alphaStars[0].messageId).toBe('msg_1');

      expect(betaStars).toHaveLength(1);
      expect(betaStars[0].messageId).toBe('msg_2');
    });

    it('filters starred messages by channelId when provided', () => {
      const userId = 'user_david';
      starMessage(userId, 'chan_work', 'msg_w1', 'Work item 1');
      starMessage(userId, 'chan_work', 'msg_w2', 'Work item 2');
      starMessage(userId, 'chan_family', 'msg_f1', 'Dinner at 8pm');

      const workStars = listStarredMessages(userId, 'chan_work');
      expect(workStars).toHaveLength(2);
      expect(workStars.map((s) => s.messageId)).toContain('msg_w1');
      expect(workStars.map((s) => s.messageId)).toContain('msg_w2');

      const familyStars = listStarredMessages(userId, 'chan_family');
      expect(familyStars).toHaveLength(1);
      expect(familyStars[0].messageId).toBe('msg_f1');

      const allStars = listStarredMessages(userId);
      expect(allStars).toHaveLength(3);
    });

    it('unstars messages and updates user starred list', () => {
      const userId = 'user_elena';
      starMessage(userId, 'chan_ops', 'msg_deploy_done', 'Deployment finished');
      starMessage(userId, 'chan_ops', 'msg_incident_alert', 'CPU spike resolved');

      expect(listStarredMessages(userId)).toHaveLength(2);

      const unstarResult = unstarMessage(userId, 'msg_deploy_done');
      expect(unstarResult).toBe(true);

      const remaining = listStarredMessages(userId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].messageId).toBe('msg_incident_alert');

      // Unstarring non-starred message returns false
      expect(unstarMessage(userId, 'msg_unknown')).toBe(false);
      expect(unstarMessage('user_non_existent', 'msg_incident_alert')).toBe(false);
    });

    it('returns empty array when listing starred messages for user with none', () => {
      expect(listStarredMessages('user_no_stars')).toEqual([]);
    });
  });

  describe('Categorized Media Gallery Engine', () => {
    it('indexes media items with generated ID and metadata', () => {
      const channelId = 'chan_media_hub';

      const photo = indexMediaItem({
        channelId,
        messageId: 'msg_img_101',
        senderUserId: 'user_photographer',
        category: 'photos',
        url: 'https://cdn.quantchat.in/media/photo_sunset.jpg',
        fileName: 'sunset.jpg',
        fileSizeBytes: 2048576,
        thumbnailUrl: 'https://cdn.quantchat.in/media/thumb_sunset.jpg',
        mimeType: 'image/jpeg',
        sentAt: '2026-09-27T10:00:00.000Z',
      });

      expect(photo.id).toMatch(/^media_\d+_[a-z0-9]+$/);
      expect(photo.category).toBe('photos');
      expect(photo.url).toBe('https://cdn.quantchat.in/media/photo_sunset.jpg');
      expect(photo.fileSizeBytes).toBe(2048576);

      const channelItems = getChannelMedia(channelId);
      expect(channelItems).toHaveLength(1);
      expect(channelItems[0].id).toBe(photo.id);
    });

    it('filters media items by category: photos, videos, audio, documents, and links', () => {
      const channelId = 'chan_team';

      indexMediaItem({
        channelId,
        messageId: 'm_photo1',
        senderUserId: 'u1',
        category: 'photos',
        url: 'https://cdn.quantchat.in/photos/1.jpg',
        sentAt: '2026-09-27T10:01:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_video1',
        senderUserId: 'u2',
        category: 'videos',
        url: 'https://cdn.quantchat.in/videos/demo.mp4',
        sentAt: '2026-09-27T10:02:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_audio1',
        senderUserId: 'u3',
        category: 'audio',
        url: 'https://cdn.quantchat.in/audio/voicenote.aac',
        sentAt: '2026-09-27T10:03:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_doc1',
        senderUserId: 'u1',
        category: 'documents',
        url: 'https://cdn.quantchat.in/docs/spec.pdf',
        fileName: 'spec.pdf',
        sentAt: '2026-09-27T10:04:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_link1',
        senderUserId: 'u4',
        category: 'links',
        url: 'https://quantmail.in/docs/architecture',
        sentAt: '2026-09-27T10:05:00.000Z',
      });

      // Query by photos
      const photos = getChannelMedia(channelId, 'photos');
      expect(photos).toHaveLength(1);
      expect(photos[0].messageId).toBe('m_photo1');

      // Query by videos
      const videos = getChannelMedia(channelId, 'videos');
      expect(videos).toHaveLength(1);
      expect(videos[0].messageId).toBe('m_video1');

      // Query by audio
      const audios = getChannelMedia(channelId, 'audio');
      expect(audios).toHaveLength(1);
      expect(audios[0].messageId).toBe('m_audio1');

      // Query by documents
      const docs = getChannelMedia(channelId, 'documents');
      expect(docs).toHaveLength(1);
      expect(docs[0].messageId).toBe('m_doc1');

      // Query by links
      const links = getChannelMedia(channelId, 'links');
      expect(links).toHaveLength(1);
      expect(links[0].messageId).toBe('m_link1');

      // Query without category returns all 5 media items
      const allMedia = getChannelMedia(channelId);
      expect(allMedia).toHaveLength(5);
    });

    it('isolates media items between different channels', () => {
      indexMediaItem({
        channelId: 'chan_a',
        messageId: 'm_a',
        senderUserId: 'u1',
        category: 'photos',
        url: 'https://cdn.quantchat.in/a.png',
        sentAt: '2026-09-27T10:00:00.000Z',
      });

      indexMediaItem({
        channelId: 'chan_b',
        messageId: 'm_b',
        senderUserId: 'u2',
        category: 'photos',
        url: 'https://cdn.quantchat.in/b.png',
        sentAt: '2026-09-27T10:00:00.000Z',
      });

      const chanAMedia = getChannelMedia('chan_a');
      expect(chanAMedia).toHaveLength(1);
      expect(chanAMedia[0].messageId).toBe('m_a');

      const chanBMedia = getChannelMedia('chan_b');
      expect(chanBMedia).toHaveLength(1);
      expect(chanBMedia[0].messageId).toBe('m_b');

      expect(getChannelMedia('chan_non_existent')).toEqual([]);
    });

    it('sorts media by sentAt descending (newest first)', () => {
      const channelId = 'chan_timeline';

      indexMediaItem({
        channelId,
        messageId: 'm_old',
        senderUserId: 'u1',
        category: 'photos',
        url: 'https://cdn.quantchat.in/old.jpg',
        sentAt: '2026-09-25T12:00:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_newest',
        senderUserId: 'u1',
        category: 'photos',
        url: 'https://cdn.quantchat.in/newest.jpg',
        sentAt: '2026-09-27T15:00:00.000Z',
      });

      indexMediaItem({
        channelId,
        messageId: 'm_mid',
        senderUserId: 'u1',
        category: 'photos',
        url: 'https://cdn.quantchat.in/mid.jpg',
        sentAt: '2026-09-26T14:00:00.000Z',
      });

      const sorted = getChannelMedia(channelId);
      expect(sorted.map((m) => m.messageId)).toEqual(['m_newest', 'm_mid', 'm_old']);
    });
  });

  describe('ChatMediaGalleryService Namespace Object Export', () => {
    it('exposes all methods correctly via ChatMediaGalleryService object', () => {
      expect(typeof ChatMediaGalleryService.pinMessage).toBe('function');
      expect(typeof ChatMediaGalleryService.unpinMessage).toBe('function');
      expect(typeof ChatMediaGalleryService.getPinnedMessages).toBe('function');
      expect(typeof ChatMediaGalleryService.starMessage).toBe('function');
      expect(typeof ChatMediaGalleryService.unstarMessage).toBe('function');
      expect(typeof ChatMediaGalleryService.listStarredMessages).toBe('function');
      expect(typeof ChatMediaGalleryService.indexMediaItem).toBe('function');
      expect(typeof ChatMediaGalleryService.getChannelMedia).toBe('function');
      expect(typeof ChatMediaGalleryService.clearGalleryForTesting).toBe('function');
    });
  });
});
