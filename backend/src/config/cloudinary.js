import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'avatars',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png'];
const AVATAR_MESSAGES = {
    INVALID_AVATAR_TYPE: 'Avatar must be a JPEG or PNG image',
    LIMIT_FILE_SIZE: 'Avatar must be 2 MB or smaller',
};

// The mimetype is client-declared; Cloudinary's allowed_formats above re-checks the
// actual file, so a renamed non-image is still rejected.
export const upload = multer({
    storage,
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        if (AVATAR_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
        cb(Object.assign(new Error(AVATAR_MESSAGES.INVALID_AVATAR_TYPE), { code: 'INVALID_AVATAR_TYPE' }));
    }
});

// Single 'avatar' upload that answers 400 { error, fields } for a bad file
// instead of falling through to the 500 error handler.
export const avatarUpload = (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (!err) return next();
        let message = AVATAR_MESSAGES[err.code];
        if (!message && err instanceof multer.MulterError) message = 'Upload a single image in the "avatar" field';
        if (!message && err.http_code === 400) message = AVATAR_MESSAGES.INVALID_AVATAR_TYPE; // rejected by Cloudinary
        if (!message) return next(err);
        res.status(400).json({ error: message, fields: { avatar: message } });
    });
};

export default cloudinary;
