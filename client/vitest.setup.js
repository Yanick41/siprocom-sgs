import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import './src/i18n';

afterEach(cleanup);

// jsdom implements neither, and Recharts' ResponsiveContainer plus the layout
// code both reach for them on mount.
globalThis.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

/**
 * Reports a size immediately rather than staying silent.
 *
 * The charts render nothing until an observation arrives,
 * so a stub that never fires makes every chart screen sit at its fallback until
 * the test times out - 23s for the dashboard before this.
 */
globalThis.ResizeObserver ??= class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback(
      [{ target, contentRect: { width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800 } }],
      this
    );
  }
  unobserve() {}
  disconnect() {}
};

// Recharts measures its container; in jsdom every box is 0×0, so charts would
// render nothing and the assertions below would test an empty tree.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });

window.scrollTo = vi.fn();
