import { useState, useMemo, useEffect, useRef } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import {
  getSubActivities, getSubActivityType, getMatchingSubs,
  inferCurrentRule, simulateChallenge,
  formatRuleMetric, describeRule, formatPoints,
} from '../utils/dataProcessor';

const BASIS_OPTIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'duration', label: 'Duration' },
  { value: 'calories', label: 'Calories' },
  { value: 'steps', label: 'Steps' },
  { value: 'flat', label: 'Flat (per check-in)' },
];

const UNIT_OPTIONS = {
  // distance unit is locked to settings.distanceUnit — no toggle here.
  distance: [],
  duration: [
    { value: 'min', label: 'minutes' },
    { value: 'hour', label: 'hours' },
  ],
  calories: [],
  steps: [],
  flat: [],
};

const UNIT_LABEL = { mi: 'miles', km: 'kilometers', min: 'minutes', hour: 'hours' };

const SORT_OPTIONS = [
  { key: 'date_desc', label: '📅 Newest' },
  { key: 'date_asc', label: '📅 Oldest' },
  { key: 'delta_desc', label: '🔺 Δ high→low' },
  { key: 'delta_asc', label: '🔻 Δ low→high' },
  { key: 'player_asc', label: '👤 Player A–Z' },
];

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDelta(d, opts = {}) {
  const sign = d > 0.05 ? '+' : d < -0.05 ? '' : '';
  const cls = d > 0.05 ? 'text-emerald-400' : d < -0.05 ? 'text-red-400' : 'text-gray-500';
  return (
    <span className={`${cls} ${opts.bold ? 'font-bold' : 'font-semibold'} tabular-nums`}>
      {sign}{d.toFixed(1)}
    </span>
  );
}

function activityLabel(t) {
  return t.replace(/_/g, ' ');
}

export default function Simulator({ data, memberMap, onPlayerClick, onActivityClick }) {
  const { settings } = useSettings();
  const distanceUnit = settings.distanceUnit;

  // Build sorted list of activity types — counts each check-in that contains the
  // activity in any of its sub-activities (so combo workouts are counted once
  // per distinct type they include).
  const activityOptions = useMemo(() => {
    const counts = {};
    for (const ci of data.check_ins) {
      const seen = new Set();
      for (const sub of getSubActivities(ci)) {
        const t = getSubActivityType(sub, ci);
        if (seen.has(t)) continue;
        seen.add(t);
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [data.check_ins]);

  const [activityType, setActivityType] = useState(activityOptions[0]?.type || 'unknown');

  // Sub-activities of the selected type across all check-ins — the right grain for
  // inferring the current rule, because each sub carries its own metric + points.
  const activitySubs = useMemo(() => {
    const out = [];
    for (const ci of data.check_ins) {
      for (const sub of getMatchingSubs(ci, activityType)) out.push(sub);
    }
    return out;
  }, [data.check_ins, activityType]);

  const currentRule = useMemo(
    () => inferCurrentRule(activitySubs, distanceUnit),
    [activitySubs, distanceUnit]
  );

  const fallbackRule = { basis: 'flat', unit: null, pointsPer: 1, perUnits: 1 };
  const [whatIfRule, setWhatIfRule] = useState(currentRule || fallbackRule);

  // Reset what-if rule whenever the inferred current rule changes (activity or unit switch)
  useEffect(() => {
    setWhatIfRule(currentRule || fallbackRule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityType, distanceUnit]);

  const [applyCap, setApplyCap] = useState(true);
  const [capValue, setCapValue] = useState(30);
  const [sortBy, setSortBy] = useState('delta_desc');

  const simulation = useMemo(
    () => simulateChallenge(data, memberMap, activityType, whatIfRule, { applyCap, capValue, distanceUnit }),
    [data, memberMap, activityType, whatIfRule, applyCap, capValue, distanceUnit]
  );

  const sortedCheckIns = useMemo(() => {
    const arr = [...simulation.checkInImpacts];
    switch (sortBy) {
      case 'date_desc':
        arr.sort((a, b) => new Date(b.ci.occurred_at) - new Date(a.ci.occurred_at));
        break;
      case 'date_asc':
        arr.sort((a, b) => new Date(a.ci.occurred_at) - new Date(b.ci.occurred_at));
        break;
      case 'delta_desc':
        arr.sort((a, b) => b.delta - a.delta);
        break;
      case 'delta_asc':
        arr.sort((a, b) => a.delta - b.delta);
        break;
      case 'player_asc':
        arr.sort((a, b) => a.member.full_name.localeCompare(b.member.full_name));
        break;
    }
    return arr;
  }, [simulation.checkInImpacts, sortBy]);

  const sortedPlayerImpacts = useMemo(() => {
    return [...simulation.playerImpacts]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [simulation.playerImpacts]);

  const defaultUnitFor = (basis) => {
    if (basis === 'distance') return distanceUnit;
    if (basis === 'duration') return 'min';
    return null;
  };

  const updateRule = (patch) => setWhatIfRule(r => {
    const next = { ...r, ...patch };
    if (patch.basis && patch.basis !== r.basis) {
      next.unit = defaultUnitFor(patch.basis);
    }
    return next;
  });

  const resetToCurrent = () => setWhatIfRule(currentRule || fallbackRule);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">🧪 Rule-Changer Simulator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pick an activity, dial a what-if scoring rule, and see how check-ins and player totals would change.
        </p>
      </div>

      {/* Activity picker + current rule */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Activity</label>
            <select
              value={activityType}
              onChange={e => setActivityType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 capitalize"
            >
              {activityOptions.map(({ type, count }) => (
                <option key={type} value={type}>
                  {activityLabel(type)} ({count})
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Current rule (inferred)</label>
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm">
              {currentRule ? (
                <>
                  <span className="text-orange-300 font-semibold">≈ {describeRule(currentRule)}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    n={currentRule.count}/{currentRule.totalValid} · spread ±{(currentRule.spread * 100).toFixed(1)}%
                  </span>
                </>
              ) : (
                <span className="text-gray-500 italic">No reliable rule inferred (not enough data)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* What-If rule editor */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-orange-400 uppercase tracking-wider font-semibold">What-If Rule</div>
          <button
            onClick={resetToCurrent}
            disabled={!currentRule}
            className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 px-3 py-1 rounded-lg transition-colors"
          >
            Reset to current
          </button>
        </div>

        {/* Basis */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {BASIS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateRule({ basis: opt.value })}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                whatIfRule.basis === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Numeric editor */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <NumberInput
            min="0"
            step="0.1"
            value={whatIfRule.pointsPer}
            onChange={v => updateRule({ pointsPer: v })}
            className="w-24 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
          <span className="text-gray-400">point(s)</span>

          {whatIfRule.basis !== 'flat' && (
            <>
              <span className="text-gray-400">per</span>
              <NumberInput
                min="0.01"
                step="0.1"
                value={whatIfRule.perUnits}
                onChange={v => updateRule({ perUnits: v })}
                className="w-24 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              {whatIfRule.basis === 'distance' ? (
                <span
                  className="text-gray-400"
                  title="Distance unit is set in Settings → Distance Unit"
                >
                  {UNIT_LABEL[distanceUnit]}
                </span>
              ) : UNIT_OPTIONS[whatIfRule.basis].length > 0 ? (
                <select
                  value={whatIfRule.unit || ''}
                  onChange={e => updateRule({ unit: e.target.value })}
                  className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  {UNIT_OPTIONS[whatIfRule.basis].map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              ) : (
                <span className="text-gray-400">{whatIfRule.basis === 'calories' ? 'calories' : 'steps'}</span>
              )}
            </>
          )}
          {whatIfRule.basis === 'flat' && <span className="text-gray-400">per check-in</span>}

          <span className="text-gray-600 ml-2">→</span>
          <span className="text-orange-300 font-semibold ml-1">{describeRule(whatIfRule)}</span>
        </div>

        {/* Daily cap */}
        <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={applyCap}
              onChange={e => setApplyCap(e.target.checked)}
              className="w-4 h-4 accent-orange-500 cursor-pointer"
            />
            <span className="text-gray-200 font-medium">Apply daily cap</span>
          </label>
          <NumberInput
            min="1"
            value={capValue}
            disabled={!applyCap}
            onChange={v => setCapValue(v)}
            className="w-20 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:opacity-40"
          />
          <span className="text-xs text-gray-500">pts/day across all activities</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="This activity total"
          primary={formatPoints(simulation.totals.activityCurrentTotal)}
          secondary={`→ ${formatPoints(simulation.totals.activitySimulatedTotal)}`}
          delta={simulation.totals.activityDelta}
        />
        <StatCard
          label="Affected players"
          primary={simulation.totals.affectedPlayerCount.toString()}
          secondary={`logged ${activityLabel(activityType)}`}
        />
        <StatCard
          label="Missing metric"
          primary={simulation.totals.missingCount.toString()}
          secondary={
            whatIfRule.basis === 'flat'
              ? 'N/A for flat rule'
              : simulation.totals.missingCount === 0
                ? `all check-ins have ${whatIfRule.basis}`
                : `sub-activit${simulation.totals.missingCount === 1 ? 'y' : 'ies'} without ${whatIfRule.basis} — kept at original score`
          }
          warn={simulation.totals.missingCount > 0 && whatIfRule.basis !== 'flat'}
        />
      </div>

      {/* Affected players */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Affected Players</h2>
          <span className="text-xs text-gray-600">{sortedPlayerImpacts.length} players</span>
        </div>
        {sortedPlayerImpacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-600">No players have logged this activity.</div>
        ) : (
          <>
            <div className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem] gap-x-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800/60">
              <div>#</div>
              <div>Athlete</div>
              <div className="text-right">Old total</div>
              <div className="text-right">New total</div>
              <div className="text-right">Δ</div>
              <div className="text-right">Rank</div>
            </div>
            <div className="divide-y divide-gray-800/50">
              {sortedPlayerImpacts.map((p, i) => {
                const rankDiff = p.oldRank - p.newRank; // positive = improved
                return (
                  <div
                    key={p.memberId}
                    className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem] gap-x-4 px-4 py-2.5 items-center hover:bg-gray-800/40 cursor-pointer transition-colors"
                    onClick={() => onPlayerClick(p.memberId)}
                  >
                    <div className="text-sm text-gray-500 tabular-nums">{i + 1}</div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar url={p.member.profile_picture_url} name={p.member.full_name} size="xs" />
                      <span className="text-sm font-medium text-gray-100 truncate hover:text-orange-300 transition-colors">
                        {p.member.full_name}
                      </span>
                    </div>
                    <div className="text-right text-sm text-gray-300 tabular-nums">{formatPoints(p.oldTotal)}</div>
                    <div className="text-right text-sm text-gray-100 font-semibold tabular-nums">{formatPoints(p.newTotal)}</div>
                    <div className="text-right text-sm">{formatDelta(p.delta)}</div>
                    <div className="text-right text-xs tabular-nums">
                      <span className="text-gray-500">#{p.oldRank}→#{p.newRank}</span>
                      {rankDiff !== 0 && (
                        <span className={`ml-1 ${rankDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {rankDiff > 0 ? `↑${rankDiff}` : `↓${-rankDiff}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Check-in list */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-300">
            Check-ins ({sortedCheckIns.length})
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Sort:</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === opt.key ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {sortedCheckIns.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-600">No check-ins for this activity.</div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {sortedCheckIns.map(({ ci, sub, isCombo, rowKey, member, currentPoints, simulatedPoints, delta, missingMetric }) => (
              <CheckInRow
                key={rowKey}
                ci={ci}
                sub={sub}
                isCombo={isCombo}
                member={member}
                rule={whatIfRule}
                distanceUnit={distanceUnit}
                currentPoints={currentPoints}
                simulatedPoints={simulatedPoints}
                delta={delta}
                missingMetric={missingMetric}
                onPlayerClick={onPlayerClick}
                onActivityClick={onActivityClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Controlled number input that holds a local draft string while typing so
// in-progress values like "0." or a momentarily empty field don't snap back.
// Commits a parsed number to `onChange` only when the draft is a finite number.
function NumberInput({ value, onChange, className, disabled, ...rest }) {
  const externalStr = value === '' || value == null || Number.isNaN(value) ? '' : String(value);
  const [draft, setDraft] = useState(externalStr);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    // Only sync the draft if the external value changed for a reason other
    // than our own onChange (e.g. Reset to Current, switching activity).
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraft(externalStr);
    }
  }, [value, externalStr]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      disabled={disabled}
      value={draft}
      onChange={e => {
        const txt = e.target.value;
        setDraft(txt);
        if (txt === '') return;
        const parsed = parseFloat(txt);
        if (Number.isFinite(parsed)) {
          lastCommittedRef.current = parsed;
          onChange(parsed);
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(draft);
        if (!Number.isFinite(parsed)) {
          setDraft(externalStr);
        }
      }}
      className={className}
    />
  );
}

function StatCard({ label, primary, secondary, delta, warn }) {
  return (
    <div className={`rounded-2xl p-4 border ${warn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-gray-900 border-gray-800'}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${warn ? 'text-amber-300' : 'text-white'}`}>{primary}</div>
      {secondary && <div className="text-xs text-gray-500 mt-1">{secondary}</div>}
      {delta !== undefined && (
        <div className="mt-1.5 text-sm">{formatDelta(delta, { bold: true })}</div>
      )}
    </div>
  );
}

function CheckInRow({ ci, sub, isCombo, member, rule, distanceUnit, currentPoints, simulatedPoints, delta, missingMetric, onPlayerClick, onActivityClick }) {
  // Use the sub-activity's own metric for display — for combo workouts, this
  // is just the portion attributable to the selected activity type.
  const metricStr = formatRuleMetric(sub, rule, distanceUnit);
  const openActivity = onActivityClick ? () => onActivityClick(ci.id) : undefined;

  return (
    <div className={`grid grid-cols-[1fr_8rem_5rem_5rem_5rem] gap-x-3 px-4 py-2.5 items-center text-sm ${missingMetric ? 'bg-amber-500/5' : ''}`}>
      {/* Player + date + title */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {missingMetric && (
            <span
              title={`No ${rule.basis} recorded for this sub-activity — can't be rescored under the current basis. Kept at original points so the player isn't penalized; switch basis to recompute.`}
              className="text-amber-400 text-sm flex-shrink-0"
            >⚠️</span>
          )}
          <button
            onClick={() => onPlayerClick(member.id)}
            className="flex items-center gap-2 min-w-0 group/p"
          >
            <Avatar url={member.profile_picture_url} name={member.full_name} size="xs" />
            <span className="font-medium text-gray-200 truncate group-hover/p:text-orange-300 transition-colors">{member.full_name}</span>
          </button>
          {isCombo && (
            <span
              title="This check-in includes other activities too — only the selected portion is rescored"
              className="text-[10px] uppercase tracking-wider bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0"
            >
              combo
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {openActivity ? (
            <button onClick={openActivity} className="hover:text-orange-300 transition-colors">
              {ci.title || '—'}
            </button>
          ) : (
            <span>{ci.title || '—'}</span>
          )}
          {' · '}{formatDateTime(ci.occurred_at)}
        </div>
      </div>

      <div className="text-right text-xs text-gray-400 tabular-nums">{metricStr}</div>

      <div className="text-right text-gray-300 tabular-nums">{currentPoints.toFixed(1)}</div>
      <div className={`text-right tabular-nums font-semibold ${missingMetric ? 'text-amber-300' : 'text-gray-100'}`}>
        {simulatedPoints.toFixed(1)}
      </div>
      <div className="text-right">{formatDelta(delta)}</div>
    </div>
  );
}
