// ============================================================================
// QuantNeon - MiniGameLobby Component
// Game lobby: game list, invite friends, matchmaking state, leaderboard,
// in-game currency, game mode selector
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface GameInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  playersOnline: number;
  category: string;
  thumbnail: string;
}

interface Friend {
  id: string;
  username: string;
  avatar: string;
  isOnline: boolean;
  currentGame?: string;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  gamesPlayed: number;
  avatar: string;
}

type MatchmakingState = 'idle' | 'searching' | 'found' | 'ready';
type GameMode = 'solo' | 'duo' | 'squad';

interface MiniGameLobbyProps {
  games: GameInfo[];
  friends: Friend[];
  onInvite: (friendId: string, gameId: string) => void;
  onStartMatch: (gameId: string, mode: GameMode, invitedFriends: string[]) => void;
  onSelectGame: (gameId: string) => void;
}

const MiniGameLobby: React.FC<MiniGameLobbyProps> = ({
  games,
  friends,
  onInvite,
  onStartMatch,
  onSelectGame,
}) => {
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode>('solo');
  const [matchmakingState, setMatchmakingState] = useState<MatchmakingState>('idle');
  const [invitedFriends, setInvitedFriends] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [currency, setCurrency] = useState<number>(2500);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const matchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [leaderboard] = useState<LeaderboardEntry[]>([
    { rank: 1, username: 'ProGamer99', score: 15420, gamesPlayed: 234, avatar: '/avatars/1.jpg' },
    { rank: 2, username: 'NeonQueen', score: 14890, gamesPlayed: 198, avatar: '/avatars/2.jpg' },
    { rank: 3, username: 'PixelMaster', score: 13200, gamesPlayed: 312, avatar: '/avatars/3.jpg' },
    { rank: 4, username: 'StarChaser', score: 11750, gamesPlayed: 156, avatar: '/avatars/4.jpg' },
    { rank: 5, username: 'NightHawk', score: 10980, gamesPlayed: 278, avatar: '/avatars/5.jpg' },
  ]);

  useEffect(() => {
    return () => {
      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (matchmakingState === 'searching') {
      matchTimerRef.current = setTimeout(() => {
        setMatchmakingState('found');
        setTimeout(() => setMatchmakingState('ready'), 2000);
      }, 3000) as unknown as ReturnType<typeof setInterval>;
    }
    return () => {
      if (matchTimerRef.current) clearTimeout(matchTimerRef.current as unknown as number);
    };
  }, [matchmakingState]);

  const handleSelectGame = useCallback(
    (game: GameInfo) => {
      setSelectedGame(game);
      setMatchmakingState('idle');
      setInvitedFriends([]);
      onSelectGame(game.id);
    },
    [onSelectGame]
  );

  const handleInviteFriend = useCallback(
    (friendId: string) => {
      if (!selectedGame) return;
      if (invitedFriends.includes(friendId)) {
        setInvitedFriends((prev) => prev.filter((id) => id !== friendId));
      } else {
        setInvitedFriends((prev) => [...prev, friendId]);
        onInvite(friendId, selectedGame.id);
      }
    },
    [selectedGame, invitedFriends, onInvite]
  );

  const handleStartMatch = useCallback(() => {
    if (!selectedGame) return;
    setMatchmakingState('searching');
    onStartMatch(selectedGame.id, selectedMode, invitedFriends);
  }, [selectedGame, selectedMode, invitedFriends, onStartMatch]);

  const handleCancelMatchmaking = useCallback(() => {
    setMatchmakingState('idle');
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current as unknown as number);
  }, []);

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getModeMaxPlayers = useCallback((mode: GameMode): number => {
    switch (mode) {
      case 'solo': return 1;
      case 'duo': return 2;
      case 'squad': return 4;
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white rounded-xl overflow-hidden">
      {/* Header with Currency */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <h2 className="text-lg font-bold">Game Lobby</h2>
        <div className="flex items-center gap-2 bg-yellow-500/10 px-3 py-1.5 rounded-full">
          <span className="text-yellow-400">{'\u{1F4B0}'}</span>
          <span className="text-yellow-400 font-bold text-sm">{currency.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Game List - Left Panel */}
        <div className="w-72 border-r border-gray-800 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Games</h3>
          <div className="space-y-2">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => handleSelectGame(game)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                  selectedGame?.id === game.id
                    ? 'bg-blue-600/20 border border-blue-500/50'
                    : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">
                  {game.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{game.name}</p>
                  <p className="text-xs text-gray-400 truncate">{game.description}</p>
                  <p className="text-xs text-green-400 mt-0.5">{game.playersOnline.toLocaleString()} online</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content - Right Panel */}
        <div className="flex-1 overflow-y-auto p-5">
          {!selectedGame ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select a game to get started</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Game Mode Selector */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Game Mode</h3>
                <div className="flex gap-3">
                  {(['solo', 'duo', 'squad'] as GameMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSelectedMode(mode)}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium capitalize transition-all ${
                        selectedMode === mode
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {mode} ({getModeMaxPlayers(mode)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Matchmaking */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Matchmaking</h3>
                <div className="bg-gray-800/50 rounded-xl p-4">
                  {matchmakingState === 'idle' && (
                    <button
                      onClick={handleStartMatch}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                    >
                      Start Match - {selectedGame.name} ({selectedMode})
                    </button>
                  )}
                  {matchmakingState === 'searching' && (
                    <div className="text-center py-2">
                      <div className="animate-pulse text-yellow-400 font-medium mb-2">Searching for players...</div>
                      <button onClick={handleCancelMatchmaking} className="text-sm text-red-400 hover:text-red-300">Cancel</button>
                    </div>
                  )}
                  {matchmakingState === 'found' && (
                    <div className="text-center py-2">
                      <p className="text-green-400 font-medium animate-pulse">Match found! Connecting...</p>
                    </div>
                  )}
                  {matchmakingState === 'ready' && (
                    <div className="text-center py-2">
                      <p className="text-white font-bold text-lg mb-2">Match Ready!</p>
                      <p className="text-gray-400 text-sm">Game starting in 3s...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Invite Friends */}
              {selectedMode !== 'solo' && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">
                    Invite Friends ({invitedFriends.length}/{getModeMaxPlayers(selectedMode) - 1})
                  </h3>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
                  />
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {filteredFriends.map((friend) => {
                      const isInvited = invitedFriends.includes(friend.id);
                      return (
                        <div key={friend.id} className="flex items-center justify-between p-2.5 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img src={friend.avatar} alt={friend.username} className="w-8 h-8 rounded-full object-cover" />
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${friend.isOnline ? 'bg-green-400' : 'bg-gray-500'}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{friend.username}</p>
                              {friend.currentGame && <p className="text-xs text-gray-500">Playing {friend.currentGame}</p>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleInviteFriend(friend.id)}
                            disabled={!isInvited && invitedFriends.length >= getModeMaxPlayers(selectedMode) - 1}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isInvited
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40'
                            }`}
                          >
                            {isInvited ? 'Remove' : 'Invite'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Leaderboard Toggle */}
              <div>
                <button
                  onClick={() => setShowLeaderboard(!showLeaderboard)}
                  className="text-sm font-semibold text-gray-300 flex items-center gap-2 hover:text-white transition-colors"
                >
                  <span>{'\u{1F3C6}'} Leaderboard</span>
                  <span className="text-xs text-gray-500">{showLeaderboard ? '(hide)' : '(show)'}</span>
                </button>
                {showLeaderboard && (
                  <div className="mt-3 bg-gray-800/50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                          <th className="py-2.5 px-3 text-left">Rank</th>
                          <th className="py-2.5 px-3 text-left">Player</th>
                          <th className="py-2.5 px-3 text-right">Score</th>
                          <th className="py-2.5 px-3 text-right">Games</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((entry) => (
                          <tr key={entry.rank} className="border-b border-gray-800/50 hover:bg-gray-700/30">
                            <td className="py-2.5 px-3">
                              <span className={`font-bold ${entry.rank <= 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                #{entry.rank}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <img src={entry.avatar} alt={entry.username} className="w-6 h-6 rounded-full" />
                                <span className="font-medium">{entry.username}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right text-green-400 font-medium">
                              {entry.score.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right text-gray-400">{entry.gamesPlayed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiniGameLobby;
