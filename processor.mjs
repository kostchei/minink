const DEFAULT_OPTIONS = Object.freeze({
  paletteSize: 20,
  edgeThreshold: 0.25,
  outlineWidth: 1,
  outlineStrength: 1,
  hueWeight: 0.82,
  valueWeight: 0.52,
  saturation: 1.18,
  contrast: 1.1,
  shadowLift: 0.2,
  smoothing: 2,
  regionCleanup: 2,
  dither: 0,
  inkColor: [15, 15, 18],
});

const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function fitSize(width, height, longEdge) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const safeLongEdge = Math.max(16, Math.round(Number(longEdge) || 96));
  const scale = safeLongEdge / Math.max(safeWidth, safeHeight);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function stylizeImageData(imageData, suppliedOptions = {}) {
  assertImageDataShape(imageData);

  const options = normalizeOptions(suppliedOptions);
  const { width, height } = imageData;
  const adjusted = adjustPixels(
    imageData.data,
    width,
    height,
    options.saturation,
    options.contrast,
    options.shadowLift,
  );
  const smoothed = boxBlur(adjusted, width, height, options.smoothing);
  const palette = buildPalette(smoothed, options.paletteSize);
  const { labels } = quantize(
    smoothed,
    palette,
    width,
    height,
    options.dither,
  );
  const cleanedLabels = cleanupSmallRegions(
    labels,
    width,
    height,
    regionMinimumSize(options.regionCleanup),
  );
  const quantized = renderLabels(
    cleanedLabels,
    palette,
    smoothed,
  );
  const structurePixels = boxBlur(
    smoothed,
    width,
    height,
    Math.max(0, options.regionCleanup - 1),
  );
  const edgeMask = detectEdges(
    structurePixels,
    cleanedLabels,
    palette,
    width,
    height,
    options.edgeThreshold,
    options.hueWeight,
    options.valueWeight,
    suppliedOptions.componentMap,
  );
  const thickMask = dilateMask(
    edgeMask,
    width,
    height,
    Math.max(0, options.outlineWidth - 1),
  );

  applyInk(
    quantized,
    thickMask,
    options.inkColor,
    options.outlineStrength,
  );

  return {
    imageData: makeImageData(quantized, width, height),
    palette,
  };
}

function normalizeOptions(options) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  return {
    paletteSize: clamp(Math.round(merged.paletteSize), 3, 24),
    edgeThreshold: clamp(merged.edgeThreshold, 0.05, 0.8),
    outlineWidth: clamp(Math.round(merged.outlineWidth), 1, 3),
    outlineStrength: clamp(merged.outlineStrength, 0, 1),
    hueWeight: clamp(merged.hueWeight, 0, 1.5),
    valueWeight: clamp(merged.valueWeight, 0, 1.5),
    saturation: clamp(merged.saturation, 0, 2.5),
    contrast: clamp(merged.contrast, 0.5, 2),
    shadowLift: clamp(merged.shadowLift, 0, 0.5),
    smoothing: clamp(Math.round(merged.smoothing), 0, 3),
    regionCleanup: clamp(Math.round(merged.regionCleanup), 0, 3),
    dither: clamp(merged.dither, 0, 0.5),
    inkColor: normalizeInkColor(merged.inkColor),
  };
}

function normalizeInkColor(color) {
  if (!Array.isArray(color) || color.length < 3) {
    return [...DEFAULT_OPTIONS.inkColor];
  }
  return color.slice(0, 3).map((channel) => clamp(Math.round(channel), 0, 255));
}

function assertImageDataShape(imageData) {
  if (
    !imageData
    || !Number.isInteger(imageData.width)
    || !Number.isInteger(imageData.height)
    || imageData.width < 1
    || imageData.height < 1
    || !imageData.data
    || imageData.data.length !== imageData.width * imageData.height * 4
  ) {
    throw new TypeError("Expected RGBA image data with valid dimensions.");
  }
}

function makeImageData(data, width, height) {
  if (typeof ImageData === "function") {
    return new ImageData(data, width, height);
  }
  return { data, width, height };
}

function adjustPixels(source, width, height, saturation, contrast, shadowLift) {
  const output = new Uint8ClampedArray(source.length);
  const contrastFactor = contrast;
  const shadowExponent = 1 - shadowLift * 0.8;

  for (let offset = 0; offset < source.length; offset += 4) {
    const red = source[offset];
    const green = source[offset + 1];
    const blue = source[offset + 2];
    const lightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    output[offset] = liftShadow(
      ((lightness + (red - lightness) * saturation) - 128) * contrastFactor + 128,
      shadowExponent,
    );
    output[offset + 1] = liftShadow(
      ((lightness + (green - lightness) * saturation) - 128) * contrastFactor + 128,
      shadowExponent,
    );
    output[offset + 2] = liftShadow(
      ((lightness + (blue - lightness) * saturation) - 128) * contrastFactor + 128,
      shadowExponent,
    );
    output[offset + 3] = source[offset + 3];
  }

  return output;
}

function boxBlur(source, width, height, passes) {
  let current = new Uint8ClampedArray(source);

  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Uint8ClampedArray(current.length);
    const output = new Uint8ClampedArray(current.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        averagePixel(current, horizontal, width, height, x, y, 1, 0);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        averagePixel(horizontal, output, width, height, x, y, 0, 1);
      }
    }

    current = output;
  }

  return current;
}

function averagePixel(source, target, width, height, x, y, xRadius, yRadius) {
  const minX = Math.max(0, x - xRadius);
  const maxX = Math.min(width - 1, x + xRadius);
  const minY = Math.max(0, y - yRadius);
  const maxY = Math.min(height - 1, y + yRadius);
  const targetOffset = (y * width + x) * 4;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;

  for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
    for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
      const offset = (sampleY * width + sampleX) * 4;
      red += source[offset];
      green += source[offset + 1];
      blue += source[offset + 2];
      alpha += source[offset + 3];
      count += 1;
    }
  }

  target[targetOffset] = red / count;
  target[targetOffset + 1] = green / count;
  target[targetOffset + 2] = blue / count;
  target[targetOffset + 3] = alpha / count;
}

function buildPalette(pixels, requestedSize) {
  const pixelCount = pixels.length / 4;
  const stride = Math.max(1, Math.floor(pixelCount / 4096));
  const samples = [];

  for (let index = 0; index < pixelCount; index += stride) {
    const offset = index * 4;
    if (pixels[offset + 3] < 24) continue;
    samples.push([
      pixels[offset],
      pixels[offset + 1],
      pixels[offset + 2],
    ]);
  }

  if (samples.length === 0) {
    return [[0, 0, 0]];
  }

  const paletteSize = Math.min(requestedSize, samples.length);
  const centroids = seedCentroids(samples, paletteSize);
  const assignments = new Uint16Array(samples.length);

  for (let iteration = 0; iteration < 9; iteration += 1) {
    const totals = Array.from(
      { length: paletteSize },
      () => [0, 0, 0, 0],
    );

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const cluster = nearestColorIndex(samples[sampleIndex], centroids);
      assignments[sampleIndex] = cluster;
      totals[cluster][0] += samples[sampleIndex][0];
      totals[cluster][1] += samples[sampleIndex][1];
      totals[cluster][2] += samples[sampleIndex][2];
      totals[cluster][3] += 1;
    }

    for (let cluster = 0; cluster < paletteSize; cluster += 1) {
      const count = totals[cluster][3];
      if (count === 0) continue;
      centroids[cluster] = [
        totals[cluster][0] / count,
        totals[cluster][1] / count,
        totals[cluster][2] / count,
      ];
    }
  }

  return centroids
    .map((color) => color.map((channel) => clampByte(channel)))
    .sort((first, second) => luminance(first) - luminance(second));
}

function seedCentroids(samples, paletteSize) {
  const mean = samples.reduce(
    (total, sample) => [
      total[0] + sample[0],
      total[1] + sample[1],
      total[2] + sample[2],
    ],
    [0, 0, 0],
  ).map((value) => value / samples.length);

  const centroids = [samples[farthestColorIndex(samples, [mean])].slice()];

  while (centroids.length < paletteSize) {
    centroids.push(samples[farthestColorIndex(samples, centroids)].slice());
  }

  return centroids;
}

function farthestColorIndex(samples, centroids) {
  let bestIndex = 0;
  let bestDistance = -1;

  for (let index = 0; index < samples.length; index += 1) {
    const nearestDistance = colorDistanceSquared(
      samples[index],
      centroids[nearestColorIndex(samples[index], centroids)],
    );
    if (nearestDistance > bestDistance) {
      bestDistance = nearestDistance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function quantize(source, palette, width, height, ditherAmount) {
  const labels = new Uint16Array(width * height);
  const ditherScale = ditherAmount * 72;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      const dither = ((BAYER_4[(y % 4) * 4 + (x % 4)] / 15) - 0.5) * ditherScale;
      const sourceColor = [
        clampByte(source[offset] + dither),
        clampByte(source[offset + 1] + dither),
        clampByte(source[offset + 2] + dither),
      ];
      const paletteIndex = nearestColorIndex(sourceColor, palette);

      labels[pixelIndex] = paletteIndex;
    }
  }

  return { labels };
}

function cleanupSmallRegions(source, width, height, minimumSize) {
  if (minimumSize <= 1) return source;

  let labels = new Uint16Array(source);

  for (let pass = 0; pass < 2; pass += 1) {
    const visited = new Uint8Array(labels.length);
    const next = new Uint16Array(labels);

    for (let start = 0; start < labels.length; start += 1) {
      if (visited[start]) continue;

      const label = labels[start];
      const region = [];
      const queue = [start];
      const neighboringCounts = new Map();
      visited[start] = 1;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        region.push(index);
        const x = index % width;
        const y = Math.floor(index / width);

        for (const neighbor of orthogonalNeighbors(x, y, width, height)) {
          if (labels[neighbor] === label) {
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          } else {
            const neighborLabel = labels[neighbor];
            neighboringCounts.set(
              neighborLabel,
              (neighboringCounts.get(neighborLabel) || 0) + 1,
            );
          }
        }
      }

      if (region.length >= minimumSize || neighboringCounts.size === 0) continue;

      let replacement = label;
      let strongestContact = -1;
      for (const [candidate, contactCount] of neighboringCounts) {
        if (contactCount > strongestContact) {
          replacement = candidate;
          strongestContact = contactCount;
        }
      }

      for (const index of region) next[index] = replacement;
    }

    labels = next;
  }

  return labels;
}

function orthogonalNeighbors(x, y, width, height) {
  const neighbors = [];
  if (x > 0) neighbors.push(y * width + x - 1);
  if (x + 1 < width) neighbors.push(y * width + x + 1);
  if (y > 0) neighbors.push((y - 1) * width + x);
  if (y + 1 < height) neighbors.push((y + 1) * width + x);
  return neighbors;
}

function regionMinimumSize(cleanupLevel) {
  return [0, 4, 10, 22][cleanupLevel] ?? 10;
}

function renderLabels(labels, palette, alphaSource) {
  const pixels = new Uint8ClampedArray(alphaSource.length);

  for (let index = 0; index < labels.length; index += 1) {
    const offset = index * 4;
    const color = palette[labels[index]];
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = alphaSource[offset + 3];
  }

  return pixels;
}

function detectEdges(
  pixels,
  labels,
  palette,
  width,
  height,
  threshold,
  hueWeight,
  valueWeight,
  componentMap,
) {
  const raw = new Uint8Array(width * height);
  const cleaned = new Uint8Array(width * height);
  const luma = new Float32Array(width * height);
  const perceptualPalette = palette.map(rgbToOklch);

  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4;
    luma[index] = (
      pixels[offset] * 0.2126
      + pixels[offset + 1] * 0.7152
      + pixels[offset + 2] * 0.0722
    ) / 255;
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = luma[(y - 1) * width + x - 1];
      const top = luma[(y - 1) * width + x];
      const topRight = luma[(y - 1) * width + x + 1];
      const left = luma[y * width + x - 1];
      const right = luma[y * width + x + 1];
      const bottomLeft = luma[(y + 1) * width + x - 1];
      const bottom = luma[(y + 1) * width + x];
      const bottomRight = luma[(y + 1) * width + x + 1];
      const gradientX = (
        -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight
      );
      const gradientY = (
        -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
      );
      const lumaGradient = Math.min(1, Math.hypot(gradientX, gradientY) / 3);
      const index = y * width + x;
      const label = labels[index];
      let paletteBoundary = 0;

      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (labels[neighbor] === label) continue;
        paletteBoundary = Math.max(
          paletteBoundary,
          perceptualBoundaryScore(
            perceptualPalette[label],
            perceptualPalette[labels[neighbor]],
            hueWeight,
            valueWeight,
          ),
        );
      }

      const score = lumaGradient * 0.34 + paletteBoundary * 0.86;
      if (score >= threshold && pixels[index * 4 + 3] > 32) {
        raw[index] = 1;
      }
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!raw[index]) continue;
      let neighbors = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          neighbors += raw[(y + offsetY) * width + x + offsetX];
        }
      }

      if (neighbors >= 2) cleaned[index] = 1;
    }
  }

  mergeComponentBoundaries(cleaned, componentMap, width, height);
  return cleaned;
}

function mergeComponentBoundaries(edgeMask, componentMap, width, height) {
  if (
    !componentMap
    || componentMap.length !== width * height
  ) {
    return;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const component = componentMap[index];
      if (!component) continue;

      for (const neighbor of orthogonalNeighbors(x, y, width, height)) {
        if (componentMap[neighbor] !== component) {
          edgeMask[index] = 1;
          break;
        }
      }
    }
  }
}

function perceptualBoundaryScore(first, second, hueWeight, valueWeight) {
  const valueDelta = Math.abs(first.lightness - second.lightness);
  const chromaDelta = Math.min(1, Math.abs(first.chroma - second.chroma) * 4);
  const rawHueDelta = Math.abs(first.hue - second.hue);
  const hueDelta = Math.min(rawHueDelta, 360 - rawHueDelta) / 180;
  const hueConfidence = Math.min(1, Math.max(first.chroma, second.chroma) / 0.14);

  return clamp(
    valueDelta * valueWeight
    + hueDelta * hueConfidence * hueWeight
    + chromaDelta * 0.28,
    0,
    1,
  );
}

function rgbToOklch(color) {
  const red = srgbToLinear(color[0] / 255);
  const green = srgbToLinear(color[1] / 255);
  const blue = srgbToLinear(color[2] / 255);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

  return { lightness, chroma, hue };
}

function srgbToLinear(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function dilateMask(source, width, height, radius) {
  if (radius === 0) return source;
  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let found = false;
      for (let offsetY = -radius; offsetY <= radius && !found; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) continue;
          if (source[sampleY * width + sampleX]) {
            found = true;
            break;
          }
        }
      }
      if (found) output[y * width + x] = 1;
    }
  }

  return output;
}

function applyInk(pixels, mask, inkColor, strength) {
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    pixels[offset] = mix(pixels[offset], inkColor[0], strength);
    pixels[offset + 1] = mix(pixels[offset + 1], inkColor[1], strength);
    pixels[offset + 2] = mix(pixels[offset + 2], inkColor[2], strength);
  }
}

function nearestColorIndex(color, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < palette.length; index += 1) {
    const distance = colorDistanceSquared(color, palette[index]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function colorDistanceSquared(first, second) {
  const redMean = (first[0] + second[0]) / 2;
  const red = first[0] - second[0];
  const green = first[1] - second[1];
  const blue = first[2] - second[2];

  return (
    (2 + redMean / 256) * red * red
    + 4 * green * green
    + (2 + (255 - redMean) / 256) * blue * blue
  );
}

function luminance(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function mix(from, to, amount) {
  return clampByte(from + (to - from) * amount);
}

function clampByte(value) {
  return clamp(Math.round(value), 0, 255);
}

function liftShadow(value, exponent) {
  return clampByte(255 * Math.pow(clamp(value, 0, 255) / 255, exponent));
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}
