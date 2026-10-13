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
        Shape the next candidate. Changes apply when you regenerate.
      </p>
      {(["primary", "secondary"] as const).map((key) => {
        const control = creativeControls[agentId][key];
        const id = `${agentId}-${key}`;
        const description = controlDescription(control, value[key]);
        const intensity = controlLevel(control, value[key]);
        return (
          <div className="creative-control" key={key}>
            <label htmlFor={id}>{control.label}</label>
            <input
              id={id}
              type="range"
              min={1}
              max={10}
              step={1}
              value={value[key]}
              disabled={disabled}
              aria-describedby={`${id}-description`}
              aria-valuetext={`${intensity}. ${description}`}
              onChange={(e) =>
                onChange({ ...value, [key]: Number(e.target.value) })
              }
            />
            <p id={`${id}-description`}>
              <strong>{intensity}</strong> — {description}
            </p>
          </div>
        );
      })}
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
