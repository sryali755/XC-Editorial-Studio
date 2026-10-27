"use client";

export const demoModels = [
  "Palmyra X5",
  "Astra",
  "Opus 5.5",
  "Gemini Flash",
] as const;

export type DemoModel = (typeof demoModels)[number];

function isDemoModel(value: string): value is DemoModel {
  return demoModels.some((model) => model === value);
}

export default function DemoModelSelector({
  value,
  onChange,
  context,
}: {
  value: DemoModel;
  onChange: (model: DemoModel) => void;
  context: string;
}) {
  return (
    <label className="demo-model-selector">
      <span>AI Model</span>
      <select
        aria-label={`AI Model for ${context}`}
        title="Demo display only; does not change the model used to generate results."
        value={value}
        onChange={(event) => {
          const selected = event.currentTarget.value;
          if (isDemoModel(selected)) onChange(selected);
        }}
      >
        {demoModels.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}
