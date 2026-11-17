// Cloudflare Worker in front of the Tank Sudda OS container. Every
// request is forwarded to the Node server in the container (see Dockerfile and
// server.mjs). Runtime secrets are Worker secrets, passed to the container as
// environment variables.
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  APP_SERVER: DurableObjectNamespace<AppServer>;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  WEBSITE_WEBHOOK_SECRET?: string;
}

export class AppServer extends Container<Env> {
  defaultPort = 8080;
  // Keep the instance warm through a working shift; it sleeps when idle.
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      PORT: "8080",
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: env.FIREBASE_PRIVATE_KEY,
      WEBSITE_WEBHOOK_SECRET: env.WEBSITE_WEBHOOK_SECRET ?? "",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // One shared instance keeps every device on the same warm server.
    return getContainer(env.APP_SERVER).fetch(request);
  },
};
