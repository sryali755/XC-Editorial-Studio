import { sectionContent, type BriefDocument } from "@/lib/brief-document";

export default function BriefDocumentPreview({
  document,
  wireframe = false,
}: {
  document: BriefDocument;
  wireframe?: boolean;
}) {
  if (wireframe) {
    const sections = document.groups.flatMap((group) => group.sections);
    const rows = [
      ["THE BUSINESS PROBLEM", "Problem"],
      ["OBJECTIVE", "Objective"],
      ["AUDIENCE", "Audience"],
      ["INSIGHT", "Insight / Opportunity"],
      ["JOB TO BE DONE", "Job to be done"],
      ["REASONS TO BELIEVE", "Proof / RTB"],
      ["STRATEGIC DIRECTION", "Strategic direction"],
      ["WHAT WE NEED", "Deliverables"],
      ["MANDATORIES", "Mandatories"],
    ] as const;
    const mainTitles = new Set<string>(rows.map(([, title]) => title));
    return (
      <article className="brief-paper brief-wireframe">
        <header>
          <span>XC CREATIVE BRIEF · {document.campaign.toUpperCase()}</span>
          <small>{document.status}</small>
        </header>
        <h1>
          {document.approved
            ? sectionContent(document.approved)
            : "Brief line not supplied"}
        </h1>
        <div className="brief-wireframe-rows">
          {rows.map(([label, title]) => {
            const section = sections.find((item) => item.title === title);
            return (
              <div className="brief-wireframe-row" key={title}>
                <h2>{label}</h2>
                <p>{section ? sectionContent(section) : "Not supplied."}</p>
              </div>
            );
          })}
        </div>
        <details className="brief-wireframe-appendix">
          <summary>Full selected source context and approval record</summary>
          {sections
            .filter((section) => !mainTitles.has(section.title))
            .map((section) => (
              <div key={section.id}>
                <h3>{section.title}</h3>
                <p>{sectionContent(section)}</p>
              </div>
            ))}
        </details>
      </article>
    );
  }
  return (
    <article className="brief-paper">
      <header className="brief-brand">
        <span className="xfinity-wordmark">xfinity</span>
        <span>CREATIVE / STRATEGY STUDIO</span>
      </header>
      <div className="brief-cover">
        <span className="brief-review-status">{document.status}</span>
        <h1>
          Creative brief<span>.</span>
        </h1>
        <p className="brief-campaign">{document.campaign}</p>
        <div className="brief-document-meta">
          <span>XFINITY CREATIVE</span>
          <span>{document.date}</span>
        </div>
      </div>
      {document.approved && (
        <section
          className="brief-strategy"
          aria-label={document.approved.title}
        >
          <h2>{document.approved.title}</h2>
          <p>{sectionContent(document.approved)}</p>
        </section>
      )}
      <div className="brief-sections">
        {document.groups.map((group, index) => (
          <section className="brief-group" key={group.title}>
            <h2 className="brief-group-title">
              <span>{String(index + 1).padStart(2, "0")}</span>
              {group.title}
            </h2>
            {group.sections.map((section) => (
              <div className="brief-field" key={section.id}>
                <h3>{section.title}</h3>
                <p>{sectionContent(section)}</p>
              </div>
            ))}
          </section>
        ))}
      </div>
      <footer>
        <span>{document.footer}</span>
        <span>STRATEGY → CREATIVE</span>
      </footer>
    </article>
  );
}
