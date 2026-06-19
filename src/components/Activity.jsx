import { useMemo, useState, useEffect } from 'react';
import Avatar from './Avatar';
import { useSettings } from '../context/SettingsContext';
import {
  getSubActivities, getSubActivityType,
  formatDuration, formatDistance, formatPoints, getLocalDay,
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

function emojiFor(type) {
  return ACTIVITY_EMOJI[type] || '💪';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function gapHours(aIso, bIso) {
  if (!aIso || !bIso) return null;
  return (new Date(aIso).getTime() - new Date(bIso).getTime()) / 3600000;
}

function fmtGap(hours) {
  const abs = Math.abs(hours);
  if (abs < 1) return `${Math.round(abs * 60)} min`;
  if (abs < 48) return `${abs.toFixed(1)} h`;
  return `${Math.round(abs / 24)} d`;
}

function MediaCarousel({ items, activityId }) {
  const [idx, setIdx] = useState(0);

  // Reset to first item when switching to a different activity.
  useEffect(() => { setIdx(0); }, [activityId]);

  if (!items || items.length === 0) return null;
  const current = items[idx];
  const isVideo = (current.medium_type || '').startsWith('video');
  const total = items.length;
  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <div className="relative bg-gray-950 group/carousel">
      <div className="w-full flex items-center justify-center" style={{ minHeight: 320, maxHeight: 600 }}>
        {isVideo ? (
          <video
            key={current.url}
            src={current.url}
            poster={current.thumbnail_url || undefined}
            controls
            className="max-w-full max-h-[600px]"
          />
        ) : (
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            title="Open original"
          >
            <img
              src={current.url}
              alt=""
              className="max-w-full max-h-[600px] object-contain"
            />
          </a>
        )}
      </div>

      {total > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous media"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white text-2xl flex items-center justify-center transition-colors backdrop-blur"
          >
            ‹
          </button>
          <button
            onClick={next}
            aria-label="Next media"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white text-2xl flex items-center justify-center transition-colors backdrop-blur"
          >
            ›
          </button>

          {/* Counter */}
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur">
            {idx + 1} / {total}
          </div>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to media ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === idx ? 'bg-white w-6' : 'bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, count, children, defaultOpen = true }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        {count != null && <span className="text-xs text-gray-600">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function MediaCard({ media, occurredAt }) {
  const isVideo = (media.medium_type || '').startsWith('video');
  const thumb = media.thumbnail_url || (!isVideo ? media.url : null);
  const exifGap = gapHours(occurredAt, media.exif_datetime); // positive: exif before activity
  const flagged = media.exif_datetime && Math.abs(exifGap) > 12;

  return (
    <div className={`bg-gray-800/50 rounded-xl overflow-hidden border ${flagged ? 'border-amber-500/40' : 'border-gray-700/40'}`}>
      <a href={media.url} target="_blank" rel="noopener noreferrer" className="block">
        {thumb ? (
          <img src={thumb} alt="" className="w-full aspect-square object-cover bg-gray-900" />
        ) : (
          <div className="w-full aspect-square bg-gray-900 flex items-center justify-center text-4xl">
            {isVideo ? '🎬' : '📷'}
          </div>
        )}
      </a>
      <div className="p-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">{isVideo ? '🎬 video' : '📷 photo'}</span>
          {media.source && <span className="text-gray-600">{media.source}</span>}
        </div>
        {media.exif_datetime ? (
          <div>
            <div className="text-gray-300">EXIF: {fmtDateShort(media.exif_datetime)}</div>
            {flagged && (
              <div className="text-amber-400 mt-0.5">
                ⚠️ {fmtGap(exifGap)} {exifGap > 0 ? 'before' : 'after'} activity
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-600 italic">no EXIF datetime</div>
        )}
        {media.exif_location_latitude && media.exif_location_longitude && (
          <a
            href={`https://www.google.com/maps?q=${media.exif_location_latitude},${media.exif_location_longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 hover:text-blue-300"
          >
            📍 {parseFloat(media.exif_location_latitude).toFixed(4)}, {parseFloat(media.exif_location_longitude).toFixed(4)}
          </a>
        )}
        <div className="text-gray-600">
          {media.width}×{media.height} · {media.medium_type}
        </div>
        <div className="text-gray-700 text-[10px]">
          uploaded {fmtDateShort(media.created_at)}
        </div>
      </div>
    </div>
  );
}

function SubActivityRow({ sub, ci, distanceUnit }) {
  const type = getSubActivityType(sub, ci);
  return (
    <div className="grid grid-cols-[2rem_1fr_auto] gap-3 items-center py-2.5">
      <div className="text-xl">{emojiFor(type)}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-100 capitalize">{type.replace(/_/g, ' ')}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-500">
          {sub.duration_millis > 0 && <span>⏱ {formatDuration(sub.duration_millis)}</span>}
          {parseFloat(sub.distance_miles) > 0 && <span>📍 {formatDistance(sub.distance_miles, distanceUnit)}</span>}
          {sub.calories > 0 && <span>🔥 {sub.calories} cal</span>}
          {sub.steps > 0 && <span>👣 {sub.steps.toLocaleString()} steps</span>}
          {sub.start_time && <span className="text-gray-700">started {fmtDateShort(sub.start_time)}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-base font-bold text-orange-400 tabular-nums">{formatPoints(sub.points || 0)}</div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">pts</div>
      </div>
    </div>
  );
}

function ReactionsList({ reactionGroups, totalCount, memberMap, onPlayerClick }) {
  const [selected, setSelected] = useState('all');

  const visible = selected === 'all'
    ? reactionGroups.flatMap(([emoji, list]) => list.map(r => ({ ...r, emoji })))
    : (reactionGroups.find(([e]) => e === selected)?.[1] || []).map(r => ({ ...r, emoji: selected }));

  const sorted = [...visible].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelected('all')}
          className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors ${
            selected === 'all'
              ? 'bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/40'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
        >
          All <span className="tabular-nums">{totalCount}</span>
        </button>
        {reactionGroups.map(([emoji, list]) => {
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
              <span className="text-gray-300 tabular-nums">{list.length}</span>
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-gray-800/60">
        {sorted.map((r, i) => {
          const author = memberMap[r.account_id];
          return (
            <div key={r.id ?? `${r.account_id}-${r.emoji}-${i}`} className="flex items-center gap-2.5 py-2">
              <span className="text-lg w-6 text-center">{r.emoji}</span>
              <Avatar url={author?.profile_picture_url} name={author?.full_name || '?'} size="xs" />
              <div className="min-w-0 flex-1">
                {author ? (
                  <button
                    onClick={() => onPlayerClick(author.id)}
                    className="text-sm font-medium text-gray-200 hover:text-orange-300 transition-colors truncate"
                  >
                    {author.full_name}
                  </button>
                ) : (
                  <span className="text-sm font-medium text-gray-500">Unknown</span>
                )}
              </div>
              {r.created_at && (
                <span className="text-xs text-gray-600 flex-shrink-0">{fmtDateShort(r.created_at)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Activity({ activityId, data, memberMap, onPlayerClick, onBack, backLabel }) {
  const { settings } = useSettings();
  const ci = useMemo(() => data.check_ins.find(c => c.id === activityId), [data.check_ins, activityId]);

  if (!ci) {
    return (
      <div className="bg-gray-900 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">❓</div>
        <h2 className="text-lg font-bold text-white">Activity not found</h2>
        <p className="text-sm text-gray-500 mt-2">This check-in is not in the loaded challenge data.</p>
        <button onClick={onBack} className="mt-5 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-sm">
          ← {backLabel || 'Back'}
        </button>
      </div>
    );
  }

  const member = memberMap[ci.account_id] || { id: ci.account_id, full_name: 'Unknown', profile_picture_url: null };
  const subs = getSubActivities(ci);
  const primaryType = getSubActivityType(subs[0] || {}, ci);
  const media = ci.check_in_media || [];

  const capInfo = useMemo(() => {
    if (!settings.dailyPointsCap?.enabled || !(parseFloat(settings.dailyPointsCap.value) > 0)) return null;
    const cap = parseFloat(settings.dailyPointsCap.value);
    const day = getLocalDay(ci.occurred_at, ci.timezone);
    const sameDayCis = data.check_ins.filter(c => c.account_id === ci.account_id && getLocalDay(c.occurred_at, c.timezone) === day);
    const rawDayTotal = sameDayCis.reduce((s, c) => s + (c.points || 0), 0);
    if (rawDayTotal <= cap) return null;
    return { cap, rawDayTotal, isShared: sameDayCis.length > 1, checkInsOnDay: sameDayCis.length };
  }, [ci, data.check_ins, settings.dailyPointsCap]);

  // Aggregate reactions by emoji
  const reactionGroups = useMemo(() => {
    const out = {};
    for (const r of (ci.reactions || [])) {
      const e = r.reaction || '?';
      if (!out[e]) out[e] = [];
      out[e].push(r);
    }
    return Object.entries(out).sort((a, b) => b[1].length - a[1].length);
  }, [ci.reactions]);

  return (
    <div className="space-y-4">
      {/* Back bar */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        ← {backLabel || 'Back'}
      </button>

      {/* Hero */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <MediaCarousel
          items={media.length > 0
            ? media
            : (ci.photo_url ? [{ url: ci.photo_url, medium_type: 'image/jpg', id: 'fallback' }] : [])}
          activityId={ci.id}
        />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onPlayerClick(member.id)}
                className="flex items-center gap-2 mb-2 group/p"
              >
                <Avatar url={member.profile_picture_url} name={member.full_name} size="xs" />
                <span className="text-sm font-medium text-gray-300 group-hover/p:text-orange-300 transition-colors">
                  {member.full_name}
                </span>
              </button>
              <h1 className="text-2xl font-bold text-white">
                <span className="mr-2">{emojiFor(primaryType)}</span>
                {ci.title || primaryType.replace(/_/g, ' ')}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-400">
                <span className="capitalize bg-gray-800 px-2.5 py-0.5 rounded-full text-xs">
                  {primaryType.replace(/_/g, ' ')}
                </span>
                <span>{fmtDate(ci.occurred_at)}</span>
                {ci.timezone && <span className="text-xs text-gray-600">{ci.timezone}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              {capInfo ? (
                <>
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="text-gray-500 line-through text-xl">{formatPoints(ci.points || 0)}</span>
                    <span className="text-4xl font-black text-orange-400">{formatPoints(capInfo.cap)}</span>
                  </div>
                  <div className="text-xs text-orange-300/80 mt-0.5">
                    {capInfo.isShared
                      ? `Day cap: ${capInfo.cap} pts (${capInfo.checkInsOnDay} workouts this day)`
                      : `Day capped at ${capInfo.cap} pts`}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-black text-orange-400">{formatPoints(ci.points || 0)}</div>
                  <div className="text-xs text-gray-500">total points</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Duration" value={ci.duration_millis > 0 ? formatDuration(ci.duration_millis) : '—'} />
        <StatCard label="Distance" value={parseFloat(ci.distance_miles) > 0 ? formatDistance(ci.distance_miles, settings.distanceUnit) : '—'} />
        <StatCard label="Calories" value={ci.calories > 0 ? ci.calories.toLocaleString() : '—'} />
        <StatCard label="Steps" value={ci.steps > 0 ? ci.steps.toLocaleString() : '—'} />
      </div>

      {/* Sub-activities */}
      <Section title="Sub-activities" count={`${subs.length} segment${subs.length === 1 ? '' : 's'}`}>
        {ci.check_in_activities && ci.check_in_activities.length > 0 ? (
          <div className="divide-y divide-gray-800/60">
            {subs.map((sub, i) => (
              <SubActivityRow key={sub.id || i} sub={sub} ci={ci} distanceUnit={settings.distanceUnit} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 italic py-3">
            No sub-activity records — the top-level fields above describe this check-in directly.
          </div>
        )}
      </Section>

      {/* Description */}
      {ci.description && (
        <Section title="Description">
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{ci.description}</p>
        </Section>
      )}

      {/* Media */}
      {media.length > 0 && (
        <Section title="Photos & media" count={`${media.length} item${media.length === 1 ? '' : 's'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {media.map(m => <MediaCard key={m.id} media={m} occurredAt={ci.occurred_at} />)}
          </div>
        </Section>
      )}

      {/* Reactions */}
      {reactionGroups.length > 0 && (
        <Section title="Reactions" count={`${ci.reactions.length} total`}>
          <ReactionsList
            reactionGroups={reactionGroups}
            totalCount={ci.reactions.length}
            memberMap={memberMap}
            onPlayerClick={onPlayerClick}
          />
        </Section>
      )}

      {/* Comments */}
      {ci.comments && ci.comments.length > 0 && (
        <Section title="Comments" count={`${ci.comments.length}`}>
          <div className="space-y-3">
            {[...ci.comments]
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
              .map(c => {
                const author = memberMap[c.account_id];
                return (
                  <div key={c.id} className="flex items-start gap-2.5">
                    <Avatar url={author?.profile_picture_url} name={author?.full_name || '?'} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {author ? (
                          <button
                            onClick={() => onPlayerClick(author.id)}
                            className="text-sm font-medium text-gray-200 hover:text-orange-300 transition-colors"
                          >
                            {author.full_name}
                          </button>
                        ) : (
                          <span className="text-sm font-medium text-gray-500">Unknown</span>
                        )}
                        <span className="text-xs text-gray-600">{fmtDateShort(c.created_at)}</span>
                      </div>
                      <div className="text-sm text-gray-300 mt-0.5 whitespace-pre-wrap break-words">{c.content}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </Section>
      )}

      {/* Technical details */}
      <Section title="Technical details">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <DetailRow label="Check-in ID" value={ci.id} mono />
          <DetailRow label="Workout entry ID" value={ci.workout_entry_id} mono />
          <DetailRow label="Created" value={fmtDateShort(ci.created_at)} />
          <DetailRow label="Updated" value={fmtDateShort(ci.updated_at)} />
          {ci.apple_workout_uuid && <DetailRow label="Apple Workout UUID" value={ci.apple_workout_uuid} mono />}
          {ci.apple_device_name && <DetailRow label="Apple device" value={ci.apple_device_name} />}
          {ci.apple_source_name && <DetailRow label="Apple source" value={ci.apple_source_name} />}
          {ci.google_place_id && <DetailRow label="Google Place ID" value={ci.google_place_id} mono />}
          {ci.details?.location_latitude && (
            <DetailRow
              label="Location"
              value={
                <a
                  href={`https://www.google.com/maps?q=${ci.details.location_latitude},${ci.details.location_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  {parseFloat(ci.details.location_latitude).toFixed(4)}, {parseFloat(ci.details.location_longitude).toFixed(4)}
                </a>
              }
            />
          )}
          <DetailRow label="Version" value={ci.version} />
          <DetailRow label="Activity type (top-level)" value={ci.activity_type || '—'} />
        </dl>

        <details className="mt-4">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">View raw JSON</summary>
          <pre className="mt-2 bg-gray-950 rounded-xl p-3 text-[10px] text-gray-400 overflow-auto max-h-96">
            {JSON.stringify(ci, null, 2)}
          </pre>
        </details>
      </Section>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-800/40">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-gray-300 text-right break-all ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}
