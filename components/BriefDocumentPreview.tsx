import { sectionContent, type BriefDocument } from "@/lib/brief-document";

export default function BriefDocumentPreview({
  document,
}: {
  document: BriefDocument;
}) {
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
