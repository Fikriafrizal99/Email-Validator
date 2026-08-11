# Email-Validator
Created from gas-tools extension

## Changelog v3.3.5

- Resolver website resmi memprioritaskan root domain dan tetap memakai subdomain kampanye sebagai evidence.
- LinkedIn mendukung profil `/company/` dan `/school/` dengan pencocokan entitas yang ketat.
- Alias institusi mencakup UMM, UM Metro, Muhammadiyah Metro, dan variasi stem domain resmi; alias Instagram pendek memerlukan dukungan nama, deskripsi, atau lokasi.
- Resolver legal memperluas bentuk badan hukum, memakai fallback alias/lokasi/induk, dan hanya mengisi AHU Evidence dari `ahu.go.id`.
- Company Master, Email Evidence, dan Raw mendapat field legal append-only tanpa menghapus atau memindahkan data lama.
- Cache Company Master sebelum v3.3.5 ditandai stale satu kali, dengan Manual Lock tetap dipertahankan.

### Hotfix v3.3.5

- Cache discovery kosong pada Email Validation Raw dan Company Master ditandai stale satu kali tanpa menghapus data.
- Respons web search `incomplete` atau URL tanpa source tidak lagi disimpan sebagai `NOT_FOUND`.
- Pencarian nama lengkap diprioritaskan sebelum fallback alias/stem.
- Metadata structured output hanya dipakai jika didukung URL source/citation aktual.
