import { useState } from 'react';
import { useGoalsStore, type Goal } from '../../stores/goals-store';

interface CreateGoalFormProps {
  onClose: () => void;
  parentGoals: Goal[];
}

function getDefaultDeadline(timeframe: string): string {
  const now = new Date();
  let target: Date;

  switch (timeframe) {
    case 'WEEKLY': {
      const dayOfWeek = now.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
      target = new Date(now);
      target.setDate(now.getDate() + daysUntilSunday);
      break;
    }
    case 'MONTHLY':
      target = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'QUARTERLY': {
      const quarter = Math.floor(now.getMonth() / 3);
      target = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
      break;
    }
    case 'YEARLY':
      target = new Date(now.getFullYear(), 11, 31);
      break;
    default:
      target = new Date(now);
      target.setDate(now.getDate() + 7);
  }

  return target.toISOString().split('T')[0];
}

export function CreateGoalForm({ onClose, parentGoals }: CreateGoalFormProps) {
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState<'MEASURABLE' | 'FREETEXT'>('FREETEXT');
  const [targetValue, setTargetValue] = useState<number>(10);
  const [unit, setUnit] = useState('');
  const [timeframe, setTimeframe] = useState('WEEKLY');
  const [deadline, setDeadline] = useState(getDefaultDeadline('WEEKLY'));
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const isSubmitting = useGoalsStore((s) => s.isSubmitting);
  const createGoal = useGoalsStore((s) => s.createGoal);

  function handleTimeframeChange(value: string) {
    setTimeframe(value);
    setDeadline(getDefaultDeadline(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }

    try {
      await createGoal({
        title: title.trim(),
        type: goalType,
        deadline,
        timeframe: timeframe || undefined,
        targetValue: goalType === 'MEASURABLE' ? targetValue : undefined,
        unit: goalType === 'MEASURABLE' && unit ? unit : undefined,
        parentId: parentId || undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create goal');
    }
  }

  return (
    <div className="bg-surface-2 rounded-xl border border-white/5 p-4 mb-4 animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Title */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="What do you want to achieve?"
            className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
          />
        </div>

        {/* Type toggle */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGoalType('FREETEXT')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                goalType === 'FREETEXT'
                  ? 'bg-brand text-surface-base'
                  : 'bg-surface-base text-text-secondary hover:text-text-primary'
              }`}
            >
              Freetext
            </button>
            <button
              type="button"
              onClick={() => setGoalType('MEASURABLE')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                goalType === 'MEASURABLE'
                  ? 'bg-brand text-surface-base'
                  : 'bg-surface-base text-text-secondary hover:text-text-primary'
              }`}
            >
              Measurable
            </button>
          </div>
        </div>

        {/* Target value + Unit (measurable only) */}
        {goalType === 'MEASURABLE' && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Target Value</label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
                min={1}
                className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pages, hours, commits..."
                className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        )}

        {/* Timeframe + Deadline */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-text-secondary mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => handleTimeframeChange(e.target.value)}
              className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-text-secondary mb-1">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Parent goal */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Parent Goal (optional)</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
          >
            <option value="">-- None --</option>
            {parentGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {'  '.repeat(g.depth)}{g.title}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Additional details..."
            className="w-full bg-surface-base border border-white/5 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand resize-none"
          />
        </div>

        {/* Error message */}
        {formError && (
          <p className="text-red-400 text-sm">{formError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-surface-base text-text-secondary rounded-lg text-sm font-medium hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-brand text-surface-base rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Goal'}
          </button>
        </div>
      </form>
    </div>
  );
}
