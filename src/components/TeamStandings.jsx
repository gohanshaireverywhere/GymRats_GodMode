import Avatar from './Avatar';
import { formatPoints } from '../utils/dataProcessor';

const RANK_COLORS = [
  'from-yellow-500/20 to-yellow-600/5 border-yellow-600/30',
  'from-gray-400/20 to-gray-500/5 border-gray-500/30',
  'from-orange-700/20 to-orange-800/5 border-orange-700/30',
];

export default function TeamStandings({ teamStandings, onPlayerClick }) {
  if (teamStandings.length === 0) {
    return (
      <div className="bg-gray-900 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">👤</div>
        <h2 className="text-lg font-bold text-white">Individual challenge</h2>
        <p className="text-sm text-gray-500 mt-2">
          This challenge has no teams — players compete individually. Check the 🏆 Leaderboard or 🎯 Goals tab.
        </p>
      </div>
    );
  }

  const maxPoints = teamStandings[0]?.totalPoints || 1;

  return (
    <div className="space-y-4">
      {teamStandings.map((entry, i) => {
        const { team, totalPoints, avgPoints, members, rank } = entry;
        const barWidth = (totalPoints / maxPoints) * 100;
        const rankColor = RANK_COLORS[i] || 'from-gray-800/20 to-gray-900/5 border-gray-700/30';

        return (
          <div
            key={team.id}
            className={`bg-gradient-to-r ${rankColor} border rounded-2xl overflow-hidden`}
          >
            {/* Team header */}
            <div className="flex items-center gap-4 p-4 pb-3">
              {/* Rank badge */}
              <div className="text-2xl font-bold text-gray-400 w-8 text-center flex-shrink-0">
                {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
              </div>

              {/* Team photo */}
              {team.photo_url && (
                <img
                  src={team.photo_url}
                  alt={team.name}
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                />
              )}

              {/* Team info */}
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-white">{team.name}</div>
                <div className="text-sm text-gray-400">
                  {members.length} members · avg {formatPoints(avgPoints)} pts
                </div>
              </div>

              {/* Points */}
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-orange-400">{formatPoints(totalPoints)}</div>
                <div className="text-xs text-gray-500">points</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mx-4 mb-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-700"
                style={{ width: `${barWidth}%` }}
              />
            </div>

            {/* Members */}
            <div className="px-4 pb-4">
              <div className="flex flex-wrap gap-3">
                {members.map((m) => (
                  <button
                    key={m.member.id}
                    onClick={() => onPlayerClick(m.member.id)}
                    className="flex items-center gap-2 bg-gray-900/50 hover:bg-gray-900 rounded-xl px-3 py-1.5 transition-colors text-left group"
                  >
                    <Avatar url={m.member.profile_picture_url} name={m.member.full_name} size="xs" />
                    <div>
                      <div className="text-xs font-medium text-gray-200 group-hover:text-orange-300 leading-tight transition-colors">{m.member.full_name}</div>
                      <div className="text-xs text-orange-400">{formatPoints(m.totalPoints)} pts</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
