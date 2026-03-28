---
name: packaging-and-signing
description: 'Package Windows apps as MSIX installers and manage code signing certificates for distribution. Covers the full workflow from building to MSIX packaging (winapp package), certificate generation (winapp cert generate), certificate trust (winapp cert install), code signing (winapp sign), self-contained deployment, CI/CD pipeline integration, and Microsoft Store submission (winapp store). Use when creating MSIX packages, generating or managing certificates, signing apps or installers, fixing certificate trust issues, setting up CI/CD packaging pipelines, distributing apps internally or through the Microsoft Store, or creating external content catalogs for sparse packages.'
---

## Quick reference

| Task | Command |
|------|---------|
| Package + sign | `winapp package <dir> --cert devcert.pfx` |
| Generate + sign + package | `winapp package <dir> --generate-cert --install-cert` |
| Self-contained deployment | `winapp package <dir> --cert devcert.pfx --self-contained` |
| Generate dev certificate | `winapp cert generate` |
| Trust certificate (admin) | `winapp cert install ./devcert.pfx` |
| Sign existing file | `winapp sign ./app.msix ./devcert.pfx` |

> Run `winapp package --help`, `winapp cert --help`, `winapp sign --help`, or `winapp --cli-schema` for full CLI details.

## End-to-end workflow

```
1. BUILD your app
       │
2. GENERATE certificate (one-time)
   └─ winapp cert generate
       │
3. TRUST certificate (one-time, admin)
   └─ winapp cert install ./devcert.pfx
       │
4. PACKAGE + SIGN
   └─ winapp package <build-output> --cert ./devcert.pfx
       │
5. INSTALL → double-click .msix or Add-AppxPackage ./myapp.msix
       │
6. DISTRIBUTE
   ├─ Internal: share .msix + cert
   ├─ Microsoft Store: winapp store <args>
   └─ Production: trusted CA cert + --timestamp
```

### Certificate workflow

```
Need a certificate?
├─ Dev/testing → winapp cert generate --manifest .
│  ├─ Creates devcert.pfx (default password: "password")
│  └─ Trust it: winapp cert install ./devcert.pfx (admin!)
├─ Production → obtain cert from a trusted CA
│  └─ Sign with --timestamp to survive cert expiration
└─ CI/CD → store PFX as a repository secret
   └─ winapp cert generate --if-exists skip
```

### What packaging does

1. Locates `appxmanifest.xml` (input folder → current dir → `--manifest`)
2. Copies manifest + assets into staging layout
3. Generates `resources.pri` (skip with `--skip-pri`)
4. Runs `makeappx pack` → creates `.msix`
5. Signs (if `--cert` provided) → calls `signtool`

### Advanced: external content catalog

For sparse packages with `AllowExternalContent`, generate a code integrity catalog to trust external executables:

```
winapp create-external-catalog "./bin/Release" --recursive
```

## Key rules

- **Publisher must match** between certificate and manifest `Identity.Publisher`. Use `winapp cert generate --manifest` to auto-match.
- **Prefer `winapp package --cert`** over separate `winapp sign` — one step instead of two.
- **`cert install` requires admin** — adds cert to machine Trusted Root store. Persists across reboots.
- **Default PFX password** is `password`. Override with `--password`.
- **`--timestamp`** is critical for production — without it, signatures expire with the cert.
- **`--self-contained`** bundles Windows App SDK runtime. Requires SDK reference in `winapp.yaml` or `.csproj`.
- **`--skip-pri`** for apps without UWP resource loading (most Electron, Rust, C++ apps).
- **`package` aliases to `pack`**. Use **`--quiet` (`-q`)** in CI/CD.

## CI/CD pattern

```yaml
# GitHub Actions
- uses: microsoft/setup-winapp@v1

- name: Package
  run: |
    winapp restore --quiet
    dotnet build -c Release
    winapp package ./bin/Release --cert ${{ secrets.CERT_PATH }} --cert-password ${{ secrets.CERT_PASSWORD }} --quiet
```

**CI/CD tips:** Use `--quiet` for clean output. Use `--if-exists skip` with cert generate. Use `--use-defaults` with init. Store PFX as a repository secret.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Publisher mismatch" | Run `winapp cert generate --manifest` to re-generate, or edit manifest `Identity.Publisher` |
| "Certificate not trusted" / install fails | Run `winapp cert install ./devcert.pfx` as admin |
| "Access denied" | `cert install` needs admin — run terminal as Administrator |
| "Certificate file already exists" | Use `--if-exists overwrite` or `--if-exists skip` |
| "appxmanifest.xml not found" | Run `winapp init` or `winapp manifest generate` first, or pass `--manifest <path>` |
| "makeappx not found" | Run `winapp update` to download build tools; ensure internet access |
| "Package installation failed" | Trust cert first (`winapp cert install`, admin). Remove stale: `Get-AppxPackage <name> \| Remove-AppxPackage` |
| Signature invalid after time | Re-sign with `--timestamp http://timestamp.digicert.com` |

## Related skills

- **Project setup** → See `identity-and-setup` for `winapp init`, manifest authoring, and running with identity.
- **Windows APIs** → See `windows-platform-apis` for SDK setup and calling platform APIs.

## External resources

- [Full CLI documentation](https://github.com/microsoft/WinAppCli/blob/main/docs/usage.md)
- [Framework-specific packaging guides](https://github.com/microsoft/WinAppCli/tree/main/docs/guides)
- [Microsoft Store Developer CLI](https://aka.ms/msstoredevcli)
