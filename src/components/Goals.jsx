import { useMemo } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import {
  getGoalProgress, getGoalLabel, formatGoalValue,
} from '../utils/dataProcessor';

export default function Goals({ leaderboard, onPlayerClick }) {
  const { settings } = useSettings();
  const goal = settings.goal;

  const rows = useMemo(() => {
    if (!goal?.enabled) return [];
    return leaderboard
      .map(entry => ({
        entry,
        progress: getGoalProgress(entry, goal),
      }))
      .sort((a, b) => b.progress.pctRaw - a.progress.pctRaw);
  }, [leaderboard, goal]);

  if (!goal?.enabled) {
    return (
      <div className="bg-gray-900 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h2 className="text-lg font-bold text-white">No goal configured</h2>
        <p className="text-sm text-gray-500 mt-2">
          Enable a challenge goal under ⚙️ Settings → Challenge Goal to track player progress here.
        </p>
      </div>
    );
  }

  const achievedCount = rows.filter(r => r.progress.achieved).length;
  const total = rows.length;
  const avgPct = total
    ? rows.reduce((s, r) => s + Math.min(100, r.progress.pctRaw), 0) / total
    : 0;
  const label = getGoalLabel(goal, settings.distanceUnit);
  const targetStr = formatGoalValue(parseFloat(goal.target) || 0, goal.metric, settings.distanceUnit);

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-gradient-to-br from-orange-500/15 via-gray-900 to-gray-900 border border-orange-500/20 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-orange-400 uppercase tracking-wider font-semibold">Challenge Goal</div>
            <h1 className="text-2xl font-bold text-white mt-1">{label}</h1>
            <p className="text-sm text-gray-400 mt-1">Target: <span className="text-gray-200 font-semibold">{targetStr}</span></p>
          </div>
          <div className="flex gap-3">
            <StatPill label="Achieved" value={`${achievedCount}/${total}`} accent="emerald" />
            <StatPill label="Avg progress" value={`${avgPct.toFixed(0)}%`} accent="orange" />
          </div>
        </div>
      </div>

      {/* Player list */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[3rem_1fr_8rem_1fr_4rem] gap-x-4 px-4 py-3 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
          <div>#</div>
          <div>Athlete</div>
          <div className="text-right">Current / Target</div>
          <div>Progress</div>
          <div className="text-right">%</div>
        </div>

        <div className="divide-y divide-gray-800/50">
          {rows.map((row, i) => {
            const { entry, progress: gp } = row;
            const currentStr = formatGoalValue(gp.value, goal.metric, settings.distanceUnit);
            const targetStr = formatGoalValue(gp.target, goal.metric, settings.distanceUnit);
            const barColor = gp.achieved ? 'bg-emerald-500' : 'bg-orange-500';
            const pctText = gp.achieved
              ? (gp.pctRaw > 100 ? `${Math.round(gp.pctRaw)}%` : '✓')
              : `${Math.round(gp.pct)}%`;

            return (
              <button
                key={entry.member.id}
                onClick={() => onPlayerClick(entry.member.id)}
                className={`w-full grid grid-cols-[3rem_1fr_8rem_1fr_4rem] gap-x-4 items-center px-4 py-3 text-left transition-colors ${
                  gp.achieved ? 'hover:bg-emerald-500/5' : 'hover:bg-gray-800/60'
                }`}
              >
                <div className="text-sm text-gray-500 tabular-nums">{i + 1}</div>

                <div className="flex items-center gap-3 min-w-0">
                  <Avatar url={entry.member.profile_picture_url} name={entry.member.full_name} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-100 truncate">{entry.member.full_name}</div>
                    <div className="text-xs text-gray-500">#{entry.rank} on leaderboard</div>
                  </div>
                </div>

                <div className="text-right text-sm tabular-nums">
                  <span className={gp.achieved ? 'text-emerald-300 font-semibold' : 'text-gray-200'}>
                    {currentStr}
                  </span>
                  <span className="text-gray-600"> / {targetStr}</span>
                </div>

                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-500`}
                    style={{ width: `${gp.pct}%` }}
                  />
                </div>

                <div className={`text-right text-sm font-semibold tabular-nums ${gp.achieved ? 'text-emerald-400' : 'text-gray-300'}`}>
                  {pctText}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-600 text-right">
        {achievedCount} of {total} athletes have hit the goal
      </p>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  const colors = {
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    orange: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  }[accent];
  return (
    <div className={`px-4 py-2 rounded-xl border ${colors}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
