# Readme 
This project explores using the [GraphQL Federation spec](https://github.com/apollographql/federation) to query across two separate Durable Objects. 

## Why
The federation specification allows disparate GraphQL APIs to contribute to a single composite schema, hosted on a single endpoint (typically `/federation`). You can write queries against this composite schema spanning across all your backend services, and return a response as if from a single source. 

This spec has been widely adopted by many organizations in order to wrangle together fragmented APIs (both from the heyday of GraphQL, and from acquisitions/mergers), and allow the product feature teams to build more quickly. Product teams can rely on this schema as their source-of-truth, and the API teams can maintain ownership of their services. These backend teams can even refactor, migrate, or make a mess of their service -- all without breaking a query (it's all hidden behind the federated gateway). 

More selfishly, I was also curious if you could use Durable Objects with SQLite backends to have a horizontally scaled database. That's why there's only a table in each Durable Object -- I was curious if this would get around the size limits, but still allow me to interact with the DOs as if they are one. 

**Disclaimer**:
I took an existing project and hacked away at it to make this one. Typically, you wouldn't split up data this way -- you'd have two services like `Products` and `Users`. Additionally, I heavily relied on Claude to move more quickly. If this project seems interesting to others, I'll clean it up a lot more. Also, it doesn't yet deploy, so just use `npm run dev` or `wrangler dev` to test it. 


## Architecture
There are two Durable Objects, each with their own SQLite table:

- `WeatherDurableObject`: responsible for all weather data for a given latitude and longitude (found in `src/durable-objects/weather-records.ts`)
- `TideDurableObject`: responsible for the tide data for a given lat and lon (found in `src/durable-objects/tide-records.ts`) 

Each Durable Object has a subgraph server built into the constructor, and corresponding types can be found in `src/durable-objects/schemas`. 


## Test it out 
- Run `npm run dev`
- Open the `/federation` endpoint
  - to test out the individual subgraphs, you can go to `/tide/graphql` and `/weather/graphql`
- You'll need to provide some weather and tide data. Here are some sample mutations to run:


**SF Weather data** 
```
mutation {
  createWeatherRecord(
    lat: 37.7749, 
    lon: -122.4194, 
    windSpeed: 7.5, 
    precipitation: 0.2
  ) {
    id
    windSpeed
    precipitation
    timestamp
    location {
      lat
      lon
    }
  }
}
```

**SB weather data** 
```
mutation {
  createWeatherRecord(
    lat: 34.4208, 
    lon: -119.6982, 
    windSpeed: 5.2, 
    precipitation: 0.0
  ) {
    id
    windSpeed
    precipitation
    timestamp
    location {
      lat
      lon
    }
  }
}
```

**SB tide data**
```
mutation {
  updateTideData(
    lat: 34.4208, 
    lon: -119.6982
  )
}
```

- Now, you can run a query that spans across the subgraphs:

```
query Query {
  allWeatherData {
    id
    windSpeed
    precipitation
    timestamp
    location {
      lat
      lon
    }
  }
  tide {
    height
    status
    timestamp
    station_id
  }
}
```
