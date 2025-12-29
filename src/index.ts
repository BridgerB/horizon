/**
 * @bridgerb/horizon - Calculate horizon elevation angles from GeoTIFF data
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { loadElevationData } from '@bridgerb/horizon';
 *
 * const elevation = await loadElevationData('path/to/elevation.tif');
 * const horizon = elevation.calculateHorizon(40.3908, -111.6458);
 *
 * // Each result contains: direction (0-359), elevationAngleDegrees, distanceKm
 * horizon.forEach(point => {
 *   console.log(`${point.direction}°: ${point.elevationAngleDegrees.toFixed(1)}° at ${point.distanceKm.toFixed(1)}km`);
 * });
 * ```
 */
export { loadElevationData } from "./horizon.js";
export type { ElevationData, HorizonResult } from "./types.js";
