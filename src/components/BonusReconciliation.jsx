import { useState, useMemo } from 'react';
import { ROTATIONS, getRotationStatus } from '../data/rotations';
import { computeExpectedBonusByPlayer } from '../utils/computeRotationBonus';
import { useBonusGrants } from '../context/BonusGrantsContext';
import { useSettings } from '../context/SettingsContext';
import { formatPoints } from '../utils/dataProcessor';
import Avatar from './Avatar';

const TOLERANCE = 0.5; // grantAmount is cap-aware and can be fractional; owed is integer ×10

// match | missing | over — severity used for sorting (higher = more urgent)
function classify(owed, granted) {
  const diff = granted - owed;
  if (diff > TOLERANCE) return { status: 'over', severity: 2, amount: diff };
  if (diff < -TOLERANCE) return { status: 'missing', severity: 1, amount: -diff };
  return { status: 'match', severity: 0, amount: 0 };
}

const STATUS_META = {
  match:   { icon: '✅', cls: 'text-emerald-400', label: 'Match' },
  missing: { icon: '⚠️', cls: 'text-amber-400',  label: 'Missing' },
  over:    { icon: '🔴', cls: 'text-red-400',     label: 'Over' },
};

function RotationBreakdown({ owedByRotation, grantedByRotation }) {
  // Union of rotation numbers that have either owed or granted amounts.
  const nums = new Set([
    ...owedByRotation.map(r => r.num),
    ...grantedByRotation.keys(),
  ]);
  const rows = [...nums].sort((a, b) => a - b).map(num => {
    const owedEntry = owedByRotation.find(r => r.num === num);
    const rotMeta = ROTATIONS.find(r => r.num === num);
    const owed = owedEntry?.expected ?? 0;
    const granted = grantedByRotation.get(num) ?? 0;
    return {
      num,
      label: owedEntry?.label ?? rotMeta?.label ?? `Rotation ${num}`,
      kind: owedEntry?.kind ?? null,
      teamName: owedEntry?.teamName ?? null,
      owed,
      granted,
      delta: granted - owed,
    };
  });

  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 uppercase tracking-wider">
            <th className="text-left font-medium py-1 pr-3">Rotation</th>
            <th className="text-left font-medium py-1 pr-3">Reason</th>
            <th className="text-right font-medium py-1 pr-3">Owed</th>
            <th className="text-right font-medium py-1 pr-3">Granted</th>
            <th className="text-right font-medium py-1">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const c = classify(r.owed, r.granted);
            return (
              <tr key={r.num} className="border-t border-gray-800/60">
                <td className="py-1 pr-3 text-gray-300 whitespace-nowrap">{r.label}</td>
                <td className="py-1 pr-3 text-gray-500">
                  {r.kind === 'featured' ? `Featured (${r.teamName})`
                    : r.kind === 'upset' ? `Upset (${r.teamName})`
                    : r.granted > 0 ? 'Granted, not owed' : '—'}
                </td>
                <td className="py-1 pr-3 text-right text-gray-400">{formatPoints(r.owed)}</td>
                <td className="py-1 pr-3 text-right text-gray-400">{formatPoints(r.granted)}</td>
                <td className={`py-1 text-right font-semibold ${
                  c.status === 'match' ? 'text-gray-600'
                    : c.status === 'over' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {r.delta > 0 ? '+' : ''}{formatPoints(r.delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationRow({ row }) {
  const [open, setOpen] = useState(false);
  const { member, teamName, owed, granted, cls: c } = row;
  const meta = STATUS_META[c.status];

  return (
    <div className={`rounded-xl border ${
      c.status === 'over' ? 'border-red-500/30 bg-red-500/5'
        : c.status === 'missing' ? 'border-amber-500/25 bg-amber-500/5'
        : 'border-gray-800 bg-gray-900'
    }`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-3 text-left">
        <Avatar url={member.profile_picture_url} name={member.full_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-200 truncate">{member.full_name}</div>
          <div className="text-xs text-gray-500 truncate">{teamName || '—'}</div>
        </div>
        <div className="flex items-center gap-5 flex-shrink-0 text-right">
          <div>
            <div className="text-xs text-gray-600">Owed</div>
            <div className="text-sm font-bold text-gray-300">{formatPoints(owed)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Granted</div>
            <div className="text-sm font-bold text-gray-300">{formatPoints(granted)}</div>
          </div>
          <div className="w-28">
            <div className="text-xs text-gray-600">Status</div>
            <div className={`text-sm font-bold ${meta.cls}`}>
              {meta.icon} {c.status === 'match' ? 'Match' : `${meta.label} ${formatPoints(c.amount)}`}
            </div>
          </div>
          <span className="text-gray-600 text-xs w-3">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-800 pt-2">
          <RotationBreakdown owedByRotation={row.owedByRotation} grantedByRotation={row.grantedByRotation} />
        </div>
      )}
    </div>
  );
}

export default function BonusReconciliation({ data }) {
  const { settings } = useSettings();
  const { grants } = useBonusGrants();
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [search, setSearch] = useState('');

  const completedRotations = useMemo(
    () => ROTATIONS.filter(r => getRotationStatus(r) === 'closed').sort((a, b) => a.num - b.num),
    []
  );

  // playerId → team name (reserve teams excluded, matching rotation scoring)
  const teamByPlayer = useMemo(() => {
    const map = new Map();
    for (const team of data.teams || []) {
      if (team.name.toLowerCase().includes('reserve')) continue;
      for (const tm of team.team_members || []) map.set(tm.account_id, team.name);
    }
    return map;
  }, [data.teams]);

  const expectedByPlayer = useMemo(
    () => computeExpectedBonusByPlayer(data, completedRotations, settings.dailyPointsCap, grants),
    [data, completedRotations, settings.dailyPointsCap, grants]
  );

  // playerId → { total, byRotation: Map<rotNum, amount> } from confirmed grants
  const grantedByPlayer = useMemo(() => {
    const map = new Map();
    for (const g of grants) {
      const amt = g.grantAmount || 0;
      if (!map.has(g.playerId)) map.set(g.playerId, { total: 0, byRotation: new Map() });
      const entry = map.get(g.playerId);
      entry.total += amt;
      entry.byRotation.set(g.rotation, (entry.byRotation.get(g.rotation) || 0) + amt);
    }
    return map;
  }, [grants]);

  const rows = useMemo(() => {
    const ids = new Set([...expectedByPlayer.keys(), ...grantedByPlayer.keys()]);
    const built = [];
    for (const id of ids) {
      const exp = expectedByPlayer.get(id);
      const gr = grantedByPlayer.get(id);
      const owed = exp?.total ?? 0;
      const granted = gr?.total ?? 0;
      // Skip noise: nothing owed and nothing meaningful granted.
      if (owed <= 0 && granted <= TOLERANCE) continue;
      const member = data.members.find(m => m.id === id);
      if (!member) continue;
      built.push({
        id,
        member,
        teamName: teamByPlayer.get(id) || null,
        owed,
        granted,
        cls: classify(owed, granted),
        owedByRotation: exp?.byRotation ?? [],
        grantedByRotation: gr?.byRotation ?? new Map(),
      });
    }
    built.sort((a, b) =>
      b.cls.severity - a.cls.severity ||
      b.cls.amount - a.cls.amount ||
      a.member.full_name.localeCompare(b.member.full_name)
    );
    return built;
  }, [expectedByPlayer, grantedByPlayer, data.members, teamByPlayer]);

  const summary = useMemo(() => {
    let matched = 0, missingPlayers = 0, missingPts = 0, overPlayers = 0, overPts = 0;
    for (const r of rows) {
      if (r.cls.status === 'match') matched++;
      else if (r.cls.status === 'missing') { missingPlayers++; missingPts += r.cls.amount; }
      else { overPlayers++; overPts += r.cls.amount; }
    }
    return { total: rows.length, matched, missingPlayers, missingPts, overPlayers, overPts };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (onlyIssues && r.cls.status === 'match') return false;
      if (q && !r.member.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, onlyIssues, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">🧾 Bonus Reconciliation</h2>
        <p className="text-sm text-gray-500 mt-1">
          Cumulative bonus each player is <span className="text-gray-400">owed</span> across all finished rotations vs.
          what's been <span className="text-gray-400">granted</span>. Catches forgotten grants and mistakes.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Players with bonus</div>
          <div className="text-2xl font-black text-white">{summary.total}</div>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reconciled</div>
          <div className="text-2xl font-black text-emerald-400">{summary.matched}</div>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Missing</div>
          <div className="text-2xl font-black text-amber-400">{summary.missingPlayers}</div>
          <div className="text-xs text-gray-500 mt-0.5">{formatPoints(summary.missingPts)} pts to grant</div>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Over-granted</div>
          <div className="text-2xl font-black text-red-400">{summary.overPlayers}</div>
          <div className="text-xs text-gray-500 mt-0.5">{formatPoints(summary.overPts)} pts extra</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-700"
        />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} className="w-4 h-4 cursor-pointer" />
          Only show issues
        </label>
      </div>

      {completedRotations.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
          No rotations have finished yet — nothing to reconcile.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-600">
          {rows.length === 0 ? 'No players are owed a bonus yet.' : 'No players match the current filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map(row => <ReconciliationRow key={row.id} row={row} />)}
        </div>
      )}
    </div>
  );
}
