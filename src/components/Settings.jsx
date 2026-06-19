import { useSettings } from '../context/SettingsContext';

const METRIC_OPTIONS = [
  { value: 'totalPoints', label: 'Points' },
  { value: 'checkInCount', label: 'Workouts' },
  { value: 'totalCalories', label: 'Calories' },
  { value: 'totalDistance', label: 'Distance' },
];

function Section({ title, description, children }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6">
      <div className="mb-5 pb-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            value === opt.value
              ? 'bg-orange-500 text-white shadow-md'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { settings, update } = useSettings();
  const goal = settings.goal;
  const setGoal = (patch) => update('goal', { ...goal, ...patch });
  const cap = settings.dailyPointsCap;
  const setCap = (patch) => update('dailyPointsCap', { ...cap, ...patch });

  return (
    <div className="max-w-2xl space-y-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Preferences are saved automatically and persist across sessions.
        </p>
      </div>

      <Section
        title="Display Preferences"
        description="Control how data is formatted throughout the app."
      >
        <SettingRow
          label="Distance Unit"
          description="The unit your challenge records distances in (the GymRats export reuses one field for both). Used everywhere distance is shown and in the Simulator."
        >
          <RadioGroup
            value={settings.distanceUnit}
            onChange={v => update('distanceUnit', v)}
            options={[
              { value: 'mi', label: 'Miles' },
              { value: 'km', label: 'Kilometers' },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Daily Points Cap"
          description="GymRats caps each player's daily points (Battle Royale uses 30). Raw check-in sums can exceed this — without the cap the viewer will overstate totals vs the app."
        >
          <RadioGroup
            value={cap.enabled ? 'on' : 'off'}
            onChange={v => setCap({ enabled: v === 'on' })}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingRow>

        {cap.enabled && (
          <SettingRow
            label="Cap Value"
            description="Maximum points awarded per player per day."
          >
            <input
              type="number"
              min="1"
              step="1"
              value={cap.value}
              onChange={e => setCap({ value: parseFloat(e.target.value) || 0 })}
              className="w-28 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </SettingRow>
        )}
      </Section>

      <Section
        title="Challenge Goal"
        description="Set a target for every player and track how far each one has progressed."
      >
        <SettingRow
          label="Enable Goal"
          description="When off, the goal column and 🎯 Goals tab are hidden."
        >
          <RadioGroup
            value={goal.enabled ? 'on' : 'off'}
            onChange={v => setGoal({ enabled: v === 'on' })}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingRow>

        {goal.enabled && (
          <>
            <SettingRow
              label="Metric"
              description="What each player needs to accumulate."
            >
              <RadioGroup
                value={goal.metric}
                onChange={v => setGoal({ metric: v })}
                options={METRIC_OPTIONS}
              />
            </SettingRow>

            <SettingRow
              label="Target"
              description={
                goal.metric === 'totalDistance'
                  ? `Value in ${settings.distanceUnit}.`
                  : 'Numeric target each player should reach.'
              }
            >
              <input
                type="number"
                min="1"
                value={goal.target}
                onChange={e => setGoal({ target: parseFloat(e.target.value) || 0 })}
                className="w-28 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-1.5 text-sm text-right focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </SettingRow>

            <SettingRow
              label="Custom Label"
              description='Optional. Falls back to "Reach X points" etc.'
            >
              <input
                type="text"
                value={goal.label}
                placeholder="(optional)"
                onChange={e => setGoal({ label: e.target.value })}
                className="w-52 bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </SettingRow>
          </>
        )}
      </Section>
    </div>
  );
}
