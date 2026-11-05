import type { paths } from './api-schema.gen';

/**
 * Types read from the generated API schema. Every JSON route has a response schema, so a screen names its data through
 * these rather than declaring a type of its own. Hand-written types remain only where the schema says less than the
 * screen needs: see `Refine`, and the list in docs/DESIGN.md.
 */
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = paths[P] extends Record<M, infer O> ? O : never;

/** The JSON body of a route's 200, 201 or 202 answer. */
export type ApiResponse<P extends keyof paths, M extends Method = 'get'> =
  Op<P, M> extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R
    : Op<P, M> extends { responses: { 201: { content: { 'application/json': infer R } } } } ? R
      : Op<P, M> extends { responses: { 202: { content: { 'application/json': infer R } } } } ? R
        : never;

/** The JSON body a route accepts. */
export type ApiBody<P extends keyof paths, M extends Method = 'post'> =
  Op<P, M> extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;

/** One row of a route that answers `{ items: [...] }`. */
export type ApiItem<P extends keyof paths, M extends Method = 'get'> = ApiResponse<P, M> extends { items: readonly (infer I)[] } ? I : never;

/**
 * A generated type with some fields narrowed by hand, where the schema says `string` and the screen relies on a closed
 * set of values, or says `object` and the screen reads known keys. Unlike `Omit`, it keeps the named keys of a type that
 * also has an index signature.
 */
export type Refine<T, R> = { [K in keyof T as K extends keyof R ? never : K]: T[K] } & R;
