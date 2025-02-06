export interface WeatherData {
  wind_speed: number;
  precipitation: number;
  timestamp: string;
}

export interface TideData {
  height: number;
  status: string;
  timestamp: string;
  station_id: string;
  extremes: {
    highTides: { time: string; height: number }[];
    lowTides: { time: string; height: number }[];
  };
}

export type TideStatus = "unknown" | "high" | "low" | "rising" | "falling";
