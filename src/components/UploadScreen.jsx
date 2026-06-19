import { useState, useCallback } from 'react';

export default function UploadScreen({ onDataLoaded }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.json')) {
      setError('Please upload a .json file exported from GymRats.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.check_ins || !data.members) {
          setError('This JSON does not look like a GymRats challenge export.');
          return;
        }
        onDataLoaded(data);
      } catch {
        setError('Failed to parse the JSON file. Make sure it is a valid GymRats export.');
      }
    };
    reader.readAsText(file);
  }, [onDataLoaded]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onInputChange = (e) => handleFile(e.target.files[0]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">🐀💪</div>
        <h1 className="text-3xl font-bold text-white">GymRats Data Viewer</h1>
        <p className="text-gray-400 mt-2">Drop your challenge export to visualise the data</p>
      </div>

      <label
        htmlFor="file-input"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          w-full max-w-md border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragging
            ? 'border-orange-400 bg-orange-500/10 scale-105'
            : 'border-gray-700 bg-gray-900 hover:border-orange-500 hover:bg-gray-800'
          }
        `}
      >
        <div className="text-4xl mb-4">{dragging ? '📂' : '📁'}</div>
        <p className="text-lg font-semibold text-gray-200">
          {dragging ? 'Drop it!' : 'Drag & drop your JSON file here'}
        </p>
        <p className="text-sm text-gray-500 mt-2">or click to browse</p>
        <input
          id="file-input"
          type="file"
          accept=".json"
          className="hidden"
          onChange={onInputChange}
        />
      </label>

      {error && (
        <div className="mt-4 max-w-md w-full bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <p className="mt-8 text-xs text-gray-600">
        Export your challenge data from the GymRats app → Challenge Settings → Export
      </p>
    </div>
  );
}
