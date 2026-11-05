import type { paths } from './api-schema.gen';

/**
 * Types read from the generated API schema. Routes without a response schema (290 of 385 at the last
 * generation) answer `never` here: for those, keep a narrow hand-written type beside the screen that
 * uses it, and the request body and query parameters still come from here.
 */
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = paths[P] extends Record<M, infer O> ? O : never;

/** The JSON body of a route's 200 or 201 answer. */
export type ApiResponse<P extends keyof paths, M extends Method = 'get'> =
  Op<P, M> extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R
    : Op<P, M> extends { responses: { 201: { content: { 'application/json': infer R } } } } ? R
      : never;

/** The JSON body a route accepts. */
export type ApiBody<P extends keyof paths, M extends Method = 'post'> =
  Op<P, M> extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;

