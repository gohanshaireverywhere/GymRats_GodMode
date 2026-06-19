import { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'gymrats-bonus-grants';

const BonusGrantsContext = createContext(null);

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.grants) ? parsed.grants : [];
  } catch {
    return [];
  }
}

function saveToStorage(grants) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ grants }));
}

export function BonusGrantsProvider({ children }) {
  const [grants, setGrants] = useState(loadFromStorage);

  const persist = (newGrants) => {
    setGrants(newGrants);
    saveToStorage(newGrants);
  };

  const addGrant = (grant) => {
    // Upsert: if a grant with the same grantId already exists, replace it
    const entry = { ...grant, confirmedAt: new Date().toISOString() };
    persist([...grants.filter(g => g.grantId !== grant.grantId), entry]);
  };

  const removeGrant = (grantId) => {
    persist(grants.filter(g => g.grantId !== grantId));
  };

  const isGranted = (grantId) => grants.some(g => g.grantId === grantId);

  const getGrant = (grantId) => grants.find(g => g.grantId === grantId);

  const getGrantsForPlayer = (playerId) => grants.filter(g => g.playerId === playerId);

  const getGrantsForPlayerDate = (playerId, date) =>
    grants.filter(g => g.playerId === playerId && g.date === date);

  // Match a specific check-in that was modified — keyed by original.checkInId
  const getGrantByOriginalCheckInId = (checkInId) =>
    grants.find(g => g.original?.checkInId === checkInId);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ grants }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bonus-grants.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.grants)) throw new Error('Invalid format: expected { grants: [] }');
        persist(parsed.grants);
        resolve(parsed.grants.length);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

  return (
    <BonusGrantsContext.Provider value={{
      grants,
      addGrant,
      removeGrant,
      isGranted,
      getGrant,
      getGrantsForPlayer,
      getGrantsForPlayerDate,
      getGrantByOriginalCheckInId,
      exportJSON,
      importJSON,
    }}>
      {children}
    </BonusGrantsContext.Provider>
  );
}

export function useBonusGrants() {
  const ctx = useContext(BonusGrantsContext);
  if (!ctx) throw new Error('useBonusGrants must be used inside BonusGrantsProvider');
  return ctx;
}
