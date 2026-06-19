import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import Avatar from './Avatar';
import {
  getTimelineData, formatPoints, formatDistance, formatDuration,
  getGoalProgress, getGoalLabel, formatGoalValue, sumPointsWithCap, getLocalDay,
} from '../utils/dataProcessor';
import { useSettings } from '../context/SettingsContext';
import { useBonusGrants } from '../context/BonusGrantsContext';


const PALETTE = [
  '#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444',
  '#06b6d4', '#84cc16', '#f59e0b', '#ec4899', '#6366f1',
];

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function WorkoutCard({ checkIn, distanceUnit, onClick, cappedInfo, bonusGrant }) {
  const activity = checkIn.check_in_activities?.[0]?.platform_activity;
  const title = checkIn.title || activity || 'Workout';
  const pts = checkIn.points || 0;
  const hasPhoto = !!checkIn.photo_url;
  const reactionsCount = checkIn.reactions?.length || 0;
  const commentsCount = checkIn.comments?.length || 0;

  const Wrapper = onClick ? 'button' : 'div';

  const netBonus = bonusGrant
    ? parseFloat(((bonusGrant.newActivityPts || 0) - (bonusGrant.original?.points || 0)).toFixed(2))
    : null;

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-start gap-3 py-3 w-full text-left ${onClick ? 'group/wc hover:bg-gray-800/30 rounded-xl -mx-2 px-2 transition-colors' : ''}`}
    >
      {/* Thumbnail */}
      {hasPhoto ? (
        <img
          src={checkIn.photo_url}
          alt=""
          className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-800"
        />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0 text-2xl">
          {activity === 'cycling' ? '🚴' : activity === 'running' ? '🏃' : activity === 'walking' ? '🚶' : activity === 'swimming' ? '🏊' : '💪'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className={`text-sm font-semibold text-gray-100 truncate ${onClick ? 'group-hover/wc:text-orange-300 transition-colors' : ''}`}>{title}</div>
          <div className="text-sm font-bold text-orange-400 flex-shrink-0">
            {cappedInfo ? (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 line-through text-xs">{formatPoints(cappedInfo.originalPts)}</span>
                <span className={cappedInfo.countedPts === 0 ? 'text-gray-600' : ''}>{formatPoints(cappedInfo.countedPts)}</span>
              </div>
            ) : (
              formatPoints(pts)
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{formatDateTime(checkIn.occurred_at)}</div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {activity && (
            <span className="text-xs bg-gray-800 text-gray-400 capitalize px-2 py-0.5 rounded-full">{activity}</span>
          )}
          {checkIn.duration_millis > 0 && (
            <span className="text-xs text-gray-600">⏱ {formatDuration(checkIn.duration_millis)}</span>
          )}
          {parseFloat(checkIn.distance_miles) > 0 && (
            <span className="text-xs text-gray-600">📍 {formatDistance(checkIn.distance_miles, distanceUnit)}</span>
          )}
          {checkIn.calories > 0 && (
            <span className="text-xs text-gray-600">🔥 {checkIn.calories} cal</span>
          )}
          {reactionsCount > 0 && (
            <span className="text-xs text-gray-600">👍 {reactionsCount}</span>
          )}
          {commentsCount > 0 && (
            <span className="text-xs text-gray-600">💬 {commentsCount}</span>
          )}
        </div>

        {/* Battle Royale bonus badge */}
        {bonusGrant && (
          <div className="mt-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs">⚔️</span>
              <span className="text-xs font-bold text-amber-300">
                Battle Royale Rotation {bonusGrant.rotation} Bonus
              </span>
              <span className="text-xs font-bold text-emerald-400 ml-auto">+{netBonus} pts</span>
            </div>
            <div className="text-xs text-gray-500">
              Originally: <span className="text-gray-400 capitalize">{bonusGrant.original?.activityType || bonusGrant.original?.title || 'Workout'}</span>
              {' · '}{formatPoints(bonusGrant.original?.points || 0)} pts
              {' → '}
              <span className="text-gray-400">{bonusGrant.newActivityPts} pts</span>
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{formatDate(label)}</p>
      <p className="text-white font-bold">{formatPoints(payload[0].value)} pts</p>
    </div>
  );
}

function ReactionsGiven({ memberId, data, memberMap, onPlayerClick, onActivityClick }) {
  const [selected, setSelected] = useState('all');

  const given = useMemo(() => {
    const rows = [];
    for (const ci of data.check_ins) {
      for (const r of (ci.reactions || [])) {
        if (r.account_id !== memberId) continue;
        rows.push({
          id: r.id ?? `${ci.id}-${r.account_id}-${r.reaction}-${r.created_at}`,
          emoji: r.reaction || '?',
          createdAt: r.created_at,
          checkIn: ci,
          target: memberMap[ci.account_id],
        });
      }
    }
    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return rows;
  }, [data.check_ins, memberId, memberMap]);

  const emojiCounts = useMemo(() => {
    const counts = {};
    for (const row of given) counts[row.emoji] = (counts[row.emoji] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [given]);

  if (given.length === 0) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Reactions Given</h3>
        <div className="text-sm text-gray-600 italic">This player hasn't reacted to any activities.</div>
      </div>
    );
  }

  const visible = selected === 'all' ? given : given.filter(r => r.emoji === selected);

  return (
    <div className="bg-gray-900 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">Reactions Given</h3>
        <span className="text-xs text-gray-600">{given.length} total</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setSelected('all')}
          className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors ${
            selected === 'all'
              ? 'bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/40'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
        >
          All <span className="tabular-nums">{given.length}</span>
        </button>
        {emojiCounts.map(([emoji, count]) => {
          const active = selected === emoji;
          return (
            <button
              key={emoji}
              onClick={() => setSelected(active ? 'all' : emoji)}
              className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors ${
                active
                  ? 'bg-orange-500/20 ring-1 ring-orange-400/40'
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <span className="text-base">{emoji}</span>
              <span className="text-gray-300 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-gray-800/60 max-h-[480px] overflow-y-auto">
        {visible.map(row => {
          const ci = row.checkIn;
          const target = row.target;
          const title = ci.title || ci.check_in_activities?.[0]?.platform_activity || 'Workout';
          return (
            <div key={row.id} className="flex items-center gap-3 py-2.5">
              <span className="text-lg w-6 text-center flex-shrink-0">{row.emoji}</span>
              {target ? (
                <button
                  onClick={() => onPlayerClick?.(target.id)}
                  className="flex items-center gap-2 min-w-0 group/t"
                >
                  <Avatar url={target.profile_picture_url} name={target.full_name} size="xs" />
                  <span className="text-sm font-medium text-gray-200 group-hover/t:text-orange-300 transition-colors truncate">
                    {target.full_name}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar url={null} name="?" size="xs" />
                  <span className="text-sm font-medium text-gray-500">Unknown</span>
                </div>
              )}
              <button
                onClick={() => onActivityClick?.(ci.id)}
                disabled={!onActivityClick}
                className="flex-1 min-w-0 text-left text-xs text-gray-500 hover:text-orange-300 transition-colors truncate disabled:hover:text-gray-500"
                title={title}
              >
                <span className="text-gray-600">on </span>
                <span className="text-gray-400 capitalize">{title}</span>
              </button>
              {row.createdAt && (
                <span className="text-xs text-gray-600 flex-shrink-0 tabular-nums">
                  {formatDateTime(row.createdAt)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlayerProfile({ entry, data, allEntries, onPlayerClick, onActivityClick }) {
  const { settings } = useSettings();
  const { getGrantsForPlayerDate, getGrantByOriginalCheckInId } = useBonusGrants();
  const { member } = entry;

  // ─── Date filter ───────────────────────────────────────────────────────
  // Empty = no clamp on that side. With both empty, behavior matches the
  // unfiltered view (all check-ins in the challenge).
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : null;
  const endMs = endDate ? new Date(endDate + 'T23:59:59.999').getTime() : null;
  const dateFilterActive = startMs != null || endMs != null;

  const inWindow = (iso) => {
    const t = new Date(iso).getTime();
    if (startMs != null && t < startMs) return false;
    if (endMs != null && t > endMs) return false;
    return true;
  };

  // The "effective" checkIns/data/entry/allEntries — when the date filter is
  // active these are recomputed against the window; otherwise we pass through
  // what App computed.
  const checkIns = useMemo(
    () => dateFilterActive ? entry.checkIns.filter(ci => inWindow(ci.occurred_at)) : entry.checkIns,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry.checkIns, startMs, endMs]
  );

  const aggregates = useMemo(() => {
    if (!dateFilterActive) {
      return {
        totalPoints: entry.totalPoints,
        checkInCount: entry.checkInCount,
        totalCalories: entry.totalCalories,
        totalDistance: entry.totalDistance,
        totalDurationMs: entry.totalDurationMs,
        totalSteps: entry.totalSteps,
      };
    }
    let totalCalories = 0, totalDistance = 0, totalDurationMs = 0, totalSteps = 0;
    for (const ci of checkIns) {
      totalCalories += ci.calories || 0;
      totalDistance += parseFloat(ci.distance_miles) || 0;
      totalDurationMs += ci.duration_millis || 0;
      totalSteps += ci.steps || 0;
    }
    const totalPoints = sumPointsWithCap(checkIns, settings.dailyPointsCap);
    return { totalPoints, checkInCount: checkIns.length, totalCalories, totalDistance, totalDurationMs, totalSteps };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilterActive, checkIns, entry, settings.dailyPointsCap]);

  const { totalPoints, checkInCount, totalCalories, totalDistance, totalDurationMs, totalSteps } = aggregates;

  // Rank within the window — recompute against every player's points in window,
  // applying the same daily cap as the unfiltered leaderboard.
  const rank = useMemo(() => {
    if (!dateFilterActive) return entry.rank;
    const playerCheckIns = {};
    for (const ci of data.check_ins) {
      if (!inWindow(ci.occurred_at)) continue;
      (playerCheckIns[ci.account_id] ||= []).push(ci);
    }
    const totals = Object.entries(playerCheckIns).map(([id, cis]) => ({
      id: Number(id),
      pts: sumPointsWithCap(cis, settings.dailyPointsCap),
    }));
    totals.sort((a, b) => b.pts - a.pts);
    const idx = totals.findIndex(t => t.id === member.id);
    return idx === -1 ? null : idx + 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilterActive, data.check_ins, member.id, startMs, endMs, entry.rank, settings.dailyPointsCap]);

  // Rebuild an entry-shaped object for helpers that need it (goal progress, timeline)
  const effectiveEntry = useMemo(() => ({
    ...entry,
    totalPoints, checkInCount, totalCalories, totalDistance, totalDurationMs, totalSteps,
    checkIns,
  }), [entry, totalPoints, checkInCount, totalCalories, totalDistance, totalDurationMs, totalSteps, checkIns]);

  // For getTimelineData we need data with start/end clamped to the window.
  const effectiveData = useMemo(() => {
    if (!dateFilterActive) return data;
    const clampedStart = startDate || data.start_date.slice(0, 10);
    const clampedEnd = endDate || data.end_date.slice(0, 10);
    return { ...data, start_date: clampedStart, end_date: clampedEnd };
  }, [dateFilterActive, data, startDate, endDate]);

  // Find player's team
  const playerTeam = useMemo(() =>
    data.teams.find(t => t.team_members.some(tm => tm.account_id === member.id)),
    [data.teams, member.id]
  );

  // Map account_id -> member for reactions list lookups
  const memberMap = useMemo(() => {
    const map = {};
    for (const m of (data.members || [])) map[m.id] = m;
    return map;
  }, [data.members]);

  // Waterfall cap info: only check-ins where counted < original get an entry
  const cappedInfoMap = useMemo(() => {
    if (!settings.dailyPointsCap?.enabled || !(parseFloat(settings.dailyPointsCap.value) > 0)) return {};
    const cap = parseFloat(settings.dailyPointsCap.value);
    const byDay = {};
    for (const ci of checkIns) {
      const day = getLocalDay(ci.occurred_at, ci.timezone);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(ci);
    }
    const map = {};
    for (const dayCis of Object.values(byDay)) {
      const raw = dayCis.reduce((s, ci) => s + (ci.points || 0), 0);
      if (raw <= cap) continue;
      dayCis.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
      let remaining = cap;
      for (const ci of dayCis) {
        const pts = ci.points || 0;
        const counted = Math.min(remaining, pts);
        remaining = Math.max(0, remaining - pts);
        if (counted < pts) map[ci.id] = { originalPts: pts, countedPts: counted };
      }
    }
    return map;
  }, [checkIns, settings.dailyPointsCap]);

  // Cumulative line chart
  const timelineData = useMemo(
    () => getTimelineData(effectiveData, [effectiveEntry]),
    [effectiveData, effectiveEntry]
  );
  const lineKey = member.full_name;

  // Activity breakdown
  const activityBreakdown = useMemo(() => {
    const counts = {};
    for (const ci of checkIns) {
      const type = ci.check_in_activities?.[0]?.platform_activity || 'other';
      counts[type] = (counts[type] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count], i) => ({ type, count, color: PALETTE[i % PALETTE.length] }));
  }, [checkIns]);

  // Points per week — relative to the effective window start
  const weeklyPoints = useMemo(() => {
    const start = new Date(effectiveData.start_date);
    const weeks = {};
    for (const ci of checkIns) {
      const d = new Date(ci.occurred_at);
      const weekNum = Math.floor((d - start) / (7 * 24 * 60 * 60 * 1000));
      const label = `W${weekNum + 1}`;
      weeks[label] = (weeks[label] || 0) + (ci.points || 0);
    }
    return Object.entries(weeks).map(([week, pts]) => ({ week, pts: parseFloat(pts.toFixed(1)) }));
  }, [checkIns, effectiveData.start_date]);

  // Best day
  const bestDay = useMemo(() => {
    const byDay = {};
    for (const ci of checkIns) {
      const d = ci.occurred_at.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + (ci.points || 0);
    }
    const top = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    return top ? { date: top[0], pts: top[1] } : null;
  }, [checkIns]);

  // Filtered data passed to ReactionsGiven so it respects the window too.
  // Filtering check-ins is enough — ReactionsGiven only walks data.check_ins.
  const effectiveDataForReactions = useMemo(
    () => dateFilterActive ? { ...data, check_ins: data.check_ins.filter(ci => inWindow(ci.occurred_at)) } : data,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateFilterActive, data, startMs, endMs]
  );

  const xInterval = Math.max(0, Math.floor(timelineData.length / 8));

  const challengeStartInput = data.start_date.slice(0, 10);
  const challengeEndInput = data.end_date.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gray-900 rounded-2xl p-6">
        <div className="flex items-center gap-5">
          <Avatar url={member.profile_picture_url} name={member.full_name} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-white">{member.full_name}</h2>
              {rank != null && <span className="text-2xl font-black text-gray-700">#{rank}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {member.role !== 'member' && (
                <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2.5 py-0.5 rounded-full capitalize font-medium">
                  {member.role}
                </span>
              )}
              {playerTeam && (
                <span className="text-xs bg-gray-800 text-gray-300 px-2.5 py-0.5 rounded-full">
                  {playerTeam.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-3xl font-black text-orange-400">{formatPoints(totalPoints)}</div>
            <div className="text-xs text-gray-500">
              {dateFilterActive ? 'points in window' : 'total points'}
            </div>
          </div>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[10rem]">
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              min={challengeStartInput}
              max={challengeEndInput}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              min={challengeStartInput}
              max={challengeEndInput}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          {dateFilterActive && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              Clear
            </button>
          )}
        </div>
        {dateFilterActive && (
          <p className="text-xs text-orange-300/80 mt-2.5">
            ⏱ Stats below reflect activity {startDate ? `from ${startDate}` : `since challenge start`}
            {' '}{endDate ? `through ${endDate}` : `to challenge end`}.
          </p>
        )}
      </div>

      {/* Goal progress */}
      {settings.goal?.enabled && (() => {
        const gp = getGoalProgress(effectiveEntry, settings.goal);
        const label = getGoalLabel(settings.goal, settings.distanceUnit);
        const currentStr = formatGoalValue(gp.value, settings.goal.metric, settings.distanceUnit);
        const targetStr = formatGoalValue(gp.target, settings.goal.metric, settings.distanceUnit);
        const remaining = Math.max(0, gp.target - gp.value);
        const remainingStr = formatGoalValue(remaining, settings.goal.metric, settings.distanceUnit);
        return (
          <div className={`rounded-2xl p-5 border ${gp.achieved ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gray-900 border-gray-800'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">🎯 Goal</div>
                <div className="text-base font-semibold text-white mt-0.5">{label}</div>
              </div>
              {gp.achieved ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-full font-bold">
                  ✓ ACHIEVED
                </span>
              ) : (
                <span className="text-xs text-gray-400">
                  <span className="text-gray-500">remaining:</span> <span className="text-gray-200 font-semibold">{remainingStr}</span>
                </span>
              )}
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${gp.achieved ? 'bg-emerald-500' : 'bg-orange-500'}`}
                style={{ width: `${gp.pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-gray-300 font-semibold">{currentStr} <span className="text-gray-600 font-normal">/ {targetStr}</span></span>
              <span className={`tabular-nums font-bold ${gp.achieved ? 'text-emerald-400' : 'text-orange-400'}`}>
                {Math.round(gp.pctRaw)}%
              </span>
            </div>
          </div>
        );
      })()}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Rank" value={rank != null ? `#${rank}` : '—'} sub={`of ${allEntries.length}`} />
        <StatCard label="Workouts" value={checkInCount} />
        <StatCard label="Calories" value={totalCalories > 0 ? totalCalories.toLocaleString() : '—'} />
        <StatCard label="Distance" value={formatDistance(totalDistance, settings.distanceUnit)} />
        <StatCard label="Active Time" value={formatDuration(totalDurationMs)} />
        <StatCard label="Best Day" value={bestDay ? formatPoints(bestDay.pts) : '—'} sub={bestDay ? formatDate(bestDay.date) : ''} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cumulative points */}
        <div className="bg-gray-900 rounded-2xl p-4 pt-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Cumulative Points</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} axisLine={false} interval={xInterval} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false}
                width={40} tickFormatter={v => v.toFixed(0)} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey={lineKey} stroke="#f97316" strokeWidth={2.5}
                dot={false} activeDot={{ r: 4, fill: '#f97316' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Points per week */}
        <div className="bg-gray-900 rounded-2xl p-4 pt-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Points per Week</h3>
          {weeklyPoints.length === 0
            ? <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyPoints} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false}
                    width={40} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length
                        ? <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs shadow-xl">
                            <p className="text-gray-400 mb-1">{label}</p>
                            <p className="text-white font-bold">{formatPoints(payload[0].value)} pts</p>
                          </div>
                        : null
                    }
                  />
                  <Bar dataKey="pts" radius={[4, 4, 0, 0]}>
                    {weeklyPoints.map((_, i) => (
                      <Cell key={i} fill="#f97316" fillOpacity={0.7 + (i / weeklyPoints.length) * 0.3} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* Activity breakdown */}
      {activityBreakdown.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Activity Breakdown</h3>
          <div className="space-y-2.5">
            {activityBreakdown.map(({ type, count, color }) => {
              const pct = (count / checkInCount) * 100;
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="text-sm text-gray-300 capitalize w-28 flex-shrink-0">{type}</div>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                    {count} ({pct.toFixed(0)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Workout log */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1 pb-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">Workout Log</h3>
          <span className="text-xs text-gray-600">{checkInCount} entries</span>
        </div>
        {(() => {
          const cap = settings.dailyPointsCap?.enabled ? parseFloat(settings.dailyPointsCap.value) : 0;
          const byDay = {};
          for (const ci of checkIns) {
            const day = getLocalDay(ci.occurred_at, ci.timezone);
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(ci);
          }
          const daysSorted = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
          return daysSorted.map(day => {
            const dayCis = [...byDay[day]].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
            const dayRaw = dayCis.reduce((s, ci) => s + (ci.points || 0), 0);
            const dayCounted = cap > 0 ? Math.min(cap, dayRaw) : dayRaw;
            const isDayCapped = cap > 0 && dayRaw > cap;
            return (
              <div key={day} className="mb-1">
                <div className="flex items-center justify-between pt-3 pb-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{formatDate(day)}</span>
                  <div className="flex items-center gap-1.5">
                    {isDayCapped && <span className="text-xs text-gray-600 line-through">{formatPoints(dayRaw)}</span>}
                    <span className={`text-xs font-bold ${isDayCapped ? 'text-orange-400' : 'text-gray-500'}`}>{formatPoints(dayCounted)} pts</span>
                    {isDayCapped && <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold">capped</span>}
                    {getGrantsForPlayerDate(member.id, day).length > 0 && (
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-semibold">⚔️ BR bonus</span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-800/60">
                  {dayCis.map(ci => (
                    <WorkoutCard
                      key={ci.id}
                      checkIn={ci}
                      distanceUnit={settings.distanceUnit}
                      onClick={onActivityClick ? () => onActivityClick(ci.id) : undefined}
                      cappedInfo={cappedInfoMap[ci.id]}
                      bonusGrant={getGrantByOriginalCheckInId(ci.id)}
                    />
                  ))}
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Reactions given */}
      <ReactionsGiven
        memberId={member.id}
        data={effectiveDataForReactions}
        memberMap={memberMap}
        onPlayerClick={onPlayerClick}
        onActivityClick={onActivityClick}
      />
    </div>
  );
}
