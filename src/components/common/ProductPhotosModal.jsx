import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Images, Upload, Download, Trash2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase, supabaseHelpers } from '../../config/supabase';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

const slugify = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
  || 'product';

const bucket = 'product-images';
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB per image

const PHOTO_DISCLAIMER = {
  en: `For storing photos on the platform there is a €1 fee for uploading up to 6 photos per product, applicable only when I upload the photos for you. Photos remain available as long as the product stays in inventory. The €3 monthly fee starts from the moment the first photo is uploaded. If you upload them yourself, you only pay the €3 monthly fee. The service is optional; photos can be sent for free via WhatsApp on request.`,
  fr: `Pour stocker les photos sur la plateforme, des frais de 1 € s’appliquent pour le téléchargement de 6 photos par produit, uniquement lorsque je les télécharge pour vous. Les photos restent disponibles tant que le produit est présent dans l’inventaire. Les frais mensuels de 3 € commencent au moment du premier téléchargement de photo. Si vous les téléchargez vous‑même, vous payez uniquement les 3 € par mois. Ce service est optionnel ; les photos peuvent être envoyées gratuitement par WhatsApp sur demande.`,
  de: `Für die Speicherung der Fotos auf der Plattform fällt eine Gebühr von 1 € für bis zu 6 Fotos pro Produkt an, jedoch nur, wenn ich die Fotos für dich hochlade. Die Fotos bleiben verfügbar, solange das Produkt im Bestand ist. Die monatliche Gebühr von 3 € gilt ab dem Moment, in dem das erste Foto hochgeladen wird. Wenn du sie selbst hochlädst, zahlst du nur die monatlichen 3 €. Der Service ist optional; die Fotos können auf Wunsch kostenlos per WhatsApp gesendet werden.`,
  it: `Per conservare le foto sulla piattaforma viene applicata una tariffa di 1 € per il caricamento di 6 foto per prodotto, dovuta solo se carico io le foto. Le foto restano disponibili finché il prodotto rimane in inventario. La tariffa mensile di 3 € decorre dal momento del primo caricamento. Se le carichi tu, paghi soltanto i 3 € al mese. Il servizio è facoltativo; le foto possono essere inviate gratuitamente via WhatsApp su richiesta.`,
  es: `Para almacenar las fotos en la plataforma se cobra una tarifa de 1 € por subir hasta 6 fotos por producto, aplicable solo cuando yo subo las fotos por ti. Las fotos permanecen disponibles mientras el producto siga en inventario. La cuota mensual de 3 € empieza en el momento en que se sube la primera foto. Si las subes tú mismo, solo pagas la cuota mensual de 3 €. El servicio es opcional; las fotos se pueden enviar gratis por WhatsApp si lo solicitas.`,
  ro: `Pentru stocarea pozelor pe platformă se percepe o taxă de 1 € pentru încărcarea a 6 poze per produs, aplicabilă doar dacă eu încarc pozele. Pozele rămân disponibile atât timp cât produsul este prezent în inventar. Taxa lunară de 3 € se aplică din momentul primei încărcări de poză. Dacă le încarci tu direct, plătești doar taxa lunară de 3 €. Serviciul este opțional; pozele pot fi trimise gratuit prin WhatsApp la cerere.`
};

const ProductPhotosModal = ({
  open,
  onClose,
  stockItem,
  companyId,
  canEdit = true,
  maxPhotos = 6,
  onPhotoCountChange
}) => {
  const { profile } = useSupabaseAuth();
  const { currentLanguage } = useLanguage();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const photoDisclaimer = PHOTO_DISCLAIMER[currentLanguage] || PHOTO_DISCLAIMER.en;

  const productName = stockItem?.name || stockItem?.product_name || 'Product';
  const slug = useMemo(() => slugify(productName), [productName]);

  const fetchImages = useCallback(async () => {
    if (!open || !stockItem?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: listError } = await supabaseHelpers.listProductImages(stockItem.id);
      if (listError) throw listError;
      const mapped = await Promise.all(
        (data || []).map(async (img) => {
          const { data: signed, error: signedError } = await supabase
            .storage
            .from(bucket)
            .createSignedUrl(img.storage_path, 600);
          if (signedError) throw signedError;
          return { ...img, signedUrl: signed?.signedUrl || null };
        })
      );
      setImages(mapped);
    } catch (err) {
      console.error('fetchImages error', err);
      setError(err.message || 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [open, stockItem?.id]);

  useEffect(() => {
    if (open) fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stockItem?.id]);

  useEffect(() => {
    if (!stockItem?.id) return;
    onPhotoCountChange?.(images.length);
  }, [images.length, onPhotoCountChange, stockItem?.id]);

  const closeModal = () => {
    setError('');
    setImages([]);
    onClose?.();
  };

  if (!open || !stockItem) return null;

  const remainingSlots = Math.max(0, maxPhotos - images.length);

  const handleFiles = async (evt) => {
    const files = Array.from(evt.target.files || []);
    if (!files.length) return;
    setError('');
    const allowed = files.slice(0, remainingSlots);
    if (!allowed.length) {
      setError('Photo limit reached. Remove an image before uploading another.');
      return;
    }
    const tooLarge = allowed.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooLarge) {
      setError(`"${tooLarge.name}" depășește limita de 4 MB per poză. Te rugăm să încarci fișiere mai mici.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of allowed) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${companyId || 'common'}/${stockItem.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: uploadError } = await supabase
          .storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'image/jpeg'
          });
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabaseHelpers.addProductImage({
          stock_item_id: stockItem.id,
          storage_path: path,
          uploaded_by: profile?.id || null
        });
        if (insertError) throw insertError;
      }
      fetchImages();
    } catch (err) {
      console.error('upload error', err);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      evt.target.value = '';
    }
  };

  const handleDelete = async (image) => {
    if (!canEdit) return;
    try {
      await supabase.storage.from(bucket).remove([image.storage_path]);
      const { error: deleteErr } = await supabaseHelpers.deleteProductImage(image.id);
      if (deleteErr) throw deleteErr;
      setImages((prev) => prev.filter((img) => img.id !== image.id));
    } catch (err) {
      console.error('delete error', err);
      setError(err.message || 'Failed to delete photo');
    }
  };

  const downloadSingle = (image) => {
    const link = document.createElement('a');
    link.href = image.signedUrl;
    link.download = `${slug}-${image.id}.jpg`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.click();
  };

  const handleDownloadAll = async () => {
    if (!images.length) return;
    setError('');
    try {
      const zip = new JSZip();
      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        const resp = await fetch(img.signedUrl);
        const blob = await resp.blob();
        const ext = blob.type.split('/')[1] || 'jpg';
        zip.file(`${slug}-${i + 1}.${ext}`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${slug}-photos.zip`);
    } catch (err) {
      console.error('zip download error', err);
      setError(err.message || 'Failed to download archive');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={closeModal}>
      <div
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Images className="w-5 h-5" /> Photos – {productName}
            </h3>
            <p className="text-sm text-text-secondary">
              {images.length} / {maxPhotos} images uploaded
            </p>
            <p className="text-[13px] text-text-secondary mt-1 leading-relaxed whitespace-pre-line">
              {photoDisclaimer}
            </p>
          </div>
          <button onClick={closeModal} className="text-text-secondary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="border border-red-200 bg-red-50 text-red-700 rounded-md px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {canEdit && (
            <div className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center text-center">
              <Upload className="w-6 h-6 text-text-secondary" />
              <p className="text-sm mt-2 text-text-secondary">
                Drag & drop or click to upload (max {remainingSlots} more)
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={remainingSlots === 0 || uploading}
                onChange={handleFiles}
                className="mt-3"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              disabled={!images.length}
              className="inline-flex items-center gap-2 px-3 py-2 border rounded text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download all
            </button>
            {uploading && <span className="text-xs text-text-secondary">Uploading…</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full flex justify-center py-10 text-text-secondary">
                Loading photos…
              </div>
            ) : images.length === 0 ? (
              <p className="col-span-full text-sm text-text-secondary text-center">
                No photos uploaded yet.
              </p>
            ) : (
              images.map((image, idx) => (
                <div key={image.id} className="border rounded-lg overflow-hidden bg-gray-50">
                  {image.signedUrl ? (
                    <img
                      src={image.signedUrl}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center text-sm text-text-secondary">
                      Preview unavailable
                    </div>
                  )}
                  <div className="flex items-center justify-between px-3 py-2 bg-white text-sm">
                    <button onClick={() => downloadSingle(image)} className="inline-flex items-center gap-1 text-primary">
                      <Download className="w-4 h-4" /> Download
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(image)}
                        className="inline-flex items-center gap-1 text-red-500"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPhotosModal;
