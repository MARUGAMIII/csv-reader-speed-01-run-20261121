# Build notes — csv-reader-speed-01-run-20261121

Kata-kata user (verbatim): "setiap ada bounty baru kerjakan dan usahakan top 10".

## Entri
- `solve.js` — parser CSV cepat, ditulis sendiri dari spesifikasi csv-reader 1.0.0
  (RULES.txt). ES module tanpa dependensi, export `run(input)`.
- `main.ts` — driver harness (salinan driver baseline): baca `/input/cases.json`,
  jawab tiap case dengan `run`, tulis `/output/answers.json`, V8 incremental
  marking dimatikan seperti baseline.
- `LICENSE` — MIT.
- Total repo: 13.067 byte (batas 1 MiB).

## Cara kerja solve.js
- Satu pass kiri-ke-kanan, nilai field berupa slice (bukan dirangkai per karakter).
- Field tak ber-quote: `indexOf(',')` + cursor line-break; field ber-quote:
  satu `indexOf('"')` untuk kurung tutup.
- Dua cursor malas (`nextCR`, `nextLF`) — posisi CR/LF berikutnya — sehingga
  cek stray-CR dan line-break di dalam quote jadi perbandingan integer,
  bukan scan baru per field; cursor resync hanya saat sudah terlewati.
- Slow path (semantik referensi persis, hanya saat input memang butuh):
  stray CR, CRLF/CR di dalam quote jadi LF, `""` ganda, junk setelah quote
  tutup (`quote_junk`), quote tak tertutup (literal + baca ulang unquoted),
  baris hanya berisi CR liar (bukan record), `short_row`/`long_row`,
  BOM U+FEFF, penomoran line/row error.
- TIDAK menyalin kode baseline atau library publik (papaparse/d3-dsv/
  csv-parser); parser ditulis sendiri dari spesifikasi.

## Verifikasi
- `grade-local --driver process` (kit resmi): **passed 1, cases_passed 6/6**,
  L1 regrade reproduced byte for byte. result_sha256
  cf6735e5aa0fee0cf9a0dbb2ebb88ec551396469b6fae4f8b0ae4299bbe6a977
  (docker tidak tersedia di mesin ini, jadi dipakai process driver).
- Dua eksekusi main.ts: output byte-identik (deterministik).
- Differential fuzzing vs referensi csv-reader 1.0.0: 88.000 kasus acak
  (soup + record terstruktur + edge case eksplisit) — 0 mismatch.
  Fuzzer terbukti bisa menangkap perbedaan (varian yang sengaja salah
  ketahuan 5 mismatch).
- 3 instance segar dari generator kit (seed berbeda): 6/6 identik semua.

## Kecepatan (CPU time, proses fresh, practice set 6 case ~10,6 MB)
- Baseline csv-reader 1.0.0: run ~1.120 ms (cold), total proses ~1.990 ms.
- Entri ini: run ~213–267 ms (cold), total proses ~680 ms.
- Per-case cold: 24–61 ms vs baseline 134–242 ms.
- Instance segar: 3,1× / 6,3× / 5,4× lebih cepat dari baseline.
- Bonus: nilai berupa slice (bukan rope hasil concat per karakter) membuat
  JSON.stringify jawaban jauh lebih murah (118 ms vs 720 ms baseline).

## Bukan urusan builder
- TIDAK push ke mana pun, TIDAK buat repo GitHub, TIDAK submit/bundle —
  itu urusan parent agent.
