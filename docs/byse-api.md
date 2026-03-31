# Byse API — Referensi Lengkap

**Base URL:** `https://api.byse.sx`

**Autentikasi:** Semua endpoint memerlukan parameter query `key` (API key).

**Format respons sukses:** `{ "msg": "OK", "server_time": "...", "status": 200, "result": ... }`

---

## Daftar Endpoint (28 total, 11 grup)

| Grup | Jumlah |
|------|--------|
| Akun | 2 |
| Upload | 2 |
| Upload Jarak Jauh | 3 |
| File | 4 |
| Folder | 2 |
| Berkas (Audit) | 2 |
| Player | 4 |
| Encoding | 4 |
| Thumbnail | 3 |
| Embed Domain | 1 |
| Bandwidth Premium | 1 |

---

## 1. Akun

### GET `/account/info`
Metadata akun: kuota, status premium.

**Parameter:**
| Nama | Format | Wajib |
|------|--------|-------|
| key | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:30:07",
  "status": 200,
  "result": {
    "email": "myemail@gmail.com",
    "balance": "0.00000",
    "storage_used": "24186265",
    "storage_left": 128824832615,
    "premim_expire": "2015-10-24 21:00:00"
  }
}
```

---

### GET `/account/stats`
Metrik performa: unduhan, keuntungan, referral.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| last | Statistik X hari terakhir (default: 7) | STRING | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:30:07",
  "status": 200,
  "result": [
    {
      "downloads": "0",
      "profit_views": "0.00000",
      "views_adb": "1",
      "sales": "0",
      "profit_sales": "0.00000",
      "profit_refs": "0.00000",
      "profit_site": "0.00000",
      "views": "0",
      "refs": "0",
      "day": "2017-09-12",
      "profit_total": "0.00000",
      "views_prem": "0"
    }
  ]
}
```

---

## 2. Upload

### GET `/upload/server`
Dapatkan endpoint upload optimal untuk akun saat ini.

**Parameter:**
| Nama | Format | Wajib |
|------|--------|-------|
| key | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-11 04:29:54",
  "status": 200,
  "result": "https://s1.myvideo.com/upload/01"
}
```

> `result` adalah URL string langsung (bukan objek).

---

### POST `<url dari /upload/server>`
Upload file video ke server upload yang didapat di atas.

**Parameter (multipart/form-data):**
| Nama | Format | Wajib |
|------|--------|-------|
| key | STRING | Ya |
| file | FILE | Ya |

**Response:**
```json
{
  "msg": "OK",
  "status": 200,
  "files": [
    {
      "filecode": "tnklyibwwpsh",
      "filename": "qwbs4m4ze4j4.mp4",
      "status": "OK"
    }
  ]
}
```

> Field di dalam `files[]`: `filecode`, `filename`, `status`.

---

## 3. Upload Jarak Jauh

### GET `/remote/add`
Tambahkan URL video ke antrian remote upload.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| url | URL video sumber | STRING | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:29:54",
  "status": 200,
  "result": {
    "filecode": "jthi5jdsu8t9"
  }
}
```

---

### GET `/remote/remove`
Batalkan remote upload yang sedang antri.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| file_code | Kode file yang ingin dibatalkan | STRING | Ya |

**Response:**
```json
{
  "msg": "File succesfully removed from remote upload queue",
  "server_time": "2017-08-11 04:29:54",
  "status": 200
}
```

---

### GET `/remote/status`
Cek progress dan status remote upload.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| file_code | Kode file yang dikembalikan saat job dibuat | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:29:54",
  "status": 200,
  "result": {
    "url": "https://exampleurl.com/file.mp4",
    "progress": "55%",
    "status": "WORKING",
    "created": "10:00:00 09-06-2022",
    "updated": "10:01:00 09-06-2022",
    "error_msg": ""
  }
}
```

> Nilai `status` yang mungkin: `WORKING`, `PENDING`, `OK`/`DONE`/`TRANSFERRED`/`FINISHED`, `ERROR`/`FAILED`.

---

## 4. File

### GET `/file/info`
Metadata detail untuk satu atau lebih file.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| file_code | Satu kode atau beberapa dipisah koma | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": [
    {
      "status": 200,
      "file_code": "gi4o0tlro01u",
      "name": "4K Time Lapse in the EOS 6D Mark II",
      "canplay": 1,
      "views_started": "1",
      "views": "0",
      "length": "20",
      "uploaded": "2017-08-10 05:07:17"
    },
    {
      "status": 404,
      "file_code": "gi4o0tlro012"
    }
  ]
}
```

> Field ID di sini adalah `file_code` (bukan `filecode`). `canplay: 1` = siap diputar.

---

### GET `/file/list`
Daftar file dengan filter opsional.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| fld_id | ID folder (default: 0 = root) | INT | Opsional |
| title | Filter judul | STRING | Opsional |
| created | Hanya file setelah timestamp ini | STRING | Opsional |
| public | File publik (1) atau privat (0) | INT | Opsional |
| per_page | Jumlah hasil per halaman | INT | Opsional |
| page | Nomor halaman | INT | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": [
    {
      "status": 200,
      "filecode": "gi4o0tlro01u",
      "name": "4K Time Lapse in the EOS 6D Mark II",
      "canplay": 1,
      "views_started": "1",
      "views": "0",
      "length": "20",
      "uploaded": "2017-08-10 05:07:17"
    }
  ]
}
```

> ⚠️ `result` adalah **array langsung** (tidak ada wrapper pagination). Field ID di sini adalah `filecode` (bukan `file_code`). Respons ini berbeda dengan `/file/info`.

---

### GET `/file/clone`
Duplikasikan file ke akun saat ini.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| file_code | Kode file yang ingin dikloning | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": {
    "file_code": "gtl2mhgw4is7",
    "url": "https://api.byse.sx/d/gtl2mhgw4is7"
  }
}
```

---

### GET `/file/clone` *(dengan `fld_id` — berfungsi sebagai Set Folder / Move)*
Pindahkan file ke folder yang ditentukan.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| file_code | Kode file yang ingin dipindah | STRING | Ya |
| fld_id | ID folder tujuan | INT | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": {
    "file_code": "j4jgihng0zou"
  }
}
```

> ⚠️ Saat `fld_id` dikirim, endpoint ini **memindahkan** file. Berdasarkan live logs, API **nyata** mengembalikan `result.file_code` dengan filecode baru. Selalu gunakan filecode baru dari `result.file_code` untuk link embed dan history. Jika `result` tidak ada, gunakan filecode asal.

---

## 5. Folder

### GET `/folder/list`
Daftar folder dan (opsional) file di dalam folder induk.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| fld_id | ID folder induk (default: 0 = root) | INT | Opsional |
| files | Set `1` untuk sertakan file | INT | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-15 19:54:22",
  "status": 200,
  "result": {
    "folders": [
      {
        "name": "Breaking Bad",
        "fld_id": "16",
        "code": "4pwb4yvp7v"
      },
      {
        "name": "Travis",
        "fld_id": "15",
        "code": "68dth39m76"
      }
    ],
    "files": [
      {
        "thumbnail": "http://img.xvs.tt/04nolnuszhph_t.jpg",
        "link": "http://xvs.tt/04nolnuszhph.html",
        "file_code": "04nolnuszhph",
        "canplay": 1,
        "length": "1560",
        "views": "10",
        "uploaded": "2021-08-20 20:37:22",
        "public": "0",
        "fld_id": "0",
        "title": "Tri pljus dva 2012 SATRip"
      }
    ]
  }
}
```

> Field ID folder adalah `fld_id` (string, bukan integer). `result.folders` dan `result.files` adalah array terpisah.

---

### GET `/folder/create`
Buat folder baru.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| name | Nama folder | STRING | Ya |
| parent_id | ID folder induk (0 = root) | INT | Opsional |
| description | Deskripsi folder | STRING | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-18 20:32:46",
  "status": 200,
  "result": {
    "fld_id": "29"
  }
}
```

> `result.fld_id` adalah string.

---

## 6. Berkas (Audit)

### GET `/files/deleted`
File yang baru-baru ini dihapus.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| last | Batas jumlah file | INT | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-15 19:04:06",
  "status": 200,
  "result": [
    {
      "file_code": "38j4wvxw164d",
      "deleted_by": "me",
      "deleted_ago_sec": "40",
      "deleted": "2021-08-15 19:03:26",
      "title": "Video 109779195"
    }
  ]
}
```

---

### GET `/files/dmca`
File dalam antrian penghapusan DMCA.

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| last | Batas jumlah laporan | INT | Opsional |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-15 19:31:48",
  "status": 200,
  "result": [
    {
      "file_code": "x2q5h0uhfzdu",
      "del_in_sec": "42097",
      "del_time": "2021-08-16 07:13:25"
    }
  ]
}
```

---

## 7. Player (Embed)

Semua endpoint player menggunakan URL embed, bukan API base URL.

### Subtitle Jarak Jauh
```
GET https://api.byse.sx/e/{file_code}?c1_file=https://example.com/file.vtt&c1_label=English
```
Gunakan `c1_file`/`c1_label`, `c2_file`/`c2_label`, dst. untuk multiple subtitle.

---

### Subtitle via JSON Manifest
```
GET https://api.byse.sx/e/{file_code}?sub.info=http://yoursubtitle.com/def.json
```
Format JSON:
```json
[
  { "src": "http://yoursubtitle.com/file.vtt", "label": "Language1", "default": true },
  { "src": "http://yoursubtitle.com/file2.vtt", "label": "Language2" }
]
```

---

### Poster Kustom
```
GET https://api.byse.sx/e/{file_code}?poster=http://yoursite.com/link/to.png
```

---

### Logo Kustom
```
GET https://api.byse.sx/e/{file_code}?logo=http://yoursite.com/link/to.png
```

---

## 8. Encoding

### GET `/encoding/list`
Semua tugas encoding beserta progress dan status.

**Parameter:** `key`

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-12-08 10:53:45",
  "status": 200,
  "result": [
    {
      "quality": "X",
      "name": "This file title",
      "progress": 0,
      "status": "ERROR",
      "error": "File download failed:500",
      "file_code": "xx1234cccs"
    },
    {
      "file_code": "xx1234cccs",
      "quality": "H",
      "name": "This file title2",
      "progress": "91",
      "status": "ENCODING"
    }
  ]
}
```

---

### GET `/encoding/status`
Progress encoding untuk satu file.

**Parameter:**
| Nama | Format | Wajib |
|------|--------|-------|
| key | STRING | Ya |
| file_code | STRING | Ya |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-12-08 10:53:45",
  "status": 200,
  "result": {
    "file_code": "xx1234cccs",
    "quality": "H",
    "name": "This file title2",
    "progress": "91",
    "status": "ENCODING"
  }
}
```

---

### GET `/encoding/restart`
Restart encoding file yang statusnya ERROR.

**Parameter:** `key`, `file_code`

**Response:** `{ "msg": "Encoding for file code: xxx was restarted", "status": 200 }`

---

### GET `/encoding/delete`
Hapus upaya encoding yang gagal.

**Parameter:** `key`, `file_code`

**Response:** `{ "msg": "Failed encoding for file code: xxx was deleted.", "status": 200 }`

---

## 9. Thumbnail

### GET `/images/thumb`
URL thumbnail untuk file.

**Parameter:** `key`, `file_code` (opsional)

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:29:54",
  "status": 200,
  "result": {
    "thumbnail": "https://img-place.com/as1xc34vv12x.png"
  }
}
```

---

### GET `/images/splash`
URL gambar splash (opening) untuk file.

**Parameter:** `key`, `file_code` (opsional)

---

### GET `/images/preview`
URL sprite preview dan trek VTT.

**Parameter:** `key`, `file_code` (opsional)

---

## 10. Embed Domain

### GET `/get/domain`
Domain embed yang sedang digunakan platform.

**Parameter:** `key`

**Response:**
```json
{
  "embed_domain": "bysesayeveum.com",
  "old_domain": "filemoon.sx",
  "new_domain": "blablabla_embed_domain.com",
  "status": 200,
  "server_time": "2024-12-03 08:32:03"
}
```

> ⚠️ API **nyata** mengembalikan `embed_domain` (dikonfirmasi dari live logs). Gunakan prioritas: `embed_domain` → `new_domain` → `old_domain`.

---

## 11. Bandwidth Premium

### GET `/hls/link`
Generate URL pemutaran HLS dengan batasan waktu (premium).

**Parameter:**
| Nama | Keterangan | Format | Wajib |
|------|-----------|--------|-------|
| key | API key | STRING | Ya |
| ip | Alamat IPv4 penonton | STRING | Ya |
| ua | User-agent penonton (URL-encoded) | STRING | Ya |

**Response:**
```json
{
  "server_time": "2025-02-20 06:57:03",
  "result": "https://premium.api.byse.sx/hls2/01/08264/2231iyrBNMfj_h/master.m3u8?t=...",
  "status": 200,
  "msg": "OK"
}
```

---

## Catatan Penting untuk Bot

| Hal | Detail |
|-----|--------|
| Field ID file di `/file/info` | `file_code` |
| Field ID file di `/file/list` | `filecode` (berbeda!) |
| Field ID folder di `/folder/list` | `fld_id` (string) |
| Field ID folder di `/folder/create` | `fld_id` (string) |
| `/file/clone` + `fld_id` | **Move file** — API nyata mengembalikan `result.file_code` baru (dikonfirmasi live) |
| `/file/clone` tanpa `fld_id` | **Clone file** — respons punya `result.file_code` baru |
| `/get/domain` | API nyata mengembalikan `embed_domain` (prioritas utama), lalu `new_domain`, lalu `old_domain` |
| `/file/list` | `result` langsung array, tidak ada wrapper pagination |
| `/upload/server` | `result` langsung string URL, bukan objek |
