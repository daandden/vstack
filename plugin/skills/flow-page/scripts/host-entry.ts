export type FlowRoute = "shell" | "content" | "observations" | "presence" | "versions" | "assets" | "comments" | "learning" | "missing";
export type FlowHost = {
  start: (fetch: (request: Request) => Response | Promise<Response>) => void;
  hello: (request: Request) => Response;
  storage: () => Response;
  hold: (request: Request) => Response;
  picker: (request: Request) => Promise<Response>;
  readerAsset: (request: Request) => Response;
  flow: (request: Request, endpoint: FlowRoute) => Promise<Response>;
  missing: () => Response;
  failure: (error: unknown) => Response;
  stop: () => Response;
};
