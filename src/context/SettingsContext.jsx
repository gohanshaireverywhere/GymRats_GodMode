import { createContext, useContext, useState, useEffect } from 'react';

const DEFAULTS = {
  distanceUnit: 'mi',
  goal: {
    enabled: true,
    metric: 'totalPoints',
    target: 40,
    label: '',
  },
  // GymRats applies a daily cap on each player's awarded points (Battle Royale
  // uses 30 pts/day). Raw check-in points can sum past this; the app shows the
  // capped figure. Default matches BR 2026 — turn off for non-capped challenges.
  dailyPointsCap: {
    enabled: true,
    value: 30,
  },
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('gymrats-settings');
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem('gymrats-settings', JSON.stringify(settings));
  }, [settings]);

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
