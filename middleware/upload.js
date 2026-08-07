const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Only allow common document/image/audio evidence formats.
// Executables, scripts, and unknown binary types are rejected outright.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'video/mp4'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never trust the original filename on disk - generate a random one
    // and keep the original only as metadata in the database.
    const randomName = crypto.randomBytes(24).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error('That file type is not supported. Please upload an image, PDF, Word document, audio, or video file.'));
  }
  cb(null, true);
}

const maxSizeMb = Number(process.env.MAX_UPLOAD_MB || 15);

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMb * 1024 * 1024, files: 5 }
});

module.exports = upload;
