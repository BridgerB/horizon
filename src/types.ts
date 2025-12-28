export interface HorizonResult {
  direction: number;
  elevationAngleDegrees: number;
  distance_km: number;
}

export interface ElevationData {
  calculateHorizon: (
    latitude: number,
    longitude: number,
    startDirection?: number,
    endDirection?: number,
  ) => HorizonResult[];
}
