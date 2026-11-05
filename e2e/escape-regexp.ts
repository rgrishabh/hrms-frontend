/** Text for use inside a RegExp, matching itself and nothing else. Every metacharacter, the backslash too. */
export const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
