import multer from 'multer';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(), // buffers go straight to sharp, never to disk
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    // First-pass check only; sharp is the real validation.
    cb(null, file.mimetype.startsWith('image/'));
  },
});

/** Accepts one optional image in the multipart field `image`. MulterErrors are mapped in errorHandler. */
export const imageUpload = upload.single('image');

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Library documents: any file type, one per request, kept in memory (images go to sharp). */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 5 },
}).single('file');
