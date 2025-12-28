import gdal from "gdal-async";
import proj4 from "proj4";
import type { ElevationData, HorizonResult } from "./types.ts";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const WGS84 = "EPSG:4326";
const UTM12N = "+proj=utm +zone=12 +datum=NAD83 +units=m +no_defs";

type GeoTransform = [number, number, number, number, number, number];

const toPixel = (
  latitude: number,
  longitude: number,
  gt: GeoTransform,
): { x: number; y: number } => {
  const [utmX, utmY] = proj4(WGS84, UTM12N, [longitude, latitude]) as [
    number,
    number,
  ];
  return {
    x: (utmX - gt[0]) / gt[1],
    y: (utmY - gt[3]) / gt[5],
  };
};

const isOutOfBounds = (
  px: number,
  py: number,
  width: number,
  height: number,
): boolean => px < 0 || py < 0 || px >= width || py >= height;

const findHorizon = (
  rasterData: Float32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  direction: number,
  pixelSize: number,
  baseElevation: number,
): HorizonResult => {
  const dx = Math.sin(direction * DEG_TO_RAD);
  const dy = -Math.cos(direction * DEG_TO_RAD);

  let maxAngle = -Infinity;
  let maxDistance = 0;
  let step = 1;

  while (true) {
    const px = Math.floor(startX + dx * step);
    const py = Math.floor(startY + dy * step);

    if (isOutOfBounds(px, py, width, height)) break;

    const elevation = rasterData[py * width + px] ?? 0;
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
    distance_km: maxDistance / 1000,
  };
};

export const loadElevationData = async (
  tifPath: string,
): Promise<ElevationData> => {
  const dataset = await gdal.openAsync(tifPath);

  if (!dataset.geoTransform) throw new Error("Missing geoTransform");

  const gt = dataset.geoTransform as GeoTransform;
  const { x: width, y: height } = dataset.rasterSize;
  const pixelSize = Math.abs(gt[1]);
  const band = dataset.bands.get(1);
  const rasterData = band.pixels.read(0, 0, width, height) as Float32Array;

  return {
    calculateHorizon: (
      latitude: number,
      longitude: number,
      startDirection = 0,
      endDirection = 359,
    ): HorizonResult[] => {
      const start = toPixel(latitude, longitude, gt);
      const startIdx = Math.floor(start.y) * width + Math.floor(start.x);
      const baseElevation = rasterData[startIdx] ?? 0;

      return Array.from(
        { length: endDirection - startDirection + 1 },
        (_, i) =>
          findHorizon(
            rasterData,
            width,
            height,
            start.x,
            start.y,
            startDirection + i,
            pixelSize,
            baseElevation,
          ),
      );
    },
  };
};
