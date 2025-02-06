export interface WeatherResponse {
    current: {
        wind_speed_10m: number;
        precipitation: number;
    };
}

export interface NOAATidePrediction {
    t: string;  // ISO timestamp
    v: string;  // water level
    type?: "H" | "L";  // H for high tide, L for low tide
}

export interface NOAATideData {
    predictions: NOAATidePrediction[];
}

export interface NOAATideResponse extends NOAATideData {}

export interface NOAAStation {
    id: string;
    name: string;
    lat: number;
    lng: number;
    distance?: number;
}

export interface NOAAStationsResponse {
    stations: NOAAStation[];
}
