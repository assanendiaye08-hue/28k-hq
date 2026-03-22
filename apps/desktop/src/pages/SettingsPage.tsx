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
    autoStartEnabled,
    isLoaded,
    loadFromDisk,
    setAutoStart,
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
        {/* Autostart toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Launch at login</p>
            <p className="text-xs text-text-secondary mt-0.5">Start 28K HQ when you log in</p>
          </div>
          <Toggle enabled={autoStartEnabled} onChange={setAutoStart} />
        </div>
      </div>

      {/* Version */}
      <div className="bg-surface-1 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">App version</p>
          <p className="text-sm text-text-primary font-mono">0.1.0</p>
        </div>
      </div>
    </div>
  );
}
