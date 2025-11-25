## Keepa – imagini produs (Amazon.fr)

Configurare curentă:
- Domeniu: `4` (FR).
- Limită: 1 token/min, cu prag de siguranță 20 tokenuri rămase (se oprește dacă scade sub prag).
- Dimensiune implicită: 1500 px.
- Set imagini: doar imaginea principală (prima intrare din `images`/`imagesCSV`).

### Variabile de mediu (.env)
- `VITE_KEEPA_API_KEY` – cheia privată Keepa (nu o commita).
- `VITE_KEEPA_DOMAIN` – default `4`.
- `VITE_KEEPA_IMAGE_SIZE` – default `1500` (acceptă `500`, `1000`, `1500`, `original`).
- `VITE_KEEPA_MAIN_IMAGE_ONLY` – `true`/`false` (default `true`).
- `VITE_KEEPA_TOKENS_PER_MINUTE` – default `1`.
- `VITE_KEEPA_TOKEN_SAFETY_REMAINING` – default `0` (setează >0 doar dacă vrei un prag de siguranță; dacă `tokensLeft` < prag, clientul se oprește).

### Utilizare în cod
```js
import { getKeepaMainImage, getKeepaImages } from '@/utils/keepaClient';

// Imagine principală la dimensiunea implicită (1500px)
const { image, tokensLeft } = await getKeepaMainImage({ asin: 'B00TEST123' });

// Toate imaginile la 500px (dacă dezactivezi MAIN_IMAGE_ONLY în .env)
const { images } = await getKeepaImages({ asin: 'B00TEST123', size: 500, allImages: true });

// Forțează refresh și sare peste cache
await getKeepaMainImage({ asin: 'B00TEST123', forceRefresh: true });
```

### Cum funcționează clientul (`src/utils/keepaClient.js`)
- Apelează endpoint-ul minim: `product?key=...&domain=4&asin=...` (fără flags `offers/history/buybox` – pot da 400 invalidParameter).
- Respectă 1 token/min (`rateLimit` + backoff la 429/503).
- Verifică `tokensLeft`: dacă e sub prag, aruncă eroare și nu mai continuă.
- Construiește URL-ul: `https://images-na.ssl-images-amazon.com/images/I/<IMAGE_ID>._SL{size}_.jpg` (pentru original, scoate sufixul).
- Cache pe sesiune/tab (Map) pentru perechea ASIN+dimensiune+tip (main/all).

### Ce trebuie setat înainte de rulare
1) Adaugă cheia Keepa în `.env`: `VITE_KEEPA_API_KEY="..."`.
2) Verifică `VITE_KEEPA_DOMAIN=4`, `VITE_KEEPA_IMAGE_SIZE=1500`, `VITE_KEEPA_MAIN_IMAGE_ONLY=true`.
3) Asigură-te că nu depășim 1 apel/min (clientul se ocupă, dar evită bucle strânse).
