// ============================================================================
// QuantNeon - Guides
// Curated content collections: places, products, posts
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Guide {
  id: string;
  title: string;
  coverUrl: string;
  author: string;
  authorAvatar: string;
  type: 'places' | 'products' | 'posts';
  itemCount: number;
  savedCount: number;
  isSaved: boolean;
  updatedAt: string;
}

interface GuidesPageState {
  guides: Guide[];
  myGuides: Guide[];
  activeTab: 'discover' | 'saved' | 'created';
  loading: boolean;
  error: string | null;
  creating: boolean;
  newTitle: string;
  newType: 'places' | 'products' | 'posts';
}

const MOCK_GUIDES: Guide[] = [
  { id: 'g1', title: 'Best Coffee Shops in NYC', coverUrl: '/guides/coffee.jpg', author: 'foodie_mark', authorAvatar: '/avatars/mark.jpg', type: 'places', itemCount: 12, savedCount: 4500, isSaved: true, updatedAt: '2024-01-14' },
  { id: 'g2', title: 'Skincare Routine Essentials', coverUrl: '/guides/skincare.jpg', author: 'beauty_lin', authorAvatar: '/avatars/lin.jpg', type: 'products', itemCount: 8, savedCount: 12000, isSaved: false, updatedAt: '2024-01-13' },
  { id: 'g3', title: 'Photography Tips for Beginners', coverUrl: '/guides/photo-tips.jpg', author: 'alex_photo', authorAvatar: '/avatars/alex.jpg', type: 'posts', itemCount: 15, savedCount: 8900, isSaved: true, updatedAt: '2024-01-12' },
  { id: 'g4', title: 'Hidden Gems in Tokyo', coverUrl: '/guides/tokyo.jpg', author: 'travel_emma', authorAvatar: '/avatars/emma.jpg', type: 'places', itemCount: 20, savedCount: 23000, isSaved: false, updatedAt: '2024-01-10' },
  { id: 'g5', title: 'Home Office Setup Ideas', coverUrl: '/guides/office.jpg', author: 'design_sara', authorAvatar: '/avatars/sara.jpg', type: 'products', itemCount: 10, savedCount: 6700, isSaved: false, updatedAt: '2024-01-08' },
];

const GuidesPage: React.FC = () => {
  const [state, setState] = useState<GuidesPageState>({
    guides: [], myGuides: [], activeTab: 'discover', loading: true, error: null, creating: false, newTitle: '', newType: 'places',
  });

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 400));
        setState(prev => ({ ...prev, guides: MOCK_GUIDES, myGuides: MOCK_GUIDES.filter(g => g.isSaved), loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load guides', loading: false }));
      }
    };
    load();
  }, []);

  const toggleSave = useCallback((guideId: string) => {
    setState(prev => ({
      ...prev,
      guides: prev.guides.map(g => g.id === guideId ? { ...g, isSaved: !g.isSaved, savedCount: g.isSaved ? g.savedCount - 1 : g.savedCount + 1 } : g),
    }));
  }, []);

  const createGuide = useCallback(() => {
    if (!state.newTitle.trim()) return;
    const newGuide: Guide = {
      id: `g_${Date.now()}`, title: state.newTitle, coverUrl: '/guides/default.jpg', author: 'my_account', authorAvatar: '/avatars/me.jpg', type: state.newType, itemCount: 0, savedCount: 0, isSaved: false, updatedAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, guides: [newGuide, ...prev.guides], creating: false, newTitle: '' }));
  }, [state.newTitle, state.newType]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center space-y-3">
          <p className="text-white">{state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const getTypeIcon = (type: string) => type === 'places' ? '📍' : type === 'products' ? '🛍' : '📝';
  const filteredGuides = state.activeTab === 'saved' ? state.guides.filter(g => g.isSaved) : state.guides;

  return (
    <div className="min-h-screen bg-black text-white pb-20 px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Guides</h1>
        <button onClick={() => setState(prev => ({ ...prev, creating: true }))} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">+ Create</button>
      </header>

      <div className="flex space-x-1 mb-4 bg-gray-900 rounded-lg p-1">
        {(['discover', 'saved', 'created'] as const).map(tab => (
          <button key={tab} onClick={() => setState(prev => ({ ...prev, activeTab: tab }))} className={`flex-1 py-2 rounded-md text-xs font-medium capitalize ${state.activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>{tab}</button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredGuides.map(guide => (
          <div key={guide.id} className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="relative h-32">
              <img src={guide.coverUrl} alt={guide.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <span className="text-xs bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">{getTypeIcon(guide.type)} {guide.type}</span>
                <h3 className="text-sm font-bold mt-1">{guide.title}</h3>
              </div>
            </div>
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-gray-700 overflow-hidden">
                  <img src={guide.authorAvatar} alt="" className="w-full h-full object-cover" />
                </div>
                <span className="text-xs text-gray-400">{guide.author}</span>
                <span className="text-xs text-gray-600">{guide.itemCount} items</span>
              </div>
              <button onClick={() => toggleSave(guide.id)} className={`text-xs px-2 py-1 rounded ${guide.isSaved ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
                {guide.isSaved ? '♥ Saved' : '♡ Save'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredGuides.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-gray-400">{state.activeTab === 'saved' ? 'No saved guides' : 'No guides found'}</p>
        </div>
      )}

      {state.creating && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Create Guide</h2>
            <input type="text" value={state.newTitle} onChange={(e) => setState(prev => ({ ...prev, newTitle: e.target.value }))} placeholder="Guide title..." className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none mb-3 focus:ring-1 focus:ring-pink-500" />
            <div className="flex space-x-2 mb-4">
              {(['places', 'products', 'posts'] as const).map(type => (
                <button key={type} onClick={() => setState(prev => ({ ...prev, newType: type }))} className={`flex-1 py-2 rounded-lg text-xs capitalize ${state.newType === type ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{getTypeIcon(type)} {type}</button>
              ))}
            </div>
            <div className="flex space-x-3">
              <button onClick={createGuide} disabled={!state.newTitle.trim()} className="flex-1 py-2 bg-pink-600 text-white rounded-lg font-medium disabled:opacity-50">Create</button>
              <button onClick={() => setState(prev => ({ ...prev, creating: false }))} className="flex-1 py-2 bg-gray-700 text-white rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuidesPage;
