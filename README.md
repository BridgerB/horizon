# horizon

Calculate 360-degree horizon elevation angles from a given latitude/longitude.

Requires Node.js 24+ and GDAL

```bash
node main.ts 40.311259 -111.659330
node main.ts 40.311259 -111.659330 47 111  # only directions 47° to 111°
```

Outputs JSON with elevation angle and distance to horizon for each degree.
