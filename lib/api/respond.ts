import { NextResponse } from "next/server";

export type Envelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  meta?: Record<string, unknown>;
};

/**
 * JSON has no BigInt, and `JSON.stringify` throws on one. Several models carry
 * byte counts as BigInt (an academy's storage used, reserved and quota), so a
 * route that returned such a row answered 500 *after* doing its work — creating
 * an academy from the platform console did exactly that. They are sent as
 * decimal strings, which is what the routes that convert them by hand already
 * send.
 */
function bigintAsString(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  const body: Envelope<T> = { data, error: null, ...(meta ? { meta } : {}) };
  return new NextResponse(JSON.stringify(body, bigintAsString), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(status: number, code: string, message: string) {
  const body: Envelope<null> = { data: null, error: { code, message } };
  return NextResponse.json(body, { status });
}
