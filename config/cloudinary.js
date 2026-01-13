import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Check if Cloudinary is configured
const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let upload, uploadImage;

if (isCloudinaryConfigured) {
  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  // Storage for general files
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'lms-files',
      allowed_formats: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar'],
      resource_type: 'auto'
    }
  });

  // Storage for images only
  const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'lms-images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
  });

  upload = multer({ storage });
  uploadImage = multer({ storage: imageStorage });

  console.log('✅ Cloudinary configured for file uploads');
} else {
  // Fallback to local storage
  const uploadDir = path.join(process.cwd(), 'uploads');
  const docsDir = path.join(uploadDir, 'documents');
  const imagesDir = path.join(uploadDir, 'images');

  // Create directories if not exist
  [uploadDir, docsDir, imagesDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Local storage for documents
  const localStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, docsDir),
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });

  // Local storage for images
  const localImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });

  upload = multer({
    storage: localStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('File type not allowed'), false);
    }
  });

  uploadImage = multer({
    storage: localImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
  });

  console.log('⚠️ Cloudinary not configured, using local storage at:', uploadDir);
}

export { upload, uploadImage };

// Delete file from Cloudinary
export const deleteFile = async (publicId) => {
  if (!isCloudinaryConfigured) return { result: 'skipped' };
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

// Get public ID from URL
export const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  return `${folder}/${filename.split('.')[0]}`;
};

export default cloudinary;