# Calculate 360-degree horizon elevation angles from GeoTIFF elevation data.

## Requirements

- Node.js 24+
- GDAL (`brew install gdal` / `apt install gdal-bin`)

## Install

```bash
npm install @bridgerb/horizon gdal-async
```

## Usage

```typescript
import { loadElevationData } from "@bridgerb/horizon";

const elevation = await loadElevationData("path/to/elevation.tif");

const horizon = elevation.calculateHorizon(40.311259, -111.659330);
// Returns 360 results, one per degree

const partial = elevation.calculateHorizon(40.311259, -111.659330, 45, 135);
// Only directions 45° to 135°
```

## API

### loadElevationData(tifPath: string): Promise\<ElevationData\>

Loads a GeoTIFF elevation file. Call once, then query many times.

### ElevationData.calculateHorizon(lat, lng, start?, end?): HorizonResult[]

- `lat` - Latitude in degrees
- `lng` - Longitude in degrees
- `start` - Start direction (default: 0)
- `end` - End direction (default: 359)

### HorizonResult

- `direction` - Compass direction in degrees (0 = North)
- `elevationAngleDegrees` - Angle to horizon
- `distance_km` - Distance to horizon point

## License

Unlicense - Public Domain
