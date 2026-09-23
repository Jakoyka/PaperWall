import { useEffect, useRef } from 'react';

// Click-and-drag a row sideways to scroll it, like swiping on a phone (with a little momentum).
// A plain click on a wallpaper still opens it; only dragging further than a few pixels scrolls.
// Touch screens already scroll natively, so touch is left alone.
// `enabled` can be turned off while something else (drag-to-reorder) is using the mouse.
export default function useDragScroll(ref, enabled = true) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let down = false;
    let panning = false;
    let suppressClick = false;
    let startX = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0; // pixels per millisecond
    let pointerId = null;
    let raf = 0;

    const onDown = (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      cancelAnimationFrame(raf);
      down = true;
      panning = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      pointerId = e.pointerId;
    };

    const onMove = (e) => {
      if (!down || e.pointerId !== pointerId || !enabledRef.current) return;
      const dx = e.clientX - startX;
      if (!panning) {
        if (Math.abs(dx) < 5) return;
        panning = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        el.classList.add('panning');
      }
      el.scrollLeft = startScroll - dx;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) velocity = 0.7 * ((lastX - e.clientX) / dt) + 0.3 * velocity;
      lastX = e.clientX;
      lastT = now;
    };

    const onUp = () => {
      if (!down) return;
      down = false;
      if (!panning) return;
      panning = false;
      el.classList.remove('panning');
      try { el.releasePointerCapture(pointerId); } catch { /* ignore */ }
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 60);

      // momentum: keep gliding, slowing down
      let v = performance.now() - lastT > 90 ? 0 : velocity * 16; // pixels per frame
      const glide = () => {
        if (Math.abs(v) < 0.4) return;
        const before = el.scrollLeft;
        el.scrollLeft += v;
        if (el.scrollLeft === before) return; // hit the end
        v *= 0.94;
        raf = requestAnimationFrame(glide);
      };
      glide();
    };

    const onClickCapture = (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('click', onClickCapture, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);
}
