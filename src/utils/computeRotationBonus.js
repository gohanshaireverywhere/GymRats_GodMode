import { getLocalDay, sumPointsWithCap, restoreOriginalPoints } from './dataProcessor';
import { CLASSIFICATION_START, CLASSIFICATION_END } from '../data/rotations';

const CLASSIFICATION_START_MS = new Date(CLASSIFICATION_START).getTime();
const CLASSIFICATION_END_MS = new Date(CLASSIFICATION_END).getTime();

function findFeaturedTeam(teams, keyword) {
  return teams.find(t => t.name.trim().toLowerCase().includes(keyword.toLowerCase()));
}

function teamScore(team, periodCheckIns, dailyCap) {
  const memberIdSet = new Set(team.team_members.map(tm => tm.account_id));
  const byMember = {};
  for (const id of memberIdSet) byMember[id] = [];
  for (const ci of periodCheckIns) {
    if (byMember[ci.account_id] !== undefined) byMember[ci.account_id].push(ci);
  }
  return Object.values(byMember).reduce(
    (sum, cis) => sum + sumPointsWithCap(cis, dailyCap),
    0
  );
}

/**
 * Compute results for one rotation (victories, eligible players, bonus pts).
 *
 * Accepts `grants` so that any check-ins modified for bonus purposes have their
 * original points restored before scoring — prevents bonus edits inside a rotation
 * window from corrupting that rotation's matchup results.
 */
export function computeRotationResults(data, rotation, dailyCap, grants = []) {
  const allTeams = data.teams.filter(t => !t.name.toLowerCase().includes('reserve'));
  const featuredTeam = findFeaturedTeam(allTeams, rotation.featuredTeam);
  if (!featuredTeam) return null;

  const startMs = new Date(rotation.start).getTime();
  const endMs = new Date(rotation.end).getTime();

  // Restore original points before scoring so bonus edits don't skew results
  const restoredCheckIns = restoreOriginalPoints(data.check_ins, grants);

  const periodCheckIns = restoredCheckIns.filter(ci => {
    const t = new Date(ci.occurred_at).getTime();
    return t >= startMs && t <= endMs;
  });

  const featuredScore = teamScore(featuredTeam, periodCheckIns, dailyCap);
  const otherTeams = allTeams.filter(t => t.id !== featuredTeam.id);
  const otherScores = otherTeams.map(t => ({ team: t, score: teamScore(t, periodCheckIns, dailyCap) }));
  const victories = otherScores.filter(({ score }) => featuredScore > score).length;

  const featuredMemberIds = new Set(featuredTeam.team_members.map(tm => tm.account_id));
  const activeInRotation = new Set(
    periodCheckIns.filter(ci => featuredMemberIds.has(ci.account_id)).map(ci => ci.account_id)
  );

  const upsets = otherScores
    .filter(({ score }) => score > featuredScore)
    .map(({ team }) => {
      const memberIdSet = new Set(team.team_members.map(tm => tm.account_id));
      const activeUpsetIds = new Set(
        periodCheckIns.filter(ci => memberIdSet.has(ci.account_id)).map(ci => ci.account_id)
      );
      return {
        teamId: team.id,
        teamName: team.name,
        bonusPtsPerPlayer: 10,
        eligiblePlayerIds: activeUpsetIds,
      };
    });

  return {
    featuredTeamId: featuredTeam.id,
    featuredTeamName: featuredTeam.name,
    victories,
    bonusPtsPerPlayer: victories * 10,
    eligiblePlayerIds: activeInRotation,
    upsets,
  };
}

/**
 * Aggregate the total bonus each player is OWED across a set of rotations
 * (cumulative). Owed bonus comes from two sources per rotation:
 *   - featured team wins: `victories * 10` for each active featured-team player
 *   - upsets: a flat +10 for each active player on a team that beat the featured team
 * A player is on exactly one team per rotation, so the two sources never overlap.
 *
 * Pass only completed rotations if you want "owed so far". `grants` is forwarded
 * to computeRotationResults so bonus-inflated check-ins are restored before scoring.
 *
 * @returns Map<playerId, { total, byRotation: [{ num, label, expected, kind, teamName }] }>
 */
export function computeExpectedBonusByPlayer(data, rotations, dailyCap, grants = []) {
  const byPlayer = new Map();
  const ensure = (id) => {
    if (!byPlayer.has(id)) byPlayer.set(id, { total: 0, byRotation: [] });
    return byPlayer.get(id);
  };

  for (const rotation of rotations) {
    const res = computeRotationResults(data, rotation, dailyCap, grants);
    if (!res) continue;

    // Featured-team winners
    if (res.bonusPtsPerPlayer > 0) {
      for (const id of res.eligiblePlayerIds) {
        const entry = ensure(id);
        entry.total += res.bonusPtsPerPlayer;
        entry.byRotation.push({
          num: rotation.num,
          label: rotation.label,
          expected: res.bonusPtsPerPlayer,
          kind: 'featured',
          teamName: res.featuredTeamName,
        });
      }
    }

    // Upset winners
    for (const upset of res.upsets) {
      for (const id of upset.eligiblePlayerIds) {
        const entry = ensure(id);
        entry.total += upset.bonusPtsPerPlayer;
        entry.byRotation.push({
          num: rotation.num,
          label: rotation.label,
          expected: upset.bonusPtsPerPlayer,
          kind: 'upset',
          teamName: upset.teamName,
        });
      }
    }
  }

  return byPlayer;
}

// Build day-capacity infos from a set of check-ins filtered to a date window.
function buildDayInfos(checkIns, windowStartMs, windowEndMs, capValue) {
  const byDay = {};
  for (const ci of checkIns) {
    const t = new Date(ci.occurred_at).getTime();
    if (t < windowStartMs || t > windowEndMs) continue;
    const day = getLocalDay(ci.occurred_at, ci.timezone);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(ci);
  }

  return Object.entries(byDay).map(([day, cis]) => {
    const rawDayTotal = cis.reduce((s, ci) => s + (ci.points || 0), 0);
    const cappedDayTotal = Math.min(capValue, rawDayTotal);
    const dayCapacity = capValue - cappedDayTotal;
    const intCapacity = Math.floor(dayCapacity);
    const sorted = [...cis].sort((a, b) => (a.points || 0) - (b.points || 0));
    const checkIn = sorted[0];
    const otherCis = sorted.slice(1);
    return { day, rawDayTotal, cappedDayTotal, dayCapacity, intCapacity, checkIn, otherCis };
  });
}

// Run greedy allocation over a set of day infos for a given remaining bonus.
// Returns { picks, remaining } where picks are recommendation objects.
function greedyAllocate(dayInfos, remaining, capValue, memberId, rotationNum, source) {
  const sorted = [...dayInfos].sort((a, b) => b.intCapacity - a.intCapacity);
  const picks = [];

  for (const info of sorted) {
    if (info.intCapacity <= 0 || remaining <= 0.000001) continue;

    const fullCapActualGain = info.dayCapacity;

    if (remaining <= fullCapActualGain + 0.000001) {
      const exactPts = info.cappedDayTotal + remaining - info.rawDayTotal + (info.checkIn.points || 0);
      const newActivityPts = Math.round(exactPts * 100) / 100;
      const actualGain = Math.round((newActivityPts - (info.checkIn.points || 0)) * 100) / 100;
      picks.push({
        ...info,
        grantId: `${memberId}-rot${rotationNum}-${info.day}`,
        newActivityPts,
        netGrant: actualGain,
        isLastDay: true,
        source,
      });
      remaining = 0;
      break;
    } else {
      const actualGain = fullCapActualGain;
      picks.push({
        ...info,
        grantId: `${memberId}-rot${rotationNum}-${info.day}`,
        newActivityPts: capValue,
        netGrant: parseFloat(actualGain.toFixed(4)),
        isLastDay: false,
        source,
      });
      remaining -= actualGain;
    }
  }

  return { picks, remaining };
}

/**
 * Find existing check-ins that can be replaced to inject bonus points.
 *
 * Phase 1: classification phase (Apr 30 – May 28) — always tried first.
 * Phase 2: if shortfall remains, fall back to past completed rotation windows
 *   oldest-first (passed as `completedRotations`).
 *
 * Each recommendation has a `source` field:
 *   { type: 'classification' }
 *   { type: 'rotation', rotationNum: N, rotationLabel: 'Rotation N', start, end }
 *
 * Returns an array sorted by date asc with a `.shortfall` property.
 *
 * Only pass check-ins on days that are still available (callers exclude days that
 * already carry a confirmed bonus grant), and pass the still-owed `bonusTotal`
 * (owed − already granted). This keeps recommendations stable across re-exports:
 * once a day is granted, it drops out of the candidate pool instead of being
 * re-derived and re-recommended.
 */
export function findGaps(
  playerCheckIns, memberId, rotationNum, bonusTotal, capValue,
  completedRotations = []
) {
  if (!capValue || capValue <= 0 || bonusTotal <= 0) return [];

  let remaining = bonusTotal;
  const selected = [];

  // Phase 1: classification phase
  const classSource = { type: 'classification' };
  const classDayInfos = buildDayInfos(
    playerCheckIns, CLASSIFICATION_START_MS, CLASSIFICATION_END_MS, capValue
  );
  if (classDayInfos.length > 0) {
    const { picks, remaining: rem } = greedyAllocate(
      classDayInfos, remaining, capValue, memberId, rotationNum, classSource
    );
    selected.push(...picks);
    remaining = rem;
  }

  // Phase 2: fallback to completed rotation windows (oldest first)
  if (remaining > 0.000001 && completedRotations.length > 0) {
    const sortedRotations = [...completedRotations].sort((a, b) => a.num - b.num);
    for (const rot of sortedRotations) {
      if (remaining <= 0.000001) break;
      const rotStartMs = new Date(rot.start).getTime();
      const rotEndMs = new Date(rot.end).getTime();
      const rotSource = {
        type: 'rotation',
        rotationNum: rot.num,
        rotationLabel: rot.label,
        start: rot.start,
        end: rot.end,
      };
      const rotDayInfos = buildDayInfos(playerCheckIns, rotStartMs, rotEndMs, capValue);
      if (rotDayInfos.length === 0) continue;
      const { picks, remaining: rem } = greedyAllocate(
        rotDayInfos, remaining, capValue, memberId, rotationNum, rotSource
      );
      selected.push(...picks);
      remaining = rem;
    }
  }

  // Sort by date ascending for display
  selected.sort((a, b) => a.day.localeCompare(b.day));

  // Attach cumulative totals
  let cumulative = 0;
  for (const rec of selected) {
    cumulative += rec.netGrant;
    rec.cumulativeAfter = cumulative;
  }

  selected.shortfall = remaining > 0.001 ? parseFloat(remaining.toFixed(4)) : 0;
  return selected;
}
