export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const TRIM_PADDING = 12;
const ALPHA_CUTOFF = 8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    image.src = url;
  });
}

function isWhiteBackground(data: Uint8ClampedArray, width: number, height: number): boolean {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  return points.every(([x, y]) => {
    const index = (y * width + x) * 4;
    return data[index] >= 235 && data[index + 1] >= 235 && data[index + 2] >= 235;
  });
}

function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

function removeWhiteBackground(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const faintest = Math.min(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = Math.min(255, Math.round((255 - faintest) * 1.35));
  }
}

export async function prepareSignatureImage(file: File): Promise<PreparedImage> {
  const accepted = file.type
    ? ACCEPTED_TYPES.includes(file.type.toLowerCase())
    : /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!accepted) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose an image smaller than 15 MB.');

  const image = await loadImage(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) throw new Error('That image has no visible content.');

  const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('Could not prepare that image.');
  sourceContext.drawImage(image, 0, 0, width, height);

  const imageData = sourceContext.getImageData(0, 0, width, height);
  const transparent = hasTransparency(imageData.data);
  if (!transparent && isWhiteBackground(imageData.data, width, height)) {
    removeWhiteBackground(imageData.data);
    sourceContext.putImageData(imageData, 0, 0);
  }

  const pixels = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('That image appears to be blank.');
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const output = document.createElement('canvas');
  output.width = cropWidth + TRIM_PADDING * 2;
  output.height = cropHeight + TRIM_PADDING * 2;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Could not prepare that image.');
  outputContext.drawImage(
    source,
    minX,
    minY,
    cropWidth,
    cropHeight,
    TRIM_PADDING,
    TRIM_PADDING,
    cropWidth,
    cropHeight,
  );

  return {
    dataUrl: output.toDataURL('image/png'),
    width: output.width,
    height: output.height,
  };
}
