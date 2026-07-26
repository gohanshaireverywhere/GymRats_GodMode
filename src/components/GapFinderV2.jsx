import { useState, useMemo, useRef } from 'react';
import { ROTATIONS, getRotationStatus } from '../data/rotations';
import { computeRotationResults, findGaps } from '../utils/computeRotationBonus';
import { useBonusGrants } from '../context/BonusGrantsContext';
import { useSettings } from '../context/SettingsContext';
import { formatPoints, formatDuration, formatDistance, getLocalDay } from '../utils/dataProcessor';
import Avatar from './Avatar';

function formatDate(dayStr) {
  return new Date(dayStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const map = {
    future:  { label: 'Not started',  cls: 'bg-gray-700 text-gray-400' },
    ongoing: { label: 'In progress',  cls: 'bg-amber-500/20 text-amber-300' },
    grace:   { label: 'Grace period', cls: 'bg-sky-500/20 text-sky-300' },
    closed:  { label: 'Finished',     cls: 'bg-emerald-500/20 text-emerald-400' },
  };
  const { label, cls } = map[status] ?? map.future;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function PlayerGapCard({ member, data, rotEntry, capValue, currentTotalPoints, completedRotations }) {
  const { isGranted, getGrant, getGrantsForPlayer, addGrant, removeGrant } = useBonusGrants();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  const playerGrants = getGrantsForPlayer(member.id).filter(g => g.rotation === rotEntry.rotation.num);
  // grantAmount stores the true net gain from the algorithm (= dayCapacity for
  // full-cap days, exact remaining for last-day grants). Always use this — never
  // recompute from newActivityPts - original.points, which ignores other check-ins
  // on the same day and overcounts on multi-check-in days.
  const grantedSoFar = playerGrants.reduce((s, g) => s + (g.grantAmount || 0), 0);
  const bonusOwed = rotEntry.bonusPtsPerPlayer;
  const remaining = Math.max(0, bonusOwed - grantedSoFar);
  const done = remaining <= 0;
  const sortedGrants = [...playerGrants].sort((a, b) => a.date.localeCompare(b.date));
  const grantedDaysKey = sortedGrants.map(g => g.date).join(',');

  // Recommend edits ONLY for the still-owed `remaining`, and only over days that
  // have NOT already been granted. Excluding granted days keeps the list stable
  // across data re-exports: once a day's bonus is applied in GymRats (inflating its
  // points) and re-imported, that day is skipped here instead of being re-derived
  // onto a different day — which used to orphan the grant and risk double-granting.
  const gapRecommendations = useMemo(() => {
    if (remaining <= 0.001) return [];
    const grantedDays = new Set(grantedDaysKey ? grantedDaysKey.split(',') : []);
    const playerCheckIns = data.check_ins.filter(ci =>
      ci.account_id === member.id && !grantedDays.has(getLocalDay(ci.occurred_at, ci.timezone))
    );
    return findGaps(playerCheckIns, member.id, rotEntry.rotation.num, remaining, capValue, completedRotations);
  }, [data.check_ins, member.id, remaining, capValue, rotEntry.rotation.num, completedRotations, grantedDaysKey]);

  const handleMarkGranted = (rec) => {
    const ci = rec.checkIn;
    const activityType = ci.check_in_activities?.[0]?.platform_activity || null;
    addGrant({
      grantId: rec.grantId,
      playerId: member.id,
      playerName: member.full_name,
      rotation: rotEntry.rotation.num,
      date: rec.day,
      grantAmount: rec.netGrant,
      newActivityPts: rec.newActivityPts,
      // Full snapshot of the original check-in for rollback reference
      original: {
        checkInId: ci.id,
        title: ci.title || null,
        activityType: activityType,
        occurredAt: ci.occurred_at,
        points: ci.points || 0,
        durationMillis: ci.duration_millis || null,
        distanceMiles: ci.distance_miles ? parseFloat(ci.distance_miles) : null,
        calories: ci.calories || null,
        steps: ci.steps || null,
      },
    });
  };

  const pct = Math.min(100, bonusOwed > 0 ? (grantedSoFar / bonusOwed) * 100 : 0);
  const projectedTotal = (currentTotalPoints ?? 0) + bonusOwed;

  return (
    <div className={`rounded-2xl border ${done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-800 bg-gray-900'}`}>
      {/* Player header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <Avatar url={member.profile_picture_url} name={member.full_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-200">{member.full_name}</span>
            {done && <span className="text-xs text-emerald-400 font-semibold">✅ Complete</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs font-semibold flex-shrink-0 ${done ? 'text-emerald-400' : 'text-amber-400'}`}>
              {grantedSoFar} / {bonusOwed} pts
            </span>
          </div>
        </div>
        <span className="text-gray-600 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-4 space-y-4">

          {/* Additive equation */}
          <div className="flex items-center gap-2 text-sm flex-wrap bg-gray-800/50 rounded-xl px-3 py-2.5">
            <span className="text-gray-300 font-semibold">{formatPoints(currentTotalPoints ?? 0)}</span>
            <span className="text-gray-600">current</span>
            <span className="text-gray-500">+</span>
            <span className="text-orange-400 font-bold">{bonusOwed} pts</span>
            <span className="text-gray-600">target bonus</span>
            <span className="text-gray-500">=</span>
            <span className="text-emerald-400 font-bold">{formatPoints(projectedTotal)}</span>
            <span className="text-gray-600">projected total</span>
          </div>
          {/* Expected actual gain from pending recommendations */}
          {!done && gapRecommendations.length > 0 && (() => {
            const expectedGain = grantedSoFar + gapRecommendations.reduce((s, r) => s + r.netGrant, 0);
            const diff = expectedGain - bonusOwed;
            const isClose = Math.abs(diff) < 0.01;
            return !isClose ? (
              <div className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-1.5">
                ⚠ Expected actual gain from these edits: <span className="font-semibold">{formatPoints(expectedGain)} pts</span>
                {' '}({diff > 0 ? '+' : ''}{formatPoints(diff)} vs target) — rounding error from fractional original check-in points, unavoidable with integer activity values.
              </div>
            ) : null;
          })()}

          {/* Already granted — rendered directly from stored grants so it stays
              accurate even after check-ins are edited in GymRats and re-imported. */}
          {sortedGrants.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-emerald-400/80 uppercase tracking-wider mb-1">Already granted ({sortedGrants.length})</div>
              {sortedGrants.map(g => {
                const o = g.original || {};
                return (
                  <div key={g.grantId} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-xs font-semibold text-gray-200 truncate">{o.title || o.activityType || 'Workout'}</span>
                          <span className="text-xs text-gray-600">{o.occurredAt ? formatDateTime(o.occurredAt) : formatDate(g.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">originally {formatPoints(o.points || 0)} pts</span>
                          <span className="text-gray-600">→ changed to</span>
                          <span className="px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300">{g.newActivityPts} pts</span>
                        </div>
                        <div className="mt-2 bg-gray-900/60 rounded-lg px-2 py-1.5 space-y-0.5">
                          <div className="text-xs text-gray-500 uppercase tracking-wider">Original (for rollback)</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                            <span className="text-gray-400 capitalize">{o.title || o.activityType || 'Workout'}</span>
                            <span>⭐ {formatPoints(o.points || 0)} pts</span>
                            {o.durationMillis > 0 && <span>⏱ {formatDuration(o.durationMillis)}</span>}
                            {o.distanceMiles > 0 && <span>📍 {formatDistance(o.distanceMiles, settings.distanceUnit)}</span>}
                            {o.calories > 0 && <span>🔥 {o.calories} cal</span>}
                          </div>
                          <div className="text-xs text-gray-600">ID: {o.checkInId}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xl font-black text-emerald-400">+{formatPoints(g.grantAmount || 0)}</div>
                        <div className="text-xs text-gray-500">net pts</div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-xs text-emerald-400 font-semibold">✅ Granted — {formatDate(g.date)}</span>
                      <button onClick={() => removeGrant(g.grantId)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Undo</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Remaining to grant — findGaps over not-yet-granted days for the still-owed amount */}
          {remaining > 0.001 && (gapRecommendations.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Check-ins to edit</div>
              <p className="text-xs text-gray-600 mb-2">
                Open each check-in in GymRats and change its activity type to a bonus activity with the exact point value shown. Confirm each one here after saving it.
              </p>
              {gapRecommendations.map((rec) => {
                const granted = isGranted(rec.grantId);
                const grant = getGrant(rec.grantId);
                const subActs = rec.checkIn.check_in_activities || [];
                const activity = subActs[0]?.platform_activity;
                const title = rec.checkIn.title || activity || 'Workout';
                const originalPts = rec.checkIn.points || 0;
                const hasMultipleSubActs = subActs.length > 1;
                const o = grant?.original;
                return (
                  <div key={rec.grantId} className={`rounded-xl border p-3 transition-colors ${granted ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-700 bg-gray-800/40'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-xs font-semibold text-gray-200 truncate">{title}</span>
                          <span className="text-xs text-gray-600">{formatDateTime(rec.checkIn.occurred_at)}</span>
                          {hasMultipleSubActs && (
                            <span className="text-xs bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-semibold">
                              {subActs.length} sub-activities
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                            originally {formatPoints(originalPts)} pts
                          </span>
                          <span className="text-gray-600">→ change to</span>
                          <span className={`px-2 py-0.5 rounded font-bold ${rec.isLastDay ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {rec.newActivityPts} pts
                          </span>
                          {rec.isLastDay && <span className="text-gray-600 italic">← exact for last grant</span>}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          Day total: {formatPoints(rec.rawDayTotal)} / {capValue} pts — room: {rec.intCapacity} pts
                        </div>
                        {/* Rotation-window fallback warning */}
                        {rec.source?.type === 'rotation' && !granted && (
                          <div className="mt-1.5 bg-sky-500/10 border border-sky-500/25 rounded-lg px-2.5 py-2">
                            <div className="text-xs font-semibold text-sky-300 mb-0.5">
                              ⚠ Inside {rec.source.rotationLabel} window
                            </div>
                            <div className="text-xs text-gray-400">
                              This check-in is from the Battle Royale rotation period. Editing it is safe —
                              the rotation score calculator will use the <span className="text-white font-semibold">original points</span> and
                              ignore the bonus modification when determining matchup results.
                            </div>
                          </div>
                        )}
                        {/* Multi-sub-activity instruction */}
                        {hasMultipleSubActs && !granted && (
                          <div className="mt-1.5 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2.5 py-2">
                            <div className="text-xs font-semibold text-sky-300 mb-1">⚡ This check-in has {subActs.length} sub-activities</div>
                            <div className="text-xs text-gray-400 mb-1.5">
                              Change <span className="text-white font-semibold">any one</span> sub-activity to <span className="text-emerald-300 font-semibold">{rec.newActivityPts} pts</span> and leave the others untouched.
                              The daily cap will bring the total to 30 pts — the net bonus is the same regardless of which one you pick.
                            </div>
                            <div className="space-y-1">
                              {subActs.map((sa, i) => (
                                <div key={i} className="text-xs text-gray-500 flex items-center gap-2">
                                  <span className="text-sky-500">#{i + 1}</span>
                                  <span className="capitalize text-gray-400">{sa.platform_activity || 'activity'}</span>
                                  <span>{formatPoints(sa.points || 0)} pts</span>
                                  {sa.duration_millis > 0 && <span>⏱ {formatDuration(sa.duration_millis)}</span>}
                                  {parseFloat(sa.distance_miles) > 0 && <span>📍 {formatDistance(sa.distance_miles, settings.distanceUnit)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {rec.otherCis && rec.otherCis.length > 0 && (
                          <div className="mt-1.5 bg-gray-900/60 rounded-lg px-2 py-1.5">
                            <div className="text-xs text-gray-600 mb-1">⚠ Other activities on this day (leave untouched):</div>
                            {rec.otherCis.map(ci => {
                              const act = ci.check_in_activities?.[0]?.platform_activity;
                              return (
                                <div key={ci.id} className="text-xs text-gray-500 flex items-center gap-2">
                                  <span className="text-gray-600">·</span>
                                  <span>{ci.title || act || 'Workout'}</span>
                                  <span className="text-gray-600">{formatDateTime(ci.occurred_at)}</span>
                                  <span className="text-gray-500">{formatPoints(ci.points || 0)} pts</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Rollback info — shown only after confirmation */}
                        {granted && o && (
                          <div className="mt-2 bg-gray-900/60 rounded-lg px-2 py-1.5 space-y-0.5">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Original (for rollback)</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                              <span className="text-gray-400 capitalize">{o.title || o.activityType || 'Workout'}</span>
                              <span>⭐ {formatPoints(o.points)} pts</span>
                              {o.durationMillis > 0 && <span>⏱ {formatDuration(o.durationMillis)}</span>}
                              {o.distanceMiles > 0 && <span>📍 {formatDistance(o.distanceMiles, settings.distanceUnit)}</span>}
                              {o.calories > 0 && <span>🔥 {o.calories} cal</span>}
                            </div>
                            <div className="text-xs text-gray-600">ID: {o.checkInId}</div>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-xl font-black ${granted ? 'text-emerald-400' : 'text-emerald-400'}`}>
                          +{formatPoints(rec.netGrant)}
                        </div>
                        <div className="text-xs text-gray-500">net pts</div>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      {granted ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-emerald-400 font-semibold">✅ Granted — {formatDate(grant?.date)}</span>
                          <button onClick={() => removeGrant(rec.grantId)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Undo</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleMarkGranted(rec)}
                          className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                        >
                          ✅ Mark as Granted in GymRats
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {gapRecommendations.shortfall > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
                  ⚠️ {formatPoints(gapRecommendations.shortfall)} pts cannot be granted — not enough un-granted check-ins with cap room.
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-600 text-center py-3">
              No un-granted check-ins with available cap room found for the remaining {formatPoints(remaining)} pts.
            </div>
          ))}

          {done && (
            <div className="text-center text-emerald-400 text-sm font-semibold py-2">
              🎉 All {bonusOwed} pts granted!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GapFinderV2({ data, memberStats }) {
  const { settings } = useSettings();
  const { grants, exportJSON, importJSON } = useBonusGrants();
  const [selectedRotNums, setSelectedRotNums] = useState(() => {
    const usable = ROTATIONS.filter(r => ['closed', 'grace'].includes(getRotationStatus(r)));
    const last = usable.length > 0 ? usable[usable.length - 1].num : ROTATIONS[0].num;
    return new Set([last]);
  });
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const importRef = useRef(null);

  const capValue = settings.dailyPointsCap?.enabled ? parseFloat(settings.dailyPointsCap.value) : 30;

  // All completed rotations sorted oldest-first — used as fallback search windows
  // in findGaps when the classification phase doesn't have enough room.
  const completedRotations = useMemo(
    () => ROTATIONS.filter(r => getRotationStatus(r) === 'closed').sort((a, b) => a.num - b.num),
    []
  );

  const selectedRotationList = useMemo(
    () => ROTATIONS.filter(r => selectedRotNums.has(r.num)).sort((a, b) => a.num - b.num),
    [selectedRotNums]
  );

  // For single-select mode: the one selected rotation (if exactly one is selected)
  const selectedRotation = selectedRotationList.length === 1 ? selectedRotationList[0] : null;
  const status = selectedRotation ? getRotationStatus(selectedRotation) : null;
  const computable = status === 'closed' || status === 'grace';

  const rotationResult = useMemo(() => {
    if (!selectedRotation || !computable) return null;
    return computeRotationResults(data, selectedRotation, settings.dailyPointsCap, grants);
  }, [data, selectedRotation, computable, settings.dailyPointsCap]);

  // Multi-rotation merge: combine results across 2+ selected rotations
  const mergedRotationData = useMemo(() => {
    if (selectedRotationList.length < 2) return null;

    const allComputable = selectedRotationList.every(r => {
      const st = getRotationStatus(r);
      return st === 'closed' || st === 'grace';
    });
    if (!allComputable) return null;

    const rotationResultsByNum = new Map();
    for (const rot of selectedRotationList) {
      const res = computeRotationResults(data, rot, settings.dailyPointsCap, grants);
      if (res) rotationResultsByNum.set(rot.num, res);
    }

    if (rotationResultsByNum.size === 0) return null;

    const perPlayerOwed = new Map();
    let anyFeaturedVictories = false;

    for (const rot of selectedRotationList) {
      const res = rotationResultsByNum.get(rot.num);
      if (!res) continue;

      if (res.bonusPtsPerPlayer > 0) {
        anyFeaturedVictories = true;
        for (const id of res.eligiblePlayerIds) {
          const entry = perPlayerOwed.get(id) ?? { total: 0, parts: [] };
          entry.total += res.bonusPtsPerPlayer;
          entry.parts.push({ rotNum: rot.num, kind: 'featured', teamName: res.featuredTeamName, amount: res.bonusPtsPerPlayer });
          perPlayerOwed.set(id, entry);
        }
      }

      for (const upset of res.upsets) {
        for (const id of upset.eligiblePlayerIds) {
          const entry = perPlayerOwed.get(id) ?? { total: 0, parts: [] };
          entry.total += upset.bonusPtsPerPlayer;
          entry.parts.push({ rotNum: rot.num, kind: 'upset', teamName: upset.teamName, amount: upset.bonusPtsPerPlayer });
          perPlayerOwed.set(id, entry);
        }
      }
    }

    return { perPlayerOwed, anyFeaturedVictories };
  }, [selectedRotationList, data, settings.dailyPointsCap, grants]);

  const eligibleMembers = useMemo(() => {
    if (!rotationResult && !mergedRotationData) return [];

    if (rotationResult) {
      return [...rotationResult.eligiblePlayerIds]
        .map(id => {
          const member = data.members.find(m => m.id === id);
          const entry = memberStats[id];
          return member ? { member, currentTotalPoints: entry?.totalPoints ?? 0 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.member.full_name.localeCompare(b.member.full_name));
    }

    if (mergedRotationData) {
      return [...mergedRotationData.perPlayerOwed.entries()]
        .map(([id, owedEntry]) => {
          const member = data.members.find(m => m.id === id);
          const entry = memberStats[id];
          return member ? { member, currentTotalPoints: entry?.totalPoints ?? 0, owedEntry } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.member.full_name.localeCompare(b.member.full_name));
    }

    return [];
  }, [rotationResult, mergedRotationData, data.members, memberStats]);

  const upsetSections = useMemo(() => {
    if (!rotationResult?.upsets?.length) return [];
    return rotationResult.upsets.map(upset => ({
      ...upset,
      members: [...upset.eligiblePlayerIds]
        .map(id => {
          const member = data.members.find(m => m.id === id);
          const entry = memberStats[id];
          return member ? { member, currentTotalPoints: entry?.totalPoints ?? 0 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.member.full_name.localeCompare(b.member.full_name)),
    }));
  }, [rotationResult, data.members, memberStats]);

  // Calculate the unique bonus activity types still NEEDED for this rotation.
  // Mirrors the per-player cards: for each player it looks only at the still-owed
  // amount over days that haven't been granted yet, so the summary shrinks as
  // grants are confirmed instead of listing already-created types forever.
  const activityTypesSummary = useMemo(() => {
    if (!rotationResult || !selectedRotation) return { created: [], needsCreation: [], totalTypes: 0 };

    const activityMap = new Map(); // key: pts.toFixed(2) → [player names]

    // Remaining recommendations for one player: owed − already granted, over
    // not-yet-granted days (same logic as PlayerGapCard).
    const remainingGapsFor = (member, owed) => {
      const playerGrants = grants.filter(g => g.playerId === member.id && g.rotation === selectedRotation.num);
      const grantedSoFar = playerGrants.reduce((s, g) => s + (g.grantAmount || 0), 0);
      const remaining = Math.max(0, owed - grantedSoFar);
      if (remaining <= 0.001) return [];
      const grantedDays = new Set(playerGrants.map(g => g.date));
      const playerCheckIns = data.check_ins.filter(ci =>
        ci.account_id === member.id && !grantedDays.has(getLocalDay(ci.occurred_at, ci.timezone))
      );
      return findGaps(playerCheckIns, member.id, selectedRotation.num, remaining, capValue, completedRotations);
    };

    for (const { member } of eligibleMembers) {
      for (const rec of remainingGapsFor(member, rotationResult.bonusPtsPerPlayer)) {
        const key = rec.newActivityPts.toFixed(2);
        if (!activityMap.has(key)) activityMap.set(key, []);
        activityMap.get(key).push(member.full_name);
      }
    }

    for (const section of upsetSections) {
      for (const { member } of section.members) {
        for (const rec of remainingGapsFor(member, section.bonusPtsPerPlayer)) {
          const key = rec.newActivityPts.toFixed(2);
          if (!activityMap.has(key)) activityMap.set(key, []);
          activityMap.get(key).push(member.full_name);
        }
      }
    }

    // An activity type is "already created" only if it appears as a newActivityPts
    // value in the confirmed grants database — not just any check-in with that value.
    const existingPts = new Set(
      grants
        .filter(g => g.newActivityPts != null)
        .map(g => (Math.round(g.newActivityPts * 100) / 100).toFixed(2))
    );

    const allTypes = Array.from(activityMap.entries())
      .map(([key, players]) => ({
        value: parseFloat(key),
        displayValue: key,
        playerCount: players.length,
        players: [...new Set(players)].sort(),
        exists: existingPts.has(key),
      }))
      .sort((a, b) => b.value - a.value);

    return {
      created: allTypes.filter(t => t.exists),
      needsCreation: allTypes.filter(t => !t.exists),
      totalTypes: allTypes.length,
    };
  }, [eligibleMembers, upsetSections, rotationResult, selectedRotation, data.check_ins, capValue, completedRotations, grants]);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    try {
      const count = await importJSON(file);
      setImportSuccess(`Imported ${count} grant${count !== 1 ? 's' : ''}`);
    } catch (err) {
      setImportError(err.message);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">🎁 Bonus Gap Finder v2</h2>
          <p className="text-sm text-gray-500 mt-1">Improved: unblock grace period, combine rotations for faster bonus grants</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportJSON} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">⬇ Export JSON</button>
          <button onClick={() => importRef.current?.click()} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">⬆ Import JSON</button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          {importSuccess && <span className="text-xs text-emerald-400">{importSuccess}</span>}
          {importError && <span className="text-xs text-red-400">{importError}</span>}
        </div>
      </div>

      {/* Rotation selector */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Select Rotation</div>
          {selectedRotNums.size > 1 && (
            <span className="text-xs text-sky-400 font-semibold">
              {selectedRotNums.size} rotations selected — combining bonuses
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mb-3">Tap to toggle — select two or more to combine their bonuses into a single grant pass.</p>
        <div className="flex flex-wrap gap-2">
          {ROTATIONS.map(r => {
            const s = getRotationStatus(r);
            const selectable = s === 'closed' || s === 'grace';
            const active = selectedRotNums.has(r.num);
            return (
              <button
                key={r.num}
                disabled={!selectable}
                onClick={() => {
                  if (!selectable) return;
                  setSelectedRotNums(prev => {
                    const next = new Set(prev);
                    if (next.has(r.num)) next.delete(r.num);
                    else next.add(r.num);
                    if (next.size === 0) next.add(r.num);
                    return next;
                  });
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex flex-col items-start gap-1 ${
                  active ? 'bg-orange-500 text-white'
                    : selectable ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    : 'bg-gray-900 text-gray-700 cursor-not-allowed opacity-50'
                }`}
              >
                <span>{r.label}</span>
                {!active && <StatusBadge status={s} />}
              </button>
            );
          })}
        </div>
      </div>

      {status === 'future' && (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-lg">This rotation has not started yet.</p>
        </div>
      )}
      {status === 'ongoing' && (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔄</div>
          <p className="text-amber-400 font-semibold text-lg">Rotation still in progress</p>
          <p className="text-sm text-gray-500 mt-1">Come back once the rotation ends and the grace period closes.</p>
        </div>
      )}

      {(computable && selectedRotation) || mergedRotationData ? (
        <>
          {status === 'grace' && selectedRotation && (
            <div className="text-xs text-sky-300/80 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
              ⏰ This rotation is still in its grace period — players may submit late check-ins until Sunday, so totals could shift slightly.
            </div>
          )}

          {/* Single-rotation view */}
          {selectedRotationList.length === 1 && (
            <>
              {!rotationResult ? (
                <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
                  Featured team not found in data.
                </div>
              ) : (rotationResult.victories === 0 && upsetSections.length === 0) ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
              <div className="text-4xl mb-3">🤷</div>
              <p>{rotationResult.featuredTeamName} neither won nor lost any matchups — no bonus to grant.</p>
            </div>
          ) : (
            <>
              {rotationResult.victories > 0 ? (
                <div className="bg-gray-900 rounded-2xl p-5 flex flex-wrap items-center gap-6">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Featured team</div>
                    <div className="text-lg font-bold text-white">{rotationResult.featuredTeamName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bonus per player</div>
                    <div className="text-lg font-bold text-orange-400">
                      {rotationResult.victories} victories × 10 = <span className="text-white">{rotationResult.bonusPtsPerPlayer} pts</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Eligible players</div>
                    <div className="text-lg font-bold text-white">{eligibleMembers.length}</div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-2xl p-5 border border-sky-500/20">
                  <div className="text-lg font-bold text-white mb-1">
                    🤷 {rotationResult.featuredTeamName} was upset by every opponent
                  </div>
                  <p className="text-sm text-gray-400">
                    No featured-team bonus this rotation — but the upset winners below each earn <span className="text-sky-400 font-semibold">+10</span>.
                  </p>
                </div>
              )}

              {/* Bonus Activity Types Summary - Collapsible */}
              <button
                onClick={() => setSummaryOpen(!summaryOpen)}
                className="w-full bg-blue-950/30 border border-blue-500/20 rounded-2xl p-5 text-left hover:bg-blue-950/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{summaryOpen ? '▼' : '▶'}</span>
                  <span className="text-lg">⚙️</span>
                  <h3 className="text-sm font-bold text-blue-300">Bonus Activity Types</h3>
                  <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-semibold ml-auto">
                    {activityTypesSummary.needsCreation.length} to create · {activityTypesSummary.created.length} ready
                  </span>
                </div>
              </button>

              {summaryOpen && (
                <div className="bg-blue-950/30 border border-blue-500/20 border-t-0 rounded-b-2xl p-5 space-y-4">
                  {activityTypesSummary.totalTypes === 0 ? (
                    <p className="text-xs text-gray-500">No eligible players found.</p>
                  ) : (
                    <>
                      {/* Already Created - Can Reuse */}
                      {activityTypesSummary.created.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                            ✅ Already Exists — Ready to Reuse
                          </div>
                          <div className="space-y-2">
                            {activityTypesSummary.created.map((type) => (
                              <div key={type.displayValue} className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="font-bold text-emerald-300 text-sm">
                                      {type.displayValue} pts
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      Used by {type.playerCount} player{type.playerCount !== 1 ? 's' : ''}: {type.players.join(', ')}
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-2xl">✓</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Needs Creation */}
                      {activityTypesSummary.needsCreation.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                            ⚠️ Need to Create in GymRats
                          </div>
                          <div className="space-y-2">
                            {activityTypesSummary.needsCreation.map((type) => (
                              <div key={type.displayValue} className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="font-bold text-amber-300 text-sm">
                                      {type.displayValue} pts
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      Used by {type.playerCount} player{type.playerCount !== 1 ? 's' : ''}: {type.players.join(', ')}
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <input type="checkbox" className="w-4 h-4 cursor-pointer" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-200">
                    💡 Create the amber-marked activities in GymRats before rewarding players. The green ones can be reused from previous rotations.
                  </div>
                </div>
              )}

              {rotationResult.victories > 0 && (
                <div className="space-y-3">
                  {eligibleMembers.map(({ member, currentTotalPoints }) => (
                    <PlayerGapCard
                      key={member.id}
                      member={member}
                      data={data}
                      rotEntry={{ rotation: selectedRotation, ...rotationResult }}
                      capValue={capValue}
                      currentTotalPoints={currentTotalPoints}
                      completedRotations={completedRotations}
                    />
                  ))}
                </div>
              )}

              {upsetSections.map(section => (
                <div key={section.teamId} className="space-y-3">
                  <div className="bg-gray-900 rounded-2xl p-5 flex flex-wrap items-center gap-6 border border-sky-500/20">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Upset winner</div>
                      <div className="text-lg font-bold text-white">{section.teamName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bonus per player</div>
                      <div className="text-lg font-bold text-sky-400">
                        1 upset win × 10 = <span className="text-white">{section.bonusPtsPerPlayer} pts</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Eligible players</div>
                      <div className="text-lg font-bold text-white">{section.members.length}</div>
                    </div>
                  </div>
                  {section.members.map(({ member, currentTotalPoints }) => (
                    <PlayerGapCard
                      key={member.id}
                      member={member}
                      data={data}
                      rotEntry={{ rotation: selectedRotation, ...section }}
                      capValue={capValue}
                      currentTotalPoints={currentTotalPoints}
                      completedRotations={completedRotations}
                    />
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Multi-rotation combined view */}
          {selectedRotationList.length >= 2 && mergedRotationData && (
            <>
              {eligibleMembers.length === 0 ? (
                <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
                  <div className="text-4xl mb-3">🤷</div>
                  <p>No player is owed a bonus across the selected rotations.</p>
                </div>
              ) : (
                <>
                  <div className="bg-gray-900 rounded-2xl p-5 flex flex-wrap items-center gap-6">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rotations</div>
                      <div className="text-lg font-bold text-white">{selectedRotationList.map(r => r.label).join(' + ')}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Eligible players</div>
                      <div className="text-lg font-bold text-white">{eligibleMembers.length}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {eligibleMembers.map(({ member, currentTotalPoints, owedEntry }) => {
                      const rotationKey = selectedRotationList.map(r => r.num).join('+');
                      return (
                        <PlayerGapCard
                          key={member.id}
                          member={member}
                          data={data}
                          rotEntry={{
                            rotation: { num: rotationKey },
                            bonusPtsPerPlayer: owedEntry.total,
                          }}
                          capValue={capValue}
                          currentTotalPoints={currentTotalPoints}
                          completedRotations={completedRotations}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
