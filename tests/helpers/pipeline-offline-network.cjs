/* eslint-disable @typescript-eslint/no-require-imports -- test-process preload */
// Isolated server only. Allow framework loopback/IPC; forbid external transport.
if (
  process.env.AI_MODE !== "mock" ||
  process.env.OPENAI_API_KEY ||
  process.env.XC_OFFLINE_TEST !== "1"
)
  throw Error(
    "PIPELINE_OFFLINE: require mock mode, empty model key and offline-test flag.",
  );
const local = (value) =>
  value === "::1" ||
  /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(value);
function check(value) {
  let host;
  if (typeof value === "string" || value instanceof URL)
    host = new URL(value).hostname;
  else host = value?.hostname || value?.host || "localhost";
  if (!local(host))
    throw Error(`PIPELINE_OFFLINE: external transport forbidden (${host}).`);
}
const realFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  check(typeof input === "string" || input instanceof URL ? input : input.url);
  return realFetch(input, init);
};
for (const name of ["node:http", "node:https"]) {
  const transport = require(name);
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (...args) {
      check(args[0]);
      return original.apply(this, args);
    };
  }
}
const net = require("node:net"),
  connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  // Node worker IPC uses pipes. No HTTP or provider requests use this path.
  if (
    !(typeof options === "string" && options.startsWith("/")) &&
    !options?.path
  ) {
    const host =
      typeof options === "object"
        ? options.host
        : typeof args[1] === "string"
          ? args[1]
          : "localhost";
    if (host && !local(host))
      throw Error(`PIPELINE_OFFLINE: external socket forbidden (${host}).`);
  }
  return connect.apply(this, args);
};
require("node:module").syncBuiltinESMExports();
