import { DurableObject } from "cloudflare:workers";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import { TideData, TideStatus } from "./types";
import schema from "./schemas/tide-records-schema.graphql";
import {
  fetchTideData,
  determineTideStatus,
  findNearestTideStation,
} from "../utils/tide-utils";
import apolloHandler from "../handlers/durable-object-apollo";

const typeDefs = gql`
  ${schema}
`;

export class TideDurableObject extends DurableObject {
  private sql: SqlStorage;
  private apolloHandler: any;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    const subgraphSchema = buildSubgraphSchema({
      typeDefs,
      resolvers: {
        Query: {
          tide: async () => this.getTide(),
        },
        Mutation: {
          updateTideData: async (_, { lat, lon }) => {
            try {
              await this.updateTideData(lat, lon);
              return true;
            } catch (error) {
              console.error("Error updating tide data:", error);
              return false;
            }
          },
        },
      },
    });

    const graphQLServerOptions = {
      schema: subgraphSchema,
      baseEndpoint: "/tide/graphql",
      enableSandbox: true,
      forwardUnmatchedRequestsToOrigin: false,
      cors: true,
      kvCache: false,
    };

    this.apolloHandler = apolloHandler(graphQLServerOptions, this);
    this.initializeDb();
  }

  async initializeDb() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tide_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        height REAL NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tide_time ON tide_records(timestamp);
    `);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/tide/graphql") {
      (request as any).durableObject = this;
      return this.apolloHandler(request, this.env, this.ctx);
    }
    return new Response("Not found", { status: 404 });
  }

  async updateTideData(lat: number, lon: number) {
    const station = await findNearestTideStation(lat, lon);

    if (station?.distance !== undefined && station.distance <= 100) {
      const tideData = await fetchTideData(station.id);
      if (tideData.predictions.length > 0) {
        const status = determineTideStatus(tideData.predictions);
        const height = parseFloat(tideData.predictions[0].v);
        const timestamp = new Date().toISOString();

        this.sql.exec(
          `INSERT INTO tide_records (station_id, height, status, timestamp)
           VALUES (?, ?, ?, ?)`,
          station.id,
          height,
          status,
          timestamp
        );

        // Cleanup old records
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        this.sql.exec(
          `DELETE FROM tide_records WHERE timestamp < ?`,
          twentyFourHoursAgo.toISOString()
        );
      }
    }
  }

  async getTide(): Promise<Partial<TideData> | null> {
    try {
      const result = this.sql
        .exec(
          `SELECT height, status, timestamp, station_id
           FROM tide_records 
           ORDER BY timestamp DESC 
           LIMIT 1`
        )
        .one();

      return {
        height: Number(result.height),
        status: result.status as TideStatus,
        timestamp: String(result.timestamp),
        station_id: String(result.station_id),
      };
    } catch (error) {
      return null;
    }
  }
}
