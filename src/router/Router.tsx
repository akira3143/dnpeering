import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface RouteState {
  path: string; // e.g. '/' or '/peer'
  search: string; // e.g. '?node=jp07'
  queryParams: Record<string, string>;
}

interface RouterContextType extends RouteState {
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

function parseCurrentRoute(): RouteState {
  const hash = window.location.hash;
  let rawPath = window.location.pathname;
  let rawSearch = window.location.search;

  if (hash.startsWith('#/')) {
    const hashContent = hash.slice(1);
    const qIndex = hashContent.indexOf('?');
    if (qIndex >= 0) {
      rawPath = hashContent.slice(0, qIndex);
      rawSearch = hashContent.slice(qIndex);
    } else {
      rawPath = hashContent;
      rawSearch = '';
    }
  }

  let path = rawPath.replace(/\/$/, '') || '/';
  if (path !== '/' && !path.startsWith('/')) {
    path = '/' + path;
  }

  const queryParams: Record<string, string> = {};
  const searchParams = new URLSearchParams(rawSearch);
  searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });

  return { path, search: rawSearch, queryParams };
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteState>(() => parseCurrentRoute());

  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(parseCurrentRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    if (to.startsWith('#') && !to.startsWith('#/')) {
      const element = document.querySelector(to);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    // Client-side history navigation (preserves home scroll position naturally)
    if (to.startsWith('/')) {
      window.history.pushState(null, '', to);
    } else if (to.startsWith('#/')) {
      window.location.hash = to;
    } else {
      window.history.pushState(null, '', '/' + to);
    }

    setRoute(parseCurrentRoute());
  }, []);

  return (
    <RouterContext.Provider value={{ ...route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};
