# RyharDev API

REST API berbasis JSON yang dibangun dengan **Node.js** dan **Express**, dirancang untuk developer yang ingin menambahkan fitur ke aplikasi, website, bot WhatsApp, bot Telegram, atau sistem automation lainnya.

> **Drop a plugin, get a new endpoint.** Cukup letakkan satu file di `plugins/` dan endpoint beserta dokumentasinya otomatis tersedia.

- **Base URL:** https://domain.wajib.my.id
- **Dokumentasi:** https://domain.wajib.my.id/docs (Swagger UI, OpenAPI 3.0)
- **Author:** RyharDev
- **Developer:** rahardiyan.sang.ceo
- **License:** MIT

## Struktur

```
ryhardev-api/
├── index.js          # Entry point (local & Vercel)
├── src/
│   ├── index.js      # Middleware, error handling, startup
│   ├── router.js     # Plugin loader, core endpoints
│   ├── swagger.js    # OpenAPI spec builder & /docs
│   ├── response.js   # JSON response helpers & validators
│   └── config.js     # Metadata & environment config
├── plugins/          # Satu file = satu fitur, dikelompokkan per kategori
│   ├── downloader/   # tag Swagger: downloader
│   │   ├── tiktok.js
│   │   ├── facebook.js
│   │   ├── instagram.js
│   │   └── spotify.js
│   ├── domain/       # tag Swagger: domain
│   │   └── domain.js
│   ├── utility/      # tag Swagger: utility
│   │   └── utility.js
│   ├── whatsapp/     # tag Swagger: whatsapp
│   │   └── whatsapp.js
│   └── _template.js  # Diabaikan loader, sebagai contoh
├── vercel.json
├── package.json
└── .env.example
```

## Instalasi Lokal

Membutuhkan Node.js 18.17 atau lebih baru.

```bash
git clone https://github.com/your-username/ryhardev-api.git
cd ryhardev-api
npm install
cp .env.example .env
npm start
```

Buka http://localhost:3000/docs.

## Deploy ke Vercel

1. Push repository ke GitHub.
2. Import repository di Vercel (Framework Preset: *Other*).
3. Isi Environment Variables sesuai `.env.example` (terutama `INSTAGRAM_APP_TOKEN` jika ingin memakai fitur Instagram).
4. Deploy. Pastikan `https://<domain>/docs` dapat diakses.

`vercel.json` memastikan folder `plugins/` ikut ter-bundle, karena plugin dimuat secara dinamis saat cold start.

## Endpoint Inti

| Method | Path               | Keterangan                          |
|--------|--------------------|-------------------------------------|
| GET    | `/api`             | Index API                           |
| GET    | `/api/status`      | Status layanan                      |
| GET    | `/api/info`        | Informasi aplikasi & author         |
| GET    | `/api/tools`       | Daftar plugin                       |
| GET    | `/api/tools/:name` | Detail plugin dan endpoint-nya      |

## Endpoint Plugin

| Plugin      | Method | Path                 | Keterangan                              |
|-------------|--------|----------------------|-----------------------------------------|
| utility     | POST   | `/api/utility/base64`| Encode / decode Base64                  |
| utility     | POST   | `/api/utility/hash`  | Hash md5 / sha1 / sha256 / sha512       |
| utility     | GET    | `/api/utility/url`   | Parse URL                               |
| utility     | GET    | `/api/utility/timestamp` | Konversi timestamp / tanggal        |
| utility     | GET    | `/api/utility/random`| UUID, angka, atau string acak           |
| utility     | POST   | `/api/utility/json`  | Validasi & format JSON                  |
| utility     | GET    | `/api/utility/ip`    | IP klien                                |
| tiktok      | GET    | `/api/tiktok/info`   | Metadata video TikTok                   |
| instagram   | GET    | `/api/instagram/info`| Metadata post Instagram (butuh token)   |
| whatsapp    | GET/POST | `/api/whatsapp/link` | Membuat link wa.me                    |

## Contoh Penggunaan

```bash
curl "https://domain.wajib.my.id/api/tiktok/info?url=https://www.tiktok.com/@scout2015/video/6718335390845095173"

curl -X POST https://domain.wajib.my.id/api/utility/hash \
  -H "Content-Type: application/json" \
  -d '{"algorithm":"sha256","text":"hello"}'
```

Format response sukses:

```json
{ "status": true, "code": 200, "creator": "RyharDev", "message": "Request successful", "data": {} }
```

Format response gagal:

```json
{ "status": false, "code": 400, "creator": "RyharDev", "message": "Invalid request",
  "error": { "type": "ValidationError", "details": "Parameter \"url\" is required" } }
```

## Membuat Plugin

1. Pilih kategori (folder di `plugins/`, mis. `plugins/downloader/`). Jika kategorinya belum ada, buat foldernya. Salin `plugins/_template.js` menjadi `plugins/<kategori>/nama-fitur.js`. Import dari `../../src/...`.
2. Ubah `name` agar sama dengan nama file (huruf kecil, angka, tanda `-`).
3. Isi `routes`. Setiap route memiliki `method`, `path`, `handler`, dan opsional `summary`, `description`, `parameters`, `requestBody`, `requestExample`, `example`.
4. Restart server. Endpoint akan tersedia di `/api/nama-fitur/...` dan muncul di `/docs`.

Aturan validasi plugin:

- `name`, `description`, `version`, `author`, dan `routes` wajib ada.
- `method` harus salah satu dari `get`, `post`, `put`, `patch`, `delete`.
- `path` harus diawali `/`. Gunakan `:param` untuk parameter path.
- Plugin yang tidak valid akan dilewati dan dicatat di log. API tetap berjalan.
- Nonaktifkan plugin dengan `enabled: false` atau melalui env `DISABLED_PLUGINS`.

Plugin dapat membaca konfigurasi dari environment variable (`process.env`). Gunakan `requireString` dan `requireUrl` dari `src/response.js` untuk validasi input, dan throw `HttpError` untuk error yang aman ditampilkan ke client.

## Keamanan

- Input divalidasi, dan body request dibatasi (`MAX_BODY_SIZE`).
- Endpoint yang mengambil data dari internet hanya memanggil host tetap (mis. oEmbed resmi), sehingga API tidak menjadi open proxy dan terlindung dari SSRF.
- Stack trace dan detail internal tidak pernah dikirim ke client.
- Request dibatasi oleh timeout (`REQUEST_TIMEOUT_MS`).

**Catatan rate limit:** limiter di dalam kode hanya berlaku per instance serverless. Untuk batas global yang ketat di production, gunakan penyimpanan eksternal seperti Redis atau Upstash.

## Batasan

- Koneksi WhatsApp Web permanen (bot session) tidak didukung karena membutuhkan proses jangka panjang. Jalankan bagian tersebut di hosting lain.
- Swagger UI memuat asset dari CDN jsDelivr.

## Lisensi

MIT. Lihat [LICENSE](LICENSE).

## Plugin Hasil Integrasi (Batch 1)

| Plugin     | Endpoint                                   | Keterangan                                 |
|------------|--------------------------------------------|--------------------------------------------|
| tiktok     | `GET /api/tiktok/download?url=&srv=1\|2`   | Link media TikTok tanpa watermark          |
| facebook   | `GET /api/facebook/download?url=&srv=1\|2` | Link video Facebook HD/SD                  |
| spotify    | `POST /api/spotify/track`                  | Buat job unduh track Spotify               |
| spotify    | `GET /api/spotify/track/:jobId`            | Cek status job (processing / ready / failed) |
| instagram  | `GET /api/instagram/download?url=`         | Link media post dan reel Instagram         |
| domain     | `GET /api/domain/check?domain=`            | Indikasi ketersediaan domain (NS lookup)   |

Parameter `srv` memilih server yang dipakai. Jika tidak diisi, default-nya `srv=1`.

Daftar lengkap file yang sudah dan belum di-port, beserta alasannya, ada di [PLUGIN_STATUS.md](PLUGIN_STATUS.md).
