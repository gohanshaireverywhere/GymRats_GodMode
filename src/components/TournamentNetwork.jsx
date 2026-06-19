import { useMemo } from 'react';
import { sumPointsWithCap, formatPoints, restoreOriginalPoints } from '../utils/dataProcessor';
import { useSettings } from '../context/SettingsContext';
import { useBonusGrants } from '../context/BonusGrantsContext';

const WIN_COLOR = '#10b981';
const LOSS_COLOR = '#ef4444';
const ONGOING_COLOR = '#94a3b8';

function TournamentNetwork({ data, rotationStart, rotationEnd, featuredTeamName }) {
  const { settings } = useSettings();
  const { grants } = useBonusGrants();

  const now = new Date();
  const startDate = rotationStart ? new Date(rotationStart) : null;
  const endDate = rotationEnd ? new Date(rotationEnd) : null;
  const isFuture = startDate ? now < startDate : false;
  const isOngoing = startDate && endDate ? now >= startDate && now < endDate : false;
  const nextSunday = endDate ? (() => {
    const d = new Date(endDate);
    const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSunday);
    return d;
  })() : null;
  const isGracePeriod = endDate && !isOngoing && !isFuture && nextSunday && now < nextSunday;
  const isClosed = endDate && !isFuture && !isOngoing && !isGracePeriod;
  const graceDateLabel = nextSunday ? nextSunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  const result = useMemo(() => {
    if (!rotationStart || !rotationEnd || !featuredTeamName) return null;

    const start = new Date(rotationStart);
    const end = new Date(rotationEnd);

    // Restore original points so bonus edits inside this rotation window don't
    // affect matchup results displayed in the network view.
    const restoredCheckIns = restoreOriginalPoints(data.check_ins, grants);
    const periodCheckIns = restoredCheckIns.filter(ci => {
      const d = new Date(ci.occurred_at);
      return d >= start && d <= end;
    });

    const teams = data.teams
      .filter(t => !t.name.toLowerCase().includes('reserve'))
      .map(team => ({
        id: team.id,
        name: team.name,
        memberIds: new Set(team.team_members.map(tm => tm.account_id)),
      }));

    const teamScores = {};
    for (const team of teams) {
      const byMember = {};
      for (const id of team.memberIds) byMember[id] = [];
      for (const ci of periodCheckIns) {
        if (byMember[ci.account_id]) byMember[ci.account_id].push(ci);
      }
      teamScores[team.id] = Object.values(byMember)
        .reduce((sum, cis) => sum + sumPointsWithCap(cis, settings.dailyPointsCap), 0);
    }

    const featuredTeam = teams.find(t => t.name.trim().toLowerCase().includes(featuredTeamName.toLowerCase()));
    if (!featuredTeam) return null;

    const otherTeams = teams.filter(t => t.id !== featuredTeam.id);

    const matchups = otherTeams.map(otherTeam => ({
      team: otherTeam,
      score: teamScores[otherTeam.id],
      result: teamScores[featuredTeam.id] > teamScores[otherTeam.id] ? 'win' : 'loss',
    }));

    return { featuredTeam, featuredScore: teamScores[featuredTeam.id], matchups };
  }, [data, rotationStart, rotationEnd, featuredTeamName, settings.dailyPointsCap, grants]);

  if (!result) {
    return (
      <div className="bg-gray-900 rounded-2xl p-8">
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-lg">Please select a rotation first</p>
        </div>
      </div>
    );
  }

  const { featuredTeam, featuredScore, matchups } = result;
  const centerX = 400;
  const centerY = 300;
  const orbitalRadius = 220;

  const positions = matchups.map((matchup, index) => {
    const angle = (index / matchups.length) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * orbitalRadius;
    const y = centerY + Math.sin(angle) * orbitalRadius;
    return { ...matchup, x, y };
  });

  const getColor = (result) => isOngoing ? ONGOING_COLOR : result === 'win' ? WIN_COLOR : LOSS_COLOR;
  const getEmoji = (result) => isOngoing ? '⏳' : result === 'win' ? '🏆' : '❌';

  return (
    <div className="bg-gray-900 rounded-2xl p-8">
      <h2 className="text-xl font-bold text-white mb-2">{featuredTeam.name} — Battle Royale Network View</h2>
      <p className="text-xs text-gray-500 mb-2">How the featured team performed against every other team this rotation</p>
      {isFuture && (
        <div className="inline-flex items-center gap-2 bg-gray-700/50 border border-gray-600 text-gray-400 rounded-lg px-3 py-1.5 text-xs font-semibold mb-4">
          🔒 This rotation has not started yet — check back on {startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      )}
      {isOngoing && (
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-1.5 text-xs font-semibold mb-4">
          🔄 Rotation in progress — results so far
        </div>
      )}
      {isGracePeriod && (
        <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 rounded-lg px-3 py-1.5 text-xs font-semibold mb-4">
          ⏰ Rotation ended — players can still submit past check-ins until {graceDateLabel}
        </div>
      )}
      {isClosed && (
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg px-3 py-1.5 text-xs font-semibold mb-4">
          ✅ Rotation finished
        </div>
      )}

      <svg viewBox="0 0 800 600" className="w-full max-w-4xl mx-auto rounded-xl" style={{ background: '#0f172a' }}>
        {/* Lines + emoji badges */}
        {positions.map((pos, idx) => {
          const color = getColor(pos.result);
          const midX = (centerX + pos.x) / 2;
          const midY = (centerY + pos.y) / 2;
          return (
            <g key={`line-${idx}`}>
              <line
                x1={centerX} y1={centerY}
                x2={pos.x} y2={pos.y}
                stroke={color} strokeWidth="2.5" opacity="0.7"
              />
              <text x={midX} y={midY + 6} textAnchor="middle" fontSize="18">
                {getEmoji(pos.result)}
              </text>
            </g>
          );
        })}

        {/* Orbital circles */}
        {positions.map((pos, idx) => {
          const color = getColor(pos.result);
          return (
            <g key={`team-${idx}`}>
              <circle cx={pos.x} cy={pos.y} r="52" fill="white" stroke={color} strokeWidth="4" />
              <text x={pos.x} y={pos.y - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
                {pos.team.name}
              </text>
              <text x={pos.x} y={pos.y + 16} textAnchor="middle" fontSize="18" fontWeight="900" fill="#111827">
                {formatPoints(pos.score)}
              </text>
            </g>
          );
        })}

        {/* Featured team (center) */}
        <circle cx={centerX} cy={centerY} r="72" fill="white" stroke="#e2e8f0" strokeWidth="4" />
        <text x={centerX} y={centerY - 18} textAnchor="middle" fontSize="14" fontWeight="700" fill="#111827">
          {featuredTeam.name}
        </text>
        <text x={centerX} y={centerY + 14} textAnchor="middle" fontSize="28" fontWeight="900" fill="#111827">
          {formatPoints(featuredScore)}
        </text>
        <text x={centerX} y={centerY + 34} textAnchor="middle" fontSize="9" fontWeight="600" fill="#64748b">
          FEATURED
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-6 flex justify-center gap-8">
        {isOngoing ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: ONGOING_COLOR }} />
            <span className="text-gray-400 text-sm">⏳ Ongoing — final results pending</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: WIN_COLOR }} />
              <span className="text-gray-400 text-sm">Featured team won</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: LOSS_COLOR }} />
              <span className="text-gray-400 text-sm">Featured team lost</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TournamentNetwork;
