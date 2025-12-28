import gdal from "gdal-async";
import { computeDestinationPoint } from "geolib";
import proj4 from "proj4";

const STEP_SIZE = 100;
const RAD_TO_DEG = 180 / Math.PI;
const WGS84 = "EPSG:4326";
const UTM12N = "+proj=utm +zone=12 +datum=NAD83 +units=m +no_defs";

interface TerrainPoint {
  longitude: number;
  latitude: number;
  elevation: number;
  distance: number;
}

interface HorizonResult {
  direction: number;
  elevationAngleDegrees: number;
  distance_km: number;
}

type GeoTransform = [number, number, number, number, number, number];

interface RasterContext {
  band: gdal.RasterBand;
  geoTransform: GeoTransform;
  rasterSize: { x: number; y: number };
}

const toUTM = (
  latitude: number,
  longitude: number,
): { x: number; y: number } => {
  const result = proj4(WGS84, UTM12N, [longitude, latitude]) as [
    number,
    number,
  ];
  return { x: result[0], y: result[1] };
};

const getRasterCoordinates = (
  geoTransform: GeoTransform,
  utmX: number,
  utmY: number,
): { x: number; y: number } => ({
  x: Math.floor((utmX - geoTransform[0]) / geoTransform[1]),
  y: Math.floor((utmY - geoTransform[3]) / geoTransform[5]),
});

const isInBounds = (
  x: number,
  y: number,
  rasterSize: { x: number; y: number },
): boolean => x >= 0 && y >= 0 && x < rasterSize.x && y < rasterSize.y;

const calculateElevationAngle = (
  elevation: number,
  baseElevation: number,
  distance: number,
): number => Math.atan2(elevation - baseElevation, distance) * RAD_TO_DEG;

const getPointAtDistance = (
  startLatitude: number,
  startLongitude: number,
  distance: number,
  direction: number,
): { latitude: number; longitude: number } =>
  computeDestinationPoint(
    { latitude: startLatitude, longitude: startLongitude },
    distance,
    direction,
  );

const getTerrainPointAtDistance = (
  ctx: RasterContext,
  startLatitude: number,
  startLongitude: number,
  direction: number,
  distance: number,
): TerrainPoint | null => {
  const { longitude, latitude } = getPointAtDistance(
    startLatitude,
    startLongitude,
    distance,
    direction,
  );
  const utm = toUTM(latitude, longitude);
  const { x, y } = getRasterCoordinates(ctx.geoTransform, utm.x, utm.y);

  if (!isInBounds(x, y, ctx.rasterSize)) return null;

  return {
    longitude,
    latitude,
    elevation: ctx.band.pixels.get(x, y),
    distance,
  };
};

const generateDistances = (
  start: number,
  step: number,
  max: number,
): number[] =>
  Array.from({ length: Math.ceil(max / step) }, (_, i) => start + i * step);

const getTerrainData = (
  ctx: RasterContext,
  startLatitude: number,
  startLongitude: number,
  direction: number,
): TerrainPoint[] => {
  const maxDistance = 100000;
  const distances = generateDistances(0, STEP_SIZE, maxDistance);

  const points: TerrainPoint[] = [];
  for (const dist of distances) {
    const point = getTerrainPointAtDistance(
      ctx,
      startLatitude,
      startLongitude,
      direction,
      dist,
    );
    if (point === null) break;
    points.push(point);
  }
  return points;
};

const findMaxElevation = (
  points: TerrainPoint[],
  baseElevation: number,
): { angle: number; distance: number } =>
  points
    .filter((p) => p.distance > 0)
    .reduce(
      (max, point) => {
        const angle = calculateElevationAngle(
          point.elevation,
          baseElevation,
          point.distance,
        );
        return angle > max.angle ? { angle, distance: point.distance } : max;
      },
      { angle: -Infinity, distance: 0 },
    );

const calculateHorizonForDirection = (
  ctx: RasterContext,
  latitude: number,
  longitude: number,
  direction: number,
): HorizonResult => {
  const points = getTerrainData(ctx, latitude, longitude, direction);
  const firstPoint = points[0];

  if (!firstPoint) {
    return { direction, elevationAngleDegrees: 0, distance_km: 0 };
  }

  const baseElevation = firstPoint.elevation;
  const { angle, distance } = findMaxElevation(points, baseElevation);

  return {
    direction,
    elevationAngleDegrees: angle === -Infinity ? 0 : angle,
    distance_km: distance / 1000,
  };
};

const calculateHorizon = async (
  tifPath: string,
  latitude: number,
  longitude: number,
  startDirection: number = 0,
  endDirection: number = 359,
): Promise<HorizonResult[]> => {
  const dataset = await gdal.openAsync(tifPath);
  if (!dataset.geoTransform) throw new Error("Missing geoTransform");

  const ctx: RasterContext = {
    band: dataset.bands.get(1),
    geoTransform: dataset.geoTransform as GeoTransform,
    rasterSize: dataset.rasterSize,
  };

  const directions = [...Array(endDirection - startDirection + 1).keys()].map(
    (i) => startDirection + i,
  );

  return directions.map((direction) => {
    const result = calculateHorizonForDirection(
      ctx,
      latitude,
      longitude,
      direction,
    );
    console.error(
      `Direction: ${direction}° - Elevation: ${
        result.elevationAngleDegrees.toFixed(2)
      }° - Distance: ${result.distance_km.toFixed(2)} km`,
    );
    return result;
  });
};

const main = async (): Promise<void> => {
  const [latArg, lngArg, startArg, endArg] = process.argv.slice(2);

  if (!latArg || !lngArg || (startArg && !endArg)) {
    console.error("Usage: node main.ts <latitude> <longitude> [start end]");
    console.error("Example: node main.ts 40.311259 -111.659330");
    console.error("Example: node main.ts 40.311259 -111.659330 47 111");
    process.exit(1);
  }

  const latitude = parseFloat(latArg);
  const longitude = parseFloat(lngArg);
  const start = startArg ? parseInt(startArg) : 0;
  const end = endArg ? parseInt(endArg) : 359;

  const result = await calculateHorizon(
    "data/n41w112_30m.tif",
    latitude,
    longitude,
    start,
    end,
  );
  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
