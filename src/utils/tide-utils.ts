import {
  WeatherResponse,
  NOAAStation,
  NOAAStationsResponse,
  NOAATideData,
  NOAATideResponse,
} from "./types";

/**
 * Calculates the distance between two points using the Haversine formula
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest NOAA tide station to given coordinates
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns Promise resolving to nearest station information
 * @throws Will throw an error if the stations cannot be fetched
 */
export async function findNearestTideStation(
  lat: number,
  lon: number
): Promise<NOAAStation> {
  try {
    // Updated URL to use HTTPS and include active stations only
    const response = await fetch(
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=metric"
    );

    if (!response.ok) {
      console.error(`NOAA API failed with status: ${response.status}`);
      throw new Error(`NOAA API returned status: ${response.status}`);
    }

    const data = (await response.json()) as NOAAStationsResponse;

    if (!data || !data.stations || !Array.isArray(data.stations)) {
      console.error("Invalid data structure:", data);
      throw new Error("Invalid station data received from NOAA API");
    }

    const stations: NOAAStation[] = data.stations
      .filter((station): station is Required<typeof station> => {
        const isValid =
          station &&
          typeof station.id === "string" &&
          typeof station.name === "string" &&
          typeof station.lat === "number" &&
          typeof station.lng === "number";

        if (!isValid) {
          console.error("Invalid station data:", station);
        }
        return isValid;
      })
      .map((station) => ({
        id: station.id,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
      }));

    if (stations.length === 0) {
      throw new Error("No valid tide stations found in NOAA data");
    }

    // Calculate distances and find nearest
    const stationsWithDistance = stations.map((station) => {
      const distance = calculateDistance(lat, lon, station.lat, station.lng);
      return {
        ...station,
        distance,
      };
    });

    // Sort by distance and get the nearest station
    const nearest = stationsWithDistance.sort(
      (a, b) => (a.distance ?? 0) - (b.distance ?? 0)
    )[0];

    if (!nearest) {
      throw new Error("Failed to find nearest station");
    }

    return nearest;
  } catch (error) {
    console.error("Error finding nearest tide station:", error);
    throw new Error(
      `Failed to find nearest tide station: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Fetches current tide data from NOAA for a given station
 * @param stationId - NOAA station ID
 * @returns Promise resolving to tide prediction data
 * @throws Will throw an error if the tide data cannot be fetched
 */
export async function fetchTideData(stationId: string): Promise<NOAATideData> {
  try {
    // Format dates as YYYYMMDD
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const begin_date = today.toISOString().split("T")[0].replace(/-/g, "");
    const end_date = tomorrow.toISOString().split("T")[0].replace(/-/g, "");

    const url = new URL(
      "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
    );
    url.searchParams.set("station", stationId);
    url.searchParams.set("begin_date", begin_date);
    url.searchParams.set("end_date", end_date);
    url.searchParams.set("product", "predictions");
    url.searchParams.set("datum", "MLLW");
    url.searchParams.set("time_zone", "lst_ldt");
    url.searchParams.set("interval", "h");
    url.searchParams.set("units", "metric");
    url.searchParams.set("application", "web_services");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error("NOAA tide API error response:", errorText);
      throw new Error(`NOAA tide API returned status: ${response.status}`);
    }

    const data = (await response.json()) as NOAATideResponse;

    if (!data || !data.predictions || !Array.isArray(data.predictions)) {
      throw new Error("Invalid tide data received from NOAA API");
    }

    return {
      predictions: data.predictions.map((pred) => ({
        t: pred.t,
        v: pred.v,
      })),
    };
  } catch (error) {
    console.error("Error fetching tide data:", error);
    throw new Error(
      `Failed to fetch tide data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function fetchTideExtremes(
  stationId: string
): Promise<NOAATideData> {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const begin_date = today.toISOString().split("T")[0].replace(/-/g, "");
    const end_date = tomorrow.toISOString().split("T")[0].replace(/-/g, "");

    const url = new URL(
      "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
    );
    url.searchParams.set("station", stationId);
    url.searchParams.set("begin_date", begin_date);
    url.searchParams.set("end_date", end_date);
    url.searchParams.set("product", "predictions");
    url.searchParams.set("datum", "MLLW");
    url.searchParams.set("time_zone", "lst_ldt");
    url.searchParams.set("interval", "hilo"); // Get only high/low predictions
    url.searchParams.set("units", "metric");
    url.searchParams.set("application", "web_services");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error("NOAA tide extremes API error response:", errorText);
      throw new Error(
        `NOAA tide extremes API returned status: ${response.status}`
      );
    }

    const data = (await response.json()) as NOAATideResponse;

    if (!data || !data.predictions || !Array.isArray(data.predictions)) {
      throw new Error("Invalid tide extremes data received from NOAA API");
    }

    return {
      predictions: data.predictions.map((pred) => ({
        t: pred.t,
        v: pred.v,
        type: pred.type,
      })),
    };
  } catch (error) {
    console.error("Error fetching tide extremes:", error);
    throw new Error(
      `Failed to fetch tide extremes: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Determines tide status based on surrounding predictions
 */
export function determineTideStatus(
  predictions: NOAATideData["predictions"]
): "rising" | "falling" | "high" | "low" {
  const now = new Date();
  const currentTime = now.getTime();

  // Find current and next prediction
  const currentPrediction = predictions.find((p, i) => {
    const predTime = new Date(p.t).getTime();
    const nextPredTime =
      i < predictions.length - 1
        ? new Date(predictions[i + 1].t).getTime()
        : Infinity;
    return currentTime >= predTime && currentTime < nextPredTime;
  });

  if (!currentPrediction || predictions.length < 2) {
    return "rising"; // Default fallback
  }

  const currentIndex = predictions.indexOf(currentPrediction);
  const nextPrediction = predictions[currentIndex + 1];

  if (!nextPrediction) {
    return "rising"; // Default fallback
  }

  const currentHeight = parseFloat(currentPrediction.v);
  const nextHeight = parseFloat(nextPrediction.v);

  // Determine if at an extreme
  const isExtreme = Math.abs(nextHeight - currentHeight) < 0.1;

  if (isExtreme) {
    return currentHeight > nextHeight ? "high" : "low";
  }

  return currentHeight < nextHeight ? "rising" : "falling";
}

export async function fetchWeatherData(
  lat: string,
  lon: string
): Promise<WeatherResponse> {
  if (!lat || !lon) {
    throw new Error("Missing latitude or longitude values");
  }

  const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,precipitation&wind_speed_unit=kn`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Weather API failed: ${response.status}`);
    }
    const data = (await response.json()) as WeatherResponse;
    return data;
  } catch (error) {
    console.error("Weather fetch error:", error);
    throw error;
  }
}
