import Uppy from '@uppy/core';
import Compressor from '@uppy/compressor';
import Dashboard from '@uppy/dashboard';
import ImageEditor from '@uppy/image-editor';
import XHRUpload from '@uppy/xhr-upload';
import { photoCaptureInfo } from './photo-metadata.js';

import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';
import '@uppy/image-editor/css/style.min.css';

const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_PREPARED_PHOTO_BYTES = 900 * 1024;

export function createPlantPhotoUploader() {
  let context = null;
  let session = null;
  let lastUploadedImage = '';
  let sessionNumber = 0;

  function disposeSession() {
    if (!session) return;
    const previous = session;
    session = null;
    if (previous.dashboard.isModalOpen()) previous.dashboard.closeModal();
    previous.uppy.destroy();
  }

  function createSession() {
    disposeSession();
    const sessionContext = context;
    const uppy = new Uppy({
      id: `plant-photo-uploader-${++sessionNumber}`,
      autoProceed: false,
      allowMultipleUploadBatches: false,
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: MAX_SOURCE_PHOTO_BYTES,
        allowedFileTypes: ['image/*'],
      },
    });

    uppy.use(Dashboard, {
      inline: false,
      target: 'body',
      autoOpen: 'imageEditor',
      closeModalOnClickOutside: false,
      proudlyDisplayPoweredByUppy: false,
      showProgressDetails: true,
      note: 'One image, up to 25 MB. Crop it as a portrait, rotate or zoom; the saved copy is compressed automatically.',
      locale: {
        strings: {
          dashboardWindowTitle: 'Plant photo editor',
        },
      },
    });

    uppy.use(ImageEditor, {
      quality: 0.84,
      cropperOptions: {
        aspectRatio: 3 / 4,
        viewMode: 1,
        autoCropArea: 1,
        background: false,
        responsive: true,
        croppedCanvasOptions: {
          maxWidth: 1200,
          maxHeight: 1600,
          fillColor: '#ffffff',
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
        },
      },
    });

    uppy.use(Compressor, {
      quality: 0.72,
      maxWidth: 900,
      maxHeight: 1200,
      mimeType: 'image/jpeg',
    });

    uppy.use(XHRUpload, {
      endpoint: () => `/api/photos?plantId=${encodeURIComponent(sessionContext.plantId)}`,
      method: 'POST',
      formData: false,
      withCredentials: false,
      headers: { 'Content-Type': 'image/jpeg', Accept: 'application/json' },
      onBeforeRequest: (_xhr, _retryCount, files) => {
        const preparedPhoto = files[0]?.data;
        if (preparedPhoto?.size > MAX_PREPARED_PHOTO_BYTES) {
          throw new Error('The prepared photo is still too large. Crop it more tightly and try again.');
        }
      },
      getResponseData: (xhr) => {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (!payload.url) throw new Error('The photo uploaded, but its private address was not returned.');
        return payload;
      },
    });

    const current = { uppy, dashboard: uppy.getPlugin('Dashboard'), uploadedImage: '', captureInfo: { capturedOn: '', source: '' } };
    session = current;

    uppy.on('file-added', async (file) => {
      if (session !== current) return;
      current.uploadedImage = '';
      current.captureInfo = { capturedOn: '', source: '' };
      sessionContext.onSelected?.(file.name, current.captureInfo, file);
      current.captureInfo = await photoCaptureInfo(file.data);
      if (session === current) sessionContext.onSelected?.(file.name, current.captureInfo, file);
    });

    uppy.on('file-removed', () => {
      if (session === current && !current.uploadedImage) sessionContext.onSelected?.('');
    });

    uppy.on('restriction-failed', (_file, error) => sessionContext.onError?.(error));
    uppy.on('upload-error', (_file, error) => sessionContext.onError?.(error));
    uppy.on('dashboard:modal-closed', () => {
      if (session === current) sessionContext.onEditorClose?.();
    });
    uppy.on('upload-success', (file, response) => {
      if (session !== current) return;
      current.uploadedImage = response?.body?.url || '';
      if (!current.uploadedImage) {
        sessionContext.onError?.(new Error('The photo uploaded, but its private address was not returned.'));
        return;
      }
      lastUploadedImage = current.uploadedImage;
      Promise.resolve(sessionContext.onUploaded?.(current.uploadedImage, file, current.captureInfo)).catch((error) => sessionContext.onError?.(error));
    });

    return current;
  }

  function setContext(nextContext) {
    if (!nextContext?.key || !nextContext?.plantId) throw new Error('Photo uploader context is incomplete.');
    if (context?.key !== nextContext.key) {
      disposeSession();
      lastUploadedImage = '';
    }
    context = nextContext;
  }

  return {
    setContext,
    open(nextContext = null) {
      if (nextContext) setContext(nextContext);
      if (!context) throw new Error('Choose a plant before opening the photo editor.');
      const current = createSession();
      context.onEditorOpen?.();
      current.dashboard.openModal();
    },
    async uploadCurrent() {
      if (!session?.uppy.getFiles().length) return lastUploadedImage;
      if (session.uploadedImage) return session.uploadedImage;
      const current = session;
      const result = await current.uppy.upload();
      if (result?.failed?.length) throw result.failed[0].error || new Error('Photo upload failed.');
      return current.uploadedImage || lastUploadedImage;
    },
    prepareForNextFile() {
      if (session?.dashboard.isModalOpen()) session.dashboard.closeModal();
    },
    reset() {
      disposeSession();
      context = null;
      lastUploadedImage = '';
    },
  };
}
