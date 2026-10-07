import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDramaSeries,
  addEpisodeToSeries,
  getSeriesById,
  listSeries,
  unlockEpisode,
  recordWatchProgress,
  getNextBingeEpisode,
  clearDramaForTesting,
  shortDramaService,
  type DramaGenre,
  type ShortDramaSeries,
  type DramaEpisode,
} from '../services/short-drama.service';

describe('SnapReels v1.1.7 Short Drama Series & Binge Playback Engine', () => {
  beforeEach(() => {
    clearDramaForTesting();
  });

  describe('createDramaSeries', () => {
    it('creates a drama series with default freeEpisodesCount and initial state', () => {
      const series = createDramaSeries({
        title: 'The Billionaire Heir Secret Return',
        synopsis:
          'Disguised as a valet, the exiled billionaire heir returns to claim his corporate empire.',
        coverPosterUrl: 'https://images.unsplash.com/photo-billionaire-drama.jpg',
        genres: ['billionaire', 'revenge'],
      });

      expect(series.id).toBeDefined();
      expect(series.title).toBe('The Billionaire Heir Secret Return');
      expect(series.synopsis).toContain('exiled billionaire heir');
      expect(series.coverPosterUrl).toBe('https://images.unsplash.com/photo-billionaire-drama.jpg');
      expect(series.genres).toEqual(['billionaire', 'revenge']);
      expect(series.totalEpisodes).toBe(0);
      expect(series.freeEpisodesCount).toBe(5);
      expect(series.episodes).toEqual([]);
      expect(series.viewCount).toBe(0);
      expect(series.rating).toBe(5);
      expect(series.createdAt).toBeDefined();

      const fetched = getSeriesById(series.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('The Billionaire Heir Secret Return');
    });

    it('creates a drama series with custom freeEpisodesCount', () => {
      const series = createDramaSeries({
        title: 'CEO Mistaken Love',
        synopsis: 'A contract marriage turns into dangerous romance.',
        coverPosterUrl: 'https://images.unsplash.com/photo-ceo.jpg',
        genres: ['romance'],
        freeEpisodesCount: 3,
      });

      expect(series.freeEpisodesCount).toBe(3);
    });

    it('throws error when title is empty or invalid', () => {
      expect(() => {
        createDramaSeries({
          title: '   ',
          synopsis: 'Test',
          coverPosterUrl: '',
          genres: ['romance'],
        });
      }).toThrow('Series title is required');
    });
  });

  describe('addEpisodeToSeries & Paywall Gating Rules', () => {
    it('adds episodes with auto-incrementing episode numbers', () => {
      const series = createDramaSeries({
        title: 'Revenge of the Disowned Son',
        synopsis: 'Cast out by family, he returns with trillionaire backing.',
        coverPosterUrl: 'https://images.unsplash.com/photo-revenge.jpg',
        genres: ['revenge', 'billionaire'],
        freeEpisodesCount: 2,
      });

      const ep1 = addEpisodeToSeries(series.id, {
        title: 'The Humiliation',
        durationSeconds: 95,
        videoUrl: 'https://cdn.quantube.tv/drama/ep1.mp4',
        thumbnailUrl: 'https://cdn.quantube.tv/drama/ep1.jpg',
      });

      const ep2 = addEpisodeToSeries(series.id, {
        title: 'The Black Card Revelation',
        durationSeconds: 110,
        videoUrl: 'https://cdn.quantube.tv/drama/ep2.mp4',
      });

      const ep3 = addEpisodeToSeries(series.id, {
        title: 'Boardroom Takeover',
        durationSeconds: 105,
        videoUrl: 'https://cdn.quantube.tv/drama/ep3.mp4',
        coinCost: 60,
      });

      expect(ep1.episodeNumber).toBe(1);
      expect(ep2.episodeNumber).toBe(2);
      expect(ep3.episodeNumber).toBe(3);

      const updatedSeries = getSeriesById(series.id);
      expect(updatedSeries?.totalEpisodes).toBe(3);
      expect(updatedSeries?.episodes.length).toBe(3);
    });

    it('enforces free vs locked rules based on freeEpisodesCount', () => {
      const series = createDramaSeries({
        title: 'Secret Billionaire Empress',
        synopsis: 'Undercover CEO romance drama.',
        coverPosterUrl: 'https://cdn.quantube.tv/posters/empress.jpg',
        genres: ['romance', 'billionaire'],
        freeEpisodesCount: 2,
      });

      // Episode 1 (<= freeEpisodesCount) -> Free, coinCost = 0
      const ep1 = addEpisodeToSeries(series.id, {
        title: 'Episode 1',
        durationSeconds: 90,
        videoUrl: 'https://cdn.quantube.tv/drama/ep1.mp4',
      });
      expect(ep1.isFree).toBe(true);
      expect(ep1.coinCost).toBe(0);

      // Episode 2 (<= freeEpisodesCount) -> Free, coinCost = 0
      const ep2 = addEpisodeToSeries(series.id, {
        title: 'Episode 2',
        durationSeconds: 92,
        videoUrl: 'https://cdn.quantube.tv/drama/ep2.mp4',
      });
      expect(ep2.isFree).toBe(true);
      expect(ep2.coinCost).toBe(0);

      // Episode 3 (> freeEpisodesCount) -> Locked, default coinCost = 50
      const ep3 = addEpisodeToSeries(series.id, {
        title: 'Episode 3',
        durationSeconds: 95,
        videoUrl: 'https://cdn.quantube.tv/drama/ep3.mp4',
      });
      expect(ep3.isFree).toBe(false);
      expect(ep3.coinCost).toBe(50);

      // Episode 4 (> freeEpisodesCount) with custom coinCost
      const ep4 = addEpisodeToSeries(series.id, {
        title: 'Episode 4',
        durationSeconds: 100,
        videoUrl: 'https://cdn.quantube.tv/drama/ep4.mp4',
        coinCost: 75,
      });
      expect(ep4.isFree).toBe(false);
      expect(ep4.coinCost).toBe(75);

      // Episode 5 with explicit isFree override
      const ep5 = addEpisodeToSeries(series.id, {
        title: 'Episode 5: Special Promo',
        durationSeconds: 85,
        videoUrl: 'https://cdn.quantube.tv/drama/ep5.mp4',
        isFree: true,
      });
      expect(ep5.isFree).toBe(true);
      expect(ep5.coinCost).toBe(0);
    });

    it('throws error when adding episode to non-existent series', () => {
      expect(() => {
        addEpisodeToSeries('non-existent-id', {
          title: 'Ghost Episode',
          durationSeconds: 60,
          videoUrl: 'https://cdn.quantube.tv/ghost.mp4',
        });
      }).toThrow('Series not found: non-existent-id');
    });

    it('throws error when videoUrl is missing', () => {
      const series = createDramaSeries({
        title: 'Trial Series',
        synopsis: 'Demo',
        coverPosterUrl: '',
        genres: ['thriller'],
      });

      expect(() => {
        addEpisodeToSeries(series.id, {
          title: 'Missing Video',
          durationSeconds: 60,
          videoUrl: '',
        });
      }).toThrow('videoUrl is required');
    });
  });

  describe('listSeries & getSeriesById', () => {
    it('filters drama series by genre', () => {
      createDramaSeries({
        title: 'Billionaire Romance',
        synopsis: 'Romance and wealth',
        coverPosterUrl: '',
        genres: ['billionaire', 'romance'],
      });

      createDramaSeries({
        title: 'Silent Shadow',
        synopsis: 'Suspenseful revenge thriller',
        coverPosterUrl: '',
        genres: ['revenge', 'thriller'],
      });

      createDramaSeries({
        title: 'Mythic Ascension',
        synopsis: 'Fantasy cultivation drama',
        coverPosterUrl: '',
        genres: ['fantasy'],
      });

      const all = listSeries();
      expect(all.length).toBe(3);

      const billionaireSeries = listSeries('billionaire');
      expect(billionaireSeries.length).toBe(1);
      expect(billionaireSeries[0].title).toBe('Billionaire Romance');

      const thrillerSeries = listSeries('thriller');
      expect(thrillerSeries.length).toBe(1);
      expect(thrillerSeries[0].title).toBe('Silent Shadow');

      const comedySeries = listSeries('comedy');
      expect(comedySeries.length).toBe(0);
    });
  });

  describe('unlockEpisode Paywall Engine', () => {
    let series: ShortDramaSeries;

    beforeEach(() => {
      series = createDramaSeries({
        title: 'The Mafia Boss Secret Wife',
        synopsis: 'Thrilling romance with high stakes action.',
        coverPosterUrl: 'https://cdn.quantube.tv/posters/mafia.jpg',
        genres: ['romance', 'thriller'],
        freeEpisodesCount: 2,
      });

      for (let i = 1; i <= 6; i++) {
        addEpisodeToSeries(series.id, {
          title: `Episode ${i}`,
          durationSeconds: 90,
          videoUrl: `https://cdn.quantube.tv/ep${i}.mp4`,
          coinCost: i > 2 ? 40 : 0,
        });
      }
    });

    it('unlocks free episode with 0 coin deduction', () => {
      const result = unlockEpisode('user-101', series.id, 1, 100);

      expect(result.success).toBe(true);
      expect(result.remainingCoins).toBe(100);
      expect(result.progress.unlockedEpisodeNumbers).toContain(1);
    });

    it('unlocks locked episode deducting coins and updating user watch progress', () => {
      // Episode 3 costs 40 coins, user has 100 coins
      const result = unlockEpisode('user-101', series.id, 3, 100);

      expect(result.success).toBe(true);
      expect(result.remainingCoins).toBe(60); // 100 - 40 = 60
      expect(result.progress.unlockedEpisodeNumbers).toContain(3);

      // Subsequent unlock of the same episode should not deduct coins again
      const repeatResult = unlockEpisode('user-101', series.id, 3, 60);
      expect(repeatResult.success).toBe(true);
      expect(repeatResult.remainingCoins).toBe(60);
    });

    it('fails gracefully when user has insufficient coin balance', () => {
      // Episode 3 costs 40 coins, user only has 25 coins
      const result = unlockEpisode('user-poor', series.id, 3, 25);

      expect(result.success).toBe(false);
      expect(result.remainingCoins).toBe(25);
      expect(result.error).toBe('Insufficient coin balance');
      expect(result.progress.unlockedEpisodeNumbers).not.toContain(3);
    });

    it('handles non-existent episode or series gracefully', () => {
      const invalidEpResult = unlockEpisode('user-101', series.id, 999, 100);
      expect(invalidEpResult.success).toBe(false);
      expect(invalidEpResult.error).toContain('Episode 999 not found');

      const invalidSeriesResult = unlockEpisode('user-101', 'non-existent-series', 1, 100);
      expect(invalidSeriesResult.success).toBe(false);
      expect(invalidSeriesResult.error).toContain('Series not found');
    });
  });

  describe('recordWatchProgress & Series Completion Percentage', () => {
    let series: ShortDramaSeries;

    beforeEach(() => {
      series = createDramaSeries({
        title: 'Billionaire Undercover Husband',
        synopsis: 'A 5-episode short drama binge series.',
        coverPosterUrl: 'https://cdn.quantube.tv/posters/husband.jpg',
        genres: ['billionaire', 'revenge'],
        freeEpisodesCount: 5,
      });

      for (let i = 1; i <= 5; i++) {
        addEpisodeToSeries(series.id, {
          title: `Episode ${i}`,
          durationSeconds: 100,
          videoUrl: `https://cdn.quantube.tv/binge/ep${i}.mp4`,
        });
      }
    });

    it('records watch progress and computes accurate completion percentages', () => {
      // Episode 1 of 5 = 20%
      const p1 = recordWatchProgress('user-binge', series.id, 1);
      expect(p1.lastWatchedEpisodeNumber).toBe(1);
      expect(p1.completionPercentage).toBe(20);
      expect(p1.lastWatchedAt).toBeDefined();

      // Episode 3 of 5 = 60%
      const p3 = recordWatchProgress('user-binge', series.id, 3);
      expect(p3.lastWatchedEpisodeNumber).toBe(3);
      expect(p3.completionPercentage).toBe(60);

      // Episode 5 of 5 = 100%
      const p5 = recordWatchProgress('user-binge', series.id, 5);
      expect(p5.lastWatchedEpisodeNumber).toBe(5);
      expect(p5.completionPercentage).toBe(100);

      // View count incremented on series
      const updatedSeries = getSeriesById(series.id);
      expect(updatedSeries?.viewCount).toBe(3);
    });

    it('throws error when recording progress on non-existent episode or series', () => {
      expect(() => {
        recordWatchProgress('user-binge', series.id, 10);
      }).toThrow('Episode 10 not found in series');

      expect(() => {
        recordWatchProgress('user-binge', 'non-existent', 1);
      }).toThrow('Series not found');
    });
  });

  describe('getNextBingeEpisode Auto-Play Sequencer', () => {
    let series: ShortDramaSeries;

    beforeEach(() => {
      series = createDramaSeries({
        title: 'Revenge of the Ex-Wife',
        synopsis: 'She built a multi-billion dollar tech empire in secret.',
        coverPosterUrl: 'https://cdn.quantube.tv/posters/ex-wife.jpg',
        genres: ['revenge', 'romance'],
        freeEpisodesCount: 3,
      });

      for (let i = 1; i <= 3; i++) {
        addEpisodeToSeries(series.id, {
          title: `Episode ${i}`,
          durationSeconds: 120,
          videoUrl: `https://cdn.quantube.tv/ex/ep${i}.mp4`,
        });
      }
    });

    it('returns the subsequent episode in sequence', () => {
      const next1 = getNextBingeEpisode(series.id, 1);
      expect(next1).not.toBeNull();
      expect(next1?.episodeNumber).toBe(2);
      expect(next1?.title).toBe('Episode 2');

      const next2 = getNextBingeEpisode(series.id, 2);
      expect(next2).not.toBeNull();
      expect(next2?.episodeNumber).toBe(3);
      expect(next2?.title).toBe('Episode 3');
    });

    it('returns null when reaching the end of the series', () => {
      const nextEnd = getNextBingeEpisode(series.id, 3);
      expect(nextEnd).toBeNull();
    });

    it('returns null for non-existent series', () => {
      const notFound = getNextBingeEpisode('unknown-series', 1);
      expect(notFound).toBeNull();
    });
  });

  describe('shortDramaService Object-Oriented Wrapper', () => {
    it('supports calling methods on the singleton instance', () => {
      const series = shortDramaService.createDramaSeries({
        title: 'OO Service Drama',
        synopsis: 'Testing OO service wrapper',
        coverPosterUrl: '',
        genres: ['comedy'],
        freeEpisodesCount: 1,
      });

      const ep = shortDramaService.addEpisodeToSeries(series.id, {
        title: 'Pilot',
        durationSeconds: 80,
        videoUrl: 'https://cdn.quantube.tv/pilot.mp4',
      });

      expect(ep.episodeNumber).toBe(1);
      expect(ep.isFree).toBe(true);

      const found = shortDramaService.getSeriesById(series.id);
      expect(found).not.toBeNull();
      expect(found?.totalEpisodes).toBe(1);
    });
  });
});
