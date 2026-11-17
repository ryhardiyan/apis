# Status Integrasi Plugin

Dari 69 file di `plugins.zip`, berikut statusnya. Plugin yang sudah jalan ada di folder `plugins/`.

## 1. Sudah di-port (dengan varian `srv`)

| Plugin file (RyharDev)  | Sumber asli                                   | Endpoint                                   |
|-------------------------|-----------------------------------------------|--------------------------------------------|
| `tiktok.js`             | `tiktok-js.js` (srv=1), `www.tiktok.com.js` (srv=2) | `GET /api/tiktok/download?url&srv=1\|2`, `GET /api/tiktok/info` |
| `facebook.js`           | `facebook-native-downloader.js` (srv=1), `fbdl.js` (srv=2) | `GET /api/facebook/download?url&srv=1\|2` |
| `spotify.js`            | `downloader-spotify.js`                       | `POST /api/spotify/track`, `GET /api/spotify/track/:jobId` |
| `instagram.js`          | `instasave.js` (media saja)                   | `GET /api/instagram/download?url`, `GET /api/instagram/info` |
| `domain.js`             | `whois.js` (dibuat ulang tanpa menulis file)  | `GET /api/domain/check?domain`             |

Catatan:
- `spotify` memakai sistem job: klien membuat job lalu melakukan polling. Ini sengaja, karena polling 60 detik di dalam satu request tidak cocok dengan batas waktu Vercel.
- `instagram/download` hanya mendukung post dan reel. Fitur story dan foto profil dari `instasave.js` belum diport karena mengarah ke profil orang.
- `domain/check` hanya indikasi berdasarkan NS lookup, bukan pengecekan registrar resmi.
- Varian yang di-port sudah dibersihkan dari kode CLI, pemanggilan `console.log` di top-level, dan penulisan file ke disk.

## 2. Belum di-port (kandidat batch berikutnya)

Ini belum diport karena butuh pembacaan dan pengujian tambahan. Kebanyakan sudah bisa dikerjakan dengan pola yang sama.

- YouTube: `ytmobi.js`, `m.youtube.com.js`, `music.youtube.com.js`, `ytshortdown-downloader.js`, `multidl.js`, `YT Music ( Search, Home, Detail..).js`
- Spotify (metadata dan varian lain): `open.spotify.com.js`, `spotidown.js`, `scrape-spotifytrack.js`
- TikTok varian lain: `tiktokdl.js`, `douyindl.js`, `tiktok.mjs` (perlu solver challenge)
- Instagram varian lain: `instagram-js.js`, `instagram.mjs`
- Facebook varian lain: `fdownloader.js` (CLI, memakai `vm`)
- Lain-lain: `scrape-githubdl.js`, `scrape-mediafiredl.js`, `scrape-omdown.js`, `omdown.js`, `pakeaja.online.js`, `whitehouse.gov.js`, `THREADS.js`, `Cari Link Preset Di Video Tiktok.js` (`amfinder.js`), `translateimage.js`, `gtranslate.mjs`, `scrape-unblurimg.js`, `scrape-wink.js`, `shazam.mjs` (butuh dependency native), `jarak.js` (tujuan belum jelas)

## 3. Tidak di-port, dengan alasan

Abuse dan gangguan terhadap orang lain:
- `spamotpwa.js`, `spamotpwa1.js`: mengirim OTP spam ke nomor WhatsApp target, dengan IP acak dan spoofing user-agent.
- `telegram-mass-report.js`: mass report untuk membuat akun atau channel orang lain diblokir.
- `Check Username WhatsApp.js`: mengecek nomor telepon satu per satu lewat bot WhatsApp.
- `scrape-ttstalk.js` ("stalk akun mantan"), `Stalker Tiktok.js`, `Stalker akun Instagram (akun Public Only).js`, `igwatcher.js`: pelacakan profil orang tertentu. Jika nanti ingin dibuka lagi, perlu dibatasi ke data publik tanpa framing pelacakan.
- `stalkml.js`: validasi ID game yang bergantung pada gateway pembayaran pihak ketiga dan mengekspos data pemain.

Melanggar hak cipta, DRM, atau kebijakan platform:
- `genius-js.js` (lirik lagu), `viu.js`, `scrape_viu.js` (layanan streaming berbayar), `freedrama.js`, `pinedrama.js` (unduh drama, juga memakai API key hardcoded).
- `kahoot-answers-scraper.js`, `quizizz-questions-scraper.js`: mengambil jawaban kuis langsung. Ini membantu kecurangan.

Bergantung pada sesi atau API privat yang tidak stabil:
- `chatgpt.js`, `chathpt.mjs`, `gemini.js`, `gemini-js.js`, `gemini-ask.mjs`, `gemini-image.mjs`: memakai cookie sesi dan endpoint tidak resmi.
- `gogogo.mjs`: API privat aplikasi pembayaran flip.id.
- `pinterest.mjs`: memakai client secret yang tertanam di kode.

Tidak cocok dengan serverless atau butuh sistem file:
- `mega-uploader.js`: menulis file lokal dan upload ke Mega.
- `ytmusic.mjs`: menjalankan `yt-dlp` lewat `spawn` dan membaca file cookie lokal.
- `freeconvert-video-to-mp3.js`: mengambil URL sembarang dari user, berisiko SSRF. Bisa dipertimbangkan lagi dengan allowlist host.
- `fastdl.js`, `sssig.js`: memakai `vm` untuk menjalankan kode dari server pihak ketiga.
- `index.js`: bot WhatsApp Baileys yang butuh koneksi permanen.
- `hdid_v2`: bukan kode, isinya blob base64.
- `scrape-githubstalk.js`: profil pengguna GitHub. Diperlakukan sama dengan kelompok stalker.

## Catatan keamanan untuk kontributor

- Jangan menaruh API key, cookie, atau client secret di dalam kode. Pindahkan ke environment variable.
- Setiap URL dari user harus lewat `requireUrl()` dengan allowlist host. Jangan fetch URL mentah.
- Jika file asli memakai header kredit (mis. "Hapus credit gak bikin u jago"), pertahankan atribusi di metadata plugin (`author`) dan di komentar file.
