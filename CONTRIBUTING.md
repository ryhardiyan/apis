# Contributing to RyharDev API

Terima kasih sudah ingin berkontribusi!

1. Fork repository dan buat branch baru (`feat/nama-fitur`).
2. Tambahkan fitur sebagai satu file di `plugins/` (lihat panduan plugin di README).
3. Pastikan `npm start` berjalan dan endpoint baru muncul di `/docs`.
4. Jangan menambah dependency baru tanpa alasan kuat. Jaga ukuran bundle tetap kecil.
5. Jangan menggunakan TypeScript. Semua kode harus JavaScript (ES Modules).
6. Jangan mengembalikan stack trace, token, atau informasi internal server di response.
7. Buat Pull Request dengan deskripsi singkat tentang perubahan.
