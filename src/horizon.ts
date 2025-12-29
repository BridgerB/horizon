import gdal from "gdal-async";
import proj4 from "proj4";
import type { ElevationData, HorizonResult } from "./types.js";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const WGS84 = "EPSG:4326";

type GeoTransform = [number, number, number, number, number, number];

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

const isOutOfBounds = (
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
): boolean => pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height;

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
    distance_km: maxDistance / 1000,
  };
};

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
