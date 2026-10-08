export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

type Factory = (params: Record<string, string>) => Screen;

let current: Screen | null = null;

export function route(path: string) {
  location.hash = '#' + path;
}

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function startRouter(root: HTMLElement, routes: Record<string, Factory>, fallback = '/home') {
  const render = () => {
    const path = location.hash.replace(/^#/, '') || fallback;
    for (const [pattern, factory] of Object.entries(routes)) {
      const params = match(pattern, path);
      if (!params) continue;
      current?.unmount();
      root.replaceChildren();
      current = factory(params);
      current.mount(root);
      return;
    }
    route(fallback);
  };
  window.addEventListener('hashchange', render);
  render();
}
