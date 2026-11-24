import { setTimeout as delay } from "node:timers/promises";

export async function until(read, timeout = 120000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try {
      const value = await read();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(400);
  }
  throw Error(
    "Timed out waiting for Android app" +
      (lastError ? ": " + lastError.message : ""),
  );
}

export async function attachWebView(adb, app) {
  const pid = await until(() => adb("shell", "pidof", "-s", app));
  await until(() =>
    adb("shell", "cat", "/proc/net/unix").includes(
      "webview_devtools_remote_" + pid,
    ),
  );
  const port = adb(
    "forward",
    "tcp:0",
    "localabstract:webview_devtools_remote_" + pid,
  );
  const tab = await until(async () => {
    const tabs = await (
      await fetch("http://127.0.0.1:" + port + "/json/list")
    ).json();
    return tabs.find(
      (t) =>
        t.type === "page" &&
        t.webSocketDebuggerUrl &&
        t.url.includes("localhost"),
    );
  });
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    pending.get(msg.id)?.(msg);
  };
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(method + " timed out"));
      }, 60000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        pending.delete(id);
        if (msg.error) reject(Error(msg.error.message));
        else resolve(msg.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return {
    async evaluate(expression) {
      const reply = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
      });
      if (reply.exceptionDetails)
        throw Error(
          reply.exceptionDetails.exception?.description ??
            "Runtime evaluation failed",
        );
      return reply.result.value;
    },
    send,
    close() {
      socket.close();
      adb("forward", "--remove", "tcp:" + port);
    },
  };
}
