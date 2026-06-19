import { useState } from 'react';
import Avatar from './Avatar';
import PlayerProfile from './PlayerProfile';
import { formatPoints } from '../utils/dataProcessor';

export default function PlayerTab({ data, leaderboard, selectedPlayerId, onPlayerClick, onActivityClick }) {
  const [search, setSearch] = useState('');

  const entry = leaderboard.find(e => e.member.id === selectedPlayerId);

  const filtered = leaderboard.filter(e =>
    e.member.full_name.toLowerCase().includes(search.toLowerCase())
  );

  if (entry) {
    return (
      <div>
        {/* Back bar */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => onPlayerClick(null)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← All Players
          </button>
        </div>
        <PlayerProfile
          entry={entry}
          data={data}
          allEntries={leaderboard}
          onPlayerClick={onPlayerClick}
          onActivityClick={onActivityClick}
        />
      </div>
    );
  }

  // Search / select screen
  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white mb-1">Player Analyser</h2>
        <p className="text-sm text-gray-500">Search and select a player to view their full challenge breakdown.</p>
      </div>

      <input
        type="text"
        placeholder="Search players…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        className="w-full bg-gray-900 border border-gray-700 text-gray-200 placeholder-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 mb-3"
      />

      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <div className="divide-y divide-gray-800/50">
          {filtered.map(e => (
            <button
              key={e.member.id}
              onClick={() => onPlayerClick(e.member.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60 transition-colors text-left"
            >
              <span className="text-sm text-gray-600 w-7 flex-shrink-0 text-right">#{e.rank}</span>
              <Avatar url={e.member.profile_picture_url} name={e.member.full_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-100 truncate">{e.member.full_name}</div>
                {e.member.role !== 'member' && (
                  <div className="text-xs text-orange-400 capitalize">{e.member.role}</div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-orange-400">{formatPoints(e.totalPoints)}</div>
                <div className="text-xs text-gray-600">{e.checkInCount} workouts</div>
              </div>
              <svg className="w-4 h-4 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-gray-600 text-sm">No players match "{search}"</div>
          )}
        </div>
      </div>
    </div>
  );
}
