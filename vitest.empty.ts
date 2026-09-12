// Stub for `server-only` / `client-only` under vitest. Next provides these as
// build-time markers with no runtime package, so vite cannot resolve them — this
// empty module stands in so server modules unit-test directly. Aliased in
// vitest.config.ts; never part of the app build.
export {};
