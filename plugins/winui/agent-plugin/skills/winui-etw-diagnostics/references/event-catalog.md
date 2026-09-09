# WinUI runtime ETW event catalog

This catalog describes events observed in shipped WinUI runtime source. Event availability,
payload shape, and message text can change with the Windows App SDK version. TraceLogging
events are self-describing; use the schema embedded in the ETL as authoritative. For legacy
manifest events, use the manifest matching the runtime that produced the trace.

Source provenance: `microsoft/microsoft-ui-xaml` commit
`2f88d24861f19237350437f6f818ede0600bd375`.

For the complete manifest schema grouped into all 373 main-provider and 61 diagnostics
families, see `manifest-event-families.md`.

## Provider summary

| Provider | Runtime role | Event form |
|---|---|---|
| `Microsoft-Windows-XAML` | Core lifecycle, parser, layout, rendering, input, images, animation, app model, controls, public API, and scheduling | Legacy manifest plus self-describing TraceLogging |
| `Microsoft.UI.Xaml` | Operational telemetry, fail-fast/error context, resource lookup, device, first-frame, and aggregate events | Self-describing TraceLogging |
| `Microsoft.UI.Xaml.Controls.Perf` | Control performance messages | Self-describing TraceLogging |
| `Microsoft.UI.Xaml.Controls.Debug` | Control informational/verbose messages | Self-describing TraceLogging |
| `Microsoft-Windows-XAML-Diagnostics` | Visual diagnostics, source information, bindings, accessibility, and detailed input | Legacy manifest |
| `Microsoft.UI.Xaml.Controls` | Controls product telemetry | Self-describing TraceLogging |
| `WindowsUIXaml` | Debug messages for DirectManipulation, resource loading, and ListViewBase chrome | WPP; matching symbols/TMF metadata required |

## Main-provider keyword map

The legacy `Microsoft-Windows-XAML` manifest defines these keywords. Newer TraceLogging
events on the same provider may use Microsoft telemetry keywords outside this low-bit map.

| Mask | Keyword | Typical event families |
|---:|---|---|
| `0x000001` | Detailed | detailed framework operations |
| `0x000002` | Temporary | temporary instrumentation |
| `0x000004` | Core | initialization, object writer, dependency objects, threading |
| `0x000008` | Managed | managed projection/runtime integration |
| `0x000010` | Parser | XAML parse/load |
| `0x000020` | Text | text services |
| `0x000040` | Layout | measure, arrange, invalidation |
| `0x000080` | Controls | controls and collections |
| `0x000100` | Appmodel | startup, windows, suspend/resume |
| `0x000200` | Databinding | binding source/target updates |
| `0x000400` | Templates | templates and deferred content |
| `0x000800` | Media | media and timed text |
| `0x001000` | Rendering | ticks, frames, render walk, surfaces |
| `0x002000` | Animation | storyboards and animation |
| `0x004000` | CachedComposition | cached composition |
| `0x008000` | Input | pointer, keyboard, focus, manipulation |
| `0x010000` | DComp | composition tree and device work |
| `0x020000` | Images | download, decode, surfaces, caches |
| `0x040000` | Stackwalk | stack-trigger event |
| `0x080000` | ApiCall | public API begin/end |

## High-value manifest event families

An event family can contain `Start/Stop`, `Begin/End`, and/or `Info` rows. Use the ETL's
opcode and payload schema; do not infer pairing solely from the suffix.

| Area | Event families |
|---|---|
| Startup/lifecycle | `ApplicationStartup`, `ApplicationStarted`, `ApplicationLoadComponent`, `InitializeCore`, `CoreServicesCreate`, `CoreServicesReset`, `CreateWindow`, `ShowWindow`, `PutRootVisual`, `PutSource`, `OnActivated`, `ApplicationSuspend`, `ApplicationResume`, `CCoreServicesOnSuspend`, `CCoreServicesOnResume`, `WindowSizeChanged` |
| Parser/object writer | `ParseXaml`, `CreateInstance`, `SetValueOnCurrentInstance`, `AddToCollectionOnCurrentInstance`, `SetConnectionID`, `SetNameOnCurrentInstance`, `ProvideStaticResourceReference`, `SetCustomRuntimeDataOnCurrentInstance`, `SetCustomRuntimeDataForDeferredElement`, `SetCustomRuntimeDataForResourceDictionary`, `SetCustomRuntimeDataForStyle`, `SetCustomRuntimeDataForVSM`, `RealizeDeferredElement` |
| Templates/resources | `GetBuiltInStyle`, `LoadTemplateContent`, `ApplyTemplate`, `RefreshTemplateBindings`, `ResourceDictionaryAdd`, `ResourceDictionaryAddWithSource`, `ResourceDictionaryRemove`, `ResourceDictionaryClear`, `ResourceUsingXName`, `ElementStyleChanged` |
| Layout | `Layout`, `Measure`, `Arrange`, `MeasureElement`, `ArrangeElement`, `MeasureOverride`, `ArrangeOverride`, `MeasureChild`, `InvalidateMeasure`, `InvalidateArrange`, `RecursiveInvalidateMeasure`, `IndividualSizeChanged`, `FireSizeChanged`, `FireLayoutUpdated`, `UpdateLayout`, `RaiseAllLoadedEvents`, `RaiseLoadedEvent`, `FrameworkElementLoading`, `ChildBoundsStats`, `ContentBoundsStats`, `InnerBoundsStats`, `OuterBoundsStats` |
| Frame/rendering | `Tick`, `Frame`, `RequestFrameReason`, `PerFrameCallback`, `UIThreadCallback`, `RenderWalk`, `SubmitFrame`, `CommitMainDevice`, `CompositorLock`, `RenderThreadSimulateVBlank`, `HWCompNodeUpdate`, `CreateAcceleratedGraphics`, `CreateGraphicsDevice`, `ReleaseGraphicsDeviceResources`, `RebuildGraphicsDeviceResources`, `RecordDeviceAsLost`, `CheckForStaleDxgiDevice` |
| Composition | `CompTreeCreateTreeNode`, `CompTreeCreateMediaNode`, `CompTreeCreateSwapChainNode`, `CompTreeInsertChild`, `CompTreeRemoveChild`, `CompTreeRemoveFromParent`, `CompTreeSetCompositionPeer`, `CompTreeRemoveCompositionPeer`, `CompTreeSetRedirectionTarget`, `DCompAppendChild`, `DCompRemoveFromTree`, `DCompRemovePrimitive`, `DCompSnapshotBounds` |
| Images | `ImageSetSource`, `ImageCacheDownload`, `ImageDownloadAvailable`, `DownloadRequestQueue`, `DownloadRequestBinding`, `DownloadRequestDataAvailable`, `DecodeStreamForImage`, `DecodeToRenderSize`, `DecodeToSurface`, `ImageCacheDecode`, `ImageCopyToVideoMemory`, `ImageEnsureAndUpdateHardwareResources`, `ImageUpdateHardwareResources`, `ImageResetForSourceChange`, `ImageSourceRelation`, `AsyncImageDecoderFrameNotReady`, `ImageAnimationEnd`, `GetCompressedImageSize`, `SystemMemorySurfaceAllocate`, `SystemMemorySurfaceFree`, `OfferSystemMemorySurface`, `ReclaimSystemMemorySurface` |
| Input/focus | `ProcessPointerInput`, `InputEvent`, `PointerDown`, `PointerUp`, `PointerUpdate`, `PointerEnter`, `PointerLeave`, `PointerWheel`, `PointerHWheel`, `PointerPressed`, `PointerMoved`, `PointerReleased`, `PointerEntered`, `PointerExited`, `PointerCaptureLost`, `PointerCanceled`, `PointerWheelChanged`, `KeyDown`, `KeyUp`, `KeyDownHandler`, `KeyUpHandler`, `HitTest`, `TouchHitTesting`, `UpdateFocus`, `XYFocusWalk`, `XYFocusEntered`, `XYFocusNotFound` |
| Gestures/manipulation | `Tapped`, `DoubleTapped`, `Holding`, `RightTapped`, `ManipulationStarting`, `ManipulationStarted`, `ManipulationDelta`, `ManipulationInertiaStarting`, `ManipulationCompleted`, `DmInitialize`, `DmPointerHitTest`, `DmSetContact`, `DmViewportStatus`, `DmViewportStatusUpdate`, `DmViewportValuesUpdate`, `DmContentValuesUpdate` |
| Routed events | `EventCallback`, `ElementAdded`, `ElementRemoved`, `ElementCreated`, `ElementDestroyed`, `PeerCreated`, `ElementSetName`, `ElementSource`, `PropertyChanged` |
| Binding | `UpdateTargetBinding`, `UpdateSourceBinding`, `UpdateDependencyPropertiesForSCR` |
| Collections/virtualization | `GenerateItems`, `GenerateContainer`, `GenerateMCContainer`, `PrepareContainer`, `PlaceElement`, `GetElementCount`, `ChangeSelection`, `ExtendSelectionRange`, `VirtualizationMeasure`, `VirtualizationAdd`, `VirtualizationCleanup`, `VirtualizedCollectionBounds`, `VirtualizedCollectionUpdated`, `VirtualizedItemAdded`, `VirtualizedItemRemoved`, `VirtualizedItemUpdated`, `NavigationCacheGetContent` |
| Animation/transitions | `Animation`, `SetAnimation`, `ClearAnimation`, `BeginStoryboard`, `BeginStoryboardWithSource`, `PauseStoryboard`, `ResumeStoryboard`, `StopStoryboard`, `EndStoryboard`, `DynamicTimeline`, `TickPausedAnimation`, `CancelTransitions`, `ProcessLayoutForTransition`, `RealizeTransition`, `FindTrackerTargets` |
| Threads/queues | `ThreadedJobQueueSubmitJob`, `ThreadedJobQueueJob`, `ThreadedJobQueueThreadWait`, `ThreadedJobQueueThreadLifetime`, `ThreadedJobQueueShutdownWait`, `ThreadedJobQueueUpdateExternalRef`, `ReleaseQueueCleanup`, `UIThreadTextRasterizeWait` |
| Memory/lifetime | `ElementCreated`, `ElementDestroyed`, `ReferenceTrackingStarted`, `ReferenceTrackingCompleted`, `ReferenceTrackingCleanup`, `ReferenceTrackerCollected`, `OfferResources`, `ReclaimResources`, `ExportHeapHandle`, `MemoryUpdateAllocationDCompSurface`, `MemoryUpdateAllocationSystemMemoryBits`, `OfferableSoftwareBitmapAlloc`, `OfferableSoftwareBitmapFree` |
| Navigation/media/miscellaneous | `FrameNavigating`, `FrameNavigated`, `PlaySound`, `GetSoundPlayerService`, `TimedTextCue`, `CompositorSetMedia`, `SurfaceImageSourceBeginDraw`, `SurfaceImageSourceEndDraw`, `VirtualSurfaceImageSourceUpdatePriority`, `FailureEncountered` |

## Self-describing events on `Microsoft-Windows-XAML`

### Lifecycle and general performance

| Event | Important payloads | Interpretation |
|---|---|---|
| `PublicApiCall` | `IsStart`, `ObjectPointer`, `MethodName`, `HR` | Public API duration and failure result. Pair by method/object and nesting. |
| `PerfXamlEvent` | `IsStart`, `ObjectPointer`, `EventName`, `IsInteresting` | Named framework/control operation. `IsInteresting` marks a region likely to affect a frame. |
| `CreateDesktopWindow` | `IsStart`, `ObjectPointer` | Desktop WinUI window construction boundary. |
| `ErrorAdditionalInformation` | `Message` | Additional release-build error context. |
| `PointerInputReentrancyDetected` | `SupersededMessageId`, `NewMessageId` | Nested pointer processing replaced an in-progress message. |
| `WebView2_CreateCoreObjects` | `IsStart`, `ObjectPointer` | WebView2 core-object creation duration. |
| `WebView2_TryCompleteInitialization` | `IsStart`, `ObjectPointer` | WebView2 initialization-completion attempt. |
| `WebView2_FireNavigationCompleted` | `ObjectPointer`, `hasEventHandlers` | Navigation completed and whether app handlers were present. |
| `WebView2_DragStartingCallback_Failed` | `HR`, `ErrorMessage` | WebView2 drag-start failure before content classification. |
| `WebView2_DragStartingCallback_WithContentType_Failed` | `HR`, `ContentType`, `ErrorMessage` | WebView2 drag-start failure with classified content. |
| `MapControl_InitializeWebMap` | `IsStart`, `ObjectPointer` | MapControl web-map initialization duration. |
| `MapControl_WebViewNavigationCompleted` | `ObjectPointer` | MapControl's embedded WebView navigation completed. |
| `MapControl_WebMessageReceived_Error` | `ObjectPointer`, `Message` | MapControl web-message processing error. |

Known `PerfXamlEvent.EventName` values include:

- `ContentDialog::ShowAsync[WithPlacement]`
- `DWXS::Initialize`
- `FlyoutBase::ShowAt[WithOptions]`
- `MenuFlyout::ShowAt`
- `WXM::InitializeForCurrentThread`

Additional dynamic TraceLogging event names on this provider describe binding,
dependency-object, heap, resource, timer, refresh-clock, visual-state, and scheduling
operations. Their event names are descriptive and their ETL schema is authoritative.
Common examples include `Application_LoadComponent`, `CoreServices_Frame`,
`DependencyObject_Enter`, `DispatcherTimer_Start`, `DispatcherTimer_Stop`,
`DispatcherTimer_Tick`, `DispatcherTimer_TickComplete`,
`EventManager_RaiseLoadedEvent`, `FrameworkElement_ApplyTemplate`,
`ResourceLookup_Dictionary`, `ResourceLookup_MergedDictionary`,
`ResourceLookup_ThemeDictionary`, `ResourceLookup_ResourceFound`,
`ResourceLookup_ImplicitStyle`, `ResourceLookup_OnStyleChanged`,
`VisualStateManager_GoToStateOptimized`, and `BuildTreeService_OutOfWork`.

### Image pipeline

| Phase | Events | Correlation/payload |
|---|---|---|
| Source | `SetUriSource`, `SetStreamSource`, `SetSoftwareBitmap`, `SetLoadedImageSurfaceUri`, `SetLoadedImageSurfaceMemory` | `Id`; URI where applicable |
| Download/cache | `QueueProcessDownload`, `WaitForDownloadInProgress`, `FoundCompletedDownload`, `ImageDownloadCompleteNotification`, `CreateImageCache`, `FoundImageCache`, `CreateImageCacheFromExistingEncodedData` | `Id`, URI, cache/decode flags |
| Metadata | `ParseImageMetadataStart`, `ParseImageMetadataStop` | `Id`, `parseHR` |
| Decode sizing | `RequestDecodeToRenderSize`, `DecodeToRenderSizeDisqualified`, `DecodeToRenderSizeStart`, `DecodeToRenderSizeStop` | state, requested/source/metadata dimensions, reason |
| Decode scheduling | `QueueProcessDecodeRequests`, `ProcessDecodeRequests`, `QueueDecodeFromImageCache`, `QueueOffThreadDecode` | `Id`, URI, state |
| Decode execution | `OffThreadDecodeStart`, `OffThreadDecodeStop`, `DecodeResultAvailable` | `Id`, URI, hardware-decode flag, result |
| Recovery | `SoftwareBitmapFallbackAfterUploadError`, `PresentBitmapDuringDeviceLoss` | `Id`, upload result |

### Scheduler and graphics

| Event | Important payload/meaning |
|---|---|
| `ImageTaskDispatcher_QueueTask` | Whether a deferred invoke was queued and pending task count |
| `ImageTaskDispatcher_Execute` | Batch size entering UI-thread image work |
| `ImageTaskDispatcher_Execute_End` | Work queued by the batch and remaining task count |
| `Dispatch_EnqueueDeferredInvoke`, `Dispatch_DequeueDeferredInvoke` | Deferred invoke queue flow |
| `Dispatch_StartDispatcherQueueTimer`, `Dispatch_DispatcherQueueTimerCallback` | Tick scheduling boundary |
| `Dispatch_PauseDispatch`, `Dispatch_ResumeDispatch`, `Dispatch_ReentrancyBlocked` | Dispatch suppression/reentrancy |
| `Scheduling_QueueTick`, `Scheduling_UIThreadRequest`, `Scheduling_RenderThreadWaitForWork` | UI/render scheduling decisions |
| `Scheduling_ClockAdvancedDuringTick`, `Scheduling_RequestAdditionalFrameOutsideTick` | Unexpected or additional frame scheduling |
| `RenderWalk_RenderElement` | Per-element render-walk detail |
| `FlowLayoutAlgorithm_Measure`, `FlowLayoutAlgorithm_Generate`, `FlowLayoutAlgorithm_Generate_CurrentBounds` | Flow-layout measurement, generation, anchor, bounds, and current-index detail |
| `BuildTreeScheduler_OutOfWork` | Repeater build-tree scheduler became idle |
| `ScrollPresenter_ValuesChanged`, `ScrollPresenter_TryUpdatePosition*`, `TryUpdateScale*` | Scroll/zoom state and requested update parameters |
| `ASBSuggestionListOpened`, `ASBSuggestionSelectionChanged` | AutoSuggestBox suggestion-list lifecycle and selection changes |

## Operational events on `Microsoft.UI.Xaml`

These events are self-describing. Many use Microsoft telemetry keywords, so capture the
provider without a restrictive low-bit keyword mask.

| Area | Events |
|---|---|
| Failure/error | `XamlFailFast`, `ListViewBaseSerializationInvalidWrite`, `ModernPanelGuard`, `NoColorGlyphRendering` |
| Startup/hosting | `FirstUiThreadFrameEnd`, `DesktopWindowXamlSource-LoadedFrameworks`, `DesktopWindowXamlSource-NewMaxActive`, `XamlIslandRoot-NewMaxArea` |
| Device | `SharedD3DDevice_CreateShared`, `SharedD3DDevice_CreateUnShared`, `SharedD3DDevice_UseShared`, `SharedD3DDevice_SharedLost`, `SharedD3DDevice_PreviouslySharedLost`, `SharedD3DDevice_NonSharedLost` |
| Resource lookup | `ResourceLookup_Start`, `ResourceLookup_Stop` |
| Runtime aggregates | `RuntimeProfiler`, `GCDuration`, `MediaTransportControlsStatistics`, `XAMLHCColor` |
| Controls/behavior | `ConnectedAnimation_TryStart`, `ConnectedAnimation_TryStart_CoordinatedElements`, `ContainerRecyclingLifetimeStats`, `PasswordBoxShowPassword`, `SeZoZoom`, `SplitMenuFlyoutItem-PrimaryButtonClicked`, `SplitMenuFlyoutItem-SubMenuOpened`, `TextBox_Clear_Event` |
| Parser/conditions | `XamlConditionEvaluated` |

## Controls providers

`Microsoft.UI.Xaml.Controls.Debug` emits a `Message` field. Info events use level 4 and
verbose events use level 5. `Microsoft.UI.Xaml.Controls.Perf` emits an `Info` field at
level 4.

| Component | Debug events | Perf event |
|---|---|---|
| AnnotatedScrollBar | `AnnotatedScrollBarInfo`, `AnnotatedScrollBarVerbose` | `AnnotatedScrollBarPerf` |
| CommandBarFlyout | `CommandBarFlyoutInfo`, `CommandBarFlyoutVerbose` | none currently emitted |
| InkToolBar | `InkToolbarInfo`, `InkToolbarVerbose` | none currently emitted |
| ItemContainer | `ItemContainerInfo`, `ItemContainerVerbose` | `ItemContainerPerf` |
| ItemsRepeater | `ItemsRepeaterInfo`, `ItemsRepeaterVerbose` | `ItemsRepeaterPerf` |
| ItemsView | `ItemsViewInfo`, `ItemsViewVerbose` | `ItemsViewPerf` |
| LinedFlowLayout | `LinedFlowLayoutInfo`, `LinedFlowLayoutVerbose` | `LinedFlowLayoutPerf` |
| NavigationView | `NavigationViewInfo`, `NavigationViewVerbose` | `NavigationViewPerf` |
| PullToRefresh | `PTRInfo`, `PTRVerbose` | `PTRPerf` |
| ScrollPresenter | `ScrollPresenterInfo`, `ScrollPresenterVerbose` | `ScrollPresenterPerf` |
| ScrollView | `ScrollViewInfo`, `ScrollViewVerbose` | `ScrollViewPerf` |
| SelectorBar | `SelectorBarInfo`, `SelectorBarVerbose` | `SelectorBarPerf` |
| SwipeControl | `SwipeControlInfo`, `SwipeControlVerbose` | `SwipeControlPerf` |
| TabView | `TabViewInfo`, `TabViewVerbose` | `TabViewPerf` |
| TitleBar | `TitleBarInfo`, `TitleBarVerbose` | `TitleBarPerf` |

`MuxActivationBypass(IsActive, FailureReason, ExpectedPath)` is emitted once by the Debug
provider and can explain activation-path differences.

## Diagnostics provider

`Microsoft-Windows-XAML-Diagnostics` contains verbose visual-tree/source/binding events and
detailed input pairs. Useful families include:

- `ElementCreatedWithSource`, `ElementAdded`, `ElementRemoved`, `PeerCreated`,
  `ElementAccessibility`, `ElementSource`, and `ImageSourceRelation`
- `PropertyChanged`, `ResourceDictionaryAddWithSource`, `ResourceUsingXName`
- `UpdateTargetBinding`, `UpdateSourceBinding`, `UpdateLayout`, `MeasureOverride`,
  `ArrangeOverride`, `InvalidateMeasure`, and `InvalidateArrange`
- pointer, gesture, manipulation, drag/drop, and `InputEvent` start/stop pairs
- designer-host lifecycle events, which are not normally relevant to a retail app

Enable this provider only for a focused trace. Correlate its object/peer handles with the
main provider inside the same process and trace; never treat handles as stable identifiers.

## Declared but not currently emitted

The current runtime manifest declares some legacy events for which no product runtime emit
site exists. Do not treat their absence as diagnostic evidence:

- `ApplicationStarting`
- `VideoCaptureFrame`
- `GraphicsDriverSupportedForVideoDecode`
- `MediaFullScreenState`
- `MediaOverlapState`
- `BitmapCacheCreated`
- `BitmapCacheDestroyed`
- `BitmapCacheUpdated`

This distinction is version-specific: a different Windows App SDK build can add, remove, or
restore an emitter while retaining a compatible manifest declaration.
