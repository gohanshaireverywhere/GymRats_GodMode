import { useState, useMemo } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import { formatPoints, formatDuration, formatDistance } from '../utils/dataProcessor';

const ACTIVITY_EMOJI = {
  cycling: '🚴', running: '🏃', walking: '🚶', swimming: '🏊', yoga: '🧘',
  hiking: '🥾', rowing: '🚣', elliptical: '🏋️', treadmill: '🏃',
  strength_training: '💪', weight_lifting: '🏋️', pilates: '🧘',
  hiit: '🔥', climbing: '🧗', bouldering: '🧗', spinning: '🚴',
  boxing: '🥊', martial_arts: '🥋', kickboxing: '🥊', muay_thai: '🥊',
  surfing: '🏄', skating: '⛸️', basketball: '🏀', soccer: '⚽', football: '🏈',
  tennis: '🎾', padel: '🎾', badminton: '🏸', squash: '🎾', volleyball: '🏐',
  table_tennis: '🏓', cricket: '🏏', dance: '💃', jump_rope: '🪢',
};

function emojiFor(type) { return ACTIVITY_EMOJI[type] || '💪'; }

function primaryActivityType(ci) {
  return ci.check_in_activities?.[0]?.platform_activity || ci.activity_type || 'unknown';
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const SORT_OPTIONS = [
  { key: 'date_desc', label: '🕐 Newest' },
  { key: 'date_asc', label: '🕐 Oldest' },
  { key: 'points_desc', label: '⬆ Highest pts' },
  { key: 'points_asc', label: '⬇ Lowest pts' },
];

function sortCheckIns(checkIns, sortBy) {
  const sorted = [...checkIns];
  switch (sortBy) {
    case 'date_asc':
      return sorted.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    case 'points_desc':
      return sorted.sort((a, b) => (b.points || 0) - (a.points || 0));
    case 'points_asc':
      return sorted.sort((a, b) => (a.points || 0) - (b.points || 0));
    case 'date_desc':
    default:
      return sorted.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  }
}

function resolveThumb(ci) {
  const media = ci.check_in_media?.find(m => (m.medium_type || '').startsWith('image'));
  return media?.thumbnail_url || media?.url || ci.photo_url
    || ci.check_in_media?.find(m => m.thumbnail_url)?.thumbnail_url;
}

function FlaggedRow({ ci, distanceUnit, onActivityClick }) {
  const activity = primaryActivityType(ci);
  const title = ci.title || activity?.replace(/_/g, ' ') || 'Workout';
  const thumbUrl = resolveThumb(ci);
  const emoji = emojiFor(activity);
  const openActivity = onActivityClick ? () => onActivityClick(ci.id) : undefined;

  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-gray-800/40 transition-colors">
      <button
        onClick={openActivity}
        disabled={!openActivity}
        className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center text-2xl cursor-pointer disabled:cursor-default group/t"
        title={openActivity ? 'Open activity details' : undefined}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover group-hover/t:opacity-80 transition-opacity" />
        ) : (
          <span>{emoji}</span>
        )}
      </button>

      <div className="min-w-0">
        {openActivity ? (
          <button
            onClick={openActivity}
            className="text-sm font-semibold text-gray-100 truncate text-left hover:text-orange-300 transition-colors block max-w-full"
          >
            {title}
          </button>
        ) : (
          <div className="text-sm font-semibold text-gray-100 truncate">{title}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500">
          <span className="capitalize bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
            {activity.replace(/_/g, ' ')}
          </span>
          <span>{formatDateTime(ci.occurred_at)}</span>
          {ci.duration_millis > 0 && <span>⏱ {formatDuration(ci.duration_millis)}</span>}
          {parseFloat(ci.distance_miles) > 0 && <span>📍 {formatDistance(ci.distance_miles, distanceUnit)}</span>}
          {ci.calories > 0 && <span>🔥 {ci.calories} cal</span>}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Points</div>
        <div className="text-lg font-bold text-orange-400">{formatPoints(ci.points || 0)}</div>
      </div>
    </div>
  );
}

export default function FlaggedCheckIns({ data, memberMap, onPlayerClick, onActivityClick }) {
  const { settings } = useSettings();
  const [sortBy, setSortBy] = useState('date_desc');

  // Auto-detect all reaction emojis present in the data, with counts.
  const emojiCounts = useMemo(() => {
    const map = new Map();
    for (const ci of data.check_ins) {
      for (const r of ci.reactions || []) {
        if (!r.reaction) continue;
        map.set(r.reaction, (map.get(r.reaction) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.check_ins]);

  // Default to ⚠️ if present, else the most-used emoji.
  const [selectedEmoji, setSelectedEmoji] = useState(() => {
    const warn = emojiCounts.find(([e]) => e.startsWith('⚠'));
    if (warn) return warn[0];
    return emojiCounts.length > 0 ? emojiCounts[0][0] : '⚠️';
  });

  // Filter check-ins by the selected emoji, group by player.
  const playerGroups = useMemo(() => {
    const byAccount = new Map();
    for (const ci of data.check_ins) {
      if (!ci.reactions?.some(r => r.reaction === selectedEmoji)) continue;
      if (!byAccount.has(ci.account_id)) byAccount.set(ci.account_id, []);
      byAccount.get(ci.account_id).push(ci);
    }
    return [...byAccount.entries()]
      .map(([accountId, checkIns]) => ({
        member: memberMap[accountId] || { id: accountId, full_name: 'Unknown', profile_picture_url: null },
        checkIns,
      }))
      .sort((a, b) => b.checkIns.length - a.checkIns.length);
  }, [data.check_ins, selectedEmoji, memberMap]);

  const totalFlagged = playerGroups.reduce((s, g) => s + g.checkIns.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">🚩 Flagged Check-ins</h2>
        <p className="text-sm text-gray-500 mt-1">
          Check-ins moderators reacted to, grouped by player — screenshot a player's card to share the list of activities they need to fix.
        </p>
      </div>

      {/* Emoji selector */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Filter by reaction</div>
        {emojiCounts.length === 0 ? (
          <p className="text-xs text-gray-600">No reactions found in this challenge data.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emojiCounts.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => setSelectedEmoji(emoji)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedEmoji === emoji ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Sort each player by:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              sortBy === opt.key ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {playerGroups.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
          <div className="text-4xl mb-3">{selectedEmoji}</div>
          <p>No check-ins reacted with {selectedEmoji}.</p>
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500">
            {totalFlagged} flagged check-in{totalFlagged !== 1 ? 's' : ''} across {playerGroups.length} player{playerGroups.length !== 1 ? 's' : ''}
          </div>
          {playerGroups.map(({ member, checkIns }) => (
            <div key={member.id} className="bg-gray-900 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-gray-800">
                <button
                  onClick={() => onPlayerClick(member.id)}
                  className="flex items-center gap-3 group/p min-w-0"
                >
                  <Avatar url={member.profile_picture_url} name={member.full_name} size="sm" />
                  <span className="text-sm font-semibold text-gray-200 group-hover/p:text-orange-300 transition-colors truncate">
                    {member.full_name}
                  </span>
                </button>
                <span className="ml-auto text-xs font-semibold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full flex-shrink-0">
                  {selectedEmoji} {checkIns.length} flagged
                </span>
              </div>
              <div className="divide-y divide-gray-800/60">
                {sortCheckIns(checkIns, sortBy).map(ci => (
                  <FlaggedRow
                    key={ci.id}
                    ci={ci}
                    distanceUnit={settings.distanceUnit}
                    onActivityClick={onActivityClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
