// Returns the local calendar date (YYYY-MM-DD) for a UTC ISO string in the given
// IANA timezone. GymRats caps per local day, not per UTC day, so a check-in logged
// at 23:53 UTC in Europe/Berlin (01:53 next day local) counts toward the next day's cap.
export function getLocalDay(isoStr, timezone) {
  if (!timezone) return isoStr.slice(0, 10);
  try {
    // 'sv' locale formats as YYYY-MM-DD — the most reliable cross-env way to get
    // an ISO local date string without manual padding.
    return new Date(isoStr).toLocaleDateString('sv', { timeZone: timezone });
  } catch {
    return isoStr.slice(0, 10);
  }
}

// Returns a new check-ins array where any check-in that was modified for a bonus
// grant has its points restored to the original pre-edit value. Use this before
// any Battle Royale rotation-period scoring so bonus edits don't corrupt results.
// The leaderboard and player profile intentionally skip this — they show modified pts.
export function restoreOriginalPoints(checkIns, grants) {
  if (!grants?.length) return checkIns;
  const map = new Map(
    grants
      .filter(g => g.original?.checkInId != null)
      .map(g => [g.original.checkInId, g.original.points])
  );
  if (!map.size) return checkIns;
  return checkIns.map(ci =>
    map.has(ci.id) ? { ...ci, points: map.get(ci.id) } : ci
  );
}

// Sum check-in points for one player, optionally applying the GymRats daily cap
// (per-day raw sum clamped to capValue). Pass dailyCap = null/undefined for the
// uncapped total. Use this anywhere you'd otherwise do a raw sum of `ci.points`
// — keeps every tab consistent with what the GymRats app shows.
export function sumPointsWithCap(checkIns, dailyCap) {
  if (!dailyCap?.enabled || !(parseFloat(dailyCap.value) > 0)) {
    let total = 0;
    for (const ci of checkIns) total += ci.points || 0;
    return total;
  }
  const cap = parseFloat(dailyCap.value);
  const byDay = {};
  for (const ci of checkIns) {
    const day = getLocalDay(ci.occurred_at, ci.timezone);
    byDay[day] = (byDay[day] || 0) + (ci.points || 0);
  }
  let total = 0;
  for (const v of Object.values(byDay)) total += Math.min(cap, v);
  return total;
}

// Apply GymRats' daily points cap (BR uses 30/day). Per-player per-day:
// sum raw check-in points for the day, clamp to capValue, then resum across days.
// Other stats (calories/distance/duration/steps/check-in count) are not capped
// — only the points totals are.
function applyDailyCap(memberStats, capValue) {
  if (!(capValue > 0)) return;
  for (const s of Object.values(memberStats)) {
    const dayTotals = {};
    for (const ci of s.checkIns) {
      const day = getLocalDay(ci.occurred_at, ci.timezone);
      dayTotals[day] = (dayTotals[day] || 0) + (ci.points || 0);
    }
    let capped = 0;
    for (const v of Object.values(dayTotals)) capped += Math.min(capValue, v);
    s.totalPoints = capped;
  }
}

export function processChallenge(data, { dailyCap } = {}) {
  const memberMap = {};
  for (const member of data.members) {
    memberMap[member.id] = member;
  }

  const memberStats = {};
  for (const checkIn of data.check_ins) {
    const { account_id, points, calories, distance_miles, duration_millis, steps } = checkIn;
    if (!memberStats[account_id]) {
      memberStats[account_id] = {
        member: memberMap[account_id] || { id: account_id, full_name: 'Unknown', profile_picture_url: null },
        totalPoints: 0,
        checkInCount: 0,
        totalCalories: 0,
        totalDistance: 0,
        totalDurationMs: 0,
        totalSteps: 0,
        checkIns: [],
      };
    }
    const s = memberStats[account_id];
    s.totalPoints += points || 0;
    s.checkInCount += 1;
    s.totalCalories += calories || 0;
    s.totalDistance += parseFloat(distance_miles || 0);
    s.totalDurationMs += duration_millis || 0;
    s.totalSteps += steps || 0;
    s.checkIns.push(checkIn);
  }

  if (dailyCap?.enabled) applyDailyCap(memberStats, parseFloat(dailyCap.value));

  const leaderboard = Object.values(memberStats)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  return { memberMap, leaderboard, memberStats };
}

export function getTeamStandings(data, memberStats) {
  const standings = data.teams.map(team => {
    let totalPoints = 0;
    const members = [];
    for (const tm of team.team_members) {
      const stats = memberStats[tm.account_id];
      if (stats) {
        totalPoints += stats.totalPoints;
        members.push(stats);
      }
    }
    return {
      team,
      totalPoints,
      memberCount: team.team_members.length,
      avgPoints: members.length ? totalPoints / members.length : 0,
      members: members.sort((a, b) => b.totalPoints - a.totalPoints),
    };
  });

  return standings.sort((a, b) => b.totalPoints - a.totalPoints).map((s, i) => ({ ...s, rank: i + 1 }));
}

export function getTimelineData(data, players) {
  if (!players.length) return [];

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Pre-sort each player's check-ins by occurred_at
  const playerCheckIns = {};
  for (const player of players) {
    playerCheckIns[player.member.id] = [...player.checkIns].sort(
      (a, b) => new Date(a.occurred_at) - new Date(b.occurred_at)
    );
  }

  // Build cumulative points per day using a running sum per player
  const runningTotals = {};
  for (const player of players) {
    runningTotals[player.member.id] = 0;
  }

  const playerCursorIndex = {};
  for (const player of players) {
    playerCursorIndex[player.member.id] = 0;
  }

  return days.map(dateStr => {
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
    const point = { date: dateStr };

    for (const player of players) {
      const pid = player.member.id;
      const checkIns = playerCheckIns[pid];
      let idx = playerCursorIndex[pid];
      while (idx < checkIns.length && new Date(checkIns[idx].occurred_at) <= dayEnd) {
        runningTotals[pid] += checkIns[idx].points || 0;
        idx++;
      }
      playerCursorIndex[pid] = idx;
      point[player.member.full_name] = parseFloat(runningTotals[pid].toFixed(2));
    }

    return point;
  });
}

export function getTeamTimelineData(data, teamStandings) {
  if (!teamStandings.length) return [];

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  const teamCheckIns = {};
  const runningTotals = {};
  const pointers = {};

  for (const ts of teamStandings) {
    const memberIds = new Set(ts.team.team_members.map(tm => tm.account_id));
    teamCheckIns[ts.team.id] = data.check_ins
      .filter(ci => memberIds.has(ci.account_id))
      .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    runningTotals[ts.team.id] = 0;
    pointers[ts.team.id] = 0;
  }

  return days.map(dateStr => {
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
    const point = { date: dateStr };
    for (const ts of teamStandings) {
      const cis = teamCheckIns[ts.team.id];
      let idx = pointers[ts.team.id];
      while (idx < cis.length && new Date(cis[idx].occurred_at) <= dayEnd) {
        runningTotals[ts.team.id] += cis[idx].points || 0;
        idx++;
      }
      pointers[ts.team.id] = idx;
      point[ts.team.name] = parseFloat(runningTotals[ts.team.id].toFixed(2));
    }
    return point;
  });
}

export function getDailyPointsData(data, players) {
  if (!players.length) return [];

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  const byDatePlayer = {};
  for (const player of players) {
    for (const ci of player.checkIns) {
      const dateStr = ci.occurred_at.slice(0, 10);
      if (!byDatePlayer[dateStr]) byDatePlayer[dateStr] = {};
      const id = player.member.id;
      byDatePlayer[dateStr][id] = (byDatePlayer[dateStr][id] || 0) + (ci.points || 0);
    }
  }

  return days.map(dateStr => {
    const point = { date: dateStr };
    for (const player of players) {
      point[player.member.full_name] = parseFloat(
        (byDatePlayer[dateStr]?.[player.member.id] || 0).toFixed(2)
      );
    }
    return point;
  });
}

export function getTotalCumulativeData(data) {
  const allCheckIns = [...data.check_ins].sort(
    (a, b) => new Date(a.occurred_at) - new Date(b.occurred_at)
  );

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  let running = 0;
  let idx = 0;
  return days.map(dateStr => {
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
    while (idx < allCheckIns.length && new Date(allCheckIns[idx].occurred_at) <= dayEnd) {
      running += allCheckIns[idx].points || 0;
      idx++;
    }
    return { date: dateStr, Total: parseFloat(running.toFixed(2)) };
  });
}

export function getDailyBreakdown(data, memberMap) {
  const byDate = {};
  for (const ci of data.check_ins) {
    const dateStr = ci.occurred_at.slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = {};
    const id = ci.account_id;
    byDate[dateStr][id] = (byDate[dateStr][id] || 0) + (ci.points || 0);
  }

  const result = {};
  for (const [date, playerMap] of Object.entries(byDate)) {
    const scorers = Object.entries(playerMap)
      .map(([id, pts]) => ({
        id,
        pts: parseFloat(pts.toFixed(2)),
        member: memberMap[Number(id)] || memberMap[id] || { full_name: 'Unknown', profile_picture_url: null },
      }))
      .sort((a, b) => b.pts - a.pts);
    result[date] = {
      total: parseFloat(scorers.reduce((s, p) => s + p.pts, 0).toFixed(2)),
      topScorers: scorers,
    };
  }
  return result;
}

export function formatDuration(ms) {
  if (!ms) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatPoints(pts) {
  return pts.toFixed(1);
}

// The `distance_miles` field stores the distance value as logged by the source app —
// despite the field name, the unit is whatever the challenge is configured to use
// (the user declares this in Settings → Distance Unit). We do not auto-convert;
// we simply label the value with the user's chosen unit.
export function formatDistance(value, unit = 'mi') {
  const val = parseFloat(value) || 0;
  if (val === 0) return '—';
  return `${val.toFixed(1)} ${unit}`;
}

const METRIC_LABELS = {
  totalPoints: 'points',
  checkInCount: 'workouts',
  totalCalories: 'calories',
  totalDistance: 'distance',
};

export function getGoalProgress(entry, goal) {
  const target = parseFloat(goal?.target) || 0;
  if (!target) return { value: 0, target: 0, pct: 0, pctRaw: 0, achieved: false };

  // totalDistance is in the user's configured unit (same unit as the data) — no conversion.
  const value = entry[goal.metric] || 0;
  const pctRaw = (value / target) * 100;
  return {
    value,
    target,
    pct: Math.min(100, pctRaw),
    pctRaw,
    achieved: value >= target,
  };
}

export function formatGoalValue(value, metric, distanceUnit = 'mi') {
  switch (metric) {
    case 'totalPoints':
      return formatPoints(value);
    case 'checkInCount':
      return Math.round(value).toString();
    case 'totalCalories':
      return Math.round(value).toLocaleString();
    case 'totalDistance':
      return `${value.toFixed(1)} ${distanceUnit}`;
    default:
      return value.toFixed(1);
  }
}

export function getGoalLabel(goal, distanceUnit = 'mi') {
  if (goal?.label?.trim()) return goal.label.trim();
  const target = parseFloat(goal?.target) || 0;
  if (goal?.metric === 'totalDistance') {
    return `Reach ${target} ${distanceUnit}`;
  }
  return `Reach ${target} ${METRIC_LABELS[goal?.metric] || 'points'}`;
}

// ─── Rule-Changer Simulator helpers ─────────────────────────────────────────

export function getActivityType(ci) {
  return ci.check_in_activities?.[0]?.platform_activity || ci.activity_type || 'unknown';
}

// A single check-in can contain multiple sub-activities (e.g. treadmill + strength).
// Top-level `points`, `distance_miles`, etc. aggregate them. For analysis we usually
// want to work at the sub-activity level — return them, or a synthetic single sub
// derived from the check-in's own fields when no sub-activities are recorded.
export function getSubActivities(ci) {
  if (ci.check_in_activities && ci.check_in_activities.length > 0) {
    return ci.check_in_activities;
  }
  return [{
    id: null,
    platform_activity: ci.activity_type,
    points: ci.points,
    distance_miles: ci.distance_miles,
    duration_millis: ci.duration_millis,
    calories: ci.calories,
    steps: ci.steps,
  }];
}

export function getSubActivityType(sub, ci) {
  return sub.platform_activity || ci?.activity_type || 'unknown';
}

export function getMatchingSubs(ci, activityType) {
  return getSubActivities(ci).filter(s => getSubActivityType(s, ci) === activityType);
}

// Extract the value for a given basis in the requested unit.
// distanceUnit declares the unit of the raw `distance_miles` field (set in Settings).
// We never auto-convert distance — the value is already in distanceUnit. If the rule
// requests a different unit than distanceUnit, we convert at that boundary only.
function metricValue(ci, basis, unit, distanceUnit) {
  switch (basis) {
    case 'distance': {
      const raw = parseFloat(ci.distance_miles) || 0;
      if (unit === distanceUnit) return raw;
      if (distanceUnit === 'km' && unit === 'mi') return raw / 1.60934;
      if (distanceUnit === 'mi' && unit === 'km') return raw * 1.60934;
      return raw;
    }
    case 'duration': {
      const min = (ci.duration_millis || 0) / 60000;
      return unit === 'hour' ? min / 60 : min;
    }
    case 'calories': return ci.calories || 0;
    case 'steps': return ci.steps || 0;
    case 'flat': return 1;
    default: return 0;
  }
}

export function computeRulePoints(ci, rule, distanceUnit = 'mi') {
  if (!rule) return { points: 0, missingMetric: false };
  if (rule.basis === 'flat') {
    return { points: parseFloat(rule.pointsPer) || 0, missingMetric: false };
  }
  const value = metricValue(ci, rule.basis, rule.unit, distanceUnit);
  if (value <= 0) return { points: 0, missingMetric: true };
  const perUnits = parseFloat(rule.perUnits) || 1;
  const pointsPer = parseFloat(rule.pointsPer) || 0;
  return { points: (value / perUnits) * pointsPer, missingMetric: false };
}

// Display the raw metric value for a check-in in the rule's unit (e.g. "4.0 km", "75 min")
export function formatRuleMetric(ci, rule, distanceUnit = 'mi') {
  if (!rule || rule.basis === 'flat') return '—';
  const v = metricValue(ci, rule.basis, rule.unit, distanceUnit);
  if (v <= 0) return '—';
  switch (rule.basis) {
    case 'distance':
      return `${v.toFixed(2)} ${rule.unit}`;
    case 'duration':
      return rule.unit === 'hour' ? `${v.toFixed(2)} h` : `${Math.round(v)} min`;
    case 'calories':
      return `${Math.round(v).toLocaleString()} cal`;
    case 'steps':
      return `${Math.round(v).toLocaleString()} steps`;
    default:
      return '—';
  }
}

function medianSorted(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function inferCurrentRule(checkIns, distanceUnit = 'mi') {
  // For each basis, infer at its natural/preferred unit. Distance uses the user's
  // configured unit (matches the unit the rule is actually authored in).
  const inferBases = [
    { basis: 'distance', unit: distanceUnit },
    { basis: 'duration', unit: 'min' },
    { basis: 'calories', unit: null },
    { basis: 'steps', unit: null },
  ];

  // Pool of valid check-ins (positive points) — used to compute per-basis coverage.
  const validCheckIns = checkIns.filter(ci => (ci.points || 0) > 0);
  const totalValid = validCheckIns.length;

  const candidates = inferBases.map(({ basis, unit }) => {
    const ratios = [];
    for (const ci of validCheckIns) {
      const v = metricValue(ci, basis, unit, distanceUnit);
      if (v <= 0) continue;
      ratios.push((ci.points || 0) / v);
    }
    if (ratios.length < 3) return null;
    ratios.sort((a, b) => a - b);
    const median = medianSorted(ratios);
    if (!(median > 0)) return null;
    // MAD (median absolute deviation) — robust to outliers, unlike stddev.
    const absDevs = ratios.map(r => Math.abs(r - median)).sort((a, b) => a - b);
    const mad = medianSorted(absDevs);
    const spread = mad / median; // relative MAD, comparable to a CV
    return { basis, unit, median, spread, count: ratios.length };
  }).filter(Boolean);

  if (!candidates.length) return null;

  // Coverage filter: a candidate must cover at least half of the most-covered basis
  // (or 3 check-ins, whichever is greater). Stops a tiny n=3 inference from beating
  // a full-coverage n=10 one purely on having a tighter spread by accident.
  const maxCoverage = Math.max(...candidates.map(c => c.count));
  const minCoverage = Math.max(3, Math.floor(maxCoverage * 0.5));
  const eligible = candidates.filter(c => c.count >= minCoverage);
  const pool = eligible.length ? eligible : candidates;

  pool.sort((a, b) => a.spread - b.spread);
  const best = pool[0];
  // Express as "1 pt per N units" — N = 1/median, rounded for readability.
  const perUnitsRaw = 1 / best.median;
  const perUnits = perUnitsRaw >= 10 ? Math.round(perUnitsRaw) : parseFloat(perUnitsRaw.toFixed(2));
  return {
    basis: best.basis,
    unit: best.unit,
    pointsPer: 1,
    perUnits,
    count: best.count,
    totalValid,
    spread: best.spread,
    // Back-compat alias so existing callers reading `cv` still work.
    cv: best.spread,
  };
}

export function describeRule(rule) {
  if (!rule) return '—';
  if (rule.basis === 'flat') {
    return `${rule.pointsPer} pt per check-in`;
  }
  const noun = rule.basis === 'distance'
    ? rule.unit
    : rule.basis === 'duration'
      ? (rule.unit === 'hour' ? 'hour' : 'min')
      : rule.basis === 'calories' ? 'cal' : 'steps';
  const ptsLabel = rule.pointsPer === 1 ? '1 pt' : `${rule.pointsPer} pts`;
  const unitLabel = rule.perUnits === 1 ? noun : `${rule.perUnits} ${noun}`;
  return `${ptsLabel} per ${unitLabel}`;
}

export function simulateChallenge(data, memberMap, activityType, rule, { applyCap, capValue, distanceUnit = 'mi' }) {
  // Per-player day buckets
  const oldDay = {};
  const newDay = {};
  const playerHasActivity = new Set();
  const checkInImpacts = [];
  let activityCurrentTotal = 0;
  let activitySimulatedTotal = 0;
  let missingCount = 0;

  for (const ci of data.check_ins) {
    const date = ci.occurred_at.slice(0, 10);
    const pid = ci.account_id;
    const oldPts = ci.points || 0;

    if (!oldDay[pid]) oldDay[pid] = {};
    if (!newDay[pid]) newDay[pid] = {};
    oldDay[pid][date] = (oldDay[pid][date] || 0) + oldPts;

    // Iterate sub-activities. The non-matching ones pass through with their
    // original points; the matching ones are rescored under the what-if rule.
    const subs = getSubActivities(ci);
    let newCheckInPts = 0;
    for (let idx = 0; idx < subs.length; idx++) {
      const sub = subs[idx];
      const subType = getSubActivityType(sub, ci);
      const subPts = sub.points || 0;

      if (subType === activityType) {
        playerHasActivity.add(pid);
        const { points: rawSimPts, missingMetric } = computeRulePoints(sub, rule, distanceUnit);
        // When the sub is missing the metric the rule needs, we can't
        // predict its rescore — GymRats clearly awarded these points via
        // some fallback we don't have visibility into. Preserve original
        // points so the player isn't artificially penalized; the ⚠️
        // flag still surfaces these as needing attention.
        const simPts = missingMetric ? subPts : rawSimPts;
        activityCurrentTotal += subPts;
        activitySimulatedTotal += simPts;
        if (missingMetric) missingCount += 1;
        newCheckInPts += simPts;
        checkInImpacts.push({
          ci,
          sub,
          subIndex: idx,
          isCombo: subs.length > 1,
          rowKey: sub.id != null ? `${ci.id}-${sub.id}` : `${ci.id}-${idx}`,
          member: memberMap[pid] || { id: pid, full_name: 'Unknown', profile_picture_url: null },
          currentPoints: subPts,
          simulatedPoints: simPts,
          delta: simPts - subPts,
          missingMetric,
        });
      } else {
        newCheckInPts += subPts;
      }
    }

    newDay[pid][date] = (newDay[pid][date] || 0) + newCheckInPts;
  }

  const cap = applyCap ? (parseFloat(capValue) || Infinity) : Infinity;
  function sumCapped(daysMap) {
    let total = 0;
    for (const v of Object.values(daysMap)) {
      total += Math.min(cap, v);
    }
    return total;
  }

  const allPlayerIds = new Set([...Object.keys(oldDay), ...Object.keys(newDay)]);
  const oldTotals = {};
  const newTotals = {};
  for (const pid of allPlayerIds) {
    oldTotals[pid] = sumCapped(oldDay[pid] || {});
    newTotals[pid] = sumCapped(newDay[pid] || {});
  }

  function ranksFrom(totals) {
    const sorted = Object.entries(totals)
      .map(([pid, pts]) => ({ pid: Number(pid), pts }))
      .sort((a, b) => b.pts - a.pts);
    const map = {};
    sorted.forEach((e, i) => { map[e.pid] = i + 1; });
    return map;
  }
  const oldRanks = ranksFrom(oldTotals);
  const newRanks = ranksFrom(newTotals);

  const playerImpacts = [...playerHasActivity].map(pid => ({
    memberId: pid,
    member: memberMap[pid] || { id: pid, full_name: 'Unknown', profile_picture_url: null },
    oldTotal: oldTotals[pid] || 0,
    newTotal: newTotals[pid] || 0,
    delta: (newTotals[pid] || 0) - (oldTotals[pid] || 0),
    oldRank: oldRanks[pid],
    newRank: newRanks[pid],
  }));

  return {
    playerImpacts,
    checkInImpacts,
    totals: {
      activityCurrentTotal,
      activitySimulatedTotal,
      activityDelta: activitySimulatedTotal - activityCurrentTotal,
      missingCount,
      affectedPlayerCount: playerHasActivity.size,
    },
  };
}

// ─── Fraud Radar helpers ──────────────────────────────────────────────────────

// Returns all activity types across the challenge sorted by submission count.
export function getActivityTypeSummary(data) {
  const counts = {};
  const points = {};
  for (const ci of data.check_ins) {
    const subs = getSubActivities(ci);
    for (const sub of subs) {
      const type = sub.platform_activity || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
      points[type] = (points[type] || 0) + (sub.points || 0);
    }
  }
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count, totalPoints: parseFloat((points[type] || 0).toFixed(2)) }))
    .sort((a, b) => b.count - a.count);
}

// Returns per-player per-period (daily or weekly) points for one activity type,
// along with the underlying check-ins and outlier flags for fraud detection.
export function getActivityTypePlayerData(data, activityType, memberMap, aggregation = 'daily', opts = {}) {
  const { madThreshold = 2.5 } = opts;
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  // Build period keys: daily = YYYY-MM-DD; weekly = YYYY-MM-DD of week start
  const periods = [];
  const cursor = new Date(startDate);
  if (aggregation === 'weekly') {
    while (cursor <= endDate) {
      periods.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    while (cursor <= endDate) {
      periods.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const getPeriodKey = (dateStr) => {
    if (aggregation === 'daily') return dateStr;
    const dayMs = 24 * 60 * 60 * 1000;
    const offset = Math.floor((new Date(dateStr) - startDate) / dayMs);
    const weekIdx = Math.max(0, Math.floor(offset / 7));
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + weekIdx * 7);
    return weekStart.toISOString().slice(0, 10);
  };

  // Aggregate points and collect check-ins per player per period
  const pointsByPlayerByPeriod = {}; // { playerId: { periodKey: pts } }
  const activitiesByPlayerByPeriod = {}; // { playerId: { periodKey: [checkIn] } }
  const playerIds = new Set();

  for (const ci of data.check_ins) {
    const matchingSubs = getSubActivities(ci).filter(
      s => (s.platform_activity || 'unknown') === activityType
    );
    if (matchingSubs.length === 0) continue;

    const pid = ci.account_id;
    const dateStr = ci.occurred_at.slice(0, 10);
    const periodKey = getPeriodKey(dateStr);

    // Only count points from the matching sub-activities
    const pts = matchingSubs.reduce((s, sub) => s + (sub.points || 0), 0);

    playerIds.add(pid);
    if (!pointsByPlayerByPeriod[pid]) pointsByPlayerByPeriod[pid] = {};
    pointsByPlayerByPeriod[pid][periodKey] = (pointsByPlayerByPeriod[pid][periodKey] || 0) + pts;

    if (!activitiesByPlayerByPeriod[pid]) activitiesByPlayerByPeriod[pid] = {};
    if (!activitiesByPlayerByPeriod[pid][periodKey]) activitiesByPlayerByPeriod[pid][periodKey] = [];
    activitiesByPlayerByPeriod[pid][periodKey].push(ci);
  }

  // Build players list (only those with ≥1 activity of this type), sorted by total pts desc
  const players = [...playerIds]
    .map(id => {
      const member = memberMap[id] || { id, full_name: 'Unknown', profile_picture_url: null };
      const total = Object.values(pointsByPlayerByPeriod[id] || {}).reduce((s, v) => s + v, 0);
      return { id, name: member.full_name, avatarUrl: member.profile_picture_url, total };
    })
    .sort((a, b) => b.total - a.total);

  // Build chart data: one entry per period
  const chartData = periods.map(period => {
    const point = { period };
    for (const p of players) {
      point[p.name] = parseFloat(((pointsByPlayerByPeriod[p.id] || {})[period] || 0).toFixed(2));
    }
    return point;
  });

  // Compute outliers per period using MAD
  function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  const outliersByPeriod = {};
  for (const period of periods) {
    const scores = players
      .map(p => ({ id: p.id, pts: (pointsByPlayerByPeriod[p.id] || {})[period] || 0 }))
      .filter(e => e.pts > 0);
    if (scores.length < 3) continue;
    const med = median(scores.map(e => e.pts));
    const mad = median(scores.map(e => Math.abs(e.pts - med)));
    if (mad === 0) continue;
    const threshold = med + madThreshold * mad;
    outliersByPeriod[period] = new Set(
      scores.filter(e => e.pts > threshold).map(e => e.id)
    );
  }

  return { periods, players, chartData, activitiesByPlayerByPeriod, outliersByPeriod };
}
