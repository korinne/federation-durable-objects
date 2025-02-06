import { Hono } from "hono";
import { WeatherDurableObject } from "./durable-objects/weather-records";
import { TideDurableObject } from "./durable-objects/tide-records";
import FederationApollo from "./handlers/federation-apollo";

// Export required durable objects for Cloudflare Workers
export { WeatherDurableObject, TideDurableObject };

export type Bindings = {
  KV_CACHE?: KVNamespace;
};

export type GraphQLServerOptions = {
  baseEndpoint: string;
  enableSandbox: boolean;
  forwardUnmatchedRequestsToOrigin: boolean;
  cors: boolean;
  kvCache: boolean;
};

const federationServerOptions: GraphQLServerOptions = {
  baseEndpoint: "/federation",
  enableSandbox: true,
  forwardUnmatchedRequestsToOrigin: false,
  cors: true,
  kvCache: false,
};

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.onError((err, c) => {
  console.error(err);
  return c.text("Something went wrong", 500);
});

app.all("/weather/graphql", async (c) => {
  const id = c.env.WEATHER_DURABLE_OBJECT.idFromName("weather");
  const stub = c.env.WEATHER_DURABLE_OBJECT.get(id);

  // Rewrite the URL to match what the DO expects
  const url = new URL(c.req.url);
  url.pathname = "/weather/graphql";
  const newRequest = new Request(url.toString(), c.req.raw);

  return stub.fetch(newRequest);
});

app.all("/tide/graphql", async (c) => {
  const id = c.env.TIDE_DURABLE_OBJECT.idFromName("tide");
  const stub = c.env.TIDE_DURABLE_OBJECT.get(id);

  const url = new URL(c.req.url);
  url.pathname = "/tide/graphql";
  const newRequest = new Request(url.toString(), c.req.raw);

  return stub.fetch(newRequest);
});

app.all(federationServerOptions.baseEndpoint, (context) => {
  return FederationApollo(context, federationServerOptions);
});

app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      message:
        "Available endpoints: /federation, weather/graphql, tide/graphql",
    },
    404
  );
});

export default {
  fetch: app.fetch,
};
