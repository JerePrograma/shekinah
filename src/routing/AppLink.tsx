import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';

import type { Navigate } from './routes';

type AppLinkProps = Readonly<{
  'aria-current'?: 'page' | undefined;
  'aria-label'?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
  navigate: Navigate;
  to: string;
}>;

function shouldUseBrowserNavigation(
  event: ReactMouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function AppLink({
  children,
  navigate,
  to,
  ...anchorProps
}: AppLinkProps) {
  return (
    <a
      {...anchorProps}
      href={to}
      onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
        if (!shouldUseBrowserNavigation(event)) {
          return;
        }

        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
