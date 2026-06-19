import { useState, useMemo, useEffect, useRef } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import {
  formatDuration, formatDistance, getSubActivities, getSubActivityType,
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

function formatDateTime(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function primaryActivityType(ci) {
  return ci.check_in_activities?.[0]?.platform_activity || ci.activity_type || 'unknown';
}

function checkInActivityTypes(ci) {
  // Union of all sub-activity types (handles combo workouts).
  const subs = getSubActivities(ci);
  const set = new Set();
  for (const s of subs) set.add(getSubActivityType(s, ci));
  return set;
}

const DEFAULT_FILTERS = {
  playerIds: [],         // empty = all
  activityTypes: [],     // empty = all
  minPoints: '',
  maxPoints: '',
  minDurationMin: '',
  maxDurationMin: '',
  minDistance: '',
  maxDistance: '',
  minCalories: '',
  maxCalories: '',
  dateFrom: '',
  dateTo: '',
  hasMedia: 'any',       // 'any' | 'yes' | 'no'
  hasReactions: 'any',
  hasComments: 'any',
  search: '',
};

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const PAGE_SIZE = 50;

export default function Feed({ data, memberMap, onPlayerClick, onActivityClick, initialFilters }) {
  const { settings } = useSettings();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Apply incoming deep-link filters (e.g. from Activity Types). The token
  // pattern ensures the filter is applied exactly once per navigation event —
  // re-renders of Feed don't re-apply it, so the user can clear it freely.
  const lastTokenRef = useRef(null);
  useEffect(() => {
    if (!initialFilters || initialFilters.token === lastTokenRef.current) return;
    lastTokenRef.current = initialFilters.token;
    const { token: _t, ...patch } = initialFilters;
    setFilters({ ...DEFAULT_FILTERS, ...patch });
    setVisibleCount(PAGE_SIZE);
    setShowFilters(true);
  }, [initialFilters]);

  const update = (patch) => {
    setFilters(prev => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
  };

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setPlayerSearch('');
    setVisibleCount(PAGE_SIZE);
  };

  // Sorted player list for picker
  const players = useMemo(() => {
    return [...data.members]
      .map(m => memberMap[m.id] || m)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [data.members, memberMap]);

  // Distinct activity types observed in this challenge
  const activityTypes = useMemo(() => {
    const set = new Set();
    for (const ci of data.check_ins) {
      for (const t of checkInActivityTypes(ci)) set.add(t);
    }
    return [...set].sort();
  }, [data.check_ins]);

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => (p.full_name || '').toLowerCase().includes(q));
  }, [players, playerSearch]);

  const togglePlayer = (id) => {
    setFilters(prev => {
      const set = new Set(prev.playerIds);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...prev, playerIds: [...set] };
    });
    setVisibleCount(PAGE_SIZE);
  };

  const toggleActivity = (type) => {
    setFilters(prev => {
      const set = new Set(prev.activityTypes);
      if (set.has(type)) set.delete(type); else set.add(type);
      return { ...prev, activityTypes: [...set] };
    });
    setVisibleCount(PAGE_SIZE);
  };

  const results = useMemo(() => {
    const f = filters;
    const minPts = numOrNull(f.minPoints);
    const maxPts = numOrNull(f.maxPoints);
    const minDurMs = numOrNull(f.minDurationMin) != null ? numOrNull(f.minDurationMin) * 60000 : null;
    const maxDurMs = numOrNull(f.maxDurationMin) != null ? numOrNull(f.maxDurationMin) * 60000 : null;
    const minDist = numOrNull(f.minDistance);
    const maxDist = numOrNull(f.maxDistance);
    const minCal = numOrNull(f.minCalories);
    const maxCal = numOrNull(f.maxCalories);
    const dateFromMs = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00').getTime() : null;
    const dateToMs = f.dateTo ? new Date(f.dateTo + 'T23:59:59.999').getTime() : null;
    const playerSet = f.playerIds.length ? new Set(f.playerIds) : null;
    const activitySet = f.activityTypes.length ? new Set(f.activityTypes) : null;
    const q = f.search.trim().toLowerCase();

    const matched = [];
    for (const ci of data.check_ins) {
      if (playerSet && !playerSet.has(ci.account_id)) continue;

      if (activitySet) {
        const types = checkInActivityTypes(ci);
        let hit = false;
        for (const t of types) { if (activitySet.has(t)) { hit = true; break; } }
        if (!hit) continue;
      }

      const pts = ci.points || 0;
      if (minPts != null && pts < minPts) continue;
      if (maxPts != null && pts > maxPts) continue;

      const dur = ci.duration_millis || 0;
      if (minDurMs != null && dur < minDurMs) continue;
      if (maxDurMs != null && dur > maxDurMs) continue;

      const dist = parseFloat(ci.distance_miles) || 0;
      if (minDist != null && dist < minDist) continue;
      if (maxDist != null && dist > maxDist) continue;

      const cal = ci.calories || 0;
      if (minCal != null && cal < minCal) continue;
      if (maxCal != null && cal > maxCal) continue;

      const occ = new Date(ci.occurred_at).getTime();
      if (dateFromMs != null && occ < dateFromMs) continue;
      if (dateToMs != null && occ > dateToMs) continue;

      const mediaCount = (ci.check_in_media?.length || 0) + (ci.photo_url ? 1 : 0);
      if (f.hasMedia === 'yes' && mediaCount === 0) continue;
      if (f.hasMedia === 'no' && mediaCount > 0) continue;

      const reactionCount = ci.reactions?.length || 0;
      if (f.hasReactions === 'yes' && reactionCount === 0) continue;
      if (f.hasReactions === 'no' && reactionCount > 0) continue;

      const commentCount = ci.comments?.length || 0;
      if (f.hasComments === 'yes' && commentCount === 0) continue;
      if (f.hasComments === 'no' && commentCount > 0) continue;

      if (q) {
        const haystack = `${ci.title || ''} ${ci.description || ''}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      matched.push({ ci, occ });
    }

    matched.sort((a, b) => b.occ - a.occ);
    return matched;
  }, [filters, data.check_ins]);

  const visible = results.slice(0, visibleCount);
  const totalCheckIns = data.check_ins.length;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.playerIds.length) n++;
    if (filters.activityTypes.length) n++;
    if (filters.minPoints !== '' || filters.maxPoints !== '') n++;
    if (filters.minDurationMin !== '' || filters.maxDurationMin !== '') n++;
    if (filters.minDistance !== '' || filters.maxDistance !== '') n++;
    if (filters.minCalories !== '' || filters.maxCalories !== '') n++;
    if (filters.dateFrom || filters.dateTo) n++;
    if (filters.hasMedia !== 'any') n++;
    if (filters.hasReactions !== 'any') n++;
    if (filters.hasComments !== 'any') n++;
    if (filters.search.trim()) n++;
    return n;
  }, [filters]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">📰 Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          All check-ins sorted newest first. Apply filters to narrow the feed down.
        </p>
      </div>

      {/* Filter card */}
      <div className="bg-gray-900 rounded-2xl">
        <button
          onClick={() => setShowFilters(s => !s)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-orange-500/20 text-orange-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                {activeFilterCount} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeFilterCount > 0 && (
              <span
                onClick={(e) => { e.stopPropagation(); clearAll(); }}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                Clear all
              </span>
            )}
            <span className="text-gray-500 text-sm">{showFilters ? '▲' : '▼'}</span>
          </div>
        </button>

        {showFilters && (
          <div className="px-5 pb-5 space-y-5 border-t border-gray-800">
            {/* Search */}
            <div className="pt-4">
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Search title / description</label>
              <input
                type="text"
                value={filters.search}
                onChange={e => update({ search: e.target.value })}
                placeholder="e.g. morning run"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Players */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Players {filters.playerIds.length > 0 && <span className="text-orange-400 normal-case">· {filters.playerIds.length} selected</span>}
                </label>
                {filters.playerIds.length > 0 && (
                  <button onClick={() => update({ playerIds: [] })} className="text-xs text-gray-500 hover:text-gray-300">
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 mb-2"
              />
              <div className="max-h-48 overflow-y-auto bg-gray-800/40 rounded-xl divide-y divide-gray-800/60">
                {filteredPlayers.map(p => {
                  const checked = filters.playerIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-800 ${checked ? 'bg-orange-500/10' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlayer(p.id)}
                        className="w-4 h-4 accent-orange-500"
                      />
                      <Avatar url={p.profile_picture_url} name={p.full_name} size="xs" />
                      <span className="text-sm text-gray-200 truncate">{p.full_name}</span>
                    </label>
                  );
                })}
                {filteredPlayers.length === 0 && (
                  <div className="px-3 py-3 text-xs text-gray-600 italic">No players match "{playerSearch}"</div>
                )}
              </div>
            </div>

            {/* Activity types */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Activity types {filters.activityTypes.length > 0 && <span className="text-orange-400 normal-case">· {filters.activityTypes.length} selected</span>}
                </label>
                {filters.activityTypes.length > 0 && (
                  <button onClick={() => update({ activityTypes: [] })} className="text-xs text-gray-500 hover:text-gray-300">
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activityTypes.map(t => {
                  const on = filters.activityTypes.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleActivity(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        on
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span>{emojiFor(t)}</span>
                      <span className="capitalize">{t.replace(/_/g, ' ')}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Range filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RangeInput
                label="Points"
                min={filters.minPoints}
                max={filters.maxPoints}
                onMin={v => update({ minPoints: v })}
                onMax={v => update({ maxPoints: v })}
                step="0.1"
              />
              <RangeInput
                label={`Duration (min)`}
                min={filters.minDurationMin}
                max={filters.maxDurationMin}
                onMin={v => update({ minDurationMin: v })}
                onMax={v => update({ maxDurationMin: v })}
                step="1"
              />
              <RangeInput
                label={`Distance (${settings.distanceUnit})`}
                min={filters.minDistance}
                max={filters.maxDistance}
                onMin={v => update({ minDistance: v })}
                onMax={v => update({ maxDistance: v })}
                step="0.1"
              />
              <RangeInput
                label="Calories"
                min={filters.minCalories}
                max={filters.maxCalories}
                onMin={v => update({ minCalories: v })}
                onMax={v => update({ maxCalories: v })}
                step="1"
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Date from</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => update({ dateFrom: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Date to</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => update({ dateTo: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Tri-state toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TriState
                label="Has photo / video"
                value={filters.hasMedia}
                onChange={v => update({ hasMedia: v })}
              />
              <TriState
                label="Has reactions"
                value={filters.hasReactions}
                onChange={v => update({ hasReactions: v })}
              />
              <TriState
                label="Has comments"
                value={filters.hasComments}
                onChange={v => update({ hasComments: v })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="text-sm text-gray-400">
        <span className="text-white font-semibold">{results.length.toLocaleString()}</span>{' '}
        {results.length === 1 ? 'check-in' : 'check-ins'}
        {activeFilterCount > 0 && (
          <span className="text-gray-600"> · of {totalCheckIns.toLocaleString()} total</span>
        )}
      </div>

      {results.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🤷</div>
          <h2 className="text-lg font-bold text-white">No check-ins match</h2>
          <p className="text-sm text-gray-500 mt-2">Try loosening or clearing some filters.</p>
        </div>
      ) : (
        <>
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="divide-y divide-gray-800/60">
              {visible.map(({ ci }) => (
                <FeedRow
                  key={ci.id}
                  ci={ci}
                  member={memberMap[ci.account_id] || { id: ci.account_id, full_name: 'Unknown', profile_picture_url: null }}
                  distanceUnit={settings.distanceUnit}
                  onPlayerClick={onPlayerClick}
                  onActivityClick={onActivityClick}
                />
              ))}
            </div>
          </div>

          {visibleCount < results.length && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="w-full bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-2xl py-3 text-sm font-medium transition-colors"
            >
              Load {Math.min(PAGE_SIZE, results.length - visibleCount)} more
              <span className="text-gray-600 ml-2">({(results.length - visibleCount).toLocaleString()} remaining)</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RangeInput({ label, min, max, onMin, onMax, step = '1' }) {
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          onChange={e => onMin(e.target.value)}
          placeholder="min"
          step={step}
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
        <span className="text-gray-600 text-xs">to</span>
        <input
          type="number"
          value={max}
          onChange={e => onMax(e.target.value)}
          placeholder="max"
          step={step}
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
      </div>
    </div>
  );
}

function TriState({ label, value, onChange }) {
  const opts = [
    { key: 'any', label: 'Any' },
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
  ];
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">{label}</label>
      <div className="flex bg-gray-800 rounded-xl p-1">
        {opts.map(o => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              value === o.key
                ? 'bg-orange-500 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedRow({ ci, member, distanceUnit, onPlayerClick, onActivityClick }) {
  const activity = primaryActivityType(ci);
  const subs = getSubActivities(ci);
  const isCombo = subs.length > 1;
  const title = ci.title || activity?.replace(/_/g, ' ') || 'Workout';
  const hasPhoto = !!ci.photo_url || (ci.check_in_media?.length || 0) > 0;
  const thumbUrl = ci.photo_url || ci.check_in_media?.find(m => !((m.medium_type || '').startsWith('video')))?.url;
  const emoji = emojiFor(activity);
  const openActivity = onActivityClick ? () => onActivityClick(ci.id) : undefined;

  const reactionCount = ci.reactions?.length || 0;
  const commentCount = ci.comments?.length || 0;

  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-gray-800/40 transition-colors">
      <button
        onClick={openActivity}
        disabled={!openActivity}
        className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center text-2xl cursor-pointer disabled:cursor-default group/t"
        title={openActivity ? 'Open activity details' : undefined}
      >
        {hasPhoto && thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover group-hover/t:opacity-80 transition-opacity" />
        ) : (
          <span>{emoji}</span>
        )}
      </button>

      <div className="min-w-0">
        <button
          onClick={() => onPlayerClick(member.id)}
          className="flex items-center gap-2 group/p"
        >
          <Avatar url={member.profile_picture_url} name={member.full_name} size="xs" />
          <span className="text-sm font-medium text-gray-200 group-hover/p:text-orange-300 transition-colors truncate">
            {member.full_name}
          </span>
        </button>
        {openActivity ? (
          <button
            onClick={openActivity}
            className="text-sm font-semibold text-gray-100 mt-1 truncate text-left hover:text-orange-300 transition-colors block max-w-full"
          >
            {title}
          </button>
        ) : (
          <div className="text-sm font-semibold text-gray-100 mt-1 truncate">{title}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500">
          <span className="capitalize bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
            {activity.replace(/_/g, ' ')}
            {isCombo && <span className="ml-1 text-gray-600">+{subs.length - 1}</span>}
          </span>
          <span>{formatDateTime(ci.occurred_at)}</span>
          {ci.duration_millis > 0 && <span>⏱ {formatDuration(ci.duration_millis)}</span>}
          {parseFloat(ci.distance_miles) > 0 && <span>📍 {formatDistance(ci.distance_miles, distanceUnit)}</span>}
          {ci.calories > 0 && <span>🔥 {ci.calories} cal</span>}
          {reactionCount > 0 && <span>❤️ {reactionCount}</span>}
          {commentCount > 0 && <span>💬 {commentCount}</span>}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Points</div>
        <div className="text-lg font-bold text-orange-400">{(ci.points || 0).toFixed(1)}</div>
      </div>
    </div>
  );
}
