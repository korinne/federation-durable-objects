import { Context } from "hono";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { startServerAndCreateCloudflareWorkersHandler } from "@as-integrations/cloudflare-workers";

export type GraphQLServerOptions = {
  schema: any; 
  baseEndpoint: string;
  enableSandbox: boolean;
  forwardUnmatchedRequestsToOrigin: boolean;
  cors: boolean | CORSOptions;
  kvCache: boolean;
};

type CORSOptions = {
  origin:
    | string
    | string[]
    | ((origin: string, c: Context) => string | undefined | null);
  allowMethods?: string[];
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
};

type ServerContext = {
  durableObject: any;
};

const apolloHandler = (
  graphQLServerOptions: GraphQLServerOptions,
  durableObject: any
) => {
  const server = new ApolloServer<ServerContext>({
    schema: graphQLServerOptions.schema, // Use the provided schema
    introspection: true,
    ...(graphQLServerOptions.enableSandbox
      ? {}
      : { plugins: [ApolloServerPluginLandingPageDisabled()] }),
  });

  return startServerAndCreateCloudflareWorkersHandler<Env, ServerContext>(
    server,
    {
      context: async ({ request }) => {
        const durableObject = (request as any).durableObject;
        if (!durableObject) {
          throw new Error("DurableObject not found in request");
        }
        return {
          durableObject,
        };
      },
    }
  );
};

export default apolloHandler;
