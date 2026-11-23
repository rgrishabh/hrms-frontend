export type FixturePersona = 'employee' | 'manager' | 'hr' | 'admin';

/** One screen in the browser checks: layout, touch targets, axe in both themes, screenshots. */
export interface Screen {
  /** File-safe name, used for screenshots. */
  name: string;
  path: string;
  persona: FixturePersona;
  /** How many record rows the mock must put on screen. Most screens must show real rows; 0 opts out of the check. */
  minRows?: number;
}

/** Answers for one group of screens; undefined passes to the next group. */
export type Fixture = (url: URL, persona: FixturePersona, method: string) => unknown;

/** Values long enough to find layouts that only work for short data. */
export const LONG = {
  name: 'Venkata Subrahmanya Lakshminarayana Krishnamurthy-Ramachandran',
  code: 'EMP-2026-INTERNATIONAL-000012345',
  email: 'venkata.subrahmanya.krishnamurthy-ramachandran@long-subdomain.example-laboratories.test',
  title: 'Principal Regional Compliance and Occupational Health Coordinator (Western Zone)',
  text: 'Requested because the previously approved arrangement could not be honoured after the client rescheduled the on-site audit twice; supporting correspondence is attached and the department head has been consulted about the revised dates.',
  org: 'Example Laboratories and Scientific Research Services International Private Limited',
  branch: 'Navi Mumbai Taloja Industrial Estate Annexe Building 3',
  file: 'scanned-supporting-documents-for-the-quarterly-compliance-review-final-version-2.pdf',
  token: 'TOKENWITHOUTANYSPACESTHATCANNOTWRAPNATURALLY0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  amount: 123456789.5,
} as const;

export const page = <T>(items: readonly T[], pageSize = 25) => ({ items, page: 1, pageSize, total: items.length });
