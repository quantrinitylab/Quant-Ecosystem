// ============================================================================
// QuantChat - SnapMap Component
// Interactive map with friend avatars and location markers
// ============================================================================

import React, { useState } from 'react';
import type { FriendLocation, Place, GeoLocation } from '../types';

interface SnapMapProps {
  friendLocations: FriendLocation[];
  places: Place[];
  myLocation: GeoLocation | null;
  onFriendTap: (friend: FriendLocation) => void;
  onPlaceTap: (place: Place) => void;
  ghostMode: boolean;
}

export const SnapMap: React.FC<SnapMapProps> = ({
  friendLocations, places, myLocation, onFriendTap, onPlaceTap, ghostMode,
}) => {
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState<GeoLocation>(myLocation || { latitude: 40.758, longitude: -73.9855 });
  const [showPlaces, setShowPlaces] = useState(true);
  const [showFriends, setShowFriends] = useState(true);

  const handleZoomIn = () => setZoom(Math.min(zoom + 1, 18));
  const handleZoomOut = () => setZoom(Math.max(zoom - 1, 5));
  const handleRecenter = () => { if (myLocation) setCenter(myLocation); };

  const getMarkerPosition = (location: GeoLocation) => {
    const scale = Math.pow(2, zoom - 12);
    const x = 50 + (location.longitude - center.longitude) * 100 * scale;
    const y = 50 - (location.latitude - center.latitude) * 100 * scale;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  return (
    <div className="snap-map-component">
      <div className="map-canvas">
        {/* Map tiles placeholder */}
        <div className="map-tiles" style={{ transform: `scale(${zoom / 12})` }}>
          <div className="map-background" />
        </div>

        {/* My location */}
        {myLocation && !ghostMode && (
          <div
            className="my-marker"
            style={{ left: '50%', top: '50%' }}
          >
            <div className="pulse-animation" />
            <div className="marker-dot blue" />
          </div>
        )}

        {/* Friend markers */}
        {showFriends && friendLocations.map(friend => {
          const pos = getMarkerPosition(friend.location);
          return (
            <div
              key={friend.userId}
              className="friend-marker"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onClick={() => onFriendTap(friend)}
            >
              {friend.bitmojiUrl ? (
                <img src={friend.bitmojiUrl} alt={friend.username} className="bitmoji-pin" />
              ) : (
                <div className="avatar-pin">{friend.username.charAt(0).toUpperCase()}</div>
              )}
              <span className="friend-label">{friend.username}</span>
              {friend.actionText && <span className="action-text">{friend.actionText}</span>}
            </div>
          );
        })}

        {/* Place markers */}
        {showPlaces && places.map(place => {
          const pos = getMarkerPosition(place.location);
          return (
            <div
              key={place.id}
              className="place-marker"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onClick={() => onPlaceTap(place)}
            >
              <div className="place-pin">📍</div>
              <span className="place-label">{place.name}</span>
            </div>
          );
        })}
      </div>

      {/* Map controls */}
      <div className="map-controls">
        <button className="zoom-btn" onClick={handleZoomIn}>+</button>
        <button className="zoom-btn" onClick={handleZoomOut}>-</button>
        <button className="recenter-btn" onClick={handleRecenter}>⊕</button>
      </div>

      {/* Layer toggles */}
      <div className="layer-toggles">
        <button className={showFriends ? 'active' : ''} onClick={() => setShowFriends(!showFriends)}>
          👥
        </button>
        <button className={showPlaces ? 'active' : ''} onClick={() => setShowPlaces(!showPlaces)}>
          📍
        </button>
      </div>

      {/* Ghost mode indicator */}
      {ghostMode && (
        <div className="ghost-mode-badge">👻 Ghost Mode Active</div>
      )}

      {/* Info bar */}
      <div className="map-info-bar">
        <span>{friendLocations.length} friends visible</span>
        <span>Zoom: {zoom}x</span>
      </div>
    </div>
  );
};

export default SnapMap;
