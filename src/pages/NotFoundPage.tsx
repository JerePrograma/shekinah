import { siteContent } from '../content/site-content';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type NotFoundPageProps = Readonly<{
  navigate: Navigate;
  pathname: string;
}>;

export function NotFoundPage({ navigate, pathname }: NotFoundPageProps) {
  return (
    <section className="page-section section" aria-labelledby="not-found-title">
      <div className="container not-found-shell">
        <p className="eyebrow">{siteContent.notFound.eyebrow}</p>
        <h1 id="not-found-title">{siteContent.notFound.title}</h1>
        <p>{siteContent.notFound.description}</p>
        <p className="requested-path">
          Ruta solicitada: <code>{pathname}</code>
        </p>
        <AppLink
          className="button button-primary"
          navigate={navigate}
          to={appPaths.home}
        >
          {siteContent.notFound.action}
        </AppLink>
      </div>
    </section>
  );
}
