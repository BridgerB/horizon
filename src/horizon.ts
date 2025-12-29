import gdal from "gdal-async";
import proj4 from "proj4";
import type { ElevationData, HorizonResult } from "./types.js";

/** Conversion factor from radians to degrees */
const RAD_TO_DEG = 180 / Math.PI;

/** Conversion factor from degrees to radians */
const DEG_TO_RAD = Math.PI / 180;

/** WGS84 coordinate reference system (standard GPS coordinates) */
const WGS84 = "EPSG:4326";

/** GeoTIFF transformation matrix: [originX, pixelWidth, rotationX, originY, rotationY, pixelHeight] */
type GeoTransform = [number, number, number, number, number, number];

/**
 * Convert geographic coordinates (latitude/longitude) to pixel coordinates.
 *
 * @param latitude - Latitude in decimal degrees
 * @param longitude - Longitude in decimal degrees
 * @param originX - X coordinate of the raster origin (from GeoTransform)
 * @param pixelWidth - Width of each pixel in projection units (from GeoTransform)
 * @param originY - Y coordinate of the raster origin (from GeoTransform)
 * @param pixelHeight - Height of each pixel in projection units (from GeoTransform)
 * @param projection - Proj4 projection string from the GeoTIFF
 * @returns Pixel coordinates { pixelX, pixelY }
 */
const toPixel = (
  latitude: number,
  longitude: number,
  originX: number,
  pixelWidth: number,
  originY: number,
  pixelHeight: number,
  projection: string,
): { pixelX: number; pixelY: number } => {
  const [projX, projY] = proj4(WGS84, projection, [longitude, latitude]) as [
    number,
    number,
  ];
  return {
    pixelX: (projX - originX) / pixelWidth,
    pixelY: (projY - originY) / pixelHeight,
  };
};

/**
 * Check if pixel coordinates are outside the raster bounds.
 *
 * @param pixelX - X pixel coordinate
 * @param pixelY - Y pixel coordinate
 * @param width - Raster width in pixels
 * @param height - Raster height in pixels
 * @returns True if coordinates are out of bounds
 */
const isOutOfBounds = (
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
): boolean => pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height;

/**
 * Find the horizon point in a single compass direction using ray marching.
 *
 * Steps outward from the observer position, tracking the maximum elevation
 * angle encountered. The horizon is the point with the highest elevation angle.
 *
 * @param rasterData - Elevation data as a flat Float32Array
 * @param width - Raster width in pixels
 * @param height - Raster height in pixels
 * @param observerX - Observer X position in pixel coordinates
 * @param observerY - Observer Y position in pixel coordinates
 * @param direction - Compass direction in degrees (0 = North, 90 = East)
 * @param pixelSize - Size of each pixel in meters
 * @param baseElevation - Elevation at the observer position in meters
 * @returns Horizon result with direction, elevation angle, and distance
 */
const findHorizon = (
  rasterData: Float32Array,
  width: number,
  height: number,
  observerX: number,
  observerY: number,
  direction: number,
  pixelSize: number,
  baseElevation: number,
): HorizonResult => {
  const stepX = Math.sin(direction * DEG_TO_RAD);
  const stepY = -Math.cos(direction * DEG_TO_RAD);

  let maxAngle = -Infinity;
  let maxDistance = 0;
  let step = 1;

  while (true) {
    const pixelX = Math.floor(observerX + stepX * step);
    const pixelY = Math.floor(observerY + stepY * step);

    if (isOutOfBounds(pixelX, pixelY, width, height)) break;

    const elevation = rasterData[pixelY * width + pixelX] ?? 0;
    const distance = step * pixelSize;
    const angle = Math.atan2(elevation - baseElevation, distance) * RAD_TO_DEG;

    if (angle > maxAngle) {
      maxAngle = angle;
      maxDistance = distance;
    }

    step++;
  }

  return {
    direction,
    elevationAngleDegrees: maxAngle === -Infinity ? 0 : maxAngle,
    distanceKm: maxDistance / 1000,
  };
};

/**
 * Load elevation data from a GeoTIFF file.
 *
 * Reads the entire raster into memory for fast horizon calculations.
 * Automatically detects the projection from the GeoTIFF file.
 *
 * @param tifPath - Path to the GeoTIFF elevation file
 * @returns ElevationData object with calculateHorizon method
 * @throws {Error} If GeoTIFF is missing geoTransform metadata
 * @throws {Error} If GeoTIFF is missing spatial reference system
 *
 * @example
 * ```typescript
 * const elevation = await loadElevationData('data/n41w112_30m.tif');
 * const horizon = elevation.calculateHorizon(40.3908, -111.6458);
 * console.log(horizon[0]); // { direction: 0, elevationAngleDegrees: 5.2, distanceKm: 12.3 }
 * ```
 */
export const loadElevationData = async (
  tifPath: string,
): Promise<ElevationData> => {
  const dataset = await gdal.openAsync(tifPath);

  if (!dataset.geoTransform) throw new Error("Missing geoTransform");
  if (!dataset.srs) throw new Error("Missing spatial reference system");

  const projection = dataset.srs.toProj4();
  const [originX, pixelWidth, , originY, , pixelHeight] = dataset
    .geoTransform as GeoTransform;
  const { x: width, y: height } = dataset.rasterSize;
  const pixelSize = Math.abs(pixelWidth);
  const band = dataset.bands.get(1);
  const rasterData = band.pixels.read(0, 0, width, height) as Float32Array;

  return {
    calculateHorizon: (
      latitude: number,
      longitude: number,
      startDirection = 0,
      endDirection = 359,
    ): HorizonResult[] => {
      const observerPixel = toPixel(
        latitude,
        longitude,
        originX,
        pixelWidth,
        originY,
        pixelHeight,
        projection,
      );
      const observerIndex = Math.floor(observerPixel.pixelY) * width +
        Math.floor(observerPixel.pixelX);
      const baseElevation = rasterData[observerIndex] ?? 0;

      return Array.from(
        { length: endDirection - startDirection + 1 },
        (_, directionOffset) =>
          findHorizon(
            rasterData,
            width,
            height,
            observerPixel.pixelX,
            observerPixel.pixelY,
            startDirection + directionOffset,
            pixelSize,
            baseElevation,
          ),
      );
    },
  };
};
