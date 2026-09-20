export type CropSettings = {
  x: number;
  y: number;
  zoom: number;
  fit?: 'cover' | 'contain';
};

const MAX_OUTPUT_LONG_EDGE = 1600;

export async function cropImageToBlob(
  file: File,
  aspectRatio: number,
  settings: CropSettings = { x: 50, y: 50, zoom: 1 },
  type = 'image/webp',
): Promise<Blob> {
  const image = await loadImage(file);
  const fit = settings.fit ?? 'cover';
  if (fit === 'contain') {
    return containImageToBlob(image, aspectRatio, type);
  }

  const sourceRatio = image.naturalWidth / image.naturalHeight;

  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (sourceRatio > aspectRatio) {
    sw = image.naturalHeight * aspectRatio;
  } else {
    sh = image.naturalWidth / aspectRatio;
  }

  sw = sw / settings.zoom;
  sh = sh / settings.zoom;

  const sx = Math.max(0, image.naturalWidth - sw) * (settings.x / 100);
  const sy = Math.max(0, image.naturalHeight - sh) * (settings.y / 100);

  const canvas = document.createElement('canvas');
  const outputSize = fitOutputSize(sw, sh);
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');

  context.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize.width, outputSize.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('crop_failed'));
      else resolve(blob);
    }, type);
  });
}

function containImageToBlob(image: HTMLImageElement, aspectRatio: number, type: string): Promise<Blob> {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let outputWidth = image.naturalWidth;
  let outputHeight = image.naturalHeight;

  if (sourceRatio > aspectRatio) {
    outputHeight = outputWidth / aspectRatio;
  } else {
    outputWidth = outputHeight * aspectRatio;
  }

  const outputSize = fitOutputSize(outputWidth, outputHeight);
  const scale = Math.min(outputSize.width / image.naturalWidth, outputSize.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const dx = (outputSize.width - drawWidth) / 2;
  const dy = (outputSize.height - drawHeight) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');

  context.fillStyle = '#eef3f8';
  context.fillRect(0, 0, outputSize.width, outputSize.height);
  context.drawImage(image, dx, dy, drawWidth, drawHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('crop_failed'));
      else resolve(blob);
    }, type);
  });
}

function fitOutputSize(width: number, height: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_OUTPUT_LONG_EDGE) return { width: Math.round(width), height: Math.round(height) };
  const scale = MAX_OUTPUT_LONG_EDGE / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    image.src = url;
  });
}
