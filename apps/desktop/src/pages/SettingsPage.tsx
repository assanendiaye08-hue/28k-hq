import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
        enabled ? 'bg-brand' : 'bg-white/10'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
          enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function SettingsPage() {
  const {
    autoUpdateEnabled,
    autoStartEnabled,
    updateAvailable,
    isCheckingUpdate,
    isLoaded,
    loadFromDisk,
    setAutoUpdate,
    setAutoStart,
    checkUpdate,
    installUpdate,
  } = useSettingsStore();

  useEffect(() => {
    if (!isLoaded) {
      loadFromDisk();
    }
  }, [isLoaded, loadFromDisk]);

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>

      <div className="bg-surface-1 rounded-2xl p-6 space-y-5">
        {/* Auto-update toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Auto-update</p>
            <p className="text-xs text-text-secondary mt-0.5">Check for updates when app starts</p>
          </div>
          <Toggle enabled={autoUpdateEnabled} onChange={setAutoUpdate} />
        </div>

        {/* Autostart toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Launch at login</p>
            <p className="text-xs text-text-secondary mt-0.5">Start 28K HQ when you log in</p>
          </div>
          <Toggle enabled={autoStartEnabled} onChange={setAutoStart} />
        </div>
      </div>

      {/* Version & Updates */}
      <div className="bg-surface-1 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">App version</p>
          <p className="text-sm text-text-primary font-mono">0.1.0</p>
        </div>

        {updateAvailable && (
          <div className="flex items-center justify-between bg-brand/10 rounded-xl px-4 py-3">
            <p className="text-sm text-text-primary">
              Update available: <span className="text-brand font-semibold">v{updateAvailable.version}</span>
            </p>
            <button
              onClick={installUpdate}
              className="text-sm text-brand font-medium hover:underline"
            >
              Install &amp; Restart
            </button>
          </div>
        )}

        <button
          onClick={checkUpdate}
          disabled={isCheckingUpdate}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isCheckingUpdate && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Check for updates
        </button>
      </div>
    </div>
  );
}
