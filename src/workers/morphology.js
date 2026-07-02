export function morphClose(mask, width, height, dilateRadius, erodeRadius) {
  return erode(dilate(mask, width, height, dilateRadius), width, height, erodeRadius);
}

export function dilate(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = 0;

      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;

          if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[yy * width + xx]) {
            found = 1;
            break;
          }
        }
      }

      output[y * width + x] = found;
    }
  }

  return output;
}

export function erode(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let full = 1;

      for (let dy = -radius; dy <= radius && full; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;

          if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[yy * width + xx]) {
            full = 0;
            break;
          }
        }
      }

      output[y * width + x] = full;
    }
  }

  return output;
}
