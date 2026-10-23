import { randomBytes } from "crypto";

/** Prefixed random id, e.g. newId("mnd") → "mnd_3f9a1c0b2e7d". */
export function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}
