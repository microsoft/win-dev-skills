---
name: media
description: 'Media playback for WinUI 3 apps — audio, video, MediaPlayerElement, and transport controls. Use when adding media playback or capture to desktop apps.'
---

# Media Integration in WinUI 3

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

### 1. Use MediaPlayerElement for Video/Audio UI

`MediaPlayerElement` is the primary XAML control for rendering media with built-in transport controls.

```xml
<MediaPlayerElement x:Name="Player"
                    AreTransportControlsEnabled="True"
                    Source="{x:Bind ViewModel.MediaSource, Mode=OneWay}"
                    AutoPlay="False" />
```

```csharp
// Set source programmatically
var uri = new Uri("https://example.com/video.mp4");
Player.Source = MediaSource.CreateFromUri(uri);
```

### 2. Use MediaPlayer for Background Audio

`MediaPlayer` handles audio playback without a visual element. Always dispose when finished.

```csharp
private MediaPlayer _player = new MediaPlayer();

public void PlayBackground(Uri source)
{
    _player.AudioCategory = MediaPlayerAudioCategory.Media;
    _player.Source = MediaSource.CreateFromUri(source);
    _player.Play();
}

public void Cleanup()
{
    _player.Pause();
    _player.Source = null;
    _player.Dispose();
}
```

### 3. Build Playlists with MediaPlaybackList

```csharp
var playlist = new MediaPlaybackList();
foreach (var file in audioFiles)
{
    var source = MediaSource.CreateFromStorageFile(file);
    playlist.Items.Add(new MediaPlaybackItem(source));
}
_player.Source = playlist;
playlist.CurrentItemChanged += (s, e) => UpdateNowPlaying(s.CurrentItem);
```

### 4. Create Media Sources Correctly

Use the right `MediaSource` factory for each scenario:

```csharp
// From URI (remote or local)
var fromUri = MediaSource.CreateFromUri(new Uri("ms-appx:///Assets/intro.mp4"));

// From StorageFile (file picker results, local files)
var file = await StorageFile.GetFileFromPathAsync(path);
var fromFile = MediaSource.CreateFromStorageFile(file);

// Adaptive streaming (HLS / DASH)
var result = await AdaptiveMediaSource.CreateFromUriAsync(hlsUri);
if (result.Status == AdaptiveMediaSourceCreationStatus.Success)
{
    var fromAdaptive = MediaSource.CreateFromAdaptiveMediaSource(result.MediaSource);
}
```

### 5. Customize Transport Controls

Inherit `MediaTransportControls` to add custom buttons or use compact mode for small players.

```xml
<MediaPlayerElement AreTransportControlsEnabled="True">
    <MediaPlayerElement.TransportControls>
        <MediaTransportControls IsCompact="True"
                                IsZoomButtonVisible="False"
                                IsPlaybackRateButtonVisible="True" />
    </MediaPlayerElement.TransportControls>
</MediaPlayerElement>
```

### 6. Handle Media Capture with CaptureElement

Declare capabilities in `Package.appxmanifest` and use `MediaCapture` for camera/microphone access.

```xml
<!-- Package.appxmanifest -->
<Capabilities>
    <DeviceCapability Name="webcam" />
    <DeviceCapability Name="microphone" />
</Capabilities>
```

```csharp
var capture = new MediaCapture();
await capture.InitializeAsync(new MediaCaptureInitializationSettings
{
    StreamingCaptureMode = StreamingCaptureMode.AudioAndVideo
});
PreviewElement.Source = capture;
await capture.StartPreviewAsync();
```

### 7. Check Codec Support Before Playback

```csharp
var source = MediaSource.CreateFromUri(mediaUri);
source.OpenOperationCompleted += (s, args) =>
{
    if (args.Error != null)
    {
        DispatcherQueue.TryEnqueue(() =>
            ShowCodecError("Format not supported. Install required codec extension."));
    }
};
```

### 8. Integrate with System Media Transport Controls

Expose metadata so the Windows media overlay displays track information.

```csharp
_player.CommandManager.IsEnabled = true;
_player.SystemMediaTransportControls.IsEnabled = true;

var updater = _player.SystemMediaTransportControls.DisplayUpdater;
updater.Type = MediaPlaybackType.Music;
updater.MusicProperties.Title = "Track Title";
updater.MusicProperties.Artist = "Artist Name";
updater.Update();
```

## Anti-patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Forget to dispose `MediaPlayer` instances | Call `Dispose()` in cleanup/`Unloaded` handlers |
| Load media synchronously on the UI thread | Use `MediaSource.CreateFromUri` or `MediaSource.CreateFromStorageFile` and set the source asynchronously |
| Skip codec support checks | Handle `OpenOperationCompleted` errors and guide users to install codecs |
| Omit `webcam`/`microphone` capabilities in manifest | Declare `DeviceCapability` in `Package.appxmanifest` before using `MediaCapture` |
| Play audio without setting `AudioCategory` | Set `MediaPlayer.AudioCategory` so Windows manages focus and ducking correctly |
| Access `SystemMediaTransportControls` from background thread | Marshal updates through `DispatcherQueue.TryEnqueue` |

## Validation

### Verification Checklist

- [ ] `MediaPlayerElement.Source` is set via `MediaSource` factory methods, never raw URIs
- [ ] `MediaPlayer` instances are disposed in page `Unloaded` or `ViewModel` cleanup
- [ ] `webcam` and `microphone` capabilities declared in manifest when using `MediaCapture`
- [ ] Codec/format errors handled gracefully with user-facing messages
- [ ] `AudioCategory` is set before calling `Play()` for background audio scenarios
- [ ] System media transport control metadata is updated on each track change

## Must Read & Research

> **Agent rule:** Before generating media playback code, look up at least one reference below to confirm the current API surface in Windows App SDK.

| Topic | Reference |
|-------|-----------|
| MediaPlayerElement overview | https://learn.microsoft.com/windows/apps/design/controls/media-playback |
| Media playback with MediaPlayer | https://learn.microsoft.com/windows/uwp/audio-video-camera/play-audio-and-video-with-mediaplayer |
| Adaptive streaming (HLS/DASH) | https://learn.microsoft.com/windows/uwp/audio-video-camera/adaptive-streaming |
| Camera & MediaCapture | https://learn.microsoft.com/windows/uwp/audio-video-camera/camera |
| System Media Transport Controls | https://learn.microsoft.com/windows/uwp/audio-video-camera/system-media-transport-controls |
