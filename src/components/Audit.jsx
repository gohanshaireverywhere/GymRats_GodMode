import { useState, useMemo } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import { formatDuration, formatDistance } from '../utils/dataProcessor';

const ACTIVITY_EMOJI = {
  cycling: '🚴',
  running: '🏃',
  walking: '🚶',
  swimming: '🏊',
  yoga: '🧘',
  hiking: '🥾',
  rowing: '🚣',
  elliptical: '🏋️',
};

const HOUR_MS = 3600 * 1000;

// Helpers for photo-EXIF filters
function exifTimestamps(ci) {
  return (ci.check_in_media || [])
    .map(m => m.exif_datetime ? new Date(m.exif_datetime).getTime() : null)
    .filter(t => Number.isFinite(t));
}

function HoursInput({ value, onChange }) {
  return (
    <input
      type="number"
      min="1"
      step="1"
      value={Number.isFinite(value) ? value : ''}
      onChange={e => onChange(e.target.value === '' ? NaN : parseFloat(e.target.value))}
      onClick={e => e.preventDefault()}
      className="w-20 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
    />
  );
}

const FILTERS = [
  {
    key: 'no_points',
    label: 'Activities without points',
    description: 'Uploaded check-ins where the system awarded 0 points — likely missing data or rejected by the validator.',
    defaults: {},
    predicate: (ci) => (ci.points || 0) <= 0,
  },
  {
    key: 'photo_predates_activity',
    label: 'Photo predates activity',
    description: 'Check-ins where a photo\'s EXIF capture time is more than X hours BEFORE the activity. Suspect: an old gym photo reused for a fresh check-in. EXIF-stripped photos are not audited here.',
    defaults: { thresholdHours: 24 },
    predicate: (ci, params) => {
      const occ = new Date(ci.occurred_at).getTime();
      const t = (Number.isFinite(params?.thresholdHours) ? params.thresholdHours : 24) * HOUR_MS;
      return exifTimestamps(ci).some(stamp => (occ - stamp) > t);
    },
    Controls: ({ params, onChange }) => (
      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.preventDefault()}>
        <span className="text-xs text-gray-400">Photo more than</span>
        <HoursInput value={params.thresholdHours} onChange={v => onChange({ thresholdHours: v })} />
        <span className="text-xs text-gray-400">hours before activity</span>
      </div>
    ),
  },
  {
    key: 'photo_follows_activity',
    label: 'Photo taken after activity',
    description: 'Check-ins where a photo\'s EXIF capture time is more than X hours AFTER the activity. Less common, but can indicate post-hoc fabrication.',
    defaults: { thresholdHours: 24 },
    predicate: (ci, params) => {
      const occ = new Date(ci.occurred_at).getTime();
      const t = (Number.isFinite(params?.thresholdHours) ? params.thresholdHours : 24) * HOUR_MS;
      return exifTimestamps(ci).some(stamp => (stamp - occ) > t);
    },
    Controls: ({ params, onChange }) => (
      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.preventDefault()}>
        <span className="text-xs text-gray-400">Photo more than</span>
        <HoursInput value={params.thresholdHours} onChange={v => onChange({ thresholdHours: v })} />
        <span className="text-xs text-gray-400">hours after activity</span>
      </div>
    ),
  },
  {
    key: 'mixed_exif_dates',
    label: 'Mixed photo dates in one check-in',
    description: 'Check-ins with multiple photos whose EXIF capture times span more than X hours. Hints at mixing fresh and old photos.',
    defaults: { thresholdHours: 24 },
    predicate: (ci, params) => {
      const stamps = exifTimestamps(ci);
      if (stamps.length < 2) return false;
      const t = (Number.isFinite(params?.thresholdHours) ? params.thresholdHours : 24) * HOUR_MS;
      return (Math.max(...stamps) - Math.min(...stamps)) > t;
    },
    Controls: ({ params, onChange }) => (
      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.preventDefault()}>
        <span className="text-xs text-gray-400">Span across photos exceeds</span>
        <HoursInput value={params.thresholdHours} onChange={v => onChange({ thresholdHours: v })} />
        <span className="text-xs text-gray-400">hours</span>
      </div>
    ),
  },
  {
    key: 'no_exif',
    label: 'Photos without EXIF',
    description: 'Check-ins with attached media but no EXIF capture time on any photo — can\'t be audited automatically. Worth a manual look if you\'re investigating a specific player.',
    defaults: {},
    predicate: (ci) => {
      const media = ci.check_in_media || [];
      if (media.length === 0) return false;
      return media.every(m => !m.exif_datetime);
    },
  },
  {
    key: 'points_range',
    label: 'Points within a range',
    description: 'Find check-ins whose awarded points fall inside a min/max window. Useful for spotting high-end outliers (e.g. 20–30 pts).',
    defaults: { min: 20, max: 30 },
    predicate: (ci, params) => {
      const pts = ci.points || 0;
      const min = Number.isFinite(params?.min) ? params.min : -Infinity;
      const max = Number.isFinite(params?.max) ? params.max : Infinity;
      return pts >= min && pts <= max;
    },
    Controls: ({ params, onChange }) => (
      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.preventDefault()}>
        <span className="text-xs text-gray-400">Range:</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={Number.isFinite(params.min) ? params.min : ''}
          onChange={e => onChange({ min: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
          className="w-20 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
        <span className="text-xs text-gray-500">to</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={Number.isFinite(params.max) ? params.max : ''}
          onChange={e => onChange({ max: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
          className="w-20 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
        <span className="text-xs text-gray-400">points</span>
      </div>
    ),
  },
];

function buildInitialState() {
  const obj = {};
  for (const f of FILTERS) {
    obj[f.key] = { enabled: f.key === 'no_points', ...(f.defaults || {}) };
  }
  return obj;
}

const SORT_OPTIONS = [
  { key: 'date_desc', label: '📅 Newest first' },
  { key: 'date_asc', label: '📅 Oldest first' },
  { key: 'player_asc', label: '👤 Player A–Z' },
  { key: 'activity_asc', label: '🏷️ Activity type' },
];

function activityType(ci) {
  return ci.check_in_activities?.[0]?.platform_activity || ci.activity_type || 'unknown';
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Audit({ data, memberMap, onPlayerClick, onActivityClick }) {
  const { settings } = useSettings();

  const [pending, setPending] = useState(buildInitialState);
  const [applied, setApplied] = useState(null);
  const [sortBy, setSortBy] = useState('date_desc');

  const toggleFilter = (key) => {
    setPending(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  };

  const updateParams = (key, patch) => {
    setPending(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const enabledCount = Object.values(pending).filter(s => s.enabled).length;

  const runSearch = () => {
    setApplied(pending);
  };

  const results = useMemo(() => {
    if (!applied) return null;
    const activeFilters = FILTERS.filter(f => applied[f.key]?.enabled);
    if (activeFilters.length === 0) return null;

    const matched = data.check_ins.filter(ci =>
      activeFilters.every(f => f.predicate(ci, applied[f.key]))
    );

    const enriched = matched.map(ci => ({
      ci,
      member: memberMap[ci.account_id] || { id: ci.account_id, full_name: 'Unknown', profile_picture_url: null },
      activity: activityType(ci),
      occurred: new Date(ci.occurred_at).getTime(),
    }));

    const sorted = [...enriched];
    switch (sortBy) {
      case 'date_desc':
        sorted.sort((a, b) => b.occurred - a.occurred);
        break;
      case 'date_asc':
        sorted.sort((a, b) => a.occurred - b.occurred);
        break;
      case 'player_asc':
        sorted.sort((a, b) => a.member.full_name.localeCompare(b.member.full_name));
        break;
      case 'activity_asc':
        sorted.sort((a, b) => a.activity.localeCompare(b.activity) || b.occurred - a.occurred);
        break;
    }
    return sorted;
  }, [applied, data.check_ins, memberMap, sortBy]);

  const dirty = applied && JSON.stringify(applied) !== JSON.stringify(pending);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">🔍 Audit</h1>
        <p className="text-sm text-gray-500 mt-1">
          Find check-ins that may need attention. Toggle filters and hit Search.
        </p>
      </div>

      {/* Filters card */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Filters</div>
        <div className="space-y-2.5">
          {FILTERS.map(f => {
            const state = pending[f.key];
            const checked = !!state?.enabled;
            return (
              <div
                key={f.key}
                className={`p-3 rounded-xl transition-colors border ${
                  checked
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : 'bg-gray-800/40 border-transparent hover:bg-gray-800'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFilter(f.key)}
                    className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${checked ? 'text-orange-300' : 'text-gray-200'}`}>
                      {f.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{f.description}</div>
                  </div>
                </label>
                {checked && f.Controls && (
                  <f.Controls params={state} onChange={patch => updateParams(f.key, patch)} />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-800">
          <span className="text-xs text-gray-600">
            {enabledCount === 0
              ? 'Select at least one filter'
              : `${enabledCount} filter${enabledCount === 1 ? '' : 's'} selected`}
            {dirty && <span className="ml-2 text-orange-400">· filters changed, hit Search</span>}
          </span>
          <button
            onClick={runSearch}
            disabled={enabledCount === 0}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              enabledCount === 0
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-orange-500 text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20'
            }`}
          >
            Search
          </button>
        </div>
      </div>

      {/* Results */}
      {results === null && (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔎</div>
          <p className="text-sm text-gray-500">Configure filters above and hit Search to see matching activities.</p>
        </div>
      )}

      {results !== null && (
        <>
          {/* Sort + count */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-400">
              <span className="text-white font-semibold">{results.length}</span> {results.length === 1 ? 'activity' : 'activities'} found
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 mr-1">Sort by:</span>
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
          </div>

          {/* Grid */}
          {results.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center">
              <div className="text-4xl mb-3">✨</div>
              <h2 className="text-lg font-bold text-white">All clean</h2>
              <p className="text-sm text-gray-500 mt-2">No activities match the current filters.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <div className="divide-y divide-gray-800/60">
                {results.map(({ ci, member, activity }) => (
                  <ResultRow
                    key={ci.id}
                    ci={ci}
                    member={member}
                    activity={activity}
                    distanceUnit={settings.distanceUnit}
                    onPlayerClick={onPlayerClick}
                    onActivityClick={onActivityClick}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildPhotoInfo(ci) {
  const media = ci.check_in_media || [];
  if (media.length === 0) return null;
  const occ = new Date(ci.occurred_at).getTime();
  const stamps = media
    .map(m => m.exif_datetime ? new Date(m.exif_datetime).getTime() : null)
    .filter(t => Number.isFinite(t));

  if (stamps.length === 0) {
    return { kind: 'no_exif', mediaCount: media.length };
  }

  const oldest = Math.min(...stamps);
  const newest = Math.max(...stamps);
  const oldestGapMs = occ - oldest;   // positive: photo before activity
  const newestGapMs = newest - occ;   // positive: photo after activity
  const spanMs = newest - oldest;

  return {
    kind: 'exif',
    mediaCount: media.length,
    exifCount: stamps.length,
    oldest,
    newest,
    oldestGapMs,
    newestGapMs,
    spanMs,
  };
}

function formatGap(ms) {
  const absH = Math.abs(ms) / HOUR_MS;
  if (absH < 1) {
    const m = Math.round(Math.abs(ms) / 60000);
    return `${m}m`;
  }
  if (absH < 48) return `${absH.toFixed(1)}h`;
  return `${Math.round(absH / 24)}d`;
}

function PhotoInfoLine({ ci }) {
  const info = useMemo(() => buildPhotoInfo(ci), [ci]);
  if (!info) return null;

  if (info.kind === 'no_exif') {
    return (
      <div className="mt-1 text-xs text-gray-600">
        📷 {info.mediaCount} photo{info.mediaCount === 1 ? '' : 's'} · no EXIF available
      </div>
    );
  }

  const beforeFlag = info.oldestGapMs > 12 * HOUR_MS;   // soft visual threshold
  const afterFlag  = info.newestGapMs > 12 * HOUR_MS;
  const spanFlag   = info.spanMs     > 12 * HOUR_MS;
  const anyFlag    = beforeFlag || afterFlag || spanFlag;

  const oldestStr = new Date(info.oldest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const newestStr = new Date(info.newest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const summary = info.exifCount === 1
    ? `EXIF ${oldestStr}`
    : `EXIF ${oldestStr} → ${newestStr}`;

  return (
    <div className={`mt-1 text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5 ${anyFlag ? 'text-amber-300' : 'text-gray-600'}`}>
      <span>{anyFlag ? '⚠️' : '📷'} {info.mediaCount} photo{info.mediaCount === 1 ? '' : 's'} · {summary}</span>
      {beforeFlag && <span className="text-red-400">oldest {formatGap(info.oldestGapMs)} before activity</span>}
      {afterFlag && <span className="text-red-400">newest {formatGap(info.newestGapMs)} after activity</span>}
      {spanFlag && info.exifCount > 1 && <span className="text-amber-400">span {formatGap(info.spanMs)}</span>}
      {info.exifCount < info.mediaCount && (
        <span className="text-gray-600">({info.mediaCount - info.exifCount} without EXIF)</span>
      )}
    </div>
  );
}

function ResultRow({ ci, member, activity, distanceUnit, onPlayerClick, onActivityClick }) {
  const title = ci.title || activity || 'Workout';
  const hasPhoto = !!ci.photo_url;
  const emoji = ACTIVITY_EMOJI[activity] || '💪';
  const openActivity = onActivityClick ? () => onActivityClick(ci.id) : undefined;

  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-gray-800/40 transition-colors">
      {/* Thumbnail (opens activity) */}
      <button
        onClick={openActivity}
        disabled={!openActivity}
        className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center text-2xl group/t cursor-pointer disabled:cursor-default"
        title={openActivity ? 'Open activity details' : undefined}
      >
        {hasPhoto ? (
          <img src={ci.photo_url} alt="" className="w-full h-full object-cover group-hover/t:opacity-80 transition-opacity" />
        ) : (
          <span>{emoji}</span>
        )}
      </button>

      {/* Middle: player + title + metadata */}
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
          <span className="capitalize bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{activity}</span>
          <span>{formatDateTime(ci.occurred_at)}</span>
          {ci.duration_millis > 0 && <span>⏱ {formatDuration(ci.duration_millis)}</span>}
          {parseFloat(ci.distance_miles) > 0 && <span>📍 {formatDistance(ci.distance_miles, distanceUnit)}</span>}
          {ci.calories > 0 && <span>🔥 {ci.calories} cal</span>}
        </div>
        <PhotoInfoLine ci={ci} />
      </div>

      {/* Right: points indicator */}
      <div className="text-right flex-shrink-0">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Points</div>
        <div className="text-lg font-bold text-red-400">{(ci.points || 0).toFixed(1)}</div>
      </div>
    </div>
  );
}

