# Renvy Bail Patch Report

Version: `1.3.0-renvyairich.22-send-waiting-fix`

## Tujuan

Patch ini fokus memperbaiki kasus pesan bot yang muncul sebagai `menunggu pesan` di WhatsApp penerima. Penyebab paling besar adalah pengiriman group message terlalu cepat tanpa metadata peserta lengkap, sender-key tidak terkirim ke semua device, atau alamat device PN/LID tidak sinkron.

## Ditambah / Diubah

```txt
[+] Group send default kembali ke safe mode seperti Baileys ori
[+] renvyFastGroupSend sekarang OFF secara default
[+] fastNoSessionSkip sekarang OFF secara default
[+] cachedGroupMetadata dari config kembali dipakai
[+] getUSyncDevices memakai withLIDProtocol jika tersedia
[+] extractDeviceJids support myLid dan server PN/LID
[+] direct message device enumeration pakai senderIdentity sesuai PN/LID
[+] direct message tidak lagi ignore zero device saat USync
[+] group message menambahkan addressing_mode dari group metadata
[+] group message memakai meLid untuk encryptGroupMessage saat addressing_mode lid
[+] group send diblokir jika metadata peserta kosong agar tidak mengirim pesan yang tidak bisa didecrypt
[+] sender-key distribution diblokir jika semua node sender-key gagal dibuat
```

## Dipertahankan

```txt
[+] AIRich tetap ada
[+] Newsletter / channel tetap ada
[+] Fast send engine tetap ada, tapi mode paling berisiko tidak lagi default
[+] Database auth tetap ada
[+] RTC caller / caller.mjs tetap ada
[+] Dugong/helper lama tetap ada
[+] CommonJS require("baileys") tetap aman
[+] README modern tetap dipakai
[+] Session core v21 tetap dipertahankan
```

## Catatan Kecepatan

Safe mode bisa membuat kirim pesan grup pertama sedikit lebih lambat karena bot menunggu metadata peserta dan session key. Namun ini mencegah pesan terkirim tanpa sender-key, yang biasanya menyebabkan penerima melihat `menunggu pesan`.

Jika benar-benar ingin mode cepat berisiko, bisa aktifkan manual:

```js
renvyFastGroupSend: true,
fastNoSessionSkip: true
```

Tidak disarankan untuk bot publik/grup besar.
