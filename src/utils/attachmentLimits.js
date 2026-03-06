export const MAX_CHAT_ATTACHMENT_SIZE = 20 * 1024 * 1024;
export const ALLOWED_CHAT_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const ATTACHMENT_SIZE_ERRORS = {
  FR: 'Fichier trop volumineux (max 20 Mo).',
  DE: 'Datei zu groß (max. 20 MB).',
  ES: 'Archivo demasiado grande (máx. 20 MB).',
  IT: 'File troppo grande (max 20 MB).',
  EN: 'File exceeds 20 MB limit.'
};

export const getAttachmentSizeError = (market) => {
  const code = String(market || 'FR').trim().toUpperCase();
  return ATTACHMENT_SIZE_ERRORS[code] || ATTACHMENT_SIZE_ERRORS.FR;
};

export const CHAT_ATTACHMENT_SIZE_MB = MAX_CHAT_ATTACHMENT_SIZE / (1024 * 1024);
