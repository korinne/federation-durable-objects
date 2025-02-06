import type { Context } from "hono";
import type { GraphQLServerOptions } from "../index";
import { ApolloServer } from "@apollo/server";
import { ApolloGateway, RemoteGraphQLDataSource } from "@apollo/gateway";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { startServerAndCreateCloudflareWorkersHandler } from "@as-integrations/cloudflare-workers";
import schema from "../../supergraph.graphql";

type ServerContext = {};

// Convert to string for sdl
const schemaString = String(schema);

class CloudflareDataSource extends RemoteGraphQLDataSource {
  async willSendRequest({
    request,
    context,
  }: {
    request: any;
    context: any;
  }): Promise<void> {}

  fetcher = async (url: string, init?: RequestInit) => {
    console.log(`Fetching from: ${url}`);
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error(`Error from subgraph ${url}: ${response.status}`);
      const text = await response.text();
      console.error(`Response body: ${text}`);
    } 
    return response;
  };
}

const handler = async (
  context: Context,
  graphQLServerOptions: GraphQLServerOptions
) => {
  const gateway = new ApolloGateway({
    supergraphSdl: schemaString,
    buildService: ({ url }) => {
      return new CloudflareDataSource({
        url,
        willSendRequest({ request }) {},
      });
    },
  });

  const server = new ApolloServer<ServerContext>({
    gateway,
    introspection: true,
    ...(graphQLServerOptions.enableSandbox
      ? {}
      : {
          plugins: [ApolloServerPluginLandingPageDisabled()],
        }),
  });

  const cfHandler = startServerAndCreateCloudflareWorkersHandler<
    Env,
    ServerContext
  >(server, {
    context: async ({ env, request, ctx }) => {
      return {};
    },
  });

  return cfHandler(context.req.raw, context.env, {
    ...context.executionCtx,
    props: {},
    waitUntil: context.executionCtx.waitUntil.bind(context.executionCtx),
    passThroughOnException: context.executionCtx.passThroughOnException?.bind(context.executionCtx)
});
};

export default handler;
