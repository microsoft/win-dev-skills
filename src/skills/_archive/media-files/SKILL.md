---
name: media-files
description: 'File handling and media playback for WinUI 3 — file pickers, System.IO, packaged/unpackaged storage, drag-and-drop, MediaPlayerElement, and transport controls. Use when reading/writing files, showing file pickers, playing audio/video, or managing app storage locations.'
---

# Media & File Handling

## Quick Reference

1. **File pickers MUST call `InitializeWithWindow`** — pass HWND before `Pick*Async` or the app crashes.
2. **Prefer `System.IO` over `StorageFile`** — reserve `StorageFile` for broker-mediated access (pickers, MRU).
3. **Use `Path.Combine()` for all paths** — never hardcode backslash separators.
4. **`MediaPlayerElement` for video, `MediaPlayer` for audio-only** — always dispose `MediaPlayer`.
5. **Declare capabilities** — `webcam`/`microphone` for `MediaCapture`; `broadFileSystemAccess` for unrestricted file access.

---

## Key Rules

### File Handling

- **Pickers:** `InitializeWithWindow.Initialize(picker, hwnd)` before `Pick*Async`. Applies to all picker types.
- **System.IO:** `File.ReadAllTextAsync`/`WriteAllTextAsync`. `FileStream` with `useAsync: true` for large files. Always `using`/`await using`.
- **Storage:** Packaged → `ApplicationData.Current.LocalFolder`. Unpackaged → `Path.Combine(LocalApplicationData, "MyApp")`.
- **Broad access:** `broadFileSystemAccess` capability. Handle `UnauthorizedAccessException` → `ms-settings:privacy-broadfilesystemaccess`.
- **Drag & drop:** `AllowDrop="True"`, check `StandardDataFormats.StorageItems` in handler.
- **File watchers:** `FileSystemWatcher` + `DispatcherQueue.TryEnqueue()` for UI. Dispose when done.
- **MRU:** `StorageApplicationPermissions.MostRecentlyUsedList` — handle `FileNotFoundException`.

### Media Playback

- **Video:** `MediaPlayerElement` with `AreTransportControlsEnabled`. Source via `MediaSource.CreateFromUri/StorageFile/AdaptiveMediaSource`.
- **Audio-only:** `MediaPlayer` — set `AudioCategory` before `Play()`. Dispose: `Pause()` → null → `Dispose()`.
- **Playlists:** `MediaPlaybackList` + `MediaPlaybackItem`. Handle `CurrentItemChanged`.
- **Transport controls:** `<MediaTransportControls IsCompact="True" />` inside `MediaPlayerElement.TransportControls`.
- **Capture:** Declare `webcam`/`microphone` capabilities. `MediaCapture.InitializeAsync()`.
- **System overlay:** `SystemMediaTransportControls.DisplayUpdater` for track metadata.

---

## Detailed References

| Reference | Contents |
|---|---|
| [`references/file-patterns.md`](references/file-patterns.md) | Full picker code, System.IO patterns, storage paths, broad access, MRU, file type associations, drag-and-drop, FileSystemWatcher |
| [`references/media-patterns.md`](references/media-patterns.md) | MediaPlayerElement, MediaPlayer, playlists, adaptive streaming, transport controls, media capture, system media controls |

## Related Skills

| Skill | When to use |
|---|---|
| `interop-webview` | HWND retrieval, `InitializeWithWindow` details |
| `platform-apis` | `MediaCapture` for camera/mic, sensor capabilities |
| `quality` | Accessibility for media controls, security for file paths |

## External Resources

| Topic | Link |
|---|---|
| File pickers | [Pickers](https://learn.microsoft.com/windows/apps/develop/files/pickers) |
| File permissions | [File access permissions](https://learn.microsoft.com/windows/apps/develop/files/file-access-permissions) |
| MediaPlayerElement | [Media playback](https://learn.microsoft.com/windows/apps/design/controls/media-playback) |
| MediaPlayer | [Play audio/video](https://learn.microsoft.com/windows/uwp/audio-video-camera/play-audio-and-video-with-mediaplayer) |
| Streaming | [HLS/DASH](https://learn.microsoft.com/windows/uwp/audio-video-camera/adaptive-streaming) |
| Camera | [MediaCapture](https://learn.microsoft.com/windows/uwp/audio-video-camera/camera) |
