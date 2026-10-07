// ============================================================================
// QuantMax - Nearby People
// Distance-sorted card list, mutual interests badges, wave button
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useNearby } from '../hooks/useNearby';

const NearbyPage: React.FC = () => {
  const {
    people,
    waves,
    filters,
    isLoading,
    loadNearby,
    sendWave,
    acceptWave,
    declineWave,
    updateFilters,
  } = useNearby();
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showWaves, setShowWaves] = useState<boolean>(false);

  useEffect(() => {
    loadNearby();
  }, []);

  const sortedPeople = useMemo(() => {
    return [...people].sort((a, b) => a.distance - b.distance);
  }, [people]);

  const pendingWaves = useMemo(() => waves.filter((w) => w.status === 'pending'), [waves]);

  if (isLoading && people.length === 0) {
    return <LoadingState variant="skeleton" text="Finding people nearby..." />;
  }

  return (
    <div className="nearby-page">
      <div className="nearby-header">
        <h1 className="page-title">Nearby</h1>
        <div className="header-actions">
          {pendingWaves.length > 0 && (
            <button className="waves-btn" onClick={() => setShowWaves(!showWaves)}>
              Waves ({pendingWaves.length})
            </button>
          )}
          <button className="filter-btn" onClick={() => setShowFilters(!showFilters)}>
            Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-field">
            <label>Max Distance: {filters.maxDistance}km</label>
            <input
              type="range"
              min="1"
              max="100"
              value={filters.maxDistance}
              onChange={(e) => updateFilters({ maxDistance: Number(e.target.value) })}
            />
          </div>
          <div className="filter-field">
            <label>
              Age: {filters.ageMin} - {filters.ageMax}
            </label>
            <input
              type="range"
              min="18"
              max="65"
              value={filters.ageMin}
              onChange={(e) => updateFilters({ ageMin: Number(e.target.value) })}
            />
            <input
              type="range"
              min="18"
              max="65"
              value={filters.ageMax}
              onChange={(e) => updateFilters({ ageMax: Number(e.target.value) })}
            />
          </div>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filters.onlineOnly}
              onChange={(e) => updateFilters({ onlineOnly: e.target.checked })}
            />{' '}
            Online Only
          </label>
        </div>
      )}

      {showWaves && pendingWaves.length > 0 && (
        <div className="waves-panel">
          <h3>Incoming Waves</h3>
          {pendingWaves.map((wave) => (
            <div key={wave.id} className="wave-item">
              <img className="wave-avatar" src={wave.fromUserAvatar} alt={wave.fromUserName} />
              <span className="wave-name">{wave.fromUserName}</span>
              <div className="wave-actions">
                <button className="accept-btn" onClick={() => acceptWave(wave.id)}>
                  Accept
                </button>
                <button className="decline-btn" onClick={() => declineWave(wave.id)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="nearby-list">
        {sortedPeople.length === 0 ? (
          <EmptyState title="No one nearby" description="Try expanding your distance filter" />
        ) : (
          sortedPeople.map((person) => (
            <div key={person.id} className="nearby-card">
              <img className="nearby-avatar" src={person.avatar} alt={person.name} />
              <div className="nearby-info">
                <div className="nearby-name-row">
                  <span className="nearby-name">
                    {person.name}, {person.age}
                  </span>
                  {person.hasWaved && <span className="waved-badge">Waved</span>}
                </div>
                <span className="nearby-distance">{person.distance.toFixed(1)} km away</span>
                <p className="nearby-bio">{person.bio}</p>
                {person.mutualInterests && person.mutualInterests.length > 0 && (
                  <div className="mutual-interests">
                    {person.mutualInterests.map((interest: string) => (
                      <span key={interest} className="mutual-tag">
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="wave-btn"
                onClick={() => sendWave(person.id)}
                disabled={person.hasWaved}
              >
                {person.hasWaved ? 'Waved' : 'Wave 👋'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NearbyPage;
