import { siteContent } from '../content/site-content';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type ApproachPageProps = Readonly<{
  navigate: Navigate;
}>;

export function ApproachPage({ navigate }: ApproachPageProps) {
  return (
    <section className="page-section section" aria-labelledby="approach-page-title">
      <div className="container page-layout">
        <div className="page-intro">
          <p className="eyebrow">{siteContent.approach.eyebrow}</p>
          <h1 id="approach-page-title">{siteContent.approach.title}</h1>
          <p>{siteContent.approach.summary}</p>
        </div>

        <div className="principle-grid">
          {siteContent.approach.principles.map((principle) => (
            <article className="principle-card" key={principle.number}>
              <span className="principle-number" aria-hidden="true">
                {principle.number}
              </span>
              <h2>{principle.title}</h2>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>

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
