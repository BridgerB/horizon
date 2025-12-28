import gdal from "gdal-async";
import proj4 from "proj4";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const WGS84 = "EPSG:4326";
const UTM12N = "+proj=utm +zone=12 +datum=NAD83 +units=m +no_defs";

type GeoTransform = [number, number, number, number, number, number];

interface HorizonResult {
  direction: number;
  elevationAngleDegrees: number;
  distance_km: number;
}

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

const calculateHorizonForDirection = (
  rasterData: Float32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  direction: number,
  pixelSize: number,
): HorizonResult => {
  const dx = Math.sin(direction * DEG_TO_RAD);
  const dy = -Math.cos(direction * DEG_TO_RAD);

  const startIdx = Math.floor(startY) * width + Math.floor(startX);
  const baseElevation = rasterData[startIdx] ?? 0;

  let maxAngle = -Infinity;
  let maxDistance = 0;

  for (let step = 1;; step++) {
    const px = Math.floor(startX + dx * step);
    const py = Math.floor(startY + dy * step);

    if (px < 0 || py < 0 || px >= width || py >= height) break;

    const elevation = rasterData[py * width + px] ?? 0;
    const distance = step * pixelSize;
    const angle = Math.atan2(elevation - baseElevation, distance) * RAD_TO_DEG;

    if (angle > maxAngle) {
      maxAngle = angle;
      maxDistance = distance;
    }
  }

  return {
    direction,
    elevationAngleDegrees: maxAngle === -Infinity ? 0 : maxAngle,
    distance_km: maxDistance / 1000,
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

  const gt = dataset.geoTransform as GeoTransform;
  const { x: width, y: height } = dataset.rasterSize;
  const pixelSize = Math.abs(gt[1]);

  const band = dataset.bands.get(1);
  const rasterData = band.pixels.read(0, 0, width, height) as Float32Array;

  const start = toPixel(latitude, longitude, gt);

  const directions = [...Array(endDirection - startDirection + 1).keys()].map(
    (i) => startDirection + i,
  );

  return directions.map((direction) => {
    const result = calculateHorizonForDirection(
      rasterData,
      width,
      height,
      start.x,
      start.y,
      direction,
      pixelSize,
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
