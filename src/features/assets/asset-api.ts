import { ImageUploadResponse } from '@/entities/asset';
import { apiRequest } from '@/shared/api/http-client';

export type ImageUploadPurpose = 'PROFILE' | 'MAP_THUMBNAIL' | 'QUESTION_IMAGE';

export const assetApi = {
  uploadImage(file: Blob, filename = 'image.webp', purpose?: ImageUploadPurpose) {
    const form = new FormData();
    form.set('file', file, filename);
    if (purpose) form.set('purpose', purpose);

    return apiRequest<ImageUploadResponse>('/api/uploads/images', {
      method: 'POST',
      body: form,
    });
  },
};
