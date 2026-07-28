import { siteContent } from '../content/site-content';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type PrivacyPageProps = Readonly<{
  navigate: Navigate;
}>;

export function PrivacyPage({ navigate }: PrivacyPageProps) {
  return (
    <section className="page-section section" aria-labelledby="privacy-title">
      <div className="container page-layout">
        <div className="page-intro">
          <p className="eyebrow">{siteContent.privacy.eyebrow}</p>
          <h1 id="privacy-title">{siteContent.privacy.title}</h1>
          <p>{siteContent.privacy.summary}</p>
        </div>

        <div className="privacy-grid">
          {siteContent.privacy.sections.map((section) => (
            <section className="privacy-card" aria-labelledby={section.id} key={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <p>{section.description}</p>
            </section>
          ))}
        </div>

        <p className="privacy-note">{siteContent.privacy.hostingNote}</p>

        <AppLink
          className="button button-secondary page-back-link"
          navigate={navigate}
          to={appPaths.home}
        >
          Volver al inicio
        </AppLink>
      </div>
    </section>
  );
}
