import { useMemo } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import {
  formatDuration, formatDistance, formatPoints,
  getSubActivities, getSubActivityType,
} from '../utils/dataProcessor';

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

const emojiFor = (type) => ACTIVITY_EMOJI[type] || '💪';

const fmtNum = (n) => Math.round(n).toLocaleString();

const labelize = (s) => (s || 'other').replace(/_/g, ' ');

function HeroStat({ emoji, label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 text-center">
      <div className="text-3xl mb-1">{emoji}</div>
      <div className="text-3xl sm:text-4xl font-black text-white tabular-nums leading-tight">{value}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wider mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
        {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function BreakdownBar({ rows, max, formatValue, palette }) {
  return (
    <div className="space-y-2.5">
      {rows.map((row, i) => {
        const pct = max > 0 ? (row.value / max) * 100 : 0;
        return (
          <div key={row.type} className="flex items-center gap-3">
            <div className="text-lg w-6 text-center flex-shrink-0">{emojiFor(row.type)}</div>
            <div className="text-sm text-gray-300 capitalize w-28 flex-shrink-0 truncate">{labelize(row.type)}</div>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: palette[i % palette.length] }}
              />
            </div>
            <div className="text-sm text-gray-200 font-semibold tabular-nums w-24 text-right flex-shrink-0">
              {formatValue(row.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordRow({ emoji, label, value, member, onPlayerClick, extra }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="text-2xl w-8 text-center flex-shrink-0">{emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        <div className="text-lg font-bold text-white tabular-nums">{value}</div>
        {member && (
          <button
            onClick={onPlayerClick ? () => onPlayerClick(member.id) : undefined}
            disabled={!onPlayerClick}
            className="mt-1 flex items-center gap-1.5 text-sm text-gray-400 hover:text-orange-300 transition-colors disabled:hover:text-gray-400"
          >
            <Avatar url={member.profile_picture_url} name={member.full_name} size="xs" />
            <span className="truncate">{member.full_name}</span>
          </button>
        )}
        {extra && <div className="text-xs text-gray-500 mt-0.5">{extra}</div>}
      </div>
    </div>
  );
}

const PALETTE = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f59e0b', '#ec4899', '#6366f1'];

const KCAL_PER_PIZZA_SLICE = 285;
const KCAL_PER_BIG_MAC = 550;
const MARATHON_MI = 26.2;
const MARATHON_KM = 42.2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function Dashboard({ data, leaderboard, memberStats, memberMap, onPlayerClick, onActivityClick }) {
  const { settings } = useSettings();
  const unit = settings.distanceUnit || 'mi';

  const stats = useMemo(() => {
    const checkIns = data.check_ins || [];
    const totalCheckIns = checkIns.length;

    // Hero totals
    let totalCalories = 0, totalDurationMs = 0, totalDistance = 0, totalSteps = 0, totalPoints = 0;
    let totalMedia = 0;
    let totalReactions = 0, totalComments = 0;
    const reactionsGivenByMember = {};
    const emojiCounts = {};
    let mostReactedCi = null, mostCommentedCi = null;
    let longestCi = null, highestPointCi = null;
    const pointsByDay = {};
    const checkInsByDay = {};
    const hourCountByMember = {};
    const distinctActivityDates = new Set();

    const distanceByActivity = {};
    const timeByActivity = {};
    const countByActivity = {};

    // Member check-in dates for streaks
    const memberDates = {}; // memberId -> Set of "YYYY-MM-DD"

    for (const ci of checkIns) {
      totalCalories += ci.calories || 0;
      totalDurationMs += ci.duration_millis || 0;
      totalDistance += parseFloat(ci.distance_miles || 0);
      totalSteps += ci.steps || 0;
      totalPoints += ci.points || 0;
      totalMedia += (ci.check_in_media?.length || 0);

      const rxs = ci.reactions || [];
      totalReactions += rxs.length;
      for (const r of rxs) {
        reactionsGivenByMember[r.account_id] = (reactionsGivenByMember[r.account_id] || 0) + 1;
        const e = r.reaction || '?';
        emojiCounts[e] = (emojiCounts[e] || 0) + 1;
      }

      totalComments += (ci.comments?.length || 0);

      if (!mostReactedCi || rxs.length > (mostReactedCi.reactions?.length || 0)) {
        if (rxs.length > 0) mostReactedCi = ci;
      }
      if (!mostCommentedCi || (ci.comments?.length || 0) > (mostCommentedCi.comments?.length || 0)) {
        if ((ci.comments?.length || 0) > 0) mostCommentedCi = ci;
      }

      if (!longestCi || (ci.duration_millis || 0) > (longestCi.duration_millis || 0)) {
        if ((ci.duration_millis || 0) > 0) longestCi = ci;
      }
      if (!highestPointCi || (ci.points || 0) > (highestPointCi.points || 0)) {
        if ((ci.points || 0) > 0) highestPointCi = ci;
      }

      // Day grouping (local date from occurred_at)
      if (ci.occurred_at) {
        const d = ci.occurred_at.slice(0, 10);
        pointsByDay[d] = (pointsByDay[d] || 0) + (ci.points || 0);
        checkInsByDay[d] = (checkInsByDay[d] || 0) + 1;
        distinctActivityDates.add(d);

        if (!memberDates[ci.account_id]) memberDates[ci.account_id] = new Set();
        memberDates[ci.account_id].add(d);

        const hour = new Date(ci.occurred_at).getHours();
        if (!hourCountByMember[ci.account_id]) hourCountByMember[ci.account_id] = { sum: 0, n: 0 };
        hourCountByMember[ci.account_id].sum += hour;
        hourCountByMember[ci.account_id].n += 1;
      }

      // Per-activity breakdown (use sub-activities to attribute correctly)
      const subs = getSubActivities(ci);
      for (const sub of subs) {
        const type = getSubActivityType(sub, ci);
        const dist = parseFloat(sub.distance_miles || 0);
        const dur = sub.duration_millis || 0;
        if (dist > 0) distanceByActivity[type] = (distanceByActivity[type] || 0) + dist;
        if (dur > 0) timeByActivity[type] = (timeByActivity[type] || 0) + dur;
        countByActivity[type] = (countByActivity[type] || 0) + 1;
      }
    }

    // Active members = those with ≥ 1 check-in
    const activeMembers = leaderboard.filter(e => e.checkInCount > 0).length;
    const totalMembers = (data.members || []).length;

    // Biggest day
    const biggestDay = Object.entries(pointsByDay).sort((a, b) => b[1] - a[1])[0];
    const biggestDayDate = biggestDay ? biggestDay[0] : null;
    const biggestDayPts = biggestDay ? biggestDay[1] : 0;
    const biggestDayCheckIns = biggestDayDate ? (checkInsByDay[biggestDayDate] || 0) : 0;

    // Most active day-of-week
    const dowCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    for (const [d, n] of Object.entries(checkInsByDay)) {
      const dow = new Date(d + 'T12:00:00Z').getUTCDay();
      dowCounts[dow] += n;
    }
    const topDowIdx = dowCounts.indexOf(Math.max(...dowCounts));
    const dowName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][topDowIdx];

    // Top reactor
    let topReactorId = null, topReactorCount = 0;
    for (const [id, n] of Object.entries(reactionsGivenByMember)) {
      if (n > topReactorCount) { topReactorCount = n; topReactorId = id; }
    }
    const topReactor = topReactorId ? memberMap[topReactorId] : null;

    // Top emoji
    const topEmoji = Object.entries(emojiCounts).sort((a, b) => b[1] - a[1])[0];

    // Longest streak (per member, then overall winner)
    let streakWinner = null;
    let streakLen = 0;
    for (const [memberId, datesSet] of Object.entries(memberDates)) {
      const dates = [...datesSet].sort();
      let cur = 1, best = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + 'T12:00:00Z');
        const next = new Date(dates[i] + 'T12:00:00Z');
        const gapDays = Math.round((next - prev) / MS_PER_DAY);
        if (gapDays === 1) { cur += 1; best = Math.max(best, cur); }
        else if (gapDays > 1) { cur = 1; }
      }
      if (best > streakLen) {
        streakLen = best;
        streakWinner = memberMap[memberId];
      }
    }

    // Earliest bird / night owl (average hour of day across check-ins, min ≥ 5 check-ins)
    const hourAverages = Object.entries(hourCountByMember)
      .filter(([, v]) => v.n >= 5)
      .map(([id, v]) => ({ id, avg: v.sum / v.n, n: v.n }));
    const earliestBird = hourAverages.length
      ? hourAverages.reduce((a, b) => a.avg < b.avg ? a : b)
      : null;
    const nightOwl = hourAverages.length
      ? hourAverages.reduce((a, b) => a.avg > b.avg ? a : b)
      : null;

    const distanceRows = Object.entries(distanceByActivity)
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value);
    const timeRows = Object.entries(timeByActivity)
      .filter(([type]) => !distanceByActivity[type] || distanceByActivity[type] < 1)
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value);
    const countRows = Object.entries(countByActivity)
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value);

    // Top performers
    const topByCalories = [...leaderboard].sort((a, b) => b.totalCalories - a.totalCalories)[0];
    const topByDistance = [...leaderboard].sort((a, b) => b.totalDistance - a.totalDistance)[0];
    const topByDuration = [...leaderboard].sort((a, b) => b.totalDurationMs - a.totalDurationMs)[0];
    const topByCount = [...leaderboard].sort((a, b) => b.checkInCount - a.checkInCount)[0];

    return {
      totalCheckIns, totalCalories, totalDurationMs, totalDistance, totalSteps, totalPoints,
      totalMedia, totalReactions, totalComments, activeMembers, totalMembers,
      activeDays: distinctActivityDates.size,
      biggestDayDate, biggestDayPts, biggestDayCheckIns,
      dowName, topDowCount: dowCounts[topDowIdx],
      topReactor, topReactorCount,
      topEmoji, // [emoji, count] | undefined
      longestCi, highestPointCi, mostReactedCi, mostCommentedCi,
      streakWinner, streakLen,
      earliestBird, nightOwl,
      distanceRows, timeRows, countRows,
      topByCalories, topByDistance, topByDuration, topByCount,
    };
  }, [data, leaderboard, memberMap]);

  const pizzaSlices = Math.round(stats.totalCalories / KCAL_PER_PIZZA_SLICE);
  const bigMacs = Math.round(stats.totalCalories / KCAL_PER_BIG_MAC);
  const marathons = stats.totalDistance > 0
    ? (stats.totalDistance / (unit === 'km' ? MARATHON_KM : MARATHON_MI))
    : 0;
  const fullDaysExercised = stats.totalDurationMs / MS_PER_DAY;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500/10 via-gray-900 to-gray-900 border border-orange-500/20 rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">{data.name}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {new Date(data.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' → '}
              {new Date(data.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Active days</div>
            <div className="text-2xl font-black text-orange-400 tabular-nums">{stats.activeDays}</div>
          </div>
        </div>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <HeroStat emoji="✅" label="Check-ins" value={fmtNum(stats.totalCheckIns)} />
        <HeroStat emoji="👥" label="Active members" value={stats.activeMembers} sub={`of ${stats.totalMembers}`} />
        <HeroStat emoji="🔥" label="Calories burned" value={fmtNum(stats.totalCalories)} />
        <HeroStat emoji="⏱" label="Active time" value={formatDuration(stats.totalDurationMs)} />
        <HeroStat emoji="📍" label="Distance" value={formatDistance(stats.totalDistance, unit)} />
        <HeroStat emoji="👣" label="Steps" value={fmtNum(stats.totalSteps)} />
        <HeroStat emoji="⭐" label="Points scored" value={formatPoints(stats.totalPoints)} />
        <HeroStat emoji="📸" label="Photos & videos" value={fmtNum(stats.totalMedia)} />
      </div>

      {/* Fun equivalencies */}
      <SectionCard title="🤯 Wow stats" subtitle="What all that effort adds up to">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.totalCalories > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
              <div className="text-3xl">🍕</div>
              <div>
                <div className="text-lg font-bold text-white tabular-nums">{fmtNum(pizzaSlices)} slices</div>
                <div className="text-xs text-gray-500">of pizza burned off ({KCAL_PER_PIZZA_SLICE} kcal each)</div>
              </div>
            </div>
          )}
          {stats.totalCalories > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
              <div className="text-3xl">🍔</div>
              <div>
                <div className="text-lg font-bold text-white tabular-nums">{fmtNum(bigMacs)} Big Macs</div>
                <div className="text-xs text-gray-500">worth of calories ({KCAL_PER_BIG_MAC} kcal each)</div>
              </div>
            </div>
          )}
          {marathons > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
              <div className="text-3xl">🏅</div>
              <div>
                <div className="text-lg font-bold text-white tabular-nums">{marathons.toFixed(1)} marathons</div>
                <div className="text-xs text-gray-500">of distance covered ({unit === 'km' ? '42.2 km' : '26.2 mi'} each)</div>
              </div>
            </div>
          )}
          {fullDaysExercised > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
              <div className="text-3xl">📅</div>
              <div>
                <div className="text-lg font-bold text-white tabular-nums">{fullDaysExercised.toFixed(1)} days</div>
                <div className="text-xs text-gray-500">of nonstop exercise combined</div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Distance by activity */}
      {stats.distanceRows.length > 0 && (
        <SectionCard title="📏 Distance by activity" subtitle={`Measured in ${unit}`}>
          <BreakdownBar
            rows={stats.distanceRows}
            max={stats.distanceRows[0]?.value || 0}
            formatValue={(v) => `${v.toFixed(1)} ${unit}`}
            palette={PALETTE}
          />
        </SectionCard>
      )}

      {/* Time by activity (for activities without meaningful distance) */}
      {stats.timeRows.length > 0 && (
        <SectionCard title="⏱ Time by activity" subtitle="For activities that aren't about distance">
          <BreakdownBar
            rows={stats.timeRows.slice(0, 8)}
            max={stats.timeRows[0]?.value || 0}
            formatValue={formatDuration}
            palette={PALETTE}
          />
        </SectionCard>
      )}

      {/* Activity popularity */}
      {stats.countRows.length > 0 && (
        <SectionCard title="🏆 Most popular activities" subtitle="By number of logged sessions">
          <BreakdownBar
            rows={stats.countRows.slice(0, 8)}
            max={stats.countRows[0]?.value || 0}
            formatValue={(v) => `${fmtNum(v)} sessions`}
            palette={PALETTE}
          />
        </SectionCard>
      )}

      {/* Records & superlatives */}
      <SectionCard title="🥇 Records & superlatives">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-gray-800/60">
          {stats.biggestDayDate && (
            <RecordRow
              emoji="🔥"
              label="Biggest day overall"
              value={`${formatPoints(stats.biggestDayPts)} pts`}
              extra={`${new Date(stats.biggestDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${stats.biggestDayCheckIns} check-ins`}
            />
          )}
          {stats.dowName && (
            <RecordRow
              emoji="📅"
              label="Most active weekday"
              value={stats.dowName}
              extra={`${fmtNum(stats.topDowCount)} check-ins logged`}
            />
          )}
          {stats.longestCi && (
            <RecordRow
              emoji="⏳"
              label="Longest single workout"
              value={formatDuration(stats.longestCi.duration_millis)}
              member={memberMap[stats.longestCi.account_id]}
              onPlayerClick={onPlayerClick}
              extra={stats.longestCi.title || labelize(stats.longestCi.activity_type) || 'Workout'}
            />
          )}
          {stats.highestPointCi && (
            <RecordRow
              emoji="💥"
              label="Highest-scoring workout"
              value={`${formatPoints(stats.highestPointCi.points)} pts`}
              member={memberMap[stats.highestPointCi.account_id]}
              onPlayerClick={onPlayerClick}
              extra={stats.highestPointCi.title || labelize(stats.highestPointCi.activity_type) || 'Workout'}
            />
          )}
          {stats.streakWinner && (
            <RecordRow
              emoji="📈"
              label="Longest active streak"
              value={`${stats.streakLen} days`}
              member={stats.streakWinner}
              onPlayerClick={onPlayerClick}
              extra="Consecutive days with a check-in"
            />
          )}
          {stats.earliestBird && (
            <RecordRow
              emoji="🌅"
              label="Earliest bird"
              value={`avg ${stats.earliestBird.avg.toFixed(1)}h`}
              member={memberMap[stats.earliestBird.id]}
              onPlayerClick={onPlayerClick}
              extra={`Avg time-of-day across ${stats.earliestBird.n} workouts`}
            />
          )}
          {stats.nightOwl && stats.earliestBird?.id !== stats.nightOwl.id && (
            <RecordRow
              emoji="🌙"
              label="Night owl"
              value={`avg ${stats.nightOwl.avg.toFixed(1)}h`}
              member={memberMap[stats.nightOwl.id]}
              onPlayerClick={onPlayerClick}
              extra={`Avg time-of-day across ${stats.nightOwl.n} workouts`}
            />
          )}
        </div>
      </SectionCard>

      {/* Top performers */}
      <SectionCard title="🏆 Top performers" subtitle="The leaders in each dimension">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-gray-800/60">
          {stats.topByCount?.checkInCount > 0 && (
            <RecordRow
              emoji="✅"
              label="Most check-ins"
              value={`${fmtNum(stats.topByCount.checkInCount)} workouts`}
              member={stats.topByCount.member}
              onPlayerClick={onPlayerClick}
            />
          )}
          {stats.topByCalories?.totalCalories > 0 && (
            <RecordRow
              emoji="🔥"
              label="Most calories burned"
              value={fmtNum(stats.topByCalories.totalCalories)}
              member={stats.topByCalories.member}
              onPlayerClick={onPlayerClick}
            />
          )}
          {stats.topByDistance?.totalDistance > 0 && (
            <RecordRow
              emoji="📍"
              label="Most distance covered"
              value={formatDistance(stats.topByDistance.totalDistance, unit)}
              member={stats.topByDistance.member}
              onPlayerClick={onPlayerClick}
            />
          )}
          {stats.topByDuration?.totalDurationMs > 0 && (
            <RecordRow
              emoji="⏱"
              label="Most time exercising"
              value={formatDuration(stats.topByDuration.totalDurationMs)}
              member={stats.topByDuration.member}
              onPlayerClick={onPlayerClick}
            />
          )}
        </div>
      </SectionCard>

      {/* Engagement */}
      <SectionCard title="💬 Community engagement" subtitle="The social side of the challenge">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="text-2xl">👍</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmtNum(stats.totalReactions)}</div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">reactions</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="text-2xl">💬</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmtNum(stats.totalComments)}</div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">comments</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="text-2xl">{stats.topEmoji ? stats.topEmoji[0] : '✨'}</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">
              {stats.topEmoji ? fmtNum(stats.topEmoji[1]) : '—'}
            </div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">top emoji</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="text-2xl">📸</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmtNum(stats.totalMedia)}</div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">media shared</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-gray-800/60">
          {stats.topReactor && (
            <RecordRow
              emoji="❤️"
              label="Biggest hype-person"
              value={`${fmtNum(stats.topReactorCount)} reactions given`}
              member={stats.topReactor}
              onPlayerClick={onPlayerClick}
            />
          )}
          {stats.mostReactedCi && (
            <div className="flex items-start gap-3 py-2.5">
              <div className="text-2xl w-8 text-center flex-shrink-0">🌟</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Most reacted-to activity</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {stats.mostReactedCi.reactions.length} reactions
                </div>
                <button
                  onClick={onActivityClick ? () => onActivityClick(stats.mostReactedCi.id) : undefined}
                  disabled={!onActivityClick}
                  className="mt-1 text-sm text-gray-400 hover:text-orange-300 transition-colors disabled:hover:text-gray-400 text-left"
                >
                  {stats.mostReactedCi.title || labelize(stats.mostReactedCi.activity_type) || 'Workout'}
                  {memberMap[stats.mostReactedCi.account_id] && (
                    <span className="text-gray-600"> · {memberMap[stats.mostReactedCi.account_id].full_name}</span>
                  )}
                </button>
              </div>
            </div>
          )}
          {stats.mostCommentedCi && (
            <div className="flex items-start gap-3 py-2.5">
              <div className="text-2xl w-8 text-center flex-shrink-0">🗣</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Most discussed activity</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {stats.mostCommentedCi.comments.length} comments
                </div>
                <button
                  onClick={onActivityClick ? () => onActivityClick(stats.mostCommentedCi.id) : undefined}
                  disabled={!onActivityClick}
                  className="mt-1 text-sm text-gray-400 hover:text-orange-300 transition-colors disabled:hover:text-gray-400 text-left"
                >
                  {stats.mostCommentedCi.title || labelize(stats.mostCommentedCi.activity_type) || 'Workout'}
                  {memberMap[stats.mostCommentedCi.account_id] && (
                    <span className="text-gray-600"> · {memberMap[stats.mostCommentedCi.account_id].full_name}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
