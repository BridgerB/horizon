/**
 * A single horizon measurement for one compass direction.
 */
export interface HorizonResult {
  /** Compass direction in degrees (0 = North, 90 = East, 180 = South, 270 = West) */
  direction: number;

  /** Elevation angle to the horizon in degrees (positive = above horizontal) */
  elevationAngleDegrees: number;

  /** Distance to the horizon point in kilometers */
  distanceKm: number;
}

/**
 * Loaded elevation data with methods to calculate horizon profiles.
 */
export interface ElevationData {
  /**
   * Calculate the horizon profile from a given location.
   *
   * @param latitude - Observer latitude in decimal degrees (WGS84)
   * @param longitude - Observer longitude in decimal degrees (WGS84)
   * @param startDirection - Starting compass direction in degrees (default: 0)
   * @param endDirection - Ending compass direction in degrees (default: 359)
   * @returns Array of horizon results, one per degree from startDirection to endDirection
   */
  calculateHorizon: (
    latitude: number,
    longitude: number,
    startDirection?: number,
    endDirection?: number,
  ) => HorizonResult[];
}
