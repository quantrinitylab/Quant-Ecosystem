// ============================================================================
// QuantChat - Discover Page
// Discover content feed with featured, trending, publishers
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { DiscoverItem, Publisher, DiscoverCategory } from '../types';
import { apiClient } from '../services/api-client';

export const DiscoverPage: React.FC = () => {
  const [feed, setFeed] = useState<DiscoverItem[]>([]);
  const [featured, setFeatured] = useState<DiscoverItem[]>([]);
  const [trending, setTrending] = useState<DiscoverItem[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [activeCategory, setActiveCategory] = useState<DiscoverCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const categories: Array<{ key: DiscoverCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'entertainment', label: 'Entertainment' },
    { key: 'gaming', label: 'Gaming' },
    { key: 'sports', label: 'Sports' },
    { key: 'music', label: 'Music' },
    { key: 'food', label: 'Food' },
    { key: 'technology', label: 'Tech' },
    { key: 'fashion', label: 'Fashion' },
  ];

  useEffect(() => {
    loadContent();
  }, [activeCategory]);

  const loadContent = async () => {
    setLoading(true);
    const category = activeCategory === 'all' ? undefined : activeCategory;

    const [feedRes, trendingRes, publishersRes] = await Promise.all([
      apiClient.getDiscoverFeed(category),
      apiClient.getTrendingContent(),
      apiClient.getPublishers(),
    ]);

    if (feedRes.success && feedRes.data) setFeed(feedRes.data);
    if (trendingRes.success && trendingRes.data) {
      setTrending(trendingRes.data);
      setFeatured(trendingRes.data.filter(i => i.isFeatured));
    }
    if (publishersRes.success && publishersRes.data) setPublishers(publishersRes.data);

    setLoading(false);
  };

  const handleSubscribe = async (publisherId: string) => {
    await apiClient.subscribe(publisherId);
    setPublishers(prev => prev.map(p =>
      p.id === publisherId ? { ...p, subscriberCount: p.subscriberCount + 1 } : p
    ));
  };

  return (
    <div className="discover-page">
      <header className="discover-header">
        <h1>Discover</h1>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search stories, shows, and more..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="category-tabs">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={activeCategory === cat.key ? 'active' : ''}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="discover-loading">Loading content...</div>
      ) : (
        <main className="discover-content">
          {/* Featured Section */}
          {featured.length > 0 && (
            <section className="featured-section">
              <h2>Featured</h2>
              <div className="featured-carousel">
                {featured.map(item => (
                  <div key={item.id} className="featured-card">
                    <img src={item.thumbnailUrl} alt={item.title} className="featured-image" />
                    <div className="featured-overlay">
                      <span className="publisher-name">{item.publisherName}</span>
                      <h3>{item.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Trending Section */}
          {trending.length > 0 && (
            <section className="trending-section">
              <h2>Trending</h2>
              <div className="trending-grid">
                {trending.map(item => (
                  <div key={item.id} className="trending-card">
                    <img src={item.thumbnailUrl} alt={item.title} className="card-image" />
                    <div className="card-info">
                      <img src={item.publisherAvatarUrl} alt={item.publisherName} className="publisher-avatar" />
                      <div className="card-text">
                        <h4>{item.title}</h4>
                        <span>{item.publisherName}</span>
                        <span className="view-count">{formatViews(item.viewCount)} views</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Publishers Section */}
          <section className="publishers-section">
            <h2>Publishers</h2>
            <div className="publishers-list">
              {publishers.map(pub => (
                <div key={pub.id} className="publisher-card">
                  <img src={pub.avatarUrl} alt={pub.name} className="publisher-avatar" />
                  <div className="publisher-info">
                    <h4>{pub.name} {pub.isVerified && '✓'}</h4>
                    <span>{formatViews(pub.subscriberCount)} subscribers</span>
                  </div>
                  <button className="subscribe-btn" onClick={() => handleSubscribe(pub.id)}>
                    Subscribe
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Main Feed */}
          <section className="feed-section">
            <h2>For You</h2>
            <div className="feed-grid">
              {feed.map(item => (
                <div key={item.id} className="feed-card">
                  <img src={item.thumbnailUrl} alt={item.title} className="feed-image" />
                  <div className="feed-card-info">
                    <h4>{item.title}</h4>
                    <span>{item.publisherName}</span>
                    {item.duration && <span>{Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
};

function formatViews(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export default DiscoverPage;
