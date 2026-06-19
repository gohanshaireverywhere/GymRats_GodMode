import { useMemo, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import {
  getSubActivities, getSubActivityType, getMatchingSubs,
  inferCurrentRule, describeRule, formatPoints,
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

function emojiFor(type) { return ACTIVITY_EMOJI[type] || '💪'; }
function labelFor(type) { return type.replace(/_/g, ' '); }

const SORT_OPTIONS = [
  { key: 'count_desc', label: 'Most check-ins' },
  { key: 'points_desc', label: 'Most points' },
  { key: 'avg_desc', label: 'Highest avg pts' },
  { key: 'name_asc', label: 'Name A–Z' },
];

// Spread → confidence label. Same numbers as the Simulator's inference
// (relative MAD); these thresholds are tuned to "≤10% reads as tight, >50%
// reads as essentially unstructured".
function confidence(spread) {
  if (spread == null) return { label: 'unknown', color: 'text-gray-500' };
  if (spread <= 0.05) return { label: 'high', color: 'text-emerald-400' };
  if (spread <= 0.2)  return { label: 'medium', color: 'text-amber-300' };
  return { label: 'low', color: 'text-red-400' };
}

export default function ActivityTypes({ data, onActivityTypeClick }) {
  const { settings } = useSettings();
  const distanceUnit = settings.distanceUnit;
  const [sortBy, setSortBy] = useState('count_desc');

  const rows = useMemo(() => {
    // Discover every activity type that appears in any sub-activity (or top-level).
    const types = new Set();
    for (const ci of data.check_ins) {
      for (const s of getSubActivities(ci)) types.add(getSubActivityType(s, ci));
    }

    const result = [];
    for (const type of types) {
      // Collect both the sub-activities of this type and the check-ins that contain them.
      let checkInCount = 0;        // check-ins that include this type at all
      let subCount = 0;            // sub-activity occurrences of this type
      let totalPoints = 0;
      let totalDuration = 0;
      let totalDistance = 0;
      let totalCalories = 0;
      let totalSteps = 0;
      const matchingSubs = [];

      for (const ci of data.check_ins) {
        const subs = getMatchingSubs(ci, type);
        if (subs.length === 0) continue;
        checkInCount += 1;
        for (const s of subs) {
          subCount += 1;
          matchingSubs.push(s);
          totalPoints += s.points || 0;
          totalDuration += s.duration_millis || 0;
          totalDistance += parseFloat(s.distance_miles) || 0;
          totalCalories += s.calories || 0;
          totalSteps += s.steps || 0;
        }
      }

      const rule = inferCurrentRule(matchingSubs, distanceUnit);

      result.push({
        type,
        checkInCount,
        subCount,
        totalPoints,
        avgPoints: subCount ? totalPoints / subCount : 0,
        totalDuration,
        totalDistance,
        totalCalories,
        totalSteps,
        rule,
      });
    }
    return result;
  }, [data.check_ins, distanceUnit]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    switch (sortBy) {
      case 'count_desc': arr.sort((a, b) => b.checkInCount - a.checkInCount); break;
      case 'points_desc': arr.sort((a, b) => b.totalPoints - a.totalPoints); break;
      case 'avg_desc': arr.sort((a, b) => b.avgPoints - a.avgPoints); break;
      case 'name_asc': arr.sort((a, b) => a.type.localeCompare(b.type)); break;
    }
    return arr;
  }, [rows, sortBy]);

  const grandTotalCheckIns = data.check_ins.length;
  const grandTotalPoints = rows.reduce((s, r) => s + r.totalPoints, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">🏷️ Activity Types</h1>
        <p className="text-sm text-gray-500 mt-1">
          Scoring rule inferred from this challenge's data, per activity. Confidence reflects how
          tightly the points-per-unit ratio clusters across check-ins.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Activity types" value={rows.length.toString()} />
        <Stat label="Check-ins" value={grandTotalCheckIns.toLocaleString()} />
        <Stat label="Total points" value={formatPoints(grandTotalPoints)} />
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Sort:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
      {sorted.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-sm text-gray-500">
          No activities in this challenge.
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_5rem_6rem_5rem_1.4fr_5rem] gap-x-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800/60">
            <div>Activity</div>
            <div className="text-right">Check-ins</div>
            <div className="text-right">Total pts</div>
            <div className="text-right">Avg / sub</div>
            <div>Inferred rule</div>
            <div className="text-right">Confidence</div>
          </div>
          <div className="divide-y divide-gray-800/50">
            {sorted.map(row => (
              <ActivityRow key={row.type} row={row} onClick={onActivityTypeClick} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600 leading-relaxed">
        Rules are inferred by computing points-per-metric ratios across every sub-activity of each
        type, then picking the basis (distance / duration / calories / steps) whose ratio clusters
        most tightly. <span className="text-gray-500">Spread</span> is the relative median absolute
        deviation — low spread means the rule fits consistently; high spread means a flat rule or a
        daily cap is likely warping the data and the inferred rule should be treated as an estimate.
        Distance is reported in your configured unit ({distanceUnit}).
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function ActivityRow({ row, onClick }) {
  const { type, checkInCount, subCount, totalPoints, avgPoints, rule } = row;
  const conf = confidence(rule?.spread);
  const ruleText = rule ? describeRule(rule) : 'not enough data';
  const handleClick = onClick ? () => onClick(type) : undefined;

  return (
    <div
      onClick={handleClick}
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      onKeyDown={handleClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } } : undefined}
      title={handleClick ? `Show ${labelFor(type)} check-ins in the Feed` : undefined}
      className={`grid grid-cols-1 md:grid-cols-[1fr_5rem_6rem_5rem_1.4fr_5rem] gap-x-4 gap-y-1 px-4 py-3 items-center transition-colors ${
        handleClick ? 'cursor-pointer hover:bg-gray-800/60' : 'hover:bg-gray-800/40'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xl flex-shrink-0">{emojiFor(type)}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-100 capitalize truncate">{labelFor(type)}</div>
          {subCount !== checkInCount && (
            <div className="text-[10px] text-gray-600">
              {subCount} sub-activities (combo workouts share check-ins)
            </div>
          )}
        </div>
      </div>

      <div className="text-right text-sm text-gray-300 tabular-nums">
        <span className="md:hidden text-gray-500 text-xs mr-1">check-ins</span>
        {checkInCount.toLocaleString()}
      </div>

      <div className="text-right text-sm text-gray-300 tabular-nums">
        <span className="md:hidden text-gray-500 text-xs mr-1">total pts</span>
        {formatPoints(totalPoints)}
      </div>

      <div className="text-right text-sm text-gray-300 tabular-nums">
        <span className="md:hidden text-gray-500 text-xs mr-1">avg</span>
        {formatPoints(avgPoints)}
      </div>

      <div className="text-sm">
        {rule ? (
          <>
            <span className="text-orange-300 font-semibold">{ruleText}</span>
            {rule.count != null && (
              <span className="text-gray-600 text-xs ml-2">
                n={rule.count}/{rule.totalValid} · ±{(rule.spread * 100).toFixed(0)}%
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-500 italic text-xs">not enough data</span>
        )}
      </div>

      <div className={`text-right text-xs font-semibold uppercase tracking-wider ${conf.color}`}>
        {conf.label}
      </div>
    </div>
  );
}
