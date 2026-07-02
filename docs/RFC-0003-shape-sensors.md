# RFC-0003 — ShapeSensors

## Principe

Les ShapeSensors sont des plugins specialises qui comparent deux ShapeDNA et retournent un score partiel explicable.

## Interface conceptuelle

```ts
interface ShapeSensor {
  id: string;
  name: string;
  weight: number;
  extract(shape): SensorData;
  compare(a, b): SensorScore;
}
```

## Sensors V1

- GeometrySensor
- ContourSensor
- HuSensor
- FourierSensor
- TopologySensor
- SymmetrySensor
