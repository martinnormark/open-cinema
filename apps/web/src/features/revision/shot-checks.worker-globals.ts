// Bundlers can give workers a `process` object. TF.js then takes it for the
// global namespace and cannot find `atob` or `fetch` to load models, so point
// `global` at the worker scope before Human is imported.
const scope = globalThis as { global?: unknown };
scope.global ??= globalThis;
export {};
