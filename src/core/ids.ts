import { randomUUID } from "node:crypto";

export type Id<T extends string> = string & { readonly __brand: T };

export function newId<T extends string>(_kind: T): Id<T> {
  return randomUUID() as Id<T>;
}
