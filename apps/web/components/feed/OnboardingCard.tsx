'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const TOPICS = ['Accessibility', 'Tech', 'AI', 'Creators', 'Design', 'Open Source', 'Community', 'News'];

interface OnboardingCardProps {
  onCompleted: () => void;
}

/**
 * 1-step interest picker shown to newly registered users so their feed is
 * immediately personalized with starter creators and groups.
 */
export function OnboardingCard({ onCompleted }: OnboardingCardProps) {
  const { user, refreshUser } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!user || dismissed || (user.interests && user.interests.length > 0)) {
    return null;
  }

  const toggle = (topic: string) => {
    setSelected((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  };

  const submit = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    try {
      await api.onboarding.saveInterests(selected);
      await refreshUser();
      setDismissed(true);
      onCompleted();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Personalize your feed" className="rounded-xl border border-primary/50 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pick your interests</h2>
          <p className="text-sm text-onSurfaceDim">
            Select a few topics to follow starter creators and join matching communities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-11 rounded-md px-3 text-sm text-onSurfaceDim hover:bg-surfaceAlt"
        >
          Skip
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {TOPICS.map((topic) => {
          const active = selected.includes(topic);
          return (
            <button
              key={topic}
              type="button"
              onClick={() => toggle(topic)}
              aria-pressed={active}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                active ? 'border-primary bg-primary text-onPrimary' : 'border-border bg-bg hover:bg-surfaceAlt'
              }`}
            >
              {topic}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={selected.length === 0 || saving}
        className="mt-4 min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-onPrimary hover:bg-primaryHover disabled:opacity-50"
      >
        {saving ? 'Personalizing…' : `Personalize feed (${selected.length})`}
      </button>
    </section>
  );
}
