import { fieldStatuses, fieldText, upstreamFields } from "@/lib/upstream";
import type { SourceField, UpstreamContext, UpstreamKey } from "@/lib/types";

export default function UpstreamContextPanel({
  value,
  onChange,
  disabled = false,
}: {
  value: UpstreamContext;
  onChange?: (key: UpstreamKey, field: SourceField) => void;
  disabled?: boolean;
}) {
  const editable = !!onChange;
  return (
    <div className="upstream-context">
      <div className="section-title">
        <div>
          <h3>Upstream decisions & requirements</h3>
          <p>
            Preserve GTM strategy and Brand messaging. Supplied information is
            not automatically approved.
          </p>
        </div>
        <span className="tag">Travels with every perspective</span>
      </div>
      {editable && (
        <p className="context-note">
          Missing fields are review items, not automatic blockers. Mark
          intentional exclusions explicitly; they will not be filled by the
          preparation agents. Approval entries record what you were told, not a
          verification.
        </p>
      )}
      {[...new Set(upstreamFields.map((f) => f.group))].map((group) => (
        <details
          key={group}
          className="upstream-group"
          open={
            group === "Upstream RTB" ||
            group === "Brand messaging & hierarchy" ||
            group === "Execution restrictions"
          }
        >
          <summary>
            {group}
            <span>
              {
                upstreamFields.filter(
                  (f) =>
                    f.group === group &&
                    value.fields[f.key].status !== "Supplied",
                ).length
              }{" "}
              review / exclusion items
            </span>
          </summary>
          <div className="upstream-field-grid">
            {upstreamFields
              .filter((f) => f.group === group)
              .map((def) => {
                const field = value.fields[def.key];
                return (
                  <section
                    className="upstream-field"
                    key={def.key}
                    aria-label={def.label}
                  >
                    <h4>{def.label}</h4>
                    {editable ? (
                      <>
                        <label className="field">
                          <span className="sr-only">{def.label} status</span>
                          <select
                            aria-label={`${def.label} status`}
                            disabled={disabled}
                            value={field.status}
                            onChange={(e) =>
                              onChange!(def.key, {
                                ...field,
                                status: e.target.value as SourceField["status"],
                              })
                            }
                          >
                            {fieldStatuses.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        {def.key === "originalRTB" ? (
                          <>
                            <p className="original-rtb">
                              {field.sourceValue ||
                                "No RTB supplied in the upstream brief."}
                            </p>
                            <small>
                              Original text is preserved. XC proposals appear
                              separately below.
                            </small>
                          </>
                        ) : (
                          <label className="field">
                            <span className="sr-only">{def.label} detail</span>
                            <textarea
                              aria-label={`${def.label} detail`}
                              disabled={
                                disabled ||
                                field.status === "Intentionally excluded"
                              }
                              rows={2}
                              value={field.value}
                              placeholder={
                                def.key === "briefType"
                                  ? "Product / Growth / Pricing"
                                  : def.key === "campaignTier"
                                    ? "Mass / Targeted / Limited (Base Only)"
                                    : "Not supplied"
                              }
                              onChange={(e) =>
                                onChange!(def.key, {
                                  ...field,
                                  value: e.target.value,
                                  status:
                                    field.status === "Not supplied" &&
                                    e.target.value.trim()
                                      ? "Supplied"
                                      : field.status === "Supplied" &&
                                          !e.target.value.trim()
                                        ? "Not supplied"
                                        : field.status,
                                })
                              }
                            />
                          </label>
                        )}
                        <label className="field">
                          <span className="sr-only">
                            {def.label} review note
                          </span>
                          <input
                            aria-label={`${def.label} review note`}
                            disabled={disabled}
                            value={field.note}
                            placeholder="Reason for exclusion / clarification / source note"
                            onChange={(e) =>
                              onChange!(def.key, {
                                ...field,
                                note: e.target.value,
                              })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <span className="tag">{field.status}</span>
                        <p>{fieldText(field)}</p>
                        {field.status === "Supplied" && field.note && (
                          <small>Review note: {field.note}</small>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
          </div>
        </details>
      ))}
      <p className="context-note">
        Workfront handoff is planned and not connected. GTM PowerPoint
        requirements do not change the XC PDF target.
      </p>
    </div>
  );
}
