import { DurableObject } from "cloudflare:workers";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import { WeatherData } from "./types";
import { fetchWeatherData } from "../utils/tide-utils";
import apolloHandler from "../handlers/durable-object-apollo";
import schema from "./schemas/weather-records-schema.graphql";

const typeDefs = gql`
  ${schema}
`;

export class WeatherDurableObject extends DurableObject {
  private sql: SqlStorage;
  private apolloHandler: any;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    const subgraphSchema = buildSubgraphSchema({
      typeDefs,
      resolvers: {
        Query: {
          weatherAtLocation: async (_, { lat, lon }) => {
            const weather = await this.getWeather(lat, lon);
            if (!weather) return null;
            return {
              id: `${lat}|${lon}`,
              windSpeed: weather.wind_speed,
              precipitation: weather.precipitation,
              timestamp: weather.timestamp,
              location: { lat, lon },
            };
          },
          weather: async (_, { lat, lon }) => this.getWeather(lat, lon),
          allWeatherData: async () => {
            try {
              const results = [];
              const cursor = this.sql.exec(`
                SELECT 
                  latitude,
                  longitude,
                  wind_speed,
                  precipitation,
                  timestamp
                FROM weather_records w1
                WHERE timestamp = (
                  SELECT MAX(timestamp)
                  FROM weather_records w2
                  WHERE w2.latitude = w1.latitude 
                  AND w2.longitude = w1.longitude
                )
              `);

              for (const row of cursor) {
                results.push({
                  id: `${String(row.latitude)}|${String(row.longitude)}`,
                  windSpeed: Number(row.wind_speed),
                  precipitation: Number(row.precipitation),
                  timestamp: String(row.timestamp),
                  location: {
                    lat: parseFloat(String(row.latitude)),
                    lon: parseFloat(String(row.longitude)),
                  },
                });
              }

              return results;
            } catch (error) {
              console.error("Error fetching all weather data:", error);
              return [];
            }
          },
        },
        Mutation: {
          addLocation: async (_, { lat, lon }) => {
            try {
              await this.updateWeatherData(lat, lon);
              return true;
            } catch (error) {
              console.error("Error adding location:", error);
              return false;
            }
          },
          updateWeatherData: async () => {
            try {
              // Get a single location to update
              const location = this.sql
                .exec(
                  `SELECT DISTINCT latitude, longitude 
                   FROM weather_records 
                   ORDER BY latitude, longitude 
                   LIMIT 1`
                )
                .one();

              if (location) {
                await this.updateWeatherData(
                  parseFloat(String(location.latitude)),
                  parseFloat(String(location.longitude))
                );
              }
              return true;
            } catch (error) {
              console.error("Error updating weather data:", error);
              return false;
            }
          },
          createWeatherRecord: async (
            _,
            { lat, lon, windSpeed, precipitation }
          ) => {
            try {
              const timestamp = new Date().toISOString();

              this.sql.exec(
                `INSERT INTO weather_records (latitude, longitude, wind_speed, precipitation, timestamp)
                 VALUES (?, ?, ?, ?, ?)`,
                String(lat),
                String(lon),
                windSpeed,
                precipitation,
                timestamp
              );

              return {
                id: `${lat}|${lon}`,
                windSpeed,
                precipitation,
                timestamp,
                location: { lat, lon },
              };
            } catch (error) {
              console.error("Error creating weather record:", error);
              throw new Error("Failed to create weather record");
            }
          },
        },
      },
    });

    const graphQLServerOptions = {
      schema: subgraphSchema,
      baseEndpoint: "/weather/graphql",
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
      CREATE TABLE IF NOT EXISTS weather_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude TEXT NOT NULL,
        longitude TEXT NOT NULL,
        wind_speed REAL NOT NULL,
        precipitation REAL NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weather_time ON weather_records(timestamp);
      CREATE INDEX IF NOT EXISTS idx_weather_location ON weather_records(latitude, longitude);
    `);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/weather/graphql") {
      (request as any).durableObject = this;
      return this.apolloHandler(request, this.env, this.ctx);
    }
    return new Response("Not found", { status: 404 });
  }

  async updateWeatherData(lat: number, lon: number) {
    const weather = await fetchWeatherData(String(lat), String(lon));
    const timestamp = new Date().toISOString();

    this.sql.exec(
      `INSERT INTO weather_records (latitude, longitude, wind_speed, precipitation, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      String(lat),
      String(lon),
      weather.current.wind_speed_10m,
      weather.current.precipitation,
      timestamp
    );

    // Cleanup old records
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    this.sql.exec(
      `DELETE FROM weather_records WHERE timestamp < ?`,
      twentyFourHoursAgo.toISOString()
    );
  }

  async getWeather(lat: number, lon: number): Promise<WeatherData | null> {
    try {
      const result = this.sql
        .exec(
          `SELECT wind_speed, precipitation, timestamp
           FROM weather_records 
           WHERE latitude = ? AND longitude = ?
           ORDER BY timestamp DESC 
           LIMIT 1`,
          String(lat),
          String(lon)
        )
        .one();

      return {
        wind_speed: Number(result.wind_speed),
        precipitation: Number(result.precipitation),
        timestamp: String(result.timestamp),
      };
    } catch (error) {
      return null;
    }
  }
}
