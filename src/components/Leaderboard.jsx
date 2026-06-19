import { useState } from 'react';
import Avatar from './Avatar';
import { formatDuration, formatPoints, formatDistance, getGoalProgress } from '../utils/dataProcessor';
import { useSettings } from '../context/SettingsContext';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const SORT_OPTIONS = [
  { key: 'totalPoints', label: 'Points' },
  { key: 'checkInCount', label: 'Workouts' },
  { key: 'totalCalories', label: 'Calories' },
  { key: 'totalDistance', label: 'Distance' },
];

export default function Leaderboard({ leaderboard, onPlayerClick }) {
  const [sortBy, setSortBy] = useState('totalPoints');
  const { settings } = useSettings();
  const showGoal = settings.goal?.enabled;

  const sorted = [...leaderboard].sort((a, b) => b[sortBy] - a[sortBy]);
  const maxVal = sorted[0]?.[sortBy] || 1;

  const gridCols = showGoal
    ? 'grid-cols-[3rem_1fr_5.5rem_5rem_6rem_6rem_8rem]'
    : 'grid-cols-[3rem_1fr_7rem_6rem_7rem_7rem]';

  return (
    <div>
      {/* Sort controls */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <span className="text-gray-400 text-sm self-center mr-1">Sort by:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sortBy === opt.key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className={`grid ${gridCols} gap-x-4 px-4 py-3 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800`}>
          <div>#</div>
          <div>Athlete</div>
          <div className="text-right">Points</div>
          <div className="text-right">Workouts</div>
          <div className="text-right">Calories</div>
          <div className="text-right">Distance</div>
          {showGoal && <div className="text-right">Goal</div>}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-800/50">
          {sorted.map((entry, i) => {
            const rank = i + 1;
            const barWidth = maxVal > 0 ? (entry[sortBy] / maxVal) * 100 : 0;

            return (
              <div
                key={entry.member.id}
                className="relative group cursor-pointer"
                onClick={() => onPlayerClick(entry.member.id)}
              >
                {/* Progress bar background */}
                <div
                  className="absolute inset-0 bg-orange-500/5 group-hover:bg-orange-500/10 transition-all rounded-none"
                  style={{ width: `${barWidth}%` }}
                />

                <div className={`relative grid ${gridCols} gap-x-4 items-center px-4 py-3`}>
                  {/* Rank */}
                  <div className="font-bold text-lg">
                    {MEDALS[rank] || <span className="text-gray-500 text-sm">{rank}</span>}
                  </div>

                  {/* Member */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar url={entry.member.profile_picture_url} name={entry.member.full_name} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-100 truncate group-hover:text-orange-300 transition-colors">{entry.member.full_name}</div>
                      {entry.member.role !== 'member' && (
                        <div className="text-xs text-orange-400 capitalize">{entry.member.role}</div>
                      )}
                    </div>
                  </div>

                  {/* Points */}
                  <div className={`text-right font-semibold ${sortBy === 'totalPoints' ? 'text-orange-400' : 'text-gray-200'}`}>
                    {formatPoints(entry.totalPoints)}
                  </div>

                  {/* Workouts */}
                  <div className={`text-right text-sm ${sortBy === 'checkInCount' ? 'text-orange-400 font-semibold' : 'text-gray-300'}`}>
                    {entry.checkInCount}
                  </div>

                  {/* Calories */}
                  <div className={`text-right text-sm ${sortBy === 'totalCalories' ? 'text-orange-400 font-semibold' : 'text-gray-300'}`}>
                    {entry.totalCalories > 0 ? entry.totalCalories.toLocaleString() : '—'}
                  </div>

                  {/* Distance */}
                  <div className={`text-right text-sm ${sortBy === 'totalDistance' ? 'text-orange-400 font-semibold' : 'text-gray-300'}`}>
                    {formatDistance(entry.totalDistance, settings.distanceUnit)}
                  </div>

                  {/* Goal */}
                  {showGoal && (() => {
                    const gp = getGoalProgress(entry, settings.goal);
                    const barColor = gp.achieved ? 'bg-emerald-500' : 'bg-orange-500';
                    return (
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-0">
                          <div
                            className={`h-full ${barColor} transition-all duration-500`}
                            style={{ width: `${gp.pct}%` }}
                          />
                        </div>
                        <span className={`text-xs tabular-nums w-9 text-right flex-shrink-0 ${gp.achieved ? 'text-emerald-400 font-semibold' : 'text-gray-400'}`}>
                          {gp.achieved ? '✓' : `${Math.round(gp.pct)}%`}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-3 text-right">
        {leaderboard.length} athletes · {leaderboard.reduce((s, e) => s + e.checkInCount, 0).toLocaleString()} total workouts
      </p>
    </div>
  );
}
