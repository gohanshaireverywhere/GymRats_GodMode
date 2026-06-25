import { useState, useMemo, useRef } from 'react';
import { ROTATIONS } from '../data/rotations';
import { computeRotationResults, findGaps } from '../utils/computeRotationBonus';
import { useBonusGrants } from '../context/BonusGrantsContext';
import { useSettings } from '../context/SettingsContext';
import { formatPoints } from '../utils/dataProcessor';

function formatDate(isoStr) {
  return new Date(isoStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function BonusGapFinder({ member, data, currentTotalPoints }) {
  const { settings } = useSettings();
  const { isGranted, getGrantForCheckIn, getGrantsForPlayer, addGrant, removeGrant, exportJSON, importJSON } = useBonusGrants();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRotNum, setSelectedRotNum] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const importRef = useRef(null);

  const capValue = settings.dailyPointsCap?.enabled ? parseFloat(settings.dailyPointsCap.value) : 30;

  // Player's team
  const playerTeam = useMemo(() =>
    data.teams.find(t => t.team_members.some(tm => tm.account_id === member.id)),
    [data.teams, member.id]
  );

  // Skip Reserve Bench players
  const isReserve = playerTeam?.name?.toLowerCase().includes('reserve');

  // Compute results for every completed rotation
  const completedRotations = useMemo(() => {
    if (!playerTeam || isReserve) return [];
    const now = new Date();
    return ROTATIONS
      .filter(r => now > new Date(r.end))
      .map(r => {
        const result = computeRotationResults(data, r, settings.dailyPointsCap);
        return result ? { rotation: r, ...result } : null;
      })
      .filter(Boolean);
  }, [data, playerTeam, isReserve, settings.dailyPointsCap]);

  // Rotations where this player's team was featured AND won at least one matchup
  const eligibleRotations = useMemo(() =>
    completedRotations.filter(r =>
      r.featuredTeamId === playerTeam?.id &&
      r.victories > 0 &&
      r.eligiblePlayerIds.has(member.id)
    ),
    [completedRotations, playerTeam, member.id]
  );

  const selectedEntry = eligibleRotations.find(r => r.rotation.num === selectedRotNum)
    ?? eligibleRotations[0];

  // Auto-select the first eligible rotation when first opened
  const effectiveEntry = selectedEntry ?? null;

  // Grants already confirmed for this player
  const playerGrants = useMemo(() =>
    getGrantsForPlayer(member.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member.id, isGranted]
  );

  const grantsForRotation = (rotNum) =>
    playerGrants.filter(g => g.rotation === rotNum);

  const grantedPtsForRotation = (rotNum) =>
    grantsForRotation(rotNum).reduce((s, g) => s + (g.grantAmount || 0), 0);

  // Gap analysis
  const gapRecommendations = useMemo(() => {
    if (!effectiveEntry) return [];
    const alreadyGranted = grantedPtsForRotation(effectiveEntry.rotation.num);
    const remaining = Math.max(0, effectiveEntry.bonusPtsPerPlayer - alreadyGranted);
    if (remaining <= 0) return [];
    const playerCheckIns = data.check_ins.filter(ci => ci.account_id === member.id);
    return findGaps(
      playerCheckIns,
      member.id,
      effectiveEntry.rotation.num,
      remaining,
      capValue,
      completedRotations.map(r => r.rotation)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEntry, data.check_ins, member.id, capValue, playerGrants.length, completedRotations]);

  const handleMarkGranted = (rec, rotEntry) => {
    const ci = rec.checkIn;
    addGrant({
      grantId: rec.grantId,
      playerId: member.id,
      playerName: member.full_name,
      rotation: rotEntry.rotation.num,
      date: rec.day,
      grantAmount: rec.netGrant,
      newActivityPts: rec.newActivityPts,
      original: {
        checkInId: ci.id,
        title: ci.title || null,
        activityType: ci.check_in_activities?.[0]?.platform_activity || null,
        occurredAt: ci.occurred_at,
        points: ci.points || 0,
        durationMillis: ci.duration_millis || null,
        distanceMiles: ci.distance_miles ? parseFloat(ci.distance_miles) : null,
        calories: ci.calories || null,
        steps: ci.steps || null,
      },
    });
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    try {
      const count = await importJSON(file);
      setImportSuccess(`Imported ${count} grant${count !== 1 ? 's' : ''} successfully`);
    } catch (err) {
      setImportError(err.message);
    }
    e.target.value = '';
  };

  if (isReserve || !playerTeam) return null;

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🎁</span>
          <span className="text-sm font-semibold text-gray-200">Bonus Gap Finder</span>
          {eligibleRotations.length > 0 && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
              {eligibleRotations.length} rotation{eligibleRotations.length !== 1 ? 's' : ''} with bonus
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-800">

          {/* No eligible rotations */}
          {eligibleRotations.length === 0 && (
            <div className="pt-4 text-center text-gray-600 text-sm py-6">
              <div className="text-3xl mb-2">🏅</div>
              {completedRotations.length === 0
                ? 'No rotations have completed yet.'
                : `${playerTeam.name} has not won any featured rotation matchups yet, or this player was not active during those rotations.`}
            </div>
          )}

          {/* Rotation selector */}
          {eligibleRotations.length > 1 && (
            <div className="pt-4">
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Rotation</label>
              <div className="flex flex-wrap gap-2">
                {eligibleRotations.map(r => (
                  <button
                    key={r.rotation.num}
                    onClick={() => setSelectedRotNum(r.rotation.num)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      (effectiveEntry?.rotation.num === r.rotation.num)
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {r.rotation.label} — {r.featuredTeamName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {effectiveEntry && (() => {
            const rotNum = effectiveEntry.rotation.num;
            const bonusOwed = effectiveEntry.bonusPtsPerPlayer;
            const grantedSoFar = grantedPtsForRotation(rotNum);
            const remaining = Math.max(0, bonusOwed - grantedSoFar);
            const done = remaining <= 0;
            const projectedTotal = (currentTotalPoints ?? 0) + bonusOwed;

            return (
              <div className="space-y-4">
                {/* Summary card */}
                <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
                  {eligibleRotations.length === 1 && (
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      {effectiveEntry.rotation.label} — {effectiveEntry.featuredTeamName}
                    </div>
                  )}

                  {/* Additive breakdown: current + bonus = target */}
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-gray-400 font-semibold">{formatPoints(currentTotalPoints ?? 0)} pts</span>
                    <span className="text-gray-600">current total</span>
                    <span className="text-gray-600">+</span>
                    <span className="text-orange-400 font-bold">{formatPoints(bonusOwed)} pts bonus</span>
                    <span className="text-gray-600">({effectiveEntry.victories} victories × 10)</span>
                    <span className="text-gray-600">=</span>
                    <span className="text-emerald-400 font-bold">{formatPoints(projectedTotal)} pts</span>
                    <span className="text-gray-600">projected total</span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-gray-500">Bonus granted so far</span>
                      <span className={`font-semibold ${done ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {done ? '✅ Complete' : `${formatPoints(grantedSoFar)} / ${formatPoints(bonusOwed)} pts`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, bonusOwed > 0 ? (grantedSoFar / bonusOwed) * 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Already granted list */}
                {grantsForRotation(rotNum).length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Already confirmed</div>
                    <div className="space-y-1.5">
                      {grantsForRotation(rotNum).map(g => (
                        <div key={g.checkInId} className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-xs font-semibold text-emerald-400">✅ +{formatPoints(g.bonusPtsGranted)} pts added</span>
                            <span className="text-xs text-gray-500 ml-2">{formatDateTime(g.occurredAt)} · {g.originalActivity}</span>
                          </div>
                          <button
                            onClick={() => removeGrant(g.checkInId)}
                            className="text-xs text-gray-600 hover:text-red-400 transition-colors ml-2"
                            title="Undo this grant"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {!done && gapRecommendations.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Recommended replacements</div>
                    <p className="text-xs text-gray-600 mb-3">
                      Replace each activity in GymRats with a custom &quot;Bonus&quot; activity using the exact points shown.
                      The <span className="text-emerald-400 font-semibold">net addition</span> to the player&apos;s total is shown in green — this accounts for their existing points that day so the bonus lands exactly on target.
                    </p>
                    <div className="space-y-2">
                      {gapRecommendations.map((rec) => {
                        const alreadyGranted = isGranted(rec.checkIn.id);
                        const grant = getGrantForCheckIn(rec.checkIn.id);
                        const activity = rec.checkIn.check_in_activities?.[0]?.platform_activity;
                        const title = rec.checkIn.title || activity || 'Workout';
                        const originalPts = rec.checkIn.points || 0;
                        return (
                          <div
                            key={rec.checkIn.id}
                            className={`rounded-xl border p-3 ${alreadyGranted ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-700 bg-gray-800/40'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-gray-200 truncate">{title}</span>
                                  <span className="text-xs text-gray-600">{formatDateTime(rec.checkIn.occurred_at)}</span>
                                </div>
                                {/* The math: original pts → exact bonus activity → net addition */}
                                <div className="flex items-center gap-1.5 mt-2 text-xs flex-wrap">
                                  <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{formatPoints(originalPts)} pts</span>
                                  <span className="text-gray-600">→</span>
                                  <span className={`px-1.5 py-0.5 rounded font-semibold ${rec.isLastDay ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700 text-gray-300'}`}>
                                    Bonus {formatPoints(rec.newActivityPts)} pts
                                    {rec.isLastDay && ' ← exact value'}
                                  </span>
                                  <span className="text-gray-600">day used: {formatPoints(rec.rawDayTotal)} / {capValue} pts</span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-base font-bold text-emerald-400">+{formatPoints(rec.netGrant)}</div>
                                <div className="text-xs text-gray-600">net added to total</div>
                              </div>
                            </div>
                            <div className="mt-2.5">
                              {alreadyGranted ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-emerald-400 font-semibold">✅ +{formatPoints(grant?.bonusPtsGranted)} pts confirmed</span>
                                  <button
                                    onClick={() => removeGrant(rec.checkIn.id)}
                                    className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                                  >
                                    Undo
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleMarkGranted(rec, effectiveEntry)}
                                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                                >
                                  ✅ Mark as Granted in GymRats
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Shortfall warning */}
                {!done && gapRecommendations.shortfall > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
                    ⚠️ Only {gapRecommendations.length} day{gapRecommendations.length !== 1 ? 's' : ''} found in the classification phase.
                    {' '}<span className="font-semibold">{formatPoints(gapRecommendations.shortfall)} pts</span> cannot be spread automatically — the player may not have had enough check-ins during Apr 30 – May 8.
                  </div>
                )}

                {done && gapRecommendations.length === 0 && (
                  <div className="text-center py-4 text-emerald-400 text-sm font-semibold">
                    🎉 All {formatPoints(bonusOwed)} pts have been granted for this rotation!
                  </div>
                )}
              </div>
            );
          })()}

          {/* Export / Import */}
          <div className="border-t border-gray-800 pt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600 mr-1">Bonus database:</span>
            <button
              onClick={exportJSON}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              ⬇ Export JSON
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              ⬆ Import JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            {importSuccess && <span className="text-xs text-emerald-400">{importSuccess}</span>}
            {importError && <span className="text-xs text-red-400">{importError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
