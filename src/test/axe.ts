import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe over a rendered container and fails with the rule names and nodes. Colour contrast needs
 * real layout, which jsdom lacks; it is covered in a browser by e2e/mock/a11y.mock.ts.
 */
export async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
  expect(summary).toEqual([]);
}
