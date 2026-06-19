import { useState, useMemo } from 'react';
import UploadScreen from './components/UploadScreen';
import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';
import TeamStandings from './components/TeamStandings';
import Timeline from './components/Timeline';
import BattleRoyale from './components/BattleRoyale';
import PlayerTab from './components/PlayerTab';
import Goals from './components/Goals';
import Audit from './components/Audit';
import Simulator from './components/Simulator';
import Activity from './components/Activity';
import Feed from './components/Feed';
import ActivityTypes from './components/ActivityTypes';
import TeamBuilder from './components/TeamBuilder';
import Settings from './components/Settings';
import GapFinder from './components/GapFinder';
import { useSettings } from './context/SettingsContext';
import { processChallenge, getTeamStandings } from './utils/dataProcessor';

const VIEWS = [
  { key: 'battle', label: '⚔️ Battle Royale' },
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'feed', label: '📰 Feed' },
  { key: 'leaderboard', label: '🏆 Leaderboard' },
  { key: 'teams', label: '👥 Teams' },
  { key: 'team_builder', label: '🧩 Team Builder' },
  { key: 'timeline', label: '📈 Timeline' },
  { key: 'player', label: '👤 Player' },
  { key: 'goals', label: '🎯 Goals' },
  { key: 'audit', label: '🔍 Audit' },
  { key: 'activity_types', label: '🏷️ Activity Types' },
  { key: 'simulator', label: '🧪 Simulator' },
  { key: 'gap_finder', label: '🎁 Gap Finder' },
  { key: 'settings', label: '⚙️ Settings' },
];

function formatDateRange(start, end) {
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

const RETURN_LABELS = {
  dashboard: 'Dashboard',
  feed: 'Feed',
  leaderboard: 'Leaderboard',
  teams: 'Teams',
  team_builder: 'Team Builder',
  timeline: 'Timeline',
  battle: 'Battle Royale',
  player: 'Player',
  goals: 'Goals',
  audit: 'Audit',
  activity_types: 'Activity Types',
  simulator: 'Simulator',
};

export default function App() {
  const { settings } = useSettings();
  const [rawData, setRawData] = useState(null);
  const [activeView, setActiveView] = useState('battle');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [activityReturnView, setActivityReturnView] = useState(null);
  const [feedInitialFilters, setFeedInitialFilters] = useState(null);

  const { memberMap, leaderboard, memberStats } = useMemo(
    () => rawData
      ? processChallenge(rawData, { dailyCap: settings.dailyPointsCap })
      : { memberMap: {}, leaderboard: [], memberStats: {} },
    [rawData, settings.dailyPointsCap]
  );

  const teamStandings = useMemo(
    () => rawData ? getTeamStandings(rawData, memberStats) : [],
    [rawData, memberStats]
  );

  const navigateToPlayer = (id) => {
    setSelectedActivityId(null);
    setSelectedPlayerId(id);
    setActiveView('player');
  };

  const navigateToActivity = (id) => {
    setActivityReturnView(activeView);
    setSelectedActivityId(id);
  };

  const navigateToFeedWithActivity = (type) => {
    setFeedInitialFilters({ activityTypes: [type], token: Date.now() });
    setSelectedActivityId(null);
    setSelectedPlayerId(null);
    setActiveView('feed');
  };

  const closeActivity = () => {
    setSelectedActivityId(null);
    if (activityReturnView) {
      setActiveView(activityReturnView);
      setActivityReturnView(null);
    }
  };

  if (!rawData) {
    return <UploadScreen onDataLoaded={setRawData} />;
  }

  const totalCheckIns = rawData.check_ins.length;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">🐀💪</span>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-sm sm:text-base leading-tight truncate">
                {rawData.name}
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">
                {formatDateRange(rawData.start_date, rawData.end_date)}
                {' · '}
                {rawData.members.length} members
                {' · '}
                {totalCheckIns.toLocaleString()} check-ins
              </p>
            </div>
          </div>
          <button
            onClick={() => setRawData(null)}
            className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Load new file
          </button>
        </div>

        {/* Nav */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => {
                setActiveView(v.key);
                setSelectedActivityId(null);
                setActivityReturnView(null);
                if (v.key !== 'player') setSelectedPlayerId(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeView === v.key
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {selectedActivityId ? (
          <Activity
            activityId={selectedActivityId}
            data={rawData}
            memberMap={memberMap}
            onPlayerClick={navigateToPlayer}
            onBack={closeActivity}
            backLabel={`Back to ${RETURN_LABELS[activityReturnView] || 'previous'}`}
          />
        ) : (
          <>
            {activeView === 'dashboard' && (
              <Dashboard
                data={rawData}
                leaderboard={leaderboard}
                memberStats={memberStats}
                memberMap={memberMap}
                onPlayerClick={navigateToPlayer}
                onActivityClick={navigateToActivity}
              />
            )}
            {activeView === 'feed' && (
              <Feed
                data={rawData}
                memberMap={memberMap}
                onPlayerClick={navigateToPlayer}
                onActivityClick={navigateToActivity}
                initialFilters={feedInitialFilters}
              />
            )}
            {activeView === 'leaderboard' && (
              <Leaderboard leaderboard={leaderboard} onPlayerClick={navigateToPlayer} />
            )}
            {activeView === 'teams' && (
              <TeamStandings teamStandings={teamStandings} onPlayerClick={navigateToPlayer} />
            )}
            {activeView === 'team_builder' && (
              <TeamBuilder data={rawData} memberMap={memberMap} />
            )}
            {activeView === 'timeline' && (
              <Timeline
                data={rawData}
                leaderboard={leaderboard}
                teamStandings={teamStandings}
                memberMap={memberMap}
                onPlayerClick={navigateToPlayer}
                onActivityClick={navigateToActivity}
              />
            )}
            {activeView === 'battle' && (
              <BattleRoyale data={rawData} memberStats={memberStats} onPlayerClick={navigateToPlayer} />
            )}
            {activeView === 'player' && (
              <PlayerTab
                data={rawData}
                leaderboard={leaderboard}
                selectedPlayerId={selectedPlayerId}
                onPlayerClick={(id) => {
                  setSelectedPlayerId(id);
                  setActiveView('player');
                }}
                onActivityClick={navigateToActivity}
              />
            )}
            {activeView === 'goals' && (
              <Goals leaderboard={leaderboard} onPlayerClick={navigateToPlayer} />
            )}
            {activeView === 'audit' && (
              <Audit
                data={rawData}
                memberMap={memberMap}
                onPlayerClick={navigateToPlayer}
                onActivityClick={navigateToActivity}
              />
            )}
            {activeView === 'activity_types' && (
              <ActivityTypes data={rawData} onActivityTypeClick={navigateToFeedWithActivity} />
            )}
            {activeView === 'simulator' && (
              <Simulator
                data={rawData}
                memberMap={memberMap}
                onPlayerClick={navigateToPlayer}
                onActivityClick={navigateToActivity}
              />
            )}
            {activeView === 'gap_finder' && (
              <GapFinder data={rawData} memberStats={memberStats} />
            )}
            {activeView === 'settings' && (
              <Settings />
            )}
          </>
        )}
      </main>
    </div>
  );
}
