/* Mode lokal Balik.in
   Dipakai saat halaman dibuka di luar Claude (misalnya Live Server di VS Code).
   Meniru database dan identitas pengguna, dengan data disimpan di localStorage peramban.
   Tambahkan ?admin di alamat untuk masuk sebagai admin, atau ?siswa untuk siswa. */
(function () {
  "use strict";
  if (window.claude && window.claude.use) return;

  var KEY = "balikin-localdb";
  var role = new URLSearchParams(location.search).has("admin")
    ? "admin"
    : "siswa";
  var myId = "u_local_" + role;
  var listeners = [];

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function newId() {
    return (
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-4)
    );
  }
  function notify() {
    listeners.slice().forEach(function (f) {
      try {
        f();
      } catch (e) {}
    });
  }
  function write(d) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) {
      return Promise.reject({
        code: "quota_exceeded",
        message: "Penyimpanan peramban penuh.",
      });
    }
    notify();
    return Promise.resolve();
  }
  function listen(f) {
    listeners.push(f);
    setTimeout(f, 0);
    return function () {
      var i = listeners.indexOf(f);
      if (i > -1) listeners.splice(i, 1);
    };
  }
  function snap(id, data) {
    return {
      id: id,
      exists: data !== undefined,
      data: function () {
        return data === undefined ? undefined : clone(data);
      },
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  }

  function doc(path) {
    var id = path.split("/").pop();
    return {
      id: id,
      path: path,
      get: function () {
        return Promise.resolve(snap(id, load()[path]));
      },
      set: function (v) {
        var d = load();
        d[path] = clone(v);
        return write(d);
      },
      update: function (v) {
        var d = load();
        if (!d[path])
          return Promise.reject({
            code: "invalid_argument",
            message: "Dokumen belum ada.",
          });
        Object.keys(v).forEach(function (k) {
          d[path][k] = clone({ x: v[k] }).x;
        });
        return write(d);
      },
      delete: function () {
        var d = load();
        delete d[path];
        return write(d);
      },
      onSnapshot: function (next) {
        return listen(function () {
          next(snap(id, load()[path]));
        });
      },
      collection: function (p) {
        return collection(path + "/" + p);
      },
    };
  }

  function collection(path) {
    function docs() {
      var d = load(),
        pre = path + "/",
        out = [];
      Object.keys(d).forEach(function (k) {
        if (k.indexOf(pre) === 0 && k.slice(pre.length).indexOf("/") === -1)
          out.push(snap(k.slice(pre.length), d[k]));
      });
      out.sort(function (a, b) {
        return a.id < b.id ? -1 : 1;
      });
      return out;
    }
    function qs() {
      var ds = docs();
      return { docs: ds, size: ds.length, empty: ds.length === 0 };
    }
    return {
      path: path,
      doc: function (id) {
        return doc(path + "/" + (id || newId()));
      },
      add: function (data) {
        var r = doc(path + "/" + newId());
        return r.set(data).then(function () {
          return r;
        });
      },
      get: function () {
        return Promise.resolve(qs());
      },
      onSnapshot: function (next) {
        return listen(function () {
          next(qs());
        });
      },
    };
  }

  var db = { doc: doc, collection: collection };
  var user = {
    id: function () {
      return Promise.resolve(myId);
    },
    isOwner: function () {
      return Promise.resolve(role === "admin");
    },
    canEdit: function () {
      return Promise.resolve(role === "admin");
    },
    can: function () {
      return Promise.resolve(true);
    },
  };

  window.claude = {
    use: function (name) {
      return Promise.resolve(
        name === "db" ? db : name === "user" ? user : null,
      );
    },
  };

  window.addEventListener("storage", function (e) {
    if (e.key === KEY) notify();
  });

  /* Penanda kecil untuk berganti peran dan menghapus data uji */
  var st = document.createElement("style");
  st.textContent =
    "#localpill{position:relative;margin:24px auto 110px;width:max-content;z-index:5;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px);padding:8px 14px;border-radius:999px;background:#16302A;color:#F3FBF8;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18)}" +
    "#localpill button{background:none;border:0;padding:0;color:#7EE8D8;font:inherit;cursor:pointer;text-decoration:underline}" +
    "@media(min-width:900px){#localpill{margin-bottom:28px}}";
  document.head.appendChild(st);

  var pill = document.createElement("div");
  pill.id = "localpill";
  pill.innerHTML =
    "<span>Mode lokal · " +
    (role === "admin" ? "Admin" : "Siswa") +
    "</span>" +
    '<button type="button" id="lp-switch">Ganti ke ' +
    (role === "admin" ? "Siswa" : "Admin") +
    "</button>" +
    '<button type="button" id="lp-reset">Hapus data</button>';
  document.body.appendChild(pill);
  document.getElementById("lp-switch").onclick = function () {
    location.href =
      location.pathname +
      (role === "admin" ? "?siswa" : "?admin") +
      location.hash;
  };
  document.getElementById("lp-reset").onclick = function () {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("balikin-sess");
    } catch (e) {}
    location.reload();
  };
})();

(function () {
  "use strict";
  var H = 3600e3,
    D = 24 * H,
    SESS = "balikin-sess";
  var CATS = [
    "Tas",
    "Elektronik",
    "Dokumen",
    "Pakaian",
    "Botol & wadah",
    "Kunci",
    "Lainnya",
  ];
  var MAIN_CATS = ["Tas", "Elektronik", "Dokumen"];
  var COLORS = [
    "biru",
    "hitam",
    "merah",
    "putih",
    "hijau",
    "kuning",
    "abu",
    "coklat",
    "cokelat",
    "ungu",
    "pink",
    "oranye",
  ];
  var STEPS = {
    "Pemilik barang": [
      "Buka Balik.in dari ponsel",
      "Cari atau filter daftar barang",
      "Ketemu: tekan Ini Barang Saya",
      "Jawab pertanyaan verifikasi",
      "Ambil barang di pos setelah disetujui",
    ],
    Penemu: [
      "Menemukan barang milik orang lain",
      "Lapor Penemuan: foto dan lokasi",
      "Titipkan ke pos satpam",
      "Sistem menyarankan kecocokan",
      "Barang diserahkan ke pemilik",
    ],
    Admin: [
      "Menerima laporan masuk",
      "Memeriksa kecocokan",
      "Memverifikasi klaim",
      "Menyerahkan barang",
      "Mengubah status Dikembalikan",
    ],
  };

  var $ = function (s) {
    return document.querySelector(s);
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  var two = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  var lc = function (s) {
    return String(s || "").toLowerCase();
  };

  var db = null,
    user = null,
    uid = null,
    isAdmin = false,
    canWrite = null,
    acct = null;
  var phase = "loading",
    tab = "daftar",
    resetMode = false,
    authMsg = "";
  var items = [],
    itemsLoaded = false,
    dismissed = [],
    unsub = null;
  var claimInfo = {},
    secretInfo = {},
    fetching = {},
    openClaims = {},
    confirmDel = "";
  var photo = null,
    dirty = false,
    prevHash = "#beranda";
  var ui = { q: "", filter: "Semua" };

  function rel(ts) {
    var d = Date.now() - ts;
    if (d < H) return Math.max(1, Math.round(d / 6e4)) + " menit lalu";
    if (d < D) return Math.floor(d / H) + " jam lalu";
    if (d < 2 * D) return "kemarin";
    return Math.floor(d / D) + " hari lalu";
  }
  function fullDate(ts) {
    try {
      return new Date(ts)
        .toLocaleString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
        .replace(" pukul", ",");
    } catch (e) {
      return new Date(ts).toString();
    }
  }
  function shortDate(ts) {
    try {
      return new Date(ts).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }
  function getItem(id) {
    for (var i = 0; i < items.length; i++)
      if (items[i].id === id) return items[i];
    return null;
  }
  function firstName() {
    return acct && acct.name ? String(acct.name).split(" ")[0] : "";
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      t.hidden = true;
    }, 3600);
  }
  function errMsg(e) {
    var c = e && e.code;
    if (c === "invalid_argument")
      return "Akunmu belum boleh menyimpan data. Minta pemilik halaman memberi akses Contributor.";
    if (c === "quota_exceeded")
      return "Penyimpanan penuh. Hubungi admin sekolah.";
    if (c === "resource_exhausted")
      return "Terlalu cepat. Tunggu sebentar lalu coba lagi.";
    return "Belum berhasil menyimpan. Periksa koneksi lalu coba lagi.";
  }

  /* ---------- kata sandi ---------- */
  function rndHex(n) {
    var a = new Uint8Array(n);
    try {
      crypto.getRandomValues(a);
    } catch (e) {
      for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    }
    return Array.prototype.map
      .call(a, function (b) {
        return (b < 16 ? "0" : "") + b.toString(16);
      })
      .join("");
  }
  function hashPw(pw, salt) {
    try {
      var enc = new TextEncoder();
      return crypto.subtle
        .importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"])
        .then(function (k) {
          return crypto.subtle.deriveBits(
            {
              name: "PBKDF2",
              salt: enc.encode(salt),
              iterations: 100000,
              hash: "SHA-256",
            },
            k,
            256,
          );
        })
        .then(function (b) {
          return Array.prototype.map
            .call(new Uint8Array(b), function (x) {
              return (x < 16 ? "0" : "") + x.toString(16);
            })
            .join("");
        });
    } catch (e) {
      var h = 5381,
        s = salt + pw;
      for (var i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return Promise.resolve("f" + h);
    }
  }

  /* ---------- pencocokan ---------- */
  function words(s) {
    return String(s)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(function (w) {
        return w.length > 2;
      });
  }
  function near(a, b) {
    a = lc(a).trim();
    b = lc(b).trim();
    if (!a || !b) return false;
    if (a === b || a.indexOf(b) > -1 || b.indexOf(a) > -1) return true;
    var wb = words(b);
    return words(a).some(function (w) {
      return wb.indexOf(w) > -1;
    });
  }
  function compare(lost, found) {
    var checks = [],
      sameCat = lost.cat && lost.cat === found.cat;
    var fw = words(found.name),
      shared = words(lost.name).filter(function (w) {
        return fw.indexOf(w) > -1;
      });
    if (!sameCat && !shared.length) return [];
    if (
      sameCat &&
      shared.some(function (w) {
        return COLORS.indexOf(w) > -1;
      })
    )
      checks.push("Kategori dan warna sama");
    else if (sameCat) checks.push("Kategori sama");
    if (shared.length && (!sameCat || checks.length === 0))
      checks.push("Nama barang mirip");
    if (near(lost.loc, found.loc)) checks.push("Lokasi berdekatan");
    if (Math.abs(lost.ts - found.ts) < 3 * D)
      checks.push("Waktu laporan berdekatan");
    return checks.length >= 2 ? checks : [];
  }
  function matches() {
    var out = [];
    items.forEach(function (L) {
      if (L.type !== "lost" || L.ownerId !== uid || L.status !== "Hilang")
        return;
      items.forEach(function (F) {
        if (F.type !== "found" || F.status !== "Ditemukan") return;
        var c = compare(L, F),
          k = L.id + "_" + F.id;
        if (c.length && dismissed.indexOf(k) === -1)
          out.push({ k: k, L: L, F: F, checks: c });
      });
    });
    return out;
  }
  function myHistory() {
    var h = [];
    items.forEach(function (it) {
      if (it.claimBy === uid) {
        if (it.status === "Diklaim")
          h.push({
            t: "Klaim " + lc(it.name) + " sedang diperiksa admin.",
            ts: it.claimTs || it.ts,
          });
        else if (it.status === "Dikembalikan")
          h.push({
            t:
              "Klaim " +
              lc(it.name) +
              " disetujui. Ambil barang di " +
              lc(it.at || "pos satpam") +
              ".",
            ts: it.returnedAt || it.claimTs || it.ts,
          });
      }
      (it.rejected || []).forEach(function (r) {
        if (r && r.by === uid)
          h.push({
            t:
              "Klaim " +
              lc(it.name) +
              " ditolak admin. Tanyakan ke guru piket jika ada pertanyaan.",
            ts: r.ts,
          });
      });
    });
    return h.sort(function (a, b) {
      return b.ts - a.ts;
    });
  }

  /* ---------- tampilan umum ---------- */
  function badge(s) {
    return '<span class="badge b-' + esc(s) + '">' + esc(s) + "</span>";
  }
  function thumb(it) {
    return (
      '<div class="thumb" aria-hidden="true">' +
      (it.photo ? '<img src="' + esc(it.photo) + '" alt="">' : "") +
      "</div>"
    );
  }
  function itemCard(it) {
    return (
      '<a class="card item" href="#barang-' +
      esc(it.id) +
      '">' +
      thumb(it) +
      '<div class="body"><h3>' +
      esc(it.name) +
      '</h3><span class="meta">' +
      esc(it.loc) +
      " · " +
      rel(it.ts) +
      "</span>" +
      badge(it.status) +
      "</div></a>"
    );
  }
  function filtered() {
    var q = ui.q.trim().toLowerCase();
    return items
      .filter(function (it) {
        if (ui.filter !== "Semua") {
          if (ui.filter === "Lainnya") {
            if (MAIN_CATS.indexOf(it.cat) > -1) return false;
          } else if (it.cat !== ui.filter) return false;
        }
        if (
          q &&
          (it.name + " " + it.loc + " " + it.cat).toLowerCase().indexOf(q) ===
            -1
        )
          return false;
        return true;
      })
      .sort(function (a, b) {
        return b.ts - a.ts;
      });
  }
  function listHTML() {
    if (!itemsLoaded) return '<div class="card empty">Memuat laporan…</div>';
    if (!items.length)
      return '<div class="card empty"><b>Belum ada laporan</b>Jadilah yang pertama: tekan Saya Kehilangan atau Saya Menemukan.</div>';
    var l = filtered();
    return l.length
      ? l.map(itemCard).join("")
      : '<div class="card empty"><b>Tidak ada yang cocok</b>Coba kata kunci atau kategori lain.</div>';
  }
  function chipsHTML() {
    return ["Semua", "Tas", "Elektronik", "Dokumen", "Lainnya"]
      .map(function (c) {
        return (
          '<button type="button" class="chip" data-chip="' +
          c +
          '" aria-pressed="' +
          (ui.filter === c) +
          '">' +
          c +
          "</button>"
        );
      })
      .join("");
  }

  function home() {
    return (
      '<p class="hi">Halo, ' +
      esc(firstName()) +
      '</p><h1 class="display">Barang hilang? Cari di sini.</h1>' +
      '<div class="tools"><div><label class="sr" for="q">Cari barang</label><input class="field" id="q" type="search" placeholder="Cari botol, jaket, kunci" value="' +
      esc(ui.q) +
      '" autocomplete="off"></div>' +
      '<div class="cta"><a class="btn ghost" href="#lapor-hilang">Saya Kehilangan</a><a class="btn solid" href="#lapor-temuan">Saya Menemukan</a></div></div>' +
      '<div class="chips" id="chips">' +
      chipsHTML() +
      "</div>" +
      '<h2>Laporan terbaru</h2><div class="list" id="list">' +
      listHTML() +
      "</div>"
    );
  }

  function dz(label) {
    return (
      '<label class="dz" id="dz" for="photo"><span>' +
      label +
      '</span><input class="sr" type="file" id="photo" accept="image/*"></label>'
    );
  }
  function fg(label, id, ph, type) {
    return (
      '<div class="fgroup"><label for="' +
      id +
      '">' +
      label +
      '</label><input class="field" id="' +
      id +
      '" type="' +
      (type || "text") +
      '" placeholder="' +
      esc(ph) +
      '" autocomplete="off"></div>'
    );
  }
  function catSel() {
    return (
      '<div class="fgroup"><label for="cat">Kategori</label><select class="field" id="cat"><option value="">Pilih kategori</option>' +
      CATS.map(function (c) {
        return "<option>" + esc(c) + "</option>";
      }).join("") +
      "</select></div>"
    );
  }
  function backBtn() {
    return '<button type="button" class="back" data-act="back"><span aria-hidden="true">←</span> Kembali</button>';
  }
  function writeBanner() {
    return canWrite === false
      ? '<div class="banner">Akun Claude kamu hanya bisa melihat. Minta pemilik halaman memberi akses Contributor agar bisa membuat laporan.</div>'
      : "";
  }

  function formFound() {
    photo = null;
    return (
      '<div class="sheet">' +
      backBtn() +
      '<h1 class="page">Lapor Penemuan</h1>' +
      writeBanner() +
      '<form data-form="found" novalidate>' +
      dz("Unggah foto barang") +
      fg("Nama barang", "name", "Contoh: botol minum biru") +
      catSel() +
      fg("Lokasi ditemukan", "loc", "Contoh: kantin") +
      '<div class="fgroup"><label for="at">Barang sekarang berada di</label><select class="field" id="at"><option>Dititipkan di pos satpam</option><option>Dititipkan ke guru piket</option><option>Saya simpan sendiri</option></select></div>' +
      '<div class="fgroup"><label for="ciri">Ciri khusus</label><input class="field" id="ciri" placeholder="Stiker, goresan, isi tas" autocomplete="off"><p class="hint">Tidak ditampilkan publik, dipakai untuk verifikasi klaim.</p></div>' +
      '<p class="formerr" id="err" hidden>Lengkapi nama barang, kategori, dan lokasi ditemukan.</p>' +
      '<button class="btn solid submit" type="submit">Kirim Laporan</button></form></div>'
    );
  }

  function formLost() {
    photo = null;
    return (
      '<div class="sheet">' +
      backBtn() +
      '<h1 class="page">Lapor Kehilangan</h1>' +
      writeBanner() +
      '<form data-form="lost" novalidate>' +
      dz("Foto barang (jika ada)") +
      fg("Nama barang", "name", "Contoh: jaket hitam") +
      catSel() +
      fg("Terakhir terlihat di", "loc", "Contoh: lapangan") +
      fg("Perkiraan waktu hilang", "lt", "Contoh: Jumat, saat istirahat") +
      fg("Ciri khusus", "ciri", "Merek, warna, stiker, isi") +
      '<div class="fgroup"><label for="contact">Kontak untuk notifikasi</label><input class="field" id="contact" placeholder="Nomor WhatsApp atau email" autocomplete="off"><p class="hint">Kami memberi tahu kamu saat ada laporan temuan yang cocok.</p></div>' +
      '<p class="formerr" id="err" hidden>Lengkapi nama barang, kategori, lokasi, dan kontak.</p>' +
      '<button class="btn solid submit" type="submit">Kirim Laporan</button></form></div>'
    );
  }

  function adminBox(it) {
    var s = secretInfo[it.id];
    if (!(isAdmin || it.ownerId === uid)) return "";
    if (!s)
      return '<div class="card admin-box"><h2>Data rahasia</h2><span class="muted">Memuat…</span></div>';
    if (s.missing) return "";
    var h =
      '<div class="card admin-box"><h2>' +
      (isAdmin ? "Data pelapor (hanya admin)" : "Data rahasia laporanmu") +
      "</h2>";
    if (isAdmin)
      h +=
        "<div><b>Pelapor:</b> " +
        esc(s.ownerName || "-") +
        " · " +
        esc(s.kelas || "-") +
        "</div>";
    h += "<div><b>Ciri khusus:</b> " + esc(s.ciri || "Tidak diisi") + "</div>";
    if (s.contact) h += "<div><b>Kontak:</b> " + esc(s.contact) + "</div>";
    return h + "</div>";
  }

  function detail(id) {
    if (!itemsLoaded)
      return (
        '<div class="sheet">' +
        backBtn() +
        '<div class="card empty">Memuat laporan…</div></div>'
      );
    var it = getItem(id);
    if (!it)
      return (
        '<div class="sheet">' +
        backBtn() +
        '<h1 class="page">Laporan tidak ditemukan</h1><p class="muted">Laporan ini mungkin sudah dihapus.</p><a class="btn solid" href="#beranda">Ke beranda</a></div>'
      );
    ensureSecret(it);
    var found = it.type === "found",
      mine = it.ownerId === uid;
    var facts = found
      ? "<div><b>Lokasi temuan:</b> " +
        esc(it.loc) +
        "</div><div><b>Waktu:</b> " +
        fullDate(it.ts) +
        "</div><div><b>Disimpan di:</b> " +
        esc(it.at || "Pos satpam") +
        "</div>"
      : "<div><b>Terakhir terlihat di:</b> " +
        esc(it.loc) +
        "</div><div><b>Waktu hilang:</b> " +
        esc(it.lostTime || fullDate(it.ts)) +
        "</div><div><b>Dilaporkan:</b> " +
        fullDate(it.ts) +
        "</div>";
    var side;
    if (found && it.status === "Ditemukan" && !mine) {
      side =
        '<form class="card claim" data-form="claim" data-id="' +
        esc(it.id) +
        '" novalidate><h2>Klaim barang ini</h2><p class="who">Atas nama ' +
        esc(acct.name) +
        " · " +
        esc(acct.kelas) +
        "</p>" +
        writeBanner() +
        '<div class="fgroup"><label for="c1">Apa ciri khusus barang ini?</label><input class="field" id="c1" autocomplete="off"></div>' +
        '<div class="fgroup"><label for="c2">Kapan dan di mana terakhir terlihat?</label><input class="field" id="c2" autocomplete="off"></div>' +
        '<p class="formerr" id="err" hidden>Jawab kedua pertanyaan agar admin bisa memverifikasi.</p>' +
        '<button class="btn solid" type="submit">Ini Barang Saya</button></form><p class="foot">Klaim diperiksa admin sebelum barang diserahkan.</p>';
    } else if (found && it.status === "Ditemukan" && mine) {
      side =
        '<div class="card note">Ini laporan penemuanmu. Admin akan memverifikasi klaim yang masuk.</div>';
    } else if (it.status === "Diklaim") {
      side =
        '<div class="card note">' +
        (it.claimBy === uid
          ? "Klaimmu sedang diperiksa admin. Pantau hasilnya di Laporan Saya."
          : "Ada klaim untuk barang ini yang sedang diperiksa admin.") +
        "</div>";
    } else if (it.status === "Dikembalikan") {
      side =
        '<div class="card note">Barang ini sudah dikembalikan ke pemiliknya.</div>';
    } else if (!found && mine) {
      side =
        '<div class="card claim"><h2>Sudah ketemu?</h2><p class="muted" style="margin:0 0 14px">Tandai laporan ini selesai agar tidak muncul sebagai barang hilang.</p><button type="button" class="btn solid" data-act="resolve" data-id="' +
        esc(it.id) +
        '">Barang Sudah Kembali</button></div>';
    } else {
      side =
        '<div class="card claim"><h2>Menemukan barang ini?</h2><p class="muted" style="margin:0 0 14px">Buat laporan penemuan supaya pemiliknya mendapat notifikasi.</p><a class="btn solid" href="#lapor-temuan">Lapor Penemuan</a></div>';
    }
    var del = "";
    if (mine || isAdmin) {
      del =
        confirmDel === it.id
          ? '<p class="foot" style="margin-bottom:10px">Hapus laporan ini selamanya?</p><div class="acts"><button type="button" class="btn danger small" data-act="delete" data-id="' +
            esc(it.id) +
            '">Ya, hapus</button><button type="button" class="btn plain small" data-act="delcancel">Batal</button></div>'
          : '<div class="stackbtn"><button type="button" class="btn plain small" data-act="delask" data-id="' +
            esc(it.id) +
            '">Hapus laporan</button></div>';
    }
    return (
      '<div class="sheet" style="max-width:none">' +
      backBtn() +
      '<div class="detail"><div><div class="photo">' +
      (it.photo
        ? '<img src="' + esc(it.photo) + '" alt="Foto ' + esc(it.name) + '">'
        : "<span>Foto barang</span>") +
      "</div></div>" +
      '<div><div class="titlerow"><h1>' +
      esc(it.name) +
      "</h1>" +
      badge(it.status) +
      '</div><div class="facts">' +
      facts +
      '</div><div style="margin-top:22px">' +
      side +
      "</div>" +
      adminBox(it) +
      del +
      "</div></div></div>"
    );
  }

  function notifs() {
    var act = matches(),
      mine = items
        .filter(function (i) {
          return i.ownerId === uid;
        })
        .sort(function (a, b) {
          return b.ts - a.ts;
        }),
      hist = myHistory();
    var h = '<h1 class="page">Notifikasi</h1><div class="stack">';
    if (!act.length)
      h +=
        '<div class="card empty"><b>Belum ada kecocokan</b>Kami memberi tahu kamu di sini saat ada laporan temuan yang cocok dengan laporan kehilanganmu.</div>';
    act.forEach(function (n) {
      var f = n.F;
      h +=
        '<section class="card notif"><h2>Ada barang yang mungkin cocok</h2><p class="muted" style="margin:-6px 0 0">Laporan temuan baru mirip dengan laporan kehilanganmu.</p>' +
        '<div class="pair"><div class="mini">' +
        badge("Hilang") +
        '<div class="ph">' +
        (n.L.photo ? '<img src="' + esc(n.L.photo) + '" alt="">' : "") +
        "</div><b>" +
        esc(n.L.name) +
        '</b><span class="s">Laporanmu</span></div>' +
        '<div class="mini">' +
        badge("Ditemukan") +
        '<div class="ph">' +
        (f.photo ? '<img src="' + esc(f.photo) + '" alt="">' : "") +
        "</div><b>" +
        esc(f.name) +
        '</b><span class="s">' +
        esc(f.loc) +
        " · " +
        esc(lc(f.at || "pos satpam")) +
        "</span></div></div>" +
        '<ul class="checks">' +
        n.checks
          .map(function (c) {
            return "<li>" + esc(c) + "</li>";
          })
          .join("") +
        "</ul>" +
        '<a class="btn solid" href="#barang-' +
        esc(f.id) +
        '">Lihat Detail dan Klaim</a><button type="button" class="btn plain" data-act="dismiss" data-id="' +
        esc(n.k) +
        '">Bukan Barang Saya</button></section>';
    });
    h += '</div><div class="sect stack"><h2>Sebelumnya</h2>';
    if (!hist.length)
      h += '<div class="card empty">Belum ada riwayat klaim.</div>';
    hist.forEach(function (x) {
      h +=
        '<div class="card hist">' +
        esc(x.t) +
        "<small>" +
        shortDate(x.ts) +
        "</small></div>";
    });
    h += "</div>";
    if (mine.length)
      h +=
        '<div class="sect stack"><h2>Laporanmu</h2>' +
        mine.map(itemCard).join("") +
        "</div>";
    return h;
  }

  function dash() {
    var c = { Hilang: 0, Ditemukan: 0, Dikembalikan: 0 };
    items.forEach(function (i) {
      if (i.status === "Hilang") c.Hilang++;
      else if (i.status === "Dikembalikan") c.Dikembalikan++;
      else c.Ditemukan++;
    });
    var pend = items
      .filter(function (i) {
        return i.status === "Diklaim" && i.claimBy;
      })
      .sort(function (a, b) {
        return (a.claimTs || 0) - (b.claimTs || 0);
      });
    var h =
      '<p class="hi">Halo, ' +
      esc(firstName()) +
      ' <span class="tag">Admin</span></p><h1 class="page">Dashboard Admin</h1><div class="stats">' +
      ["Hilang", "Ditemukan", "Dikembalikan"]
        .map(function (k) {
          return (
            '<div class="card stat"><b>' +
            two(c[k]) +
            "</b><span>" +
            k +
            "</span></div>"
          );
        })
        .join("") +
      '</div><h2>Klaim menunggu verifikasi</h2><div class="claims">';
    if (!itemsLoaded) h += '<div class="card empty">Memuat klaim…</div>';
    else if (!pend.length)
      h +=
        '<div class="card empty"><b>Tidak ada klaim yang menunggu</b>Klaim baru dari siswa muncul di sini.</div>';
    pend.forEach(function (it) {
      ensureClaim(it);
      var cl = claimInfo[it.id],
        open = openClaims[it.id];
      h +=
        '<div class="card cl"><h3>' +
        esc(it.name) +
        '</h3><p class="by">' +
        (cl && !cl.missing
          ? "Diklaim oleh " + esc(cl.byName) + " · " + esc(cl.kelas)
          : cl
            ? "Data klaim tidak ditemukan"
            : "Memuat data klaim…") +
        "</p>" +
        (cl && !cl.missing
          ? '<button type="button" class="more" data-act="toggle" data-id="' +
            esc(it.id) +
            '" aria-expanded="' +
            !!open +
            '">' +
            (open ? "Sembunyikan jawaban" : "Lihat jawaban klaim") +
            "</button>"
          : "") +
        (open && cl && !cl.missing
          ? '<dl class="ans"><dt>Ciri khusus menurut pengklaim</dt><dd>' +
            esc(cl.a1) +
            "</dd><dt>Terakhir terlihat</dt><dd>" +
            esc(cl.a2) +
            "</dd><dt>Ciri khusus dari penemu (tidak publik)</dt><dd>" +
            (secretInfo[it.id]
              ? esc(secretInfo[it.id].ciri || "Tidak diisi")
              : "Memuat…") +
            "</dd></dl>"
          : "") +
        '<div class="acts"><button type="button" class="btn solid" data-act="approve" data-id="' +
        esc(it.id) +
        '">Setujui</button><button type="button" class="btn plain" data-act="reject" data-id="' +
        esc(it.id) +
        '">Tolak</button></div></div>';
      if (open) ensureSecret(it);
    });
    h +=
      '</div><p class="flowline">Alur status: Hilang → Ditemukan → Diklaim → Dikembalikan</p>';
    return h;
  }

  function help() {
    var h =
      '<h1 class="page">Alur pengguna Balik.in</h1><p class="muted" style="margin:-8px 0 22px;max-width:60ch">Jika barang belum ada di daftar, pemilik memilih Lapor Kehilangan dan mendapat notifikasi saat ada kecocokan.</p><div class="flow">';
    Object.keys(STEPS).forEach(function (role) {
      h +=
        '<div class="frow"><h3>' +
        role +
        '</h3><div class="steps">' +
        STEPS[role]
          .map(function (s, i) {
            return (
              (i ? '<span class="arr" aria-hidden="true">→</span>' : "") +
              '<div class="step"><i>' +
              (i + 1) +
              "</i><span>" +
              esc(s) +
              "</span></div>"
            );
          })
          .join("") +
        "</div></div>";
    });
    h +=
      '</div><h2>Arti status</h2><ul class="legend"><li>' +
      badge("Hilang") +
      '<span class="muted">Pemilik sudah melapor, barang belum ketemu.</span></li><li>' +
      badge("Ditemukan") +
      '<span class="muted">Ada yang menemukan dan menitipkannya di pos.</span></li><li>' +
      badge("Diklaim") +
      '<span class="muted">Ada klaim yang sedang diperiksa admin.</span></li><li>' +
      badge("Dikembalikan") +
      '<span class="muted">Barang sudah diserahkan ke pemiliknya.</span></li></ul>' +
      '<div class="sect" style="max-width:60ch"><h2>Butuh bantuan?</h2><p class="muted" style="margin:0">Tanyakan ke guru piket atau satpam di pos. Ciri khusus yang kamu isi tidak ditampilkan publik, hanya dipakai admin untuk memverifikasi klaim.</p></div>' +
      (isAdmin
        ? '<div class="sect" style="max-width:60ch"><h2>Untuk admin</h2><p class="muted" style="margin:0">Admin adalah orang yang diberi akses Editor pada halaman ini lewat menu Share. Siswa cukup diberi akses Contributor agar bisa mendaftar dan membuat laporan.</p></div>'
        : "") +
      '<div class="sect"><h2>Akun</h2><div class="card account"><p>Masuk sebagai <b>' +
      esc(acct.name) +
      "</b> · " +
      esc(acct.kelas) +
      (isAdmin ? ' <span class="tag">Admin</span>' : "") +
      '</p><button type="button" class="btn plain small" style="width:auto" data-act="logout">Keluar</button></div></div>';
    return h;
  }

  /* ---------- layar daftar & masuk ---------- */
  function authHTML() {
    if (phase === "loading")
      return '<div class="card empty" style="margin-top:40px">Memuat Balik.in…</div>';
    if (phase === "blocked")
      return '<div class="sheet" style="margin-top:30px"><div class="card claim"><h2>Buka lewat akun Claude yang diundang</h2><p class="muted" style="margin:0">Akun dan laporan Balik.in disimpan di akun Claude pemilik halaman ini. Minta pemilik membagikan halaman dengan akses Contributor, lalu buka tautannya sambil masuk ke Claude.</p></div></div>';
    var left =
      '<div><h1 class="display">Barang hilang? Balik.in bantu kembalikan.</h1><p class="lead">Satu tempat resmi untuk melapor, mencari, dan mengklaim barang di SMK Telkom Malang.</p><ul class="points"><li>Lapor kehilangan atau penemuan lengkap dengan foto dan lokasi.</li><li>Dapat notifikasi saat ada laporan temuan yang cocok.</li><li>Klaim diverifikasi admin sebelum barang diserahkan.</li></ul></div>';
    var err =
      '<p class="formerr" id="err"' +
      (authMsg ? "" : " hidden") +
      ">" +
      esc(authMsg) +
      "</p>";
    var body;
    if (tab === "daftar") {
      if (acct && !resetMode) {
        body =
          '<h2>Akun sudah ada</h2><p class="sub">Akun ini sudah terdaftar atas nama ' +
          esc(acct.name) +
          '. Silakan masuk.</p><button type="button" class="btn solid" data-tab="masuk">Masuk</button>';
      } else {
        body =
          "<h2>" +
          (resetMode ? "Buat kata sandi baru" : "Daftar sekarang") +
          '</h2><p class="sub">' +
          (resetMode
            ? "Kata sandi lama diganti. Laporanmu tetap aman."
            : "Isi data singkat, lalu langsung bisa melapor dan mencari.") +
          "</p>" +
          writeBanner() +
          '<form data-form="' +
          (resetMode ? "reset" : "reg") +
          '" novalidate>' +
          (resetMode
            ? ""
            : fg("Nama lengkap", "rn", "Contoh: Dimas Aditya") +
              fg("Kelas", "rk", "Contoh: XI RPL 1")) +
          fg("Kata sandi", "rp", "Minimal 6 karakter", "password") +
          fg(
            "Ulangi kata sandi",
            "rp2",
            "Ketik lagi kata sandinya",
            "password",
          ) +
          err +
          '<button class="btn solid" type="submit">' +
          (resetMode ? "Simpan Kata Sandi Baru" : "Daftar Sekarang") +
          "</button></form>" +
          '<p class="switch">' +
          (resetMode
            ? '<button type="button" class="linkbtn" data-tab="masuk">Kembali ke masuk</button>'
            : 'Sudah punya akun? <button type="button" class="linkbtn" data-tab="masuk">Masuk</button>') +
          "</p>";
      }
    } else {
      if (!acct) {
        body =
          '<h2>Belum ada akun</h2><p class="sub">Daftar dulu, hanya butuh satu menit.</p><button type="button" class="btn solid" data-tab="daftar">Daftar Sekarang</button>';
      } else {
        body =
          '<h2>Selamat datang kembali</h2><p class="sub">' +
          esc(acct.name) +
          " · " +
          esc(acct.kelas) +
          "</p>" +
          '<form data-form="login" novalidate>' +
          fg("Kata sandi", "lp", "Kata sandimu", "password") +
          err +
          '<button class="btn solid" type="submit">Masuk</button></form>' +
          '<p class="switch"><button type="button" class="linkbtn" data-act="forgot">Lupa kata sandi?</button></p>';
      }
    }
    var card =
      '<div class="card formcard"><div class="tabs" role="group" aria-label="Daftar atau masuk"><button type="button" data-tab="daftar" aria-pressed="' +
      (tab === "daftar") +
      '">Daftar</button><button type="button" data-tab="masuk" aria-pressed="' +
      (tab === "masuk") +
      '">Masuk</button></div>' +
      body +
      '<p class="fine">Akun terhubung dengan akun Claude yang kamu pakai membuka halaman ini.</p></div>';
    return '<div class="authwrap">' + left + card + "</div>";
  }

  /* ---------- data ---------- */
  function ensureSecret(it) {
    if (
      !(isAdmin || it.ownerId === uid) ||
      secretInfo[it.id] ||
      fetching["s" + it.id] ||
      !it.ownerId
    )
      return;
    fetching["s" + it.id] = 1;
    db.doc("secrets/" + it.ownerId + "/list/" + it.id)
      .get()
      .then(function (s) {
        secretInfo[it.id] = s.exists ? s.data() : { missing: true };
      })
      .catch(function () {
        secretInfo[it.id] = { missing: true };
      })
      .then(function () {
        refresh();
      });
  }
  function ensureClaim(it) {
    if (claimInfo[it.id] || fetching["c" + it.id] || !it.claimBy) return;
    fetching["c" + it.id] = 1;
    db.doc("claims/" + it.claimBy + "/list/" + it.id)
      .get()
      .then(function (s) {
        claimInfo[it.id] = s.exists ? s.data() : { missing: true };
      })
      .catch(function () {
        claimInfo[it.id] = { missing: true };
      })
      .then(function () {
        refresh();
      });
  }

  function startItems() {
    if (unsub) return;
    unsub = db.collection("items").onSnapshot(
      function (s) {
        items = s.docs.map(function (d) {
          var o = d.data();
          o.id = d.id;
          return o;
        });
        itemsLoaded = true;
        refresh();
      },
      function () {
        itemsLoaded = true;
        toast("Koneksi ke data terputus. Muat ulang halaman.");
        refresh();
      },
    );
  }

  async function enter() {
    phase = "app";
    try {
      var d = await db.doc("data/users/" + uid + "/prefs").get();
      dismissed = (d.exists && d.data().dismissed) || [];
    } catch (e) {
      dismissed = [];
    }
    try {
      localStorage.setItem(SESS, uid);
    } catch (e) {}
    startItems();
    if (!location.hash || location.hash === "#") location.hash = "#beranda";
    render();
    window.scrollTo(0, 0);
  }

  async function boot() {
    try {
      var c = window.claude;
      if (!c || !c.use) {
        phase = "blocked";
        render();
        return;
      }
      var r = await Promise.all([c.use("db"), c.use("user")]);
      db = r[0];
      user = r[1];
      if (!db || !user) {
        phase = "blocked";
        render();
        return;
      }
      uid = await user.id();
      if (!uid) {
        phase = "blocked";
        render();
        return;
      }
      isAdmin = await user.canEdit();
      canWrite = await user.can("data.write");
      var snap = await db.doc("data/users/" + uid + "/account").get();
      acct = snap.exists ? snap.data() : null;
      tab = acct ? "masuk" : "daftar";
      var sess = null;
      try {
        sess = localStorage.getItem(SESS);
      } catch (e) {}
      if (acct && sess === uid) {
        await enter();
        return;
      }
      phase = "auth";
      render();
    } catch (e) {
      phase = "blocked";
      render();
    }
  }

  /* ---------- routing ---------- */
  function route() {
    var h = (location.hash || "#beranda").slice(1);
    if (h.indexOf("barang-") === 0) return { v: "barang", id: h.slice(7) };
    return { v: h };
  }
  function navItems() {
    var a = [
      ["beranda", "Beranda"],
      ["laporan", "Laporan Saya"],
      ["bantuan", "Bantuan"],
    ];
    if (isAdmin) a.splice(1, 0, ["daftar", "Daftar Barang"]);
    return a;
  }
  function render() {
    var r = route(),
      sub = false,
      html,
      key = r.v;
    document.body.classList.toggle("auth", phase !== "app");
    if (phase !== "app") {
      $("#app").innerHTML = authHTML();
      $("#dnav").innerHTML = "";
      $("#bnav").innerHTML = "";
      $("#whobar").innerHTML = "";
      document.body.classList.remove("sub");
      return;
    }
    switch (r.v) {
      case "lapor-temuan":
        html = formFound();
        sub = true;
        break;
      case "lapor-hilang":
        html = formLost();
        sub = true;
        break;
      case "barang":
        html = detail(r.id);
        sub = true;
        break;
      case "laporan":
        html = notifs();
        break;
      case "bantuan":
        html = help();
        break;
      case "daftar":
        html = home();
        break;
      default:
        key = "beranda";
        html = isAdmin ? dash() : home();
    }
    $("#app").innerHTML = html;
    document.body.classList.toggle("sub", sub);
    var cnt = matches().length;
    var nav = navItems()
      .map(function (n) {
        return (
          '<a href="#' +
          n[0] +
          '"' +
          (key === n[0] ? ' aria-current="page"' : "") +
          ">" +
          n[1] +
          (n[0] === "laporan" && cnt
            ? '<span class="dot" title="Ada kecocokan baru"></span>'
            : "") +
          "</a>"
        );
      })
      .join("");
    $("#dnav").innerHTML = nav;
    $("#bnav").innerHTML = nav;
    $("#whobar").innerHTML =
      "<span><b>" +
      esc(firstName()) +
      "</b>" +
      (isAdmin ? ' <span class="tag">Admin</span>' : "") +
      '</span><button type="button" class="linkbtn" data-act="logout">Keluar</button>';
  }
  function typing() {
    var a = document.activeElement;
    return !!(
      a &&
      a.matches &&
      a.matches("input,select,textarea") &&
      $("#app").contains(a)
    );
  }
  function refresh() {
    if (phase !== "app") return;
    var a = document.activeElement;
    if (a && a.id === "q") {
      var l = $("#list");
      if (l) l.innerHTML = listHTML();
      return;
    }
    if (typing()) {
      dirty = true;
      return;
    }
    render();
  }
  document.addEventListener("focusout", function () {
    if (!dirty) return;
    setTimeout(function () {
      if (!typing()) {
        dirty = false;
        render();
      }
    }, 80);
  });
  function go(h) {
    if (location.hash === "#" + h) render();
    else location.hash = "#" + h;
  }
  window.addEventListener("hashchange", function (ev) {
    try {
      prevHash = new URL(ev.oldURL).hash || "#beranda";
    } catch (x) {
      prevHash = "#beranda";
    }
    confirmDel = "";
    render();
    window.scrollTo(0, 0);
  });

  /* ---------- aksi ---------- */
  function bad(ids) {
    var ok = true;
    ids.forEach(function (id) {
      var el = $("#" + id);
      var v = el && el.value.trim();
      if (!v) {
        ok = false;
        if (el) el.setAttribute("aria-invalid", "true");
      } else el.removeAttribute("aria-invalid");
    });
    var e = $("#err");
    if (e) e.hidden = ok;
    return !ok;
  }
  function setBusy(f, b) {
    var s = f.querySelector('[type="submit"]');
    if (s) s.disabled = b;
  }
  function authErr(m) {
    authMsg = m;
    var e = $("#err");
    if (e) {
      e.textContent = m;
      e.hidden = !m;
    }
  }

  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    var kind = f.getAttribute("data-form"),
      val = function (id) {
        var el = $("#" + id);
        return el ? el.value.trim() : "";
      };
    if (kind === "reg" || kind === "reset") return doRegister(f, kind, val);
    if (kind === "login") return doLogin(f, val);
    if (kind === "found") return doFound(f, val);
    if (kind === "lost") return doLost(f, val);
    if (kind === "claim") return doClaim(f, val);
  });

  async function doRegister(f, kind, val) {
    var ids = kind === "reg" ? ["rn", "rk", "rp", "rp2"] : ["rp", "rp2"];
    if (bad(ids)) {
      authMsg = "";
      return authErr("Lengkapi semua kolom.");
    }
    if (val("rp").length < 6) return authErr("Kata sandi minimal 6 karakter.");
    if (val("rp") !== val("rp2"))
      return authErr("Kata sandi dan ulangannya belum sama.");
    setBusy(f, true);
    try {
      var salt = rndHex(16),
        hash = await hashPw(val("rp"), salt);
      var data = {
        name: kind === "reg" ? val("rn") : acct.name,
        kelas: kind === "reg" ? val("rk") : acct.kelas,
        salt: salt,
        hash: hash,
        ts: Date.now(),
      };
      await db.doc("data/users/" + uid + "/account").set(data);
      acct = data;
      resetMode = false;
      authMsg = "";
      toast(
        kind === "reg"
          ? "Akun dibuat. Selamat datang, " + firstName() + "!"
          : "Kata sandi baru tersimpan.",
      );
      await enter();
    } catch (err) {
      setBusy(f, false);
      authErr(errMsg(err));
    }
  }

  async function doLogin(f, val) {
    if (bad(["lp"])) return authErr("Isi kata sandi.");
    setBusy(f, true);
    try {
      var hash = await hashPw(val("lp"), acct.salt);
      if (hash !== acct.hash) {
        setBusy(f, false);
        return authErr("Kata sandi salah. Coba lagi.");
      }
      authMsg = "";
      await enter();
    } catch (err) {
      setBusy(f, false);
      authErr("Belum bisa masuk. Coba lagi.");
    }
  }

  function readPhoto() {
    return photo;
  }

  async function doFound(f, val) {
    if (bad(["name", "cat", "loc"])) return;
    var v = {
      name: val("name"),
      cat: val("cat"),
      loc: val("loc"),
      ciri: val("ciri"),
      at: val("at"),
      photo: readPhoto(),
    };
    setBusy(f, true);
    try {
      var at = v.at
        .replace("Dititipkan di ", "")
        .replace("Dititipkan ke ", "")
        .replace("Saya simpan sendiri", "Dibawa penemu");
      at = at.charAt(0).toUpperCase() + at.slice(1);
      var ref = db.collection("items").doc();
      await db
        .doc("secrets/" + uid + "/list/" + ref.id)
        .set({ ciri: v.ciri, ownerName: acct.name, kelas: acct.kelas });
      var it = {
        type: "found",
        name: v.name,
        cat: v.cat,
        loc: v.loc,
        at: at,
        status: "Ditemukan",
        ts: Date.now(),
        ownerId: uid,
        photo: v.photo,
      };
      await ref.set(it);
      toast("Laporan penemuan terkirim. Terima kasih sudah jujur!");
      go("beranda");
    } catch (err) {
      setBusy(f, false);
      toast(errMsg(err));
    }
  }

  async function doLost(f, val) {
    if (bad(["name", "cat", "loc", "contact"])) return;
    var v = {
      name: val("name"),
      cat: val("cat"),
      loc: val("loc"),
      lt: val("lt"),
      ciri: val("ciri"),
      contact: val("contact"),
      photo: readPhoto(),
    };
    setBusy(f, true);
    try {
      var ref = db.collection("items").doc();
      await db
        .doc("secrets/" + uid + "/list/" + ref.id)
        .set({
          ciri: v.ciri,
          contact: v.contact,
          ownerName: acct.name,
          kelas: acct.kelas,
        });
      var it = {
        type: "lost",
        name: v.name,
        cat: v.cat,
        loc: v.loc,
        lostTime: v.lt,
        status: "Hilang",
        ts: Date.now(),
        ownerId: uid,
        photo: v.photo,
      };
      await ref.set(it);
      var m = 0;
      items.forEach(function (F) {
        if (
          F.type === "found" &&
          F.status === "Ditemukan" &&
          compare(it, F).length
        )
          m++;
      });
      if (m) {
        toast("Ada barang yang mungkin cocok dengan laporanmu.");
        go("laporan");
      } else {
        toast("Laporan terkirim. Kami memberi tahu kamu saat ada yang cocok.");
        go("beranda");
      }
    } catch (err) {
      setBusy(f, false);
      toast(errMsg(err));
    }
  }

  async function doClaim(f, val) {
    if (bad(["c1", "c2"])) return;
    var it = getItem(f.getAttribute("data-id"));
    if (!it) return;
    var v = { a1: val("c1"), a2: val("c2") };
    setBusy(f, true);
    try {
      var now = Date.now();
      await db
        .doc("claims/" + uid + "/list/" + it.id)
        .set({
          itemId: it.id,
          byName: acct.name,
          kelas: acct.kelas,
          a1: v.a1,
          a2: v.a2,
          ts: now,
        });
      await db
        .doc("items/" + it.id)
        .update({ status: "Diklaim", claimBy: uid, claimTs: now });
      toast("Klaim terkirim. Admin akan memeriksanya.");
    } catch (err) {
      setBusy(f, false);
      toast(errMsg(err));
    }
  }

  async function finish(id, ok) {
    var it = getItem(id);
    if (!it) return;
    try {
      var now = Date.now();
      if (ok)
        await db
          .doc("items/" + id)
          .update({ status: "Dikembalikan", returnedAt: now });
      else {
        var rej = (it.rejected || []).concat([{ by: it.claimBy, ts: now }]);
        await db
          .doc("items/" + id)
          .update({
            status: "Ditemukan",
            claimBy: null,
            claimTs: null,
            rejected: rej,
          });
      }
      try {
        await db.doc("claims/" + it.claimBy + "/list/" + id).delete();
      } catch (x) {}
      delete claimInfo[id];
      delete openClaims[id];
      toast(
        ok
          ? "Klaim disetujui. Status diubah menjadi Dikembalikan."
          : "Klaim ditolak.",
      );
    } catch (err) {
      toast(errMsg(err));
    }
  }

  async function removeItem(id) {
    var it = getItem(id);
    if (!it) return;
    try {
      await db.doc("items/" + id).delete();
      try {
        await db.doc("secrets/" + it.ownerId + "/list/" + id).delete();
      } catch (x) {}
      confirmDel = "";
      toast("Laporan dihapus.");
      go("beranda");
    } catch (err) {
      toast(errMsg(err));
    }
  }

  function logout() {
    try {
      localStorage.removeItem(SESS);
    } catch (e) {}
    if (unsub) {
      unsub();
      unsub = null;
    }
    items = [];
    itemsLoaded = false;
    secretInfo = {};
    claimInfo = {};
    fetching = {};
    phase = "auth";
    tab = "masuk";
    resetMode = false;
    authMsg = "";
    location.hash = "";
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener("input", function (e) {
    if (e.target.id === "q") {
      ui.q = e.target.value;
      var l = $("#list");
      if (l) l.innerHTML = listHTML();
    } else if (e.target.getAttribute && e.target.getAttribute("aria-invalid"))
      e.target.removeAttribute("aria-invalid");
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id !== "photo" || !t.files || !t.files[0]) return;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 480 / Math.max(img.width, img.height)),
          c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        photo = c.toDataURL("image/jpeg", 0.7);
        var z = $("#dz");
        z.querySelector("span").hidden = true;
        var p = z.querySelector("img");
        if (!p) {
          p = new Image();
          z.appendChild(p);
        }
        p.src = photo;
        p.alt = "Foto barang yang diunggah";
      };
      img.onerror = function () {
        toast("Foto tidak bisa dibaca. Coba foto lain.");
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(t.files[0]);
  });

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-chip],[data-act],[data-tab]");
    if (!t) return;
    if (t.hasAttribute("data-tab")) {
      tab = t.getAttribute("data-tab");
      if (tab === "masuk") resetMode = false;
      authMsg = "";
      render();
      return;
    }
    if (t.hasAttribute("data-chip")) {
      ui.filter = t.getAttribute("data-chip");
      $("#chips").innerHTML = chipsHTML();
      $("#list").innerHTML = listHTML();
      return;
    }
    var a = t.getAttribute("data-act"),
      id = t.getAttribute("data-id");
    if (a === "back") {
      prevHash && prevHash !== location.hash
        ? go(prevHash.slice(1))
        : go("beranda");
    } else if (a === "logout") logout();
    else if (a === "forgot") {
      resetMode = true;
      tab = "daftar";
      authMsg = "";
      render();
    } else if (a === "dismiss") {
      if (dismissed.indexOf(id) === -1) dismissed.push(id);
      db.doc("data/users/" + uid + "/prefs")
        .set({ dismissed: dismissed })
        .catch(function () {});
      render();
    } else if (a === "toggle") {
      openClaims[id] = !openClaims[id];
      render();
    } else if (a === "approve") finish(id, true);
    else if (a === "reject") finish(id, false);
    else if (a === "delask") {
      confirmDel = id;
      render();
    } else if (a === "delcancel") {
      confirmDel = "";
      render();
    } else if (a === "delete") removeItem(id);
    else if (a === "resolve") {
      db.doc("items/" + id)
        .update({ status: "Dikembalikan", returnedAt: Date.now() })
        .then(function () {
          toast("Senang barangmu sudah kembali!");
        })
        .catch(function (er) {
          toast(errMsg(er));
        });
    }
  });

  render();
  boot();
})();
