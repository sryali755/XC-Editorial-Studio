// Test-process preload only. Never imported by the application or live server.
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preloads must use CommonJS before test modules load. */
const denied = () => {
  throw new Error(
    "PHASE1_NO_API: HTTP/network requests are forbidden in this test pass.",
  );
};
globalThis.fetch = denied;
for (const name of ["node:http", "node:https"]) {
  const mod = require(name);
  mod.request = denied;
  mod.get = denied;
}
const net = require("node:net");
net.connect = denied;
net.createConnection = denied;
net.Socket.prototype.connect = denied;
require("node:module").syncBuiltinESMExports();
