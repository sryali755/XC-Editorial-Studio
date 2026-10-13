import {
  creativeControls,
  controlDescription,
  controlLevel,
  defaultPersonality,
  isPerspective,
  type PersonalitySettings,
} from "@/lib/creative-controls";

export function CreativeControls({
  agentId,
  value,
  disabled,
  onChange,
}: {
  agentId: string;
  value: PersonalitySettings;
  disabled: boolean;
  onChange: (value: PersonalitySettings) => void;
}) {
  if (!isPerspective(agentId)) return null;
  return (
    <details className="creative-controls" open>
      <summary>Creative Controls</summary>
      <p className="muted">
        Move left for a restrained version of this perspective or right for its
        strongest expression. Changes apply when you regenerate.
      </p>
      {(() => {
        const control = creativeControls[agentId].primary;
        const id = `${agentId}-primary`;
        const description = controlDescription(control, value.primary);
        const intensity = controlLevel(control, value.primary);
        return (
          <div className="creative-control">
            <label htmlFor={id}>{control.label}</label>
            <input
              id={id}
              type="range"
              min={1}
              max={10}
              step={1}
              value={value.primary}
              disabled={disabled}
              aria-describedby={`${id}-description`}
              aria-valuetext={`${intensity}. ${description}`}
              onChange={(e) => onChange({ primary: Number(e.target.value) })}
            />
            <p id={`${id}-description`}>
              <strong>{intensity}</strong> — {description}
            </p>
          </div>
        );
      })()}
      <button
        type="button"
        className="button small"
        disabled={disabled}
        onClick={() => onChange(defaultPersonality())}
      >
        Reset controls
      </button>
    </details>
  );
}
