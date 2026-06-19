import { useMemo, useState, useRef, useEffect } from 'react';
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Brush,
} from 'recharts';
import Avatar from './Avatar';
import {
  getTimelineData, getTeamTimelineData,
  getTotalCumulativeData, getDailyBreakdown,
  getDailyPointsData,
  formatPoints,
  getActivityTypeSummary,
  getActivityTypePlayerData,
  restoreOriginalPoints,
} from '../utils/dataProcessor';
import { useBonusGrants } from '../context/BonusGrantsContext';

const PALETTE = [
  '#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444',
  '#06b6d4', '#84cc16', '#f59e0b', '#ec4899', '#6366f1',
  '#14b8a6', '#fb923c', '#e11d48', '#22d3ee', '#4ade80',
];

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLargeNumber(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return v.toFixed(0);
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl max-w-xs">
      <p className="text-xs text-gray-400 mb-2 font-medium">{formatDate(label)}</p>
      <div className="space-y-1">
        {sorted.map(entry => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="text-gray-300 truncate">{entry.name}</span>
            </div>
            <span className="font-semibold text-white flex-shrink-0">{formatPoints(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewTooltip({ active, payload, label, dailyBreakdown }) {
  if (!active || !payload?.length) return null;
  const dayData = dailyBreakdown[label];
  const cumulativeTotal = payload[0]?.value || 0;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl w-64">
      <p className="text-xs text-gray-400 mb-1 font-medium">{formatDate(label)}</p>
      <p className="text-sm font-bold text-orange-400 mb-2">{formatPoints(cumulativeTotal)} pts cumulative</p>
      {dayData && (
        <>
          <p className="text-xs text-gray-500 mb-1.5">+{formatPoints(dayData.total)} earned today · Top scorers:</p>
          <div className="space-y-1">
            {dayData.topScorers.slice(0, 5).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-3 flex-shrink-0">{i + 1}.</span>
                <span className="text-gray-200 flex-1 truncate">{s.member.full_name}</span>
                <span className="font-semibold text-white flex-shrink-0">{formatPoints(s.pts)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Player multi-select dropdown ─────────────────────────────────────────────

function PlayerMultiSelect({ leaderboard, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const filtered = leaderboard.filter(p =>
    p.member.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(leaderboard.map(p => p.member.id)));
  const clearAll = () => onChange(new Set());

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-200 transition-colors"
      >
        <span>
          {selectedIds.size === 0
            ? 'No players selected'
            : selectedIds.size === leaderboard.length
            ? 'All players'
            : `${selectedIds.size} player${selectedIds.size !== 1 ? 's' : ''} selected`}
        </span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-20 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-72">
          <div className="p-2 border-b border-gray-800">
            <input
              type="text"
              placeholder="Search players…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-gray-800 text-gray-200 placeholder-gray-600 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2 px-3 py-2 border-b border-gray-800">
            <button onClick={selectAll} className="text-xs text-orange-400 hover:text-orange-300 font-medium">
              Select all
            </button>
            <span className="text-gray-700">·</span>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-300 font-medium">
              Clear
            </button>
            <span className="ml-auto text-xs text-gray-600">{selectedIds.size} / {leaderboard.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-4">No players match</p>
            )}
            {filtered.map((p) => {
              const checked = selectedIds.has(p.member.id);
              const color = PALETTE[leaderboard.indexOf(p) % PALETTE.length];
              return (
                <label
                  key={p.member.id}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-gray-800/60' : 'hover:bg-gray-800/40'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.member.id)}
                    className="rounded border-gray-600 bg-gray-800 accent-orange-500 w-3.5 h-3.5 flex-shrink-0"
                  />
                  <span className="text-xs text-gray-600 w-5 flex-shrink-0">#{p.rank}</span>
                  <Avatar url={p.member.profile_picture_url} name={p.member.full_name} size="xs" />
                  <span className="text-sm text-gray-200 flex-1 truncate">{p.member.full_name}</span>
                  <span className="text-xs font-medium flex-shrink-0" style={{ color }}>
                    {formatPoints(p.totalPoints)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Standard cumulative chart ────────────────────────────────────────────────

function TimelineChart({ timelineData, keys, colors, interval }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 pt-6">
      <ResponsiveContainer width="100%" height={480}>
        <LineChart data={timelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={interval}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={v => v.toFixed(0)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
            formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>}
          />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Overview: cumulative total chart ────────────────────────────────────────

function TotalCumulativeChart({ totalData, dailyBreakdown, interval }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 pt-2">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Total Points — All Players Combined</h3>
        <p className="text-xs text-gray-500 mt-0.5">Hover over the chart to see who scored the most each day</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={totalData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={interval}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={formatLargeNumber}
          />
          <Tooltip content={<OverviewTooltip dailyBreakdown={dailyBreakdown} />} />
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#f97316' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Overview: player contributions list ─────────────────────────────────────

function PlayerContributions({ leaderboard }) {
  const [showAll, setShowAll] = useState(false);
  const grandTotal = leaderboard.reduce((sum, p) => sum + p.totalPoints, 0);
  const displayed = showAll ? leaderboard : leaderboard.slice(0, 15);

  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Player Contributions to Grand Total</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Grand total: <span className="text-orange-400 font-semibold">{formatPoints(grandTotal)} pts</span>
          {' '}across all {leaderboard.length} players
        </p>
      </div>
      <div className="space-y-2">
        {displayed.map((p, i) => {
          const pct = grandTotal ? (p.totalPoints / grandTotal) * 100 : 0;
          const color = PALETTE[i % PALETTE.length];
          return (
            <div key={p.member.id} className="flex items-center gap-2.5">
              <span className="text-xs text-gray-600 w-6 text-right flex-shrink-0">#{p.rank}</span>
              <Avatar url={p.member.profile_picture_url} name={p.member.full_name} size="xs" />
              <span className="text-xs text-gray-300 w-28 truncate flex-shrink-0">{p.member.full_name}</span>
              <div className="flex-1 h-3.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-200 w-14 text-right flex-shrink-0">
                {formatPoints(p.totalPoints)}
              </span>
              <span className="text-xs text-gray-600 w-9 text-right flex-shrink-0">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      {leaderboard.length > 15 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="mt-3 text-xs text-orange-400 hover:text-orange-300 font-medium"
        >
          {showAll ? 'Show top 15' : `Show all ${leaderboard.length} players`}
        </button>
      )}
    </div>
  );
}

// ─── Overview: daily scoreboard calendar ─────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DailyScoreboard({ dailyBreakdown, data }) {
  const days = useMemo(() => {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    const result = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      result.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [data]);

  const firstDOW = new Date(days[0] + 'T12:00:00Z').getDay();

  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Daily Top Scorers</h3>
        <p className="text-xs text-gray-500 mt-0.5">Who scored the most points each day of the challenge</p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {/* Day-of-week header row */}
        {DOW_LABELS.map(d => (
          <div key={d} className="text-center text-xs text-gray-600 py-1 font-medium">{d}</div>
        ))}

        {/* Empty offset cells for first-day alignment */}
        {Array.from({ length: firstDOW }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {/* Day cells */}
        {days.map(dateStr => {
          const dayData = dailyBreakdown[dateStr];
          const d = new Date(dateStr + 'T12:00:00Z');
          const dom = d.getDate();
          const isFirstOfMonth = dom === 1;
          const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });

          return (
            <div
              key={dateStr}
              className={`rounded-xl p-2 ${
                dayData
                  ? 'bg-gray-800 border border-gray-700/50'
                  : 'bg-gray-900/40 border border-gray-800/30'
              }`}
            >
              {/* Date + daily total */}
              <div className="flex items-baseline justify-between gap-1 mb-1.5">
                <span className="text-xs text-gray-500 leading-none">
                  {isFirstOfMonth ? `${monthLabel} ` : ''}{dom}
                </span>
                {dayData && (
                  <span className="text-xs font-bold text-orange-400 leading-none">
                    +{formatPoints(dayData.total)}
                  </span>
                )}
              </div>

              {/* Top 3 scorers */}
              {dayData ? (
                <div className="space-y-1">
                  {dayData.topScorers.slice(0, 3).map((s, i) => {
                    const firstName = s.member.full_name.split(' ')[0];
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-1 min-w-0"
                        title={`${s.member.full_name}: ${formatPoints(s.pts)} pts`}
                      >
                        <span className="text-xs leading-none flex-shrink-0">{MEDALS[i]}</span>
                        <span className="text-xs text-gray-400 truncate flex-1 leading-tight">{firstName}</span>
                        <span className="text-xs text-gray-300 flex-shrink-0 leading-tight tabular-nums">
                          {formatPoints(s.pts)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-700 mt-1">—</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Daily mode: tooltip ─────────────────────────────────────────────────────

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].filter(e => e.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, e) => s + e.value, 0);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl max-w-xs">
      <p className="text-xs text-gray-400 mb-1 font-medium">{formatDate(label)}</p>
      <p className="text-xs text-orange-400 font-semibold mb-2">{formatPoints(total)} pts earned</p>
      <div className="space-y-1">
        {sorted.map(entry => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
              <span className="text-gray-300 truncate">{entry.name}</span>
            </div>
            <span className="font-semibold text-white flex-shrink-0">{formatPoints(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Daily mode: stacked bar chart ───────────────────────────────────────────

function DailyChart({ dailyData, players, colors, interval }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 pt-2">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Daily Points Earned</h3>
        <p className="text-xs text-gray-500 mt-0.5">Points scored each day (not cumulative) · stacked by player</p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={interval}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={v => v.toFixed(0)}
          />
          <Tooltip content={<DailyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
            formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>}
          />
          {players.map((p, i) => (
            <Bar
              key={p.member.id}
              dataKey={p.member.full_name}
              stackId="stack"
              fill={colors[i]}
              radius={i === players.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Fraud Radar ──────────────────────────────────────────────────────────────

function formatActivityType(type) {
  if (!type || type === 'unknown') return 'Unknown';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function ActivityTypeSidebar({ types, selected, onSelect }) {
  return (
    <div className="w-44 flex-shrink-0 bg-gray-900 rounded-2xl overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Activity Types</p>
      </div>
      <div className="overflow-y-auto flex-1" style={{ maxHeight: 520 }}>
        {types.map(({ type, count }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
              selected === type
                ? 'bg-orange-500/20 text-orange-400 font-semibold'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <span className="truncate mr-2">{formatActivityType(type)}</span>
            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium ${
              selected === type ? 'bg-orange-500/30 text-orange-300' : 'bg-gray-800 text-gray-500'
            }`}>{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const AVG_KEY = '__avg__';
const MED_KEY = '__med__';
const REF_LABELS = { [AVG_KEY]: 'Average', [MED_KEY]: 'Median' };
const REF_COLORS = { [AVG_KEY]: '#facc15', [MED_KEY]: '#c084fc' };

// Hover-only tooltip — purely informational, no interactivity
function FraudTooltip({ active, payload, label, outliersByPeriod, aggregation }) {
  if (!active || !payload?.length) return null;
  const outliers = outliersByPeriod?.[label] || new Set();
  const periodLabel = aggregation === 'weekly' ? `Week of ${formatDate(label)}` : formatDate(label);

  const refEntries = payload.filter(e => e.dataKey === AVG_KEY || e.dataKey === MED_KEY);
  const playerEntries = [...payload]
    .filter(e => e.dataKey !== AVG_KEY && e.dataKey !== MED_KEY && e.value > 0)
    .sort((a, b) => b.value - a.value);

  if (playerEntries.length === 0 && refEntries.length === 0) return null;

  return (
    <div className="bg-gray-950 border border-gray-700 rounded-xl p-3 shadow-2xl pointer-events-none" style={{ minWidth: 200 }}>
      <p className="text-xs text-gray-400 mb-2 font-medium">{periodLabel} · click to inspect</p>
      <div className="space-y-1">
        {playerEntries.slice(0, 12).map((entry, i) => {
          const isOutlier = outliers.has(entry.dataKey);
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-gray-600 w-4 flex-shrink-0 text-right">{i + 1}.</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                <span className={`truncate ${isOutlier ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>{entry.name}</span>
                {isOutlier && <span className="flex-shrink-0">⚠️</span>}
              </div>
              <span className={`font-bold flex-shrink-0 ${isOutlier ? 'text-red-400' : 'text-white'}`}>
                {formatPoints(entry.value)}
              </span>
            </div>
          );
        })}
        {playerEntries.length > 12 && <p className="text-xs text-gray-600 pt-1">+{playerEntries.length - 12} more</p>}
      </div>
      {refEntries.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800 space-y-1">
          {refEntries.map(entry => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 flex-shrink-0" style={{ background: REF_COLORS[entry.dataKey] }} />
                <span style={{ color: REF_COLORS[entry.dataKey] }}>{REF_LABELS[entry.dataKey]}</span>
              </div>
              <span className="font-bold" style={{ color: REF_COLORS[entry.dataKey] }}>
                {formatPoints(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Clickable legend pills rendered outside the chart
function FraudLegend({ players, allPlayers, outlierIds, hiddenIds, onToggle, showOnlyOutliers }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {allPlayers.map((player, i) => {
        const isOutlier = outlierIds.has(player.id);
        const isHidden = hiddenIds.has(player.id);
        const isDimmed = isHidden || (showOnlyOutliers && !isOutlier);
        const color = isOutlier ? '#ef4444' : PALETTE[i % PALETTE.length];
        return (
          <button
            key={player.id}
            onClick={() => onToggle(player.id)}
            title={isHidden ? 'Click to show' : 'Click to hide'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              isDimmed
                ? 'border-gray-700 text-gray-600 bg-transparent opacity-50'
                : 'border-transparent'
            }`}
            style={isDimmed ? {} : { background: color + '22', borderColor: color + '55', color }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: isDimmed ? '#374151' : color }}
            />
            {player.name}
            {isOutlier && !isDimmed && <span className="ml-0.5">⚠️</span>}
          </button>
        );
      })}
    </div>
  );
}

function FraudDetailPanel({ period, fraudData, allPlayers, outlierIds, aggregation, onOpenPopup, onClose, isPinned }) {
  const periodLabel = aggregation === 'weekly' ? `Week of ${formatDate(period)}` : formatDate(period);
  const periodPoint = fraudData.chartData.find(d => d.period === period);

  const rows = allPlayers
    .map(p => ({
      ...p,
      score: periodPoint ? (periodPoint[p.name] || 0) : 0,
      activities: fraudData.activitiesByPlayerByPeriod?.[p.id]?.[period] || [],
    }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (rows.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white">{periodLabel}</p>
          {!isPinned && <span className="text-xs text-gray-600">click chart to pin</span>}
        </div>
        {isPinned && <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>}
      </div>
      <div className="divide-y divide-gray-800/60">
        {rows.map((p, i) => {
          const isOutlier = outlierIds.has(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-600 text-xs w-4 flex-shrink-0">{i + 1}.</span>
                <span className={`text-sm truncate ${isOutlier ? 'text-red-400 font-semibold' : 'text-gray-200'}`}>
                  {isOutlier && '⚠️ '}{p.name}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-sm font-bold ${isOutlier ? 'text-red-400' : 'text-white'}`}>
                  {formatPoints(p.score)}
                </span>
                {p.activities.length > 0 && (
                  <button
                    onClick={() => onOpenPopup({ player: p, period, activities: p.activities, aggregation })}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {p.activities.length} {p.activities.length === 1 ? 'activity' : 'activities'} →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPopup({ data, memberMap, onActivityClick, onPlayerClick, onClose }) {
  if (!data) return null;
  const { player, period, activities, aggregation } = data;
  const member = memberMap?.[player.id] || { full_name: player.name, profile_picture_url: player.avatarUrl };
  const periodLabel = aggregation === 'weekly' ? `Week of ${formatDate(period)}` : formatDate(period);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-80 max-h-96 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <button
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0 text-left"
            onClick={() => { onPlayerClick(player.id); onClose(); }}
          >
            <Avatar member={member} size={28} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{player.name}</p>
              <p className="text-xs text-gray-500">{periodLabel}</p>
            </div>
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 flex-shrink-0 ml-2 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {activities.map(ci => (
            <button
              key={ci.id}
              onClick={() => { onActivityClick(ci.id); onClose(); }}
              className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-xs text-gray-500">
                  {new Date(ci.occurred_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-sm text-white font-medium truncate mt-0.5">
                  {ci.title || formatActivityType(ci.activity_type) || 'Workout'}
                </p>
              </div>
              <span className="text-sm font-bold text-orange-400 flex-shrink-0">{formatPoints(ci.points)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FraudRadarChart({ chartData, visiblePlayers, allPlayers, outliersByPeriod, aggregation, onChartClick, onChartHover, showAverage, showMedian }) {
  const getColor = (player) => {
    const isOutlier = Object.values(outliersByPeriod).some(s => s.has(player.id));
    if (isOutlier) return '#ef4444';
    const idx = allPlayers.findIndex(p => p.id === player.id);
    return PALETTE[idx % PALETTE.length];
  };

  return (
    <ResponsiveContainer width="100%" height={420}>
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        onClick={(e) => e?.activeLabel && onChartClick(e.activeLabel)}
        onMouseMove={(e) => onChartHover?.(e?.activeLabel || null)}
        onMouseLeave={() => onChartHover?.(null)}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="period"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={formatDate}
          interval={aggregation === 'daily' ? 6 : 0}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatLargeNumber}
        />
        <Tooltip
          content={(props) => (
            <FraudTooltip
              {...props}
              outliersByPeriod={outliersByPeriod}
              aggregation={aggregation}
            />
          )}
        />
        <Brush
          dataKey="period"
          height={22}
          stroke="#374151"
          fill="#111827"
          travellerWidth={6}
          tickFormatter={formatDate}
        />
        {visiblePlayers.map((player) => {
          const isOutlier = Object.values(outliersByPeriod).some(s => s.has(player.id));
          const color = getColor(player);
          return (
            <Line
              key={player.name}
              type="monotone"
              dataKey={player.name}
              stroke={color}
              strokeWidth={isOutlier ? 2.5 : 1.5}
              strokeDasharray={isOutlier ? '6 3' : undefined}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          );
        })}
        {showAverage && (
          <Line
            key={AVG_KEY}
            type="monotone"
            dataKey={AVG_KEY}
            name="Average"
            stroke={REF_COLORS[AVG_KEY]}
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        )}
        {showMedian && (
          <Line
            key={MED_KEY}
            type="monotone"
            dataKey={MED_KEY}
            name="Median"
            stroke={REF_COLORS[MED_KEY]}
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Timeline({ data, leaderboard, teamStandings, memberMap, onPlayerClick, onActivityClick }) {
  const [mode, setMode] = useState('overview');

  // Players mode — multi-select, default top 10
  const defaultSelected = useMemo(
    () => new Set(leaderboard.slice(0, 10).map(p => p.member.id)),
    [leaderboard]
  );
  const [selectedIds, setSelectedIds] = useState(defaultSelected);

  // Daily mode — independent player selection, default top 10
  const defaultDailySelected = useMemo(
    () => new Set(leaderboard.slice(0, 10).map(p => p.member.id)),
    [leaderboard]
  );
  const [dailySelectedIds, setDailySelectedIds] = useState(defaultDailySelected);

  // Teams mode — toggleable team pills, default all on
  const [hiddenTeams, setHiddenTeams] = useState(new Set());

  const toggleTeam = (id) => {
    setHiddenTeams(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Players timeline
  const selectedPlayers = useMemo(
    () => leaderboard.filter(p => selectedIds.has(p.member.id)),
    [leaderboard, selectedIds]
  );
  const playerTimelineData = useMemo(
    () => getTimelineData(data, selectedPlayers),
    [data, selectedPlayers]
  );
  const playerKeys = selectedPlayers.map(p => p.member.full_name);
  const playerColors = selectedPlayers.map(p => PALETTE[leaderboard.indexOf(p) % PALETTE.length]);

  // Teams timeline
  const visibleTeams = useMemo(
    () => teamStandings.filter(ts => !hiddenTeams.has(ts.team.id)),
    [teamStandings, hiddenTeams]
  );
  const teamTimelineData = useMemo(
    () => getTeamTimelineData(data, visibleTeams),
    [data, visibleTeams]
  );

  const teamColorMap = useMemo(() => {
    const map = {};
    teamStandings.forEach((ts, i) => { map[ts.team.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [teamStandings]);

  // Overview mode
  const totalCumulativeData = useMemo(() => getTotalCumulativeData(data), [data]);
  const dailyBreakdown = useMemo(() => getDailyBreakdown(data, memberMap), [data, memberMap]);

  // Daily mode
  const dailyPlayers = useMemo(
    () => leaderboard.filter(p => dailySelectedIds.has(p.member.id)),
    [leaderboard, dailySelectedIds]
  );
  const dailyPointsData = useMemo(
    () => getDailyPointsData(data, dailyPlayers),
    [data, dailyPlayers]
  );
  const dailyColors = dailyPlayers.map(p => PALETTE[leaderboard.indexOf(p) % PALETTE.length]);

  // Fraud Radar mode
  const { grants } = useBonusGrants();
  const [fraudType, setFraudType] = useState(null);
  const [fraudAgg, setFraudAgg] = useState('daily');
  const [popupData, setPopupData] = useState(null);
  const [hiddenFraudPlayers, setHiddenFraudPlayers] = useState(new Set());
  const [showOnlyOutliers, setShowOnlyOutliers] = useState(false);
  const [clickedFraudPeriod, setClickedFraudPeriod] = useState(null);
  const [hoveredFraudPeriod, setHoveredFraudPeriod] = useState(null);
  const hoverClearTimer = useRef(null);
  const [excludeBRBonus, setExcludeBRBonus] = useState(false);
  const [showFraudAverage, setShowFraudAverage] = useState(false);
  const [showFraudMedian, setShowFraudMedian] = useState(false);
  const [fraudMadThreshold, setFraudMadThreshold] = useState(2.5);

  const fraudActivityTypes = useMemo(() => getActivityTypeSummary(data), [data]);
  const resolvedFraudType = fraudType || fraudActivityTypes[0]?.type || null;

  // When the toggle is on, restore pre-bonus points so BR rewards don't skew the analysis
  const fraudAnalysisData = useMemo(() => {
    if (!excludeBRBonus || !grants?.length) return data;
    return { ...data, check_ins: restoreOriginalPoints(data.check_ins, grants) };
  }, [data, excludeBRBonus, grants]);

  const fraudData = useMemo(
    () => resolvedFraudType
      ? getActivityTypePlayerData(fraudAnalysisData, resolvedFraudType, memberMap, fraudAgg, { madThreshold: fraudMadThreshold })
      : null,
    [fraudAnalysisData, resolvedFraudType, memberMap, fraudAgg, fraudMadThreshold]
  );

  // Trim chart data to last period that has any non-zero value
  const trimmedFraudChartData = useMemo(() => {
    if (!fraudData?.chartData?.length) return [];
    let lastIdx = 0;
    fraudData.chartData.forEach((point, i) => {
      if (fraudData.players.some(p => (point[p.name] || 0) > 0)) lastIdx = i;
    });
    return fraudData.chartData.slice(0, lastIdx + 1);
  }, [fraudData]);

  // Augment chart data with per-period average/median across ALL players when toggled on
  const augmentedFraudChartData = useMemo(() => {
    if (!trimmedFraudChartData.length || !fraudData) return trimmedFraudChartData;
    if (!showFraudAverage && !showFraudMedian) return trimmedFraudChartData;
    return trimmedFraudChartData.map(point => {
      const scores = fraudData.players
        .map(p => point[p.name] || 0)
        .filter(s => s > 0);
      const result = { ...point };
      if (showFraudAverage && scores.length > 0) {
        result[AVG_KEY] = parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
      }
      if (showFraudMedian && scores.length > 0) {
        const sorted = [...scores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        result[MED_KEY] = parseFloat(
          (sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]).toFixed(2)
        );
      }
      return result;
    });
  }, [trimmedFraudChartData, fraudData, showFraudAverage, showFraudMedian]);

  // Compute the set of all outlier player IDs across all periods
  const fraudOutlierIds = useMemo(() => {
    if (!fraudData) return new Set();
    const ids = new Set();
    Object.values(fraudData.outliersByPeriod).forEach(s => s.forEach(id => ids.add(id)));
    return ids;
  }, [fraudData]);

  // Players visible in the chart (respects hide + outlier-only filter)
  const visibleFraudPlayers = useMemo(() => {
    if (!fraudData) return [];
    return fraudData.players.filter(p => {
      if (hiddenFraudPlayers.has(p.id)) return false;
      if (showOnlyOutliers && !fraudOutlierIds.has(p.id)) return false;
      return true;
    });
  }, [fraudData, hiddenFraudPlayers, showOnlyOutliers, fraudOutlierIds]);

  const toggleFraudPlayer = (id) => {
    setHiddenFraudPlayers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleChartHover = (period) => {
    if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    if (period) {
      setHoveredFraudPeriod(period);
    } else {
      // 350 ms grace — lets the mouse travel from chart to the detail panel without it disappearing
      hoverClearTimer.current = setTimeout(() => setHoveredFraudPeriod(null), 350);
    }
  };

  const xInterval = 6;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'daily',    label: '📅 Daily' },
            { key: 'players',  label: '👤 Players' },
            { key: 'teams',    label: '👥 Teams' },
            { key: 'fraud',    label: '🚨 Fraud Radar' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                mode === key
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Players mode controls */}
      {mode === 'players' && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-400">Showing:</span>
          <PlayerMultiSelect
            leaderboard={leaderboard}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />
          {selectedIds.size === 0 && (
            <span className="text-xs text-gray-600">Select at least one player to display the chart</span>
          )}
        </div>
      )}

      {/* Teams mode controls */}
      {mode === 'teams' && teamStandings.length === 0 && (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">👤</div>
          <h2 className="text-lg font-bold text-white">Individual challenge</h2>
          <p className="text-sm text-gray-500 mt-2">
            This challenge has no teams. Try the Overview, Daily, or Players modes above.
          </p>
        </div>
      )}

      {mode === 'teams' && teamStandings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-400">Toggle teams:</span>
          {teamStandings.map(ts => {
            const hidden = hiddenTeams.has(ts.team.id);
            const color = teamColorMap[ts.team.id];
            return (
              <button
                key={ts.team.id}
                onClick={() => toggleTeam(ts.team.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  hidden
                    ? 'border-gray-700 text-gray-600 bg-transparent'
                    : 'border-transparent text-white'
                }`}
                style={hidden ? {} : { background: color + '33', borderColor: color + '66', color }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: hidden ? '#4b5563' : color }}
                />
                {ts.team.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Overview mode */}
      {mode === 'overview' && (
        <div className="space-y-4">
          <TotalCumulativeChart
            totalData={totalCumulativeData}
            dailyBreakdown={dailyBreakdown}
            interval={xInterval}
          />
          <PlayerContributions leaderboard={leaderboard} />
          <DailyScoreboard dailyBreakdown={dailyBreakdown} data={data} />
        </div>
      )}

      {/* Daily mode */}
      {mode === 'daily' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-400">Players:</span>
            <PlayerMultiSelect
              leaderboard={leaderboard}
              selectedIds={dailySelectedIds}
              onChange={setDailySelectedIds}
            />
            {dailySelectedIds.size === 0 && (
              <span className="text-xs text-gray-600">Select at least one player to display the chart</span>
            )}
          </div>
          {dailyPlayers.length > 0 ? (
            <DailyChart
              dailyData={dailyPointsData}
              players={dailyPlayers}
              colors={dailyColors}
              interval={xInterval}
            />
          ) : (
            <div className="bg-gray-900 rounded-2xl flex items-center justify-center h-48 text-gray-600">
              <p>Select at least one player above to display the chart</p>
            </div>
          )}
        </div>
      )}

      {/* Players chart */}
      {mode === 'players' && selectedIds.size > 0 && (
        <TimelineChart
          timelineData={playerTimelineData}
          keys={playerKeys}
          colors={playerColors}
          interval={xInterval}
        />
      )}

      {/* Teams chart */}
      {mode === 'teams' && visibleTeams.length > 0 && (
        <TimelineChart
          timelineData={teamTimelineData}
          keys={visibleTeams.map(ts => ts.team.name)}
          colors={visibleTeams.map(ts => teamColorMap[ts.team.id])}
          interval={xInterval}
        />
      )}

      {((mode === 'players' && selectedIds.size === 0) || (mode === 'teams' && visibleTeams.length === 0 && teamStandings.length > 0)) && (
        <div className="bg-gray-900 rounded-2xl flex items-center justify-center h-48 text-gray-600">
          <p>Nothing selected — enable at least one {mode === 'players' ? 'player' : 'team'} above</p>
        </div>
      )}

      {/* Fraud Radar mode */}
      {mode === 'fraud' && (
        <div className="flex gap-4 items-start">
          <ActivityTypeSidebar
            types={fraudActivityTypes}
            selected={resolvedFraudType}
            onSelect={(type) => { setFraudType(type); setClickedFraudPeriod(null); setHiddenFraudPlayers(new Set()); setShowOnlyOutliers(false); }}
          />
          <div className="flex-1 space-y-3 min-w-0">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {formatActivityType(resolvedFraudType || '')}
              </span>
              <div className="flex gap-1 ml-auto flex-wrap">
                {grants?.length > 0 && (
                  <button
                    onClick={() => setExcludeBRBonus(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      excludeBRBonus
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    ⚔️ Exclude BR bonuses
                  </button>
                )}
                {['daily', 'weekly'].map(agg => (
                  <button
                    key={agg}
                    onClick={() => { setFraudAgg(agg); setClickedFraudPeriod(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      fraudAgg === agg
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {agg.charAt(0).toUpperCase() + agg.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sensitivity slider */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex-shrink-0">Sensitivity</span>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.25}
                value={fraudMadThreshold}
                onChange={e => setFraudMadThreshold(parseFloat(e.target.value))}
                className="w-32 accent-orange-500"
              />
              <span className="font-mono text-orange-400 w-8">{fraudMadThreshold}×</span>
              <span className="text-gray-600">← more outliers · fewer →</span>
            </div>

            {/* Outlier info */}
            {fraudData && fraudOutlierIds.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 border border-red-900/40 rounded-xl text-xs text-red-400">
                <span>⚠️</span>
                <span>Red dashed lines are statistical outliers (≥ {fraudMadThreshold}× MAD above median). Hover to preview · click chart to inspect.</span>
              </div>
            )}

            {/* Chart */}
            {fraudData && fraudData.players.length > 0 ? (
              <div className="bg-gray-900 rounded-2xl p-4">
                <FraudRadarChart
                  chartData={augmentedFraudChartData}
                  visiblePlayers={visibleFraudPlayers}
                  allPlayers={fraudData.players}
                  outliersByPeriod={fraudData.outliersByPeriod}
                  aggregation={fraudAgg}
                  onChartClick={(period) => setClickedFraudPeriod(prev => prev === period ? null : period)}
                  onChartHover={handleChartHover}
                  showAverage={showFraudAverage}
                  showMedian={showFraudMedian}
                />
                {/* Clickable legend pills */}
                <FraudLegend
                  allPlayers={fraudData.players}
                  outlierIds={fraudOutlierIds}
                  hiddenIds={hiddenFraudPlayers}
                  onToggle={toggleFraudPlayer}
                  showOnlyOutliers={showOnlyOutliers}
                />
                {/* Control row */}
                <div className="flex items-center gap-2 pt-2 mt-2 border-t border-gray-800 flex-wrap">
                  <button
                    onClick={() => setHiddenFraudPlayers(new Set(fraudData.players.map(p => p.id)))}
                    className="px-2.5 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    Remove all
                  </button>
                  <button
                    onClick={() => setHiddenFraudPlayers(new Set())}
                    className="px-2.5 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    Add all
                  </button>
                  <div className="w-px h-4 bg-gray-700 mx-1 flex-shrink-0" />
                  {fraudOutlierIds.size > 0 && (
                    <button
                      onClick={() => setShowOnlyOutliers(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        showOnlyOutliers
                          ? 'border-red-500/50 bg-red-500/10 text-red-400'
                          : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      ⚠️ Outliers only
                    </button>
                  )}
                  <div className="w-px h-4 bg-gray-700 mx-1 flex-shrink-0" />
                  <button
                    onClick={() => setShowFraudAverage(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      showFraudAverage
                        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                        : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <span className="inline-block w-4 h-0.5 flex-shrink-0" style={{ background: '#facc15' }} />
                    Average
                  </button>
                  <button
                    onClick={() => setShowFraudMedian(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      showFraudMedian
                        ? 'border-purple-400/50 bg-purple-400/10 text-purple-400'
                        : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <span className="inline-block w-4 h-0.5 flex-shrink-0" style={{ background: '#c084fc' }} />
                    Median
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-2xl flex items-center justify-center h-48 text-gray-600">
                <p>No activities of this type recorded</p>
              </div>
            )}

            {/* Detail panel — appears on hover, stays pinned on click */}
            {(hoveredFraudPeriod || clickedFraudPeriod) && fraudData && (
              <div
                onMouseEnter={() => { if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current); }}
                onMouseLeave={() => { if (!clickedFraudPeriod) hoverClearTimer.current = setTimeout(() => setHoveredFraudPeriod(null), 150); }}
              >
              <FraudDetailPanel
                period={clickedFraudPeriod || hoveredFraudPeriod}
                fraudData={fraudData}
                allPlayers={fraudData.players}
                outlierIds={fraudOutlierIds}
                aggregation={fraudAgg}
                onOpenPopup={setPopupData}
                isPinned={!!clickedFraudPeriod}
                onClose={() => { setClickedFraudPeriod(null); setHoveredFraudPeriod(null); }}
              />
              </div>
            )}

            {fraudData && fraudData.players.length > 0 && (
              <p className="text-xs text-gray-600 text-right">
                Non-cumulative points per {fraudAgg === 'weekly' ? 'week' : 'day'} · {visibleFraudPlayers.length}/{fraudData.players.length} players shown
              </p>
            )}
          </div>
        </div>
      )}

      {/* Activity popup (Fraud Radar) */}
      {popupData && onPlayerClick && onActivityClick && (
        <ActivityPopup
          data={popupData}
          memberMap={memberMap}
          onActivityClick={onActivityClick}
          onPlayerClick={onPlayerClick}
          onClose={() => setPopupData(null)}
        />
      )}

      {mode !== 'fraud' && (
        <p className="text-xs text-gray-600 text-right">
          Cumulative points · {formatDate(data.start_date?.slice(0, 10))} – {formatDate(data.end_date?.slice(0, 10))}
        </p>
      )}
    </div>
  );
}
