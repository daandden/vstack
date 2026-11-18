import { useNitroApp } from "nitropack/runtime";
import { host } from "./utils/flow-host";

const app = useNitroApp();
host.start(request => {
  const url = new URL(request.url);
  return app.localFetch(url.pathname + url.search, {
    method: request.method,
    headers: request.headers,
    context: { _platform: { flowRequest: request } },
  });
});
