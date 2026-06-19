import { useState, useMemo, useRef } from 'react';
import Avatar from './Avatar';
import { formatPoints, sumPointsWithCap } from '../utils/dataProcessor';
import { useSettings } from '../context/SettingsContext';
import ANNOUNCED_TEAMS from '../data/announcedTeams.json';

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDateInputValue(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function computePlayerProfiles(data, startDateMs, endDateMs, dailyCap) {
  const byPlayer = {};
  for (const ci of data.check_ins) {
    const t = new Date(ci.occurred_at).getTime();
    if (startDateMs != null && t < startDateMs) continue;
    if (endDateMs != null && t > endDateMs) continue;
    (byPlayer[ci.account_id] ||= []).push(ci);
  }
  const profiles = {};
  for (const [id, cis] of Object.entries(byPlayer)) {
    const activeDays = new Set(cis.map(ci => ci.occurred_at.slice(0, 10))).size;
    profiles[id] = { points: sumPointsWithCap(cis, dailyCap), activeDays };
  }
  return profiles;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// Cluster players into 4 archetypes on points × active-days axes, then
// snake-draft each archetype evenly across teams. A final pairwise-swap pass
// tightens any remaining points imbalance without disturbing the archetype mix.
function buildTeamsArchetype(players, teamCount, maxSize) {
  const medPts = median(players.map(p => p.points));
  const medDays = median(players.map(p => p.activeDays));

  const archetypeOf = p => {
    const hiPts = p.points >= medPts;
    const hiDays = p.activeDays >= medDays;
    if (hiPts && hiDays) return 'A'; // star consistent
    if (hiPts && !hiDays) return 'B'; // bursty scorer
    if (!hiPts && hiDays) return 'C'; // reliable grinder
    return 'D';                       // casual
  };

  const buckets = { A: [], B: [], C: [], D: [] };
  for (const p of players) {
    const arch = archetypeOf(p);
    buckets[arch].push({ ...p, archetype: arch });
  }
  for (const b of Object.values(buckets)) b.sort((a, b) => b.points - a.points);

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    players: [], total: 0, allTimeTotal: 0, activeDaysTotal: 0,
  }));

  // Snake-draft each archetype bucket across teams in order A → B → C → D.
  for (const bucket of [buckets.A, buckets.B, buckets.C, buckets.D]) {
    let forward = true;
    let ti = 0;
    for (const p of bucket) {
      // Skip teams that are already full; step in current direction.
      let attempts = 0;
      while (teams[ti].players.length >= maxSize && attempts < teamCount) {
        ti = forward ? (ti + 1) % teamCount : (ti - 1 + teamCount) % teamCount;
        attempts++;
      }
      teams[ti].players.push(p);
      teams[ti].total += p.points;
      teams[ti].allTimeTotal += p.allTimePoints ?? p.points;
      teams[ti].activeDaysTotal += p.activeDays;
      // Advance and flip direction at ends for snake pattern.
      if (forward) {
        if (ti === teamCount - 1) { forward = false; }
        else { ti++; }
      } else {
        if (ti === 0) { forward = true; }
        else { ti--; }
      }
    }
  }

  // Pairwise swap pass: improve points spread without breaking archetype mix.
  let improved = true;
  while (improved) {
    improved = false;
    const spread = () => {
      const tots = teams.map(t => t.total);
      return Math.max(...tots) - Math.min(...tots);
    };
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let pi = 0; pi < teams[i].players.length; pi++) {
          for (let pj = 0; pj < teams[j].players.length; pj++) {
            const a = teams[i].players[pi];
            const b = teams[j].players[pj];
            if (a.archetype !== b.archetype) continue; // only swap same archetype
            const before = spread();
            teams[i].total += b.points - a.points;
            teams[j].total += a.points - b.points;
            if (spread() < before) {
              teams[i].players[pi] = b;
              teams[j].players[pj] = a;
              teams[i].allTimeTotal += (b.allTimePoints ?? b.points) - (a.allTimePoints ?? a.points);
              teams[j].allTimeTotal += (a.allTimePoints ?? a.points) - (b.allTimePoints ?? b.points);
              teams[i].activeDaysTotal += b.activeDays - a.activeDays;
              teams[j].activeDaysTotal += a.activeDays - b.activeDays;
              improved = true;
            } else {
              teams[i].total += a.points - b.points;
              teams[j].total += b.points - a.points;
            }
          }
        }
      }
    }
  }

  for (const t of teams) t.players.sort((a, b) => b.points - a.points);
  return teams.map((t, i) => ({ id: `team-${i + 1}`, name: `Team #${i + 1}`, ...t }));
}

function recalcTotal(teamPlayers) {
  return teamPlayers.reduce((s, p) => s + p.points, 0);
}

function recalcAllTimeTotal(teamPlayers) {
  return teamPlayers.reduce((s, p) => s + (p.allTimePoints ?? p.points), 0);
}

function recalcActiveDaysTotal(teamPlayers) {
  return teamPlayers.reduce((s, p) => s + (p.activeDays ?? 0), 0);
}

function rehydrateTeams(json, memberMap) {
  const teams = (json.teams || []).map((t, i) => ({
    id: t.id || `team-${i + 1}`,
    name: t.name || `Team #${i + 1}`,
    players: (t.players || []).map(p => ({
      id: p.id,
      name: memberMap[p.id]?.full_name || p.name || 'Unknown',
      avatar: memberMap[p.id]?.profile_picture_url || null,
      points: parseFloat(p.points) || 0,
      allTimePoints: parseFloat(p.all_time_points ?? p.points) || 0,
      activeDays: parseInt(p.active_days) || 0,
      archetype: p.archetype ?? null,
    })).sort((a, b) => b.points - a.points),
    total: 0,
    allTimeTotal: 0,
    activeDaysTotal: 0,
  }));
  for (const t of teams) {
    t.total = recalcTotal(t.players);
    t.allTimeTotal = recalcAllTimeTotal(t.players);
    t.activeDaysTotal = recalcActiveDaysTotal(t.players);
  }
  return teams;
}

function balanceMetric(teams) {
  if (teams.length === 0) return { spread: 0, stddev: 0, max: 0, min: 0, avg: 0, activeDaysSpread: 0 };
  const totals = teams.map(t => t.total);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
  const variance = totals.reduce((s, v) => s + (v - avg) ** 2, 0) / totals.length;
  const stddev = Math.sqrt(variance);
  const dayTotals = teams.map(t => t.activeDaysTotal ?? 0);
  const activeDaysSpread = Math.max(...dayTotals) - Math.min(...dayTotals);
  return { spread: max - min, stddev, max, min, avg, activeDaysSpread };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TeamBuilder({ data, memberMap }) {
  const { settings } = useSettings();
  const challengeStart = toDateInputValue(data.start_date);
  const challengeEnd = toDateInputValue(data.end_date);

  const af = ANNOUNCED_TEAMS.filters ?? {};
  const [startDate, setStartDate] = useState(af.startDate ?? challengeStart);
  const [endDate, setEndDate] = useState(af.endDate ?? challengeEnd);
  const [mode, setMode] = useState(af.mode ?? 'size');
  const [teamSize, setTeamSize] = useState(af.teamSize ?? 4);
  const [teamCount, setTeamCount] = useState(af.teamCount ?? 4);
  const [minPoints, setMinPoints] = useState(af.minPoints ?? 0);

  const [teams, setTeams] = useState(() => rehydrateTeams(ANNOUNCED_TEAMS, memberMap));
  const [referenceTeams] = useState(() => rehydrateTeams(ANNOUNCED_TEAMS, memberMap));
  const [snapshotFilters, setSnapshotFilters] = useState(af ?? null);
  const [showTotalColumn, setShowTotalColumn] = useState(false);

  const fileInputRef = useRef(null);

  const eligiblePlayers = useMemo(() => {
    const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : null;
    const endMs = endDate ? new Date(endDate + 'T23:59:59.999').getTime() : null;
    const profiles = computePlayerProfiles(data, startMs, endMs, settings.dailyPointsCap);
    const allTimeProfiles = computePlayerProfiles(data, null, null, settings.dailyPointsCap);
    const out = [];
    for (const m of data.members) {
      const pts = profiles[m.id]?.points ?? 0;
      if (pts < (parseFloat(minPoints) || 0)) continue;
      const memberProfile = memberMap[m.id] || m;
      out.push({
        id: m.id,
        name: memberProfile.full_name,
        avatar: memberProfile.profile_picture_url,
        points: pts,
        activeDays: profiles[m.id]?.activeDays ?? 0,
        allTimePoints: allTimeProfiles[m.id]?.points ?? 0,
      });
    }
    return out.sort((a, b) => b.points - a.points);
  }, [data, memberMap, startDate, endDate, minPoints, settings.dailyPointsCap]);

  const numTeamsIfSize = Math.max(1, Math.ceil(eligiblePlayers.length / (parseInt(teamSize, 10) || 1)));
  const sizePerTeamIfCount = Math.ceil(eligiblePlayers.length / Math.max(1, parseInt(teamCount, 10) || 1));

  const handleBuild = () => {
    if (eligiblePlayers.length === 0) return;
    let k, maxSize;
    if (mode === 'size') {
      const s = Math.max(1, parseInt(teamSize, 10) || 1);
      k = Math.max(1, Math.ceil(eligiblePlayers.length / s));
      maxSize = s;
    } else {
      k = Math.max(1, parseInt(teamCount, 10) || 1);
      maxSize = Math.ceil(eligiblePlayers.length / k);
    }
    setTeams(buildTeamsArchetype(eligiblePlayers, k, maxSize));
    setSnapshotFilters({ startDate, endDate, mode, teamSize, teamCount, minPoints });
  };

  // ─── Drag and drop ───────────────────────────────────────────────────────
  const [dragInfo, setDragInfo] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const onDragStart = (teamId, playerId) => (e) => {
    setDragInfo({ teamId, playerId });
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', `${teamId}:${playerId}`); } catch {}
  };

  const onDragOver = (teamId) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== teamId) setDropTarget(teamId);
  };

  const onDragLeave = (teamId) => () => {
    if (dropTarget === teamId) setDropTarget(null);
  };

  const onDrop = (targetTeamId) => (e) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragInfo) return;
    const { teamId: sourceTeamId, playerId } = dragInfo;
    setDragInfo(null);
    if (sourceTeamId === targetTeamId) return;

    setTeams(prev => {
      if (!prev) return prev;
      const next = prev.map(t => ({ ...t, players: [...t.players] }));
      const src = next.find(t => t.id === sourceTeamId);
      const dst = next.find(t => t.id === targetTeamId);
      if (!src || !dst) return prev;
      const idx = src.players.findIndex(p => p.id === playerId);
      if (idx === -1) return prev;
      const [moved] = src.players.splice(idx, 1);
      dst.players.push(moved);
      dst.players.sort((a, b) => b.points - a.points);
      src.total = recalcTotal(src.players);
      dst.total = recalcTotal(dst.players);
      src.allTimeTotal = recalcAllTimeTotal(src.players);
      dst.allTimeTotal = recalcAllTimeTotal(dst.players);
      src.activeDaysTotal = recalcActiveDaysTotal(src.players);
      dst.activeDaysTotal = recalcActiveDaysTotal(dst.players);
      return next;
    });
  };

  // ─── Download / Upload ───────────────────────────────────────────────────
  const handleDownload = () => {
    if (!teams) return;
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      challenge: { id: data.id, name: data.name },
      filters: snapshotFilters,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        total_points: parseFloat(t.total.toFixed(2)),
        all_time_total_points: parseFloat((t.allTimeTotal ?? t.total).toFixed(2)),
        players: t.players.map(p => ({
          id: p.id,
          name: p.name,
          points: parseFloat(p.points.toFixed(2)),
          all_time_points: parseFloat((p.allTimePoints ?? p.points).toFixed(2)),
          active_days: p.activeDays ?? 0,
          archetype: p.archetype ?? null,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = (data.name || 'challenge').replace(/[^a-z0-9\-]+/gi, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `teams_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.teams || !Array.isArray(parsed.teams)) {
        alert('Invalid team file: missing "teams" array.');
        return;
      }
      if (parsed.filters) {
        const f = parsed.filters;
        if (f.startDate != null) setStartDate(f.startDate);
        if (f.endDate != null) setEndDate(f.endDate);
        if (f.mode) setMode(f.mode);
        if (f.teamSize != null) setTeamSize(f.teamSize);
        if (f.teamCount != null) setTeamCount(f.teamCount);
        if (f.minPoints != null) setMinPoints(f.minPoints);
        setSnapshotFilters(f);
      }
      setTeams(rehydrateTeams(parsed, memberMap));
    } catch (err) {
      alert(`Failed to load file: ${err.message}`);
    }
  };

  const referencePlayerTeamMap = useMemo(() => {
    const map = new Map();
    for (const t of referenceTeams) {
      for (const p of t.players) map.set(p.id, { teamId: t.id, teamName: t.name });
    }
    return map;
  }, [referenceTeams]);

  const assignedPlayerIds = useMemo(() => {
    const s = new Set();
    for (const t of (teams ?? [])) for (const p of t.players) s.add(p.id);
    return s;
  }, [teams]);

  const comparisonStats = useMemo(() => {
    if (!teams) return null;
    let matched = 0, wrongTeam = 0, missing = 0;
    for (const t of teams) {
      for (const p of t.players) {
        const ref = referencePlayerTeamMap.get(p.id);
        if (!ref) continue;
        if (ref.teamId === t.id) matched++;
        else wrongTeam++;
      }
    }
    for (const pid of referencePlayerTeamMap.keys()) {
      if (!assignedPlayerIds.has(pid)) missing++;
    }
    return { matched, wrongTeam, missing, total: referencePlayerTeamMap.size };
  }, [teams, referencePlayerTeamMap, assignedPlayerIds]);

  const missingFromTeams = useMemo(() => {
    const result = [];
    for (const t of referenceTeams) {
      for (const p of t.players) {
        if (!assignedPlayerIds.has(p.id)) result.push({ ...p, refTeamName: t.name });
      }
    }
    return result;
  }, [referenceTeams, assignedPlayerIds]);

  const unassignedMembers = useMemo(() => {
    const eligibleMap = new Map(eligiblePlayers.map(p => [p.id, p]));
    return data.members
      .filter(m => !assignedPlayerIds.has(m.id))
      .map(m => {
        const ep = eligibleMap.get(m.id);
        const profile = memberMap[m.id] || m;
        return {
          id: m.id,
          name: profile.full_name || 'Unknown',
          avatar: profile.profile_picture_url || null,
          points: ep?.points ?? 0,
          activeDays: ep?.activeDays ?? 0,
          archetype: ep?.archetype ?? null,
        };
      })
      .sort((a, b) => b.points - a.points);
  }, [data.members, memberMap, assignedPlayerIds, eligiblePlayers]);

  const balance = teams ? balanceMetric(teams) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">🧩 Team Builder</h1>
        <p className="text-sm text-gray-500 mt-1">
          Test team distributions for upcoming challenges. Filters select eligible players;
          the builder uses a greedy LPT split to keep team point totals balanced.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 rounded-2xl p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              min={challengeStart || undefined}
              max={challengeEnd || undefined}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              min={challengeStart || undefined}
              max={challengeEnd || undefined}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Mode</label>
          <div className="flex bg-gray-800 rounded-xl p-1 max-w-xs">
            <button
              onClick={() => setMode('size')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'size' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              By team size
            </button>
            <button
              onClick={() => setMode('count')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'count' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              By # of teams
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mode === 'size' ? (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Team size</label>
              <input
                type="number"
                min="1"
                step="1"
                value={teamSize}
                onChange={e => setTeamSize(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <p className="text-xs text-gray-600 mt-1.5">
                → ~{numTeamsIfSize} team{numTeamsIfSize === 1 ? '' : 's'} with {eligiblePlayers.length} eligible player{eligiblePlayers.length === 1 ? '' : 's'}
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Number of teams</label>
              <input
                type="number"
                min="1"
                step="1"
                value={teamCount}
                onChange={e => setTeamCount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <p className="text-xs text-gray-600 mt-1.5">
                → ~{sizePerTeamIfCount} player{sizePerTeamIfCount === 1 ? '' : 's'} per team
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Min points</label>
            <input
              type="number"
              min="0"
              step="1"
              value={minPoints}
              onChange={e => setMinPoints(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Players below this threshold (in the date range) are excluded.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            <span className="text-white font-semibold">{eligiblePlayers.length}</span> eligible
            <span className="text-gray-600"> / {data.members.length} total members</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleUploadClick}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              📂 Load JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChosen}
              className="hidden"
            />
            <button
              onClick={handleDownload}
              disabled={!teams}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:hover:bg-gray-800"
            >
              💾 Download Teams
            </button>
            <button
              onClick={handleBuild}
              disabled={eligiblePlayers.length === 0}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40 disabled:hover:bg-orange-500 shadow-lg shadow-orange-500/20"
            >
              Build Teams
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {teams === null ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🧩</div>
          <p className="text-sm text-gray-500">Adjust filters and hit Build Teams to generate a balanced split.</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-sm text-gray-500">
          No eligible players for the current filters.
        </div>
      ) : (
        <>
          {/* Balance summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Teams" value={teams.length.toString()} />
            <StatCard label="Players placed" value={teams.reduce((s, t) => s + t.players.length, 0).toString()} />
            <StatCard
              label="Points spread"
              value={formatPoints(balance.spread)}
              sub={balance.avg > 0 ? `${((balance.spread / balance.avg) * 100).toFixed(1)}% of avg` : null}
            />
            <StatCard label="Active-days spread" value={balance.activeDaysSpread.toString()} sub="max − min across teams" />
          </div>

          {/* Comparison banner */}
          {comparisonStats && (
            <div className={`rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm border ${
              comparisonStats.wrongTeam === 0 && comparisonStats.missing === 0
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-gray-900 border-gray-800'
            }`}>
              <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">vs Announced</span>
              <span className="text-emerald-400 font-semibold">✓ {comparisonStats.matched}/{comparisonStats.total} match</span>
              {comparisonStats.wrongTeam > 0 && (
                <span className="text-orange-400 font-semibold">⚠ {comparisonStats.wrongTeam} on wrong team</span>
              )}
              {comparisonStats.missing > 0 && (
                <span className="text-red-400 font-semibold">✗ {comparisonStats.missing} missing from teams</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-600">
              Drag and drop players between teams to fine-tune. Totals and spread update live.
            </p>
            <button
              onClick={() => setShowTotalColumn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                showTotalColumn
                  ? 'bg-gray-700 border-gray-600 text-gray-200'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${showTotalColumn ? 'bg-orange-400' : 'bg-gray-600'}`} />
              Show total pts
            </button>
          </div>

          {/* Teams grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(team => (
              <TeamCard
                key={team.id}
                team={team}
                showTotal={showTotalColumn}
                isDropTarget={dropTarget === team.id}
                onDragStart={onDragStart}
                onDragOver={onDragOver(team.id)}
                onDragLeave={onDragLeave(team.id)}
                onDrop={onDrop(team.id)}
                balanceMax={balance.max}
                balanceMin={balance.min}
                referencePlayerTeamMap={referencePlayerTeamMap}
              />
            ))}
          </div>
          {/* Missing from announced assignment */}
          {missingFromTeams.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-red-400 mb-3">✗ Missing from announced assignment</h2>
              <div className="space-y-1">
                {missingFromTeams.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 py-1.5">
                    <Avatar url={p.avatar} name={p.name} size="xs" />
                    <div className="flex-1 min-w-0 text-sm text-gray-200 truncate">{p.name}</div>
                    <span className="text-xs text-orange-400 flex-shrink-0">{p.refTeamName}</span>
                    <span className="text-xs text-gray-500 tabular-nums w-14 text-right">{formatPoints(p.points)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Unassigned players — always shown at the bottom */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Unassigned players</h2>
        <p className="text-xs text-gray-600 mb-3">{data.members.length} total members · {assignedPlayerIds.size} assigned</p>
        {unassignedMembers.length === 0 ? (
          <p className="text-xs text-gray-600 italic">All players are assigned to a team.</p>
        ) : (
          <div className="space-y-1">
            {unassignedMembers.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 py-1.5">
                <Avatar url={p.avatar} name={p.name} size="xs" />
                <div className="flex-1 min-w-0 text-sm text-gray-200 truncate">{p.name}</div>
                {p.archetype && <ArchetypeBadge archetype={p.archetype} />}
                <span className="text-xs text-gray-500 tabular-nums w-14 text-right">{formatPoints(p.points)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ARCHETYPE_META = {
  A: { label: 'A', title: 'Star — high points, high consistency', color: 'text-emerald-400 bg-emerald-400/10' },
  B: { label: 'B', title: 'Bursty — high points, low consistency', color: 'text-blue-400 bg-blue-400/10' },
  C: { label: 'C', title: 'Grinder — low points, high consistency', color: 'text-orange-400 bg-orange-400/10' },
  D: { label: 'D', title: 'Casual — low points, low consistency', color: 'text-gray-500 bg-gray-700/50' },
};

function MatchDot({ playerId, teamId, referencePlayerTeamMap }) {
  const ref = referencePlayerTeamMap.get(playerId);
  if (!ref) return <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" title="Not in announced assignment" />;
  if (ref.teamId === teamId) return <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Matches announced assignment" />;
  return <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title={`Announced: ${ref.teamName}`} />;
}

function ArchetypeBadge({ archetype }) {
  const meta = ARCHETYPE_META[archetype];
  if (!meta) return null;
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.color}`}
      title={meta.title}
    >
      {meta.label}
    </span>
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

function TeamCard({ team, showTotal, isDropTarget, onDragStart, onDragOver, onDragLeave, onDrop, balanceMax, balanceMin, referencePlayerTeamMap }) {
  const isHighest = team.total === balanceMax && balanceMax !== balanceMin;
  const isLowest = team.total === balanceMin && balanceMax !== balanceMin;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-gray-900 rounded-2xl overflow-hidden border-2 transition-colors ${
        isDropTarget
          ? 'border-orange-500 bg-orange-500/5'
          : isHighest
            ? 'border-emerald-500/30'
            : isLowest
              ? 'border-amber-500/30'
              : 'border-transparent'
      }`}
    >
      {/* Team header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-gray-100 leading-tight">{team.name}</div>
            {team.players.some(p => p.archetype) && (
              <div className="flex items-center gap-1 mt-1.5">
                {['A', 'B', 'C', 'D'].map(arch => {
                  const count = team.players.filter(p => p.archetype === arch).length;
                  if (count === 0) return null;
                  const meta = ARCHETYPE_META[arch];
                  return (
                    <span key={arch} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.color}`} title={meta.title}>
                      {arch}×{count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-baseline gap-2 justify-end">
              <div>
                {showTotal && (
                  <div className="text-[10px] uppercase tracking-wider text-gray-600 text-right mb-0.5">As per date</div>
                )}
                <div className="text-base font-bold text-orange-400 tabular-nums">{formatPoints(team.total)}</div>
              </div>
              {showTotal && (
                <div className="pl-2 border-l border-gray-700">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600 text-right mb-0.5">Total</div>
                  <div className="text-base font-bold text-gray-400 tabular-nums">{formatPoints(team.allTimeTotal ?? team.total)}</div>
                </div>
              )}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mt-0.5">
              {team.players.length} player{team.players.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      {/* Column labels when showTotal is on */}
      {showTotal && team.players.length > 0 && (
        <div className="flex items-center px-4 py-1 bg-gray-800/40 border-b border-gray-800/60">
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-gray-600 flex-shrink-0">
            <span className="w-14 text-right">Date</span>
            <span className="w-14 text-right">Total</span>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-800/60 min-h-[4rem]">
        {team.players.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-600 italic">
            Drop a player here
          </div>
        ) : (
          team.players.map(p => (
            <div
              key={p.id}
              draggable
              onDragStart={onDragStart(team.id, p.id)}
              className="flex items-center gap-2.5 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-gray-800/60 transition-colors"
              title="Drag to move"
            >
              <span className="text-gray-600 text-xs flex-shrink-0">⋮⋮</span>
              <Avatar url={p.avatar} name={p.name} size="xs" />
              <div className="flex-1 min-w-0 text-sm text-gray-200 truncate">{p.name}</div>
              {p.archetype && <ArchetypeBadge archetype={p.archetype} />}
              {referencePlayerTeamMap && <MatchDot playerId={p.id} teamId={team.id} referencePlayerTeamMap={referencePlayerTeamMap} />}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-sm font-semibold text-gray-300 tabular-nums w-14 text-right">
                  {formatPoints(p.points)}
                </div>
                {showTotal && (
                  <div className="text-sm font-medium text-gray-500 tabular-nums w-14 text-right">
                    {formatPoints(p.allTimePoints ?? p.points)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
