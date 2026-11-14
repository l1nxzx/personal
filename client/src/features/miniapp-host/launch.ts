const EASE = 'cubic-bezier(0.2, 0.85, 0.25, 1)';

/**
 * Opening an app the way a phone does: the icon grows into the screen, its picture fading into
 * the page's background, then the app's screen appears underneath as the layer fades away.
 * Drawn as a separate layer on `document.body`, so it survives the page change. `go` changes
 * the page; it is called straight away when motion is reduced.
 */
export function launchFrom(icon: HTMLElement | null, go: () => void) {
  if (!icon || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    go();
    return;
  }
  const r = icon.getBoundingClientRect();
  // The page area: the whole screen on phones, right of the sidebar on large screens.
  const main = document.querySelector('main')?.getBoundingClientRect();
  const left = main && main.width < window.innerWidth ? main.left : 0;
  const width = window.innerWidth - left;
  const height = window.innerHeight;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${r.width}px`,
    height: `${r.height}px`,
    zIndex: '60',
    pointerEvents: 'none',
    overflow: 'hidden',
    background: 'rgb(var(--bg))',
    transformOrigin: '0 0',
    transform: `translate(${r.left}px, ${r.top}px)`,
  } satisfies Partial<CSSStyleDeclaration>);
  const picture = icon.cloneNode(true) as HTMLElement;
  Object.assign(picture.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: `${-r.height / 2}px 0 0 ${-r.width / 2}px`,
  });
  layer.appendChild(picture);
  document.body.appendChild(layer);

  const grow = layer.animate(
    [
      {
        width: `${r.width}px`,
        height: `${r.height}px`,
        transform: `translate(${r.left}px, ${r.top}px)`,
        borderRadius: `${r.width * 0.26}px`,
      },
      {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${left}px, 0px)`,
        borderRadius: '0px',
      },
    ],
    { duration: 340, easing: EASE, fill: 'forwards' },
  );
  picture.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 1, transform: 'scale(1.5)', offset: 0.25 },
      { opacity: 0, transform: 'scale(2.4)' },
    ],
    { duration: 300, easing: 'ease-out', fill: 'forwards' },
  );

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    go();
    // Give the new page a frame to draw, then lift the layer off it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 200,
          easing: 'ease-out',
          fill: 'forwards',
        });
        fade.onfinish = () => layer.remove();
        setTimeout(() => layer.remove(), 600);
      }),
    );
  };
  grow.onfinish = finish;
  // Never leave the layer over the page, whatever happens to the animation.
  setTimeout(finish, 500);
}
