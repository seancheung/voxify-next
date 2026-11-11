export function snapshotStream(signal: AbortSignal, load: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout>;
  let closed = false;
  const stop = () => {
    closed = true;
    clearTimeout(timer);
  };
  const stream = new ReadableStream({
    start(controller) {
      let previous = "",
        lastSent = 0;
      const refresh = async () => {
        try {
          const data = JSON.stringify(await load());
          if (closed) return;
          const changed = data !== previous;
          if (changed || Date.now() - lastSent >= 30000) {
            controller.enqueue(
              new TextEncoder().encode(changed ? `data: ${data}\n\n` : ": ping\n\n"),
            );
            previous = data;
            lastSent = Date.now();
          }
        } catch (error) {
          if (!closed) controller.error(error);
          stop();
        }
        if (!closed) timer = setTimeout(refresh, 1000);
      };
      signal.addEventListener(
        "abort",
        () => {
          if (!closed) {
            stop();
            controller.close();
          }
        },
        { once: true },
      );
      void refresh();
    },
    cancel: stop,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
