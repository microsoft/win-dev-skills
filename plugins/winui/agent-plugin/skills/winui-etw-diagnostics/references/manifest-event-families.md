# Complete manifest event-family index

This is the complete manifest family index for the analyzed WinUI runtime version. A family can contain multiple event IDs, versions, opcodes, levels, or payload templates. Availability and active emit sites can differ by Windows App SDK version; the matching ETL manifest remains authoritative.

Source provenance: `microsoft/microsoft-ui-xaml` commit
`2f88d24861f19237350437f6f818ede0600bd375`.

## Microsoft-Windows-XAML

| Family | Events | Opcodes | Levels | Keywords | Payload templates |
|---|---:|---|---|---|---|
| `AcceleratorKeyActivated` | 1 | Info | Informational | Input | KeyData |
| `AccessKeyScopeBuilderConstructScope` | 2 | Start, Stop | Informational | Input | (none) |
| `AccessKeyScopeInvoke` | 2 | Start, Stop | Informational | Input | (none) |
| `AddToCollectionOnCurrentInstance` | 2 | Start, Stop | Diagnostic | Core | SimpleEvent |
| `Animation` | 1 | Info | Informational | Animation | BeginAnimationData |
| `ApiFunctionCall` | 2 | Start, Stop | Debugging | ApiCall | ApiFunctionCallStart, ApiFunctionCallStop |
| `ApiPropertyGetValue` | 2 | Start, Stop | Debugging | ApiCall | ApiPropertyAccessor, ElementIdData |
| `ApiPropertySetValue` | 2 | Start, Stop | Debugging | ApiCall | ApiPropertyAccessor, ElementIdData |
| `ApplicationLoadComponent` | 2 | Start, Stop | Informational | Appmodel | ComponentNameData, SimpleEvent |
| `ApplicationResume` | 2 | Start, Stop | Verbose | Appmodel | SimpleEvent |
| `ApplicationStarted` | 1 | Info | Informational | Appmodel | SimpleEvent |
| `ApplicationStarting` | 1 | Info | Informational | Appmodel | SimpleEvent |
| `ApplicationStartup` | 1 | Info | Informational | Appmodel | SimpleEvent |
| `ApplicationSuspend` | 2 | Start, Stop | Verbose | Appmodel | SimpleEvent |
| `ApplyTemplate` | 2 | Start, Stop | Informational | Layout | ElementIdClassNameData, SimpleEvent |
| `Arrange` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `ArrangeElement` | 2 | Start, Stop | Verbose | Detailed | ArrangeElementBeginData, ArrangeElementEndData |
| `AsyncImageDecoderFrameNotReady` | 1 | Info | Informational | Images | (none) |
| `BeginStoryboard` | 1 | Info | Informational | Animation | BeginStoryboardData |
| `BindEnterpriseId` | 1 | Info | Informational | Images | ElementIdNameData |
| `BitmapCacheCreated` | 1 | Info | Verbose | CachedComposition | CacheIdData |
| `BitmapCacheDestroyed` | 1 | Info | Verbose | CachedComposition | CacheIdData |
| `BitmapCacheUpdated` | 1 | Info | Verbose | CachedComposition | CacheUpdatedData |
| `BlockOnGPU` | 2 | Start, Stop | Verbose | Rendering | BlockOnGPUData |
| `CachedBoundsStats` | 4 | Info | Informational | Input | CachedBoundsStatsData |
| `CancelTransitions` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CaptureDrawFrame` | 1 | Info | Informational | Rendering | ElementNameData |
| `CCoreServicesOnResume` | 1 | Info | Informational | Rendering | SimpleEvent |
| `CCoreServicesOnSuspend` | 1 | Info | Informational | Rendering | SimpleBoolean |
| `CCoreServicesSetWindowVisibility` | 1 | Info | Informational | Rendering | SimpleBoolean |
| `CCoreServicesStartSoftSuspendTimer` | 1 | Info | Informational | Rendering | SimpleEvent |
| `CCoreServicesStopSoftSuspendTimer` | 1 | Info | Informational | Rendering | SimpleEvent |
| `ChangeSelection` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `CheckAutomaticAutomationChanges` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `CheckAutomaticAutomationChangesPopup` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `CheckForStaleDxgiDevice` | 1 | Info | Informational | Rendering | CheckForStaleDxgiDevice |
| `ClrShutdown` | 2 | Start, Stop | Informational | Managed | SimpleEvent |
| `ClrStartup` | 2 | Start, Stop | Informational | Managed | SimpleEvent |
| `CommitDCompCommand` | 1 | Info | Informational | Rendering | CommitDCompCommand |
| `CommitMainDevice` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CommitSecondaryDevice` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CompNodeOffset` | 1 | Info | Verbose | Input | CompNodeOffsetInfoData |
| `CompositorLock` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CompositorSetMedia` | 1 | Info | Informational | Media | CompositorSetMediaSwapchain |
| `CompTreeCleanupVisual` | 1 | Info | Verbose | DComp | CompTreeCleanupVisualData |
| `CompTreeCreateMediaNode` | 1 | Info | Verbose | DComp | CompTreeCreateNodeData |
| `CompTreeCreateRedirectedNode` | 1 | Info | Verbose | DComp | CompTreeCreateRedirectedNodeData |
| `CompTreeCreateRenderDataNode` | 1 | Info | Verbose | DComp | CompTreeCreateRenderDataNodeData |
| `CompTreeCreateSwapChainNode` | 1 | Info | Verbose | DComp | CompTreeCreateNodeData |
| `CompTreeCreateTreeNode` | 1 | Info | Verbose | DComp | CompTreeCreateTreeNodeData |
| `CompTreeInsertChild` | 1 | Info | Verbose | DComp | CompTreeInsertChildData |
| `CompTreeRemoveChild` | 1 | Info | Verbose | DComp | CompTreeRemoveChildData |
| `CompTreeRemoveCompositionPeer` | 1 | Info | Verbose | DComp | CompTreeCompositionPeerData |
| `CompTreeRemoveFromParent` | 2 | Start, Stop | Verbose | DComp | CompTreeRemoveFromParentData |
| `CompTreeSetCompositionPeer` | 1 | Info | Verbose | DComp | CompTreeCompositionPeerData |
| `CompTreeSetPrimitiveGroup` | 1 | Info | Verbose | DComp | CompTreeSetPrimitiveGroupData |
| `CompTreeSetRedirectionTarget` | 1 | Info | Verbose | DComp | CompTreeSetRedirectionTargetData |
| `ComputeSnappingMode` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `ComputeVsisBounds` | 1 | Info | Informational | Rendering | ComputeVsisBoundsData |
| `ContentOffsets` | 1 | Info | Verbose | Input | ContentOffsetsInfoData |
| `CoreServicesCreate` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `CoreServicesReset` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `CoreWebViewHostInvoke` | 1 | Info | Informational | (none) | WebViewHostInvoke |
| `CoreWebViewSetWindowlessFocus` | 1 | Info | Informational | (none) | CoreWebViewSetWindowlessFocus |
| `CreateAcceleratedGraphics` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CreateDManipSharedTransform` | 1 | Info | Informational | DComp | SimpleEvent |
| `CreateGraphicsDevice` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CreateInstance` | 2 | Start, Stop | Diagnostic | Core | CreateInstance, SimpleEvent |
| `CreateResourceManager` | 2 | Start, Stop | Informational | Core | (none) |
| `CreateSwapChain` | 1 | Info | Informational | Rendering | SwapChainData |
| `CreateSwipeRecognizer` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `CreateViewportInteraction` | 1 | Info | Informational | Input | CreateViewportInteraction |
| `CreateWindow` | 2 | Start, Stop | Informational | Appmodel | SimpleEvent |
| `CreatingHardwareCompositor` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CreatingMetaSurface` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `CurveSegment` | 1 | Info | Verbose | Input | CurveSegmentInfoData |
| `DCompAddPrimitiveToRenderDataList` | 1 | Info | Verbose | DComp | DCompAddPrimitiveToRenderDataListData |
| `DCompAddToTree` | 1 | Info | Informational | Rendering | DCompAddToTree |
| `DCompAddTransformToGroup` | 1 | Info | Verbose | DComp | DCompAddTransformToGroupData |
| `DCompAppendChild` | 1 | Info | Informational | (none) | DCompAppendChild |
| `DCompCreatePrimitive` | 1 | Info | Verbose | DComp | DCompCreatePrimitiveData |
| `DCompCreateTransform` | 1 | Info | Verbose | DComp | DCompCreateTransformData |
| `DCompCreateTransformGroup` | 1 | Info | Verbose | DComp | DCompCreateTransformGroupData |
| `DCompCreateVisual` | 2 | Info | Informational, Verbose | DComp, Rendering | DCompCreateVisualData, DCompLogVisual |
| `DCompInsertChild` | 1 | Info | Verbose | DComp | DCompInsertChildData |
| `DCompInsertPrimitiveAtHead` | 1 | Info | Verbose | DComp | DCompInsertPrimitiveAtHeadData |
| `DCompLinkPrimitive` | 1 | Info | Verbose | DComp | DCompLinkPrimitiveData |
| `DCompMergePrimitiveGroup` | 1 | Info | Verbose | DComp | DCompMergePrimitiveGroupData |
| `DCompRemove2DTransform` | 1 | Info | Informational | Rendering | DCompLogVisual |
| `DCompRemove3DTransform` | 1 | Info | Informational | Rendering | DCompLogVisual |
| `DCompRemoveChild` | 1 | Info | Verbose | DComp | DCompRemoveChildData |
| `DCompRemoveFromTree` | 1 | Info | Informational | Rendering | DCompLogVisual |
| `DCompRemovePrimitive` | 1 | Info | Verbose | DComp | DCompRemovePrimitiveData |
| `DCompSet2DTransform` | 2 | Info | Informational, Verbose | DComp, Rendering | DCompSet2DTransform, DCompSetTransformData |
| `DCompSet3DTransform` | 1 | Info | Informational | Rendering | DCompLogVisual |
| `DCompSetClip` | 2 | Info | Informational, Verbose | DComp, Rendering | DCompLogVisual, DCompSetClipData |
| `DCompSetMediaEngineSwapchainHandle` | 1 | Info | Informational | Rendering | DCompUpdateSwapChain |
| `DCompSetOpacity` | 1 | Info | Verbose | DComp | DCompSetOpacityData |
| `DCompSetPrimitiveGroup` | 1 | Info | Verbose | DComp | DCompSetPrimitiveGroupData |
| `DCompSetSwapChain` | 1 | Info | Informational | Rendering | DCompUpdateSwapChain |
| `DCompSetTransformValue` | 1 | Info | Verbose | DComp | DCompSetTransformValueData |
| `DCompSnapshotBounds` | 1 | Info | Informational | (none) | ArrangeElementBeginData |
| `DCompSplitPrimitiveGroup` | 1 | Info | Verbose | DComp | DCompSplitPrimitiveGroupData |
| `DCompUpdateContentSize` | 1 | Info | Informational | Rendering | DCompUpdateSwapChain |
| `DecodeGreaterThanRenderSize` | 1 | Info | Informational | Images | DecodeToRenderSizeData |
| `DecodeSizeQuery` | 2 | Start, Stop | Verbose | Images | SimpleEvent |
| `DecodeStreamForImage` | 1 | Info | Verbose | Images | DecodedImageData |
| `DecodeToRenderSize` | 4 | Info, Start, Stop | Informational, Verbose | Images | DecodeToRenderSizeData, ImageReferenceData |
| `DecodeToRenderSizeDisabled` | 2 | Info | Informational | Images | DecodeToRenderSizeDisabledData, DRSDisabledWithKeyData |
| `DecodeToSurface` | 2 | Start, Stop | Informational | Images | SimpleEvent |
| `DestroySwipeRecognizer` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmCompositorContentValuesUpdate` | 2 | Start, Stop | Informational | Input | DmContentData, DmContentValuesData |
| `DmCompositorViewportAdded` | 1 | Info | Informational | Input | DmViewportContainerData |
| `DmCompositorViewportRemoved` | 1 | Info | Informational | Input | DmViewportContainerData |
| `DmCompositorViewportValuesUpdate` | 2 | Start, Stop | Informational | Input | DmViewportData, DmViewportValuesData |
| `DmContentValuesUpdate` | 2 | Start, Stop | Informational | Input | DmContentData, DmContentValuesData |
| `DmCrossSlideContainerCompleted` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmInitialize` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmPointerHitTest` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmSetContact` | 1 | Info | Informational | Input | DmViewportData |
| `DmSetCrossSlideContainer` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmStartCrossSlideContainers` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `DmViewportStatus` | 1 | Info | Informational | Input | DmViewportStatusData |
| `DmViewportStatusUpdate` | 2 | Start, Stop | Informational | Input | DmViewportData, DmViewportStatusData |
| `DmViewportValuesUpdate` | 2 | Start, Stop | Informational | Input | DmViewportData, DmViewportValuesData |
| `DownloadRequest` | 2 | Start, Stop | Verbose | Detailed | SimpleEvent |
| `DownloadRequestBinding` | 2 | Start, Stop | Informational | Images | FailureCode, IdData |
| `DownloadRequestDataAvailable` | 1 | Info | Informational | Images | IdSize |
| `DownloadRequestQueue` | 1 | Info | Informational | Images | IdStringValue |
| `DrawFrameRateCounter` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `DynamicTimeline` | 2 | Start, Stop | Informational | Animation | SimpleEvent |
| `ElementCreated` | 1 | Info | Verbose | Detailed | ElementIdData |
| `ElementDestroyed` | 1 | Info | Verbose | Detailed | ElementIdData |
| `ElementSetName` | 1 | Info | Verbose | Detailed | ElementIdNameData |
| `ElementStyleChanged` | 1 | Info | Verbose | Core | ElementStyleChangedData |
| `EndStoryboard` | 1 | Info | Informational | Animation | ElementIdData |
| `EventCallback` | 2 | Start, Stop | Informational | Core | CallbackNameData, SimpleEvent |
| `ExportHeapHandle` | 1 | Info | Informational | (none) | HeapHandle |
| `ExtendSelectionRange` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `ExtendToBlockBoundaries` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `ExternalAtlasSizeOverride` | 1 | Info | Informational | (none) | SimpleElementWidthHeight |
| `FailureEncountered` | 1 | Info | Informational | Stackwalk | FailureCode |
| `FaultInBehavior` | 2 | Start, Stop | Verbose | Parser | FaultInBehavior |
| `FeedSwipeRecognizer` | 3 | Info, Start, Stop | Informational, Verbose | Input | PointerData, SimpleEvent |
| `FindBackgroundPrimitive` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `FindObjectsOfType` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `FindTrackerTargets` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `FireEffectiveViewportChanged` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `FireLayoutUpdated` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `FireSizeChanged` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `Frame` | 3 | Info, Start, Stop | Informational, Verbose | Layout | SimpleBoolean, SimpleEvent |
| `FrameNavigated` | 1 | Info | Informational | Appmodel | FrameNavigationData |
| `FrameNavigating` | 1 | Info | Informational | Appmodel | FrameNavigationData |
| `GenerateContainer` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `GenerateItems` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `GenerateMCContainer` | 2 | Start, Stop | Informational | Core | SetupCCCIndex, SimpleEvent |
| `GetBuiltInStyle` | 2 | Start, Stop | Informational | Parser | ClassNameData, SimpleEvent |
| `GetCompressedImageSize` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `GetElementCount` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `GetSoundPlayerService` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `GraphicsDriverSupportedForVideoDecode` | 1 | Info | Informational | Media | GraphicsDriverSupportedForVideoTemplateData |
| `HardwareDecodeFrame` | 2 | Start, Stop | Informational | Media | SimpleEvent |
| `HitTest` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `HitTestStats` | 1 | Info | Informational | Input | HitTestStatsData |
| `HubSectionCount` | 1 | Info | Informational | Controls | HubSectionCountData |
| `HWCompNodeUpdate` | 2 | Start, Stop | Verbose | (none) | ElementIdData, SimpleEvent |
| `ImageAnimationEnd` | 1 | Info | Informational | Images | SimpleEvent |
| `ImageCacheDecode` | 2 | Start, Stop | Informational | Images | URITemplate |
| `ImageCacheDownload` | 2 | Start, Stop | Informational | Images | URITemplate |
| `ImageCopyToVideoMemory` | 2 | Start, Stop | Verbose | Images | IdData |
| `ImageDownloadAvailable` | 2 | Start, Stop | Verbose | Images | ImageReferenceData |
| `ImageEnsureAndUpdateHardwareResources` | 2 | Start, Stop | Verbose | Images | ImageReferenceData |
| `ImageRequestDecode` | 3 | Info, Start, Stop | Verbose | Images | ImageReferenceData, ImageReferenceDataWithStateAndSize |
| `ImageResetForSourceChange` | 2 | Start, Stop | Verbose | Images | ImageReferenceData |
| `ImageSetSource` | 2 | Start, Stop | Verbose | Images | IdData |
| `ImageSetSourceFromUri` | 2 | Start, Stop | Verbose | Images | ImageReferenceData |
| `ImageUpdateHardwareResources` | 2 | Start, Stop | Verbose | Images | IdData |
| `ImageUsesColorTransform` | 1 | Info | Informational | Images | SimpleEvent |
| `IndividualSizeChanged` | 2 | Start, Stop | Informational | Layout | ElementIdData, SimpleEvent |
| `InitializeCore` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `InitializeMediaEffect` | 1 | Info | Informational | Media | InitializeMediaEffect |
| `InitializeMetadataStore` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `InitializeText` | 2 | Start, Stop | Informational | Text | (none) |
| `KeyDown` | 2 | Start, Stop | Informational | (none) | KeyDownData |
| `KeyDownHandler` | 2 | Start, Stop | Verbose | (none) | HandledData, KeyHandlerData |
| `KeyEvent` | 2 | Start, Stop | Verbose | (none) | SimpleEvent |
| `KeyTipsVisualChanging` | 1 | Info | Informational | Input | (none) |
| `KeyUp` | 2 | Start, Stop | Informational | (none) | KeyData |
| `KeyUpHandler` | 2 | Start, Stop | Verbose | (none) | HandledData, KeyHandlerData |
| `Layout` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `LoadTemplateContent` | 2 | Start, Stop | Verbose | Templates | LoadTemplateContentData, TemplateIdData |
| `ManipulationTransformCreated` | 1 | Info | Verbose | Input | ManipulationTransformInfoData |
| `ManipulationTransformDestroyed` | 1 | Info | Verbose | Input | ManipulationTransformInfoData |
| `ManipulationTransformUpdate` | 1 | Info | Verbose | Input | ManipulationTransformUpdateInfoData |
| `Measure` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `MeasureChild` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `MeasureElement` | 2 | Start, Stop | Verbose | Detailed | MeasureElementBeginData, MeasureElementEndData |
| `MediaElementLegacyFullScreen` | 1 | Stop | Informational | Media | MediaElementLegacyFullScreen |
| `MediaFullScreenState` | 1 | Info | Informational | Media | MediaFullScreenData |
| `MediaOverlapState` | 1 | Info | Informational | Media | MediaOverlapData |
| `MemoryReportPressureToGC` | 1 | Info | Verbose | Core | Size |
| `MemoryUpdateAllocationDCompSurface` | 1 | Info | Verbose | Core | Size |
| `MemoryUpdateAllocationSystemMemoryBits` | 1 | Info | Verbose | Core | Size |
| `MockDCompDump` | 1 | Info | Verbose | Rendering | LargeAnsiString |
| `NavigationCacheGetContent` | 1 | Info | Informational | Appmodel | NavigationCacheGetContentData |
| `NotifyGripperPositionChanged` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `OfferableSoftwareBitmapAlloc` | 1 | Info | Informational | Images | SimpleElementWidthHeight |
| `OfferableSoftwareBitmapFree` | 1 | Info | Informational | Images | IdData |
| `OfferResources` | 2 | Start, Stop | Informational | Rendering | OfferResourcesEndData, SimpleEvent |
| `OfferSystemMemorySurface` | 1 | Info | Informational | Rendering | SystemMemorySurface |
| `OnActivated` | 2 | Start, Stop | Informational | (none) | SimpleEvent |
| `OnLaunchedProtected` | 2 | Start, Stop | Informational | (none) | SimpleEvent |
| `PageRotationAnimationStarted` | 1 | Info | Informational | Rendering | SimpleEvent |
| `PageRotationSnapshotTaken` | 1 | Info | Informational | Rendering | SimpleEvent |
| `ParseXaml` | 2 | Start, Stop | Informational | Parser | URITemplate |
| `PauseStoryboard` | 1 | Info | Informational | Animation | ElementIdData |
| `PerFrameCallback` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `PerfTrackDetection` | 1 | Info | Informational | win:ResponseTime | PerfTrackDetectionData |
| `PlaceElement` | 2 | Start, Stop | Informational | Core | SetupCCCIndex, SimpleEvent |
| `PlaySound` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `PointerCaptureChanged` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerDown` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerEnter` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerHWheel` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerLeave` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerUp` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerUpdate` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PointerWheel` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `PrepareContainer` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `PresentControllerConvertQpcToVBlankNoFrameStats` | 1 | Info | Verbose | Rendering | QPCToVBlankNoFrameStatsData |
| `PresentControllerConvertQpcToVBlankWithFrameStats` | 1 | Info | Verbose | Rendering | QPCToVBlankWithFrameStatsData |
| `PresentControllerFrameOnScreen` | 1 | Info | Verbose | Rendering | FrameOnScreenData |
| `PresentControllerFrameOnScreenMissed` | 1 | Info | Verbose | Rendering | FrameOnScreenMissedData |
| `PresentControllerFrameStatisticsInconsistentVBlank` | 1 | Info | Verbose | Rendering | InconsistentVBlankData |
| `PresentControllerGetFrameStatistics` | 1 | Info | Verbose | Rendering | GetFrameStatisticsData |
| `PresentControllerGetFrameStatisticsDisjoint` | 1 | Info | Verbose | Rendering | ControllerData |
| `PresentControllerPresent` | 1 | Info | Verbose | Rendering | PresentData |
| `PresentControllerPresentBlocked` | 1 | Info | Informational | Rendering | PresentBlockedData |
| `PresentControllerReset` | 1 | Info | Informational | Rendering | ControllerData |
| `PresentControllerSetLatency` | 1 | Info | Informational | Rendering | SetLatencyData |
| `PresentControllerShouldProduceFrame` | 1 | Info | Verbose | Rendering | ShouldProduceFrameData |
| `PresentControllerShouldProduceMultipleFramesPerVBlank` | 1 | Info | Verbose | Rendering | ControllerData |
| `PresentControllerSkippedFrame` | 1 | Info | Informational | Rendering | ControllerData |
| `PresentControllerStateChange` | 1 | Info | Informational | Rendering | ControllerStateChangeData |
| `PrimitiveCompositionDraw` | 2 | Start, Stop | Informational | Rendering | PrimitiveCompositionDrawData, SimpleEvent |
| `PrimitiveCompositionEnsureHardwareResources` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `PrimitiveCompositionGenerateInstances` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `PrimitiveCompositionTexture8BitExpand` | 2 | Start, Stop | Verbose | DComp | SimpleEvent, SurfaceUpdateData |
| `PrimitiveCompositionTextureUpdate` | 2 | Start, Stop | Verbose | Rendering | SimpleEvent, SurfaceUpdateData |
| `PrimitiveCompositionUpdateSurfaces` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `ProcessAlphaModeUpdate` | 2 | Start, Stop | Informational | Rendering | AlphaModeData |
| `ProcessLayoutForTransition` | 2 | Start, Stop | Verbose | Animation | SimpleEvent |
| `ProcessNotifyWindowLayoutCompleted` | 2 | Info | Verbose | Rendering | LayoutCompletedData, NotifyWindowLayoutCompleteData |
| `ProcessPointerInput` | 2 | Start, Stop | Verbose | Input | PointerData, SimpleEvent |
| `ProcessRetarget` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `ProvideStaticResourceReference` | 2 | Start, Stop | Verbose | Core | ProvideStaticResourceReference, SimpleEvent |
| `PutRootVisual` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `PutSource` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `QueueDCompCommand` | 1 | Info | Informational | Rendering | QueueDCompCommand |
| `RaiseAllLoadedEvents` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `RaiseLoadedEvent` | 2 | Start, Stop | Verbose | Core | ElementIdData, SimpleEvent |
| `RealizeDeferredElement` | 2 | Start, Stop | Verbose | Templates | RealizeDeferredElementBeginData, RealizeDeferredElementEndData |
| `RealizeTransition` | 2 | Start, Stop | Informational | Animation | SimpleEvent |
| `RebuildGraphicsDeviceResources` | 2 | Start, Stop | Verbose | Rendering | (none) |
| `ReclaimResources` | 2 | Start, Stop | Informational | Rendering | ReclaimResourcesEndData, SimpleEvent |
| `ReclaimSystemMemorySurface` | 1 | Info | Informational | Rendering | SystemMemorySurface |
| `RecordDeviceAsLost` | 1 | Info | Informational | Rendering | SimpleEvent |
| `RecursiveInvalidateMeasure` | 1 | Info | Informational | Layout | SystemMemorySurface |
| `ReferenceTrackerCollected` | 1 | Info | Verbose | Core | ReferenceTrackerCollected |
| `ReferenceTrackingCleanup` | 1 | Info | Informational | Core | ReferenceTrackingCleanup |
| `ReferenceTrackingCompleted` | 2 | Start, Stop | Informational | Core | ReferenceTrackingCompleted, SimpleEvent |
| `ReferenceTrackingStarted` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `RefreshTemplateBindings` | 2 | Start, Stop | Verbose | Detailed | SimpleEvent |
| `RegisterInputPaneHandler` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `ReleaseDManipSharedTransform` | 1 | Info | Informational | DComp | SimpleEvent |
| `ReleaseGraphicsDeviceResources` | 2 | Start, Stop | Verbose | Rendering | ReleaseGraphicsDeviceResources |
| `ReleaseQueueCleanup` | 2 | Start, Stop | Informational | Core | SimpleEvent |
| `ReleaseSwapChain` | 1 | Info | Informational | Rendering | SwapChainData |
| `RenderElement` | 2 | Start, Stop | Verbose | (none) | ElementIdData, SimpleEvent |
| `RenderTargetBitmapFallback` | 1 | Info | Informational | Images | RenderTargetBitmapFallback |
| `RenderThreadDoNotWait` | 1 | Info | Informational | Rendering | SimpleEvent |
| `RenderThreadFrame` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderThreadLogTimeToNextWork` | 1 | Info | Informational | Rendering | RenderThreadLogTimeToNextWork |
| `RenderThreadPresent` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderThreadRender` | 1 | Info | Informational | Rendering | FrameIdData |
| `RenderThreadSimulateVBlank` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderThreadSkipFrameNotDirty` | 1 | Info | Informational | Rendering | SimpleEvent |
| `RenderThreadWaitForVBlank` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderThreadWaitForWork` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderToSurface` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `RenderWalk` | 3 | Start, Stop | Informational | Rendering | RenderWalkElementCounts, SimpleEvent |
| `RequestFrameReason` | 1 | Info | Informational | Rendering | RequestFrameReasonTemplate |
| `ResettingMetaSurfaces` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `ResizeSwapChain` | 1 | Info | Informational | Rendering | SwapChainData |
| `ResourceDictionaryAdd` | 1 | Info | Verbose | Core | ResourceDictionaryAddData |
| `ResourceDictionaryClear` | 1 | Info | Verbose | Core | ResourceDictionaryClearData |
| `ResourceDictionaryRemove` | 1 | Info | Verbose | Core | ResourceDictionaryRemoveData |
| `ResumeStoryboard` | 1 | Info | Informational | Animation | ElementIdData |
| `SetAlphaModeSwapChain` | 1 | Info | Informational | Rendering | SwapChainData |
| `SetConnectionID` | 2 | Start, Stop | Diagnostic | Core | SimpleEvent |
| `SetCustomRuntimeDataForDeferredElement` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `SetCustomRuntimeDataForResourceDictionary` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `SetCustomRuntimeDataForStyle` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `SetCustomRuntimeDataForVSM` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `SetCustomRuntimeDataOnCurrentInstance` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `SetMaximumFrameLatency` | 1 | Info | Informational | Rendering | FrameCountData |
| `SetNameOnCurrentInstance` | 2 | Start, Stop | Diagnostic | Core | SetName, SimpleEvent |
| `SetTemplateOwner` | 1 | Info | Verbose | Templates | SetTemplateOwnerData |
| `SetupCCC` | 2 | Start, Stop | Informational | Controls | SetupCCCIndex, SimpleEvent |
| `SetValueOnCurrentInstance` | 2 | Start, Stop | Diagnostic | Core | SetValueOnCurrentInstance, SimpleEvent |
| `SetViewportInteraction` | 1 | Info | Informational | Input | SetViewportInteraction |
| `ShowWindow` | 2 | Start, Stop | Informational | Appmodel | SimpleEvent |
| `StopStoryboard` | 1 | Info | Informational | Animation | ElementIdData |
| `SubmitAlphaModeUpdate` | 2 | Start, Stop | Informational | Rendering | AlphaModeData |
| `SubmitFrame` | 3 | Info, Start, Stop | Informational | Rendering | FrameIdData, SimpleEvent |
| `SubmitNotifyWindowLayoutCompleted` | 2 | Info | Verbose | Rendering | LayoutCompletedData, NotifyWindowLayoutCompleteData |
| `SubmitNotifyWindowResized` | 1 | Info | Verbose | Rendering | NotifyWindowLayoutCompleteData |
| `SubmitRetarget` | 2 | Start, Stop | Informational | Rendering | SimpleEvent |
| `SurfaceImageSourceBeginDraw` | 1 | Info | Informational | Rendering | SurfaceImageSourceBeginDrawData |
| `SurfaceImageSourceEndDraw` | 1 | Info | Informational | Rendering | SurfaceImageSourceEndDrawData |
| `SwipeUnrecognized` | 1 | Info | Informational | Input | SimpleEvent |
| `Swiping` | 2 | Start, Stop | Informational | Input | SimpleEvent |
| `SystemMemorySurfaceAllocate` | 1 | Info | Informational | Rendering | SystemMemorySurfaceAllocateData |
| `SystemMemorySurfaceFree` | 1 | Info | Informational | Rendering | SystemMemorySurfaceFreeData |
| `TextureAtlasAllocate` | 1 | Info | Informational | Rendering | TextureAtlasData |
| `TextureAtlasEntryAllocate` | 1 | Info | Verbose | Rendering | TextureAtlasEntryData |
| `TextureAtlasEntryFree` | 1 | Info | Verbose | Rendering | TextureAtlasEntryData |
| `TextureAtlasFree` | 1 | Info | Informational | Rendering | IdData |
| `TextureAtlasUtilization` | 1 | Info | Informational | Rendering | TextureAtlasUtilizationData |
| `ThemeChanged` | 2 | Start, Stop | Informational | Core | (none) |
| `ThreadedJobQueueInactivity` | 1 | Info | Verbose | Core | IdData |
| `ThreadedJobQueueJob` | 2 | Start, Stop | Verbose | Core | IdCorrelation |
| `ThreadedJobQueueShutdownWait` | 2 | Start, Stop | Verbose | Core | FailureCode, IdData |
| `ThreadedJobQueueSubmitJob` | 1 | Info | Verbose | Core | IdCorrelation |
| `ThreadedJobQueueThreadLifetime` | 2 | Start, Stop | Verbose | Core | IdData |
| `ThreadedJobQueueUpdateExternalRef` | 1 | Info | Verbose | Core | IdUintValue |
| `ThreadedJobQueueWait` | 2 | Start, Stop | Verbose | Core | IdData |
| `Tick` | 1 | Info | Informational | Core | TickData |
| `TickPausedAnimation` | 1 | Info | Informational | Animation | AnimationData |
| `TouchHitTesting` | 2 | Start, Stop | Verbose | Input | FloatRectData, SimpleEvent |
| `TouchSelectionGripperHideBegin` | 1 | Info | Informational | Input | TextSelectionGripperData |
| `TouchSelectionGripperHideEnd` | 1 | Info | Informational | Input | TextSelectionGripperData |
| `TouchSelectionGripperReposition` | 1 | Info | Informational | Input | TextSelectionGripperData |
| `TouchSelectionGripperShowBegin` | 1 | Info | Informational | Input | TextSelectionGripperData |
| `TouchSelectionGripperShowEnd` | 1 | Info | Informational | Input | TextSelectionGripperData |
| `TouchSelectionGripperTetherBegin` | 1 | Info | Informational | Input | SimpleEvent |
| `TouchSelectionGripperTetherEnd` | 1 | Info | Informational | Input | SimpleEvent |
| `UIThreadCallback` | 2 | Start, Stop | Verbose | Core | SimpleEvent |
| `UIThreadSoftwareRasterizeWait` | 2 | Start, Stop | Verbose | Rendering | SimpleEvent |
| `UIThreadTextRasterizeWait` | 2 | Start, Stop | Verbose | Rendering | SimpleEvent |
| `UIThreadWaitGPUWork` | 2 | Start, Stop | Verbose | Rendering | SimpleEvent |
| `UpdateDependencyPropertiesForSCR` | 1 | Info | Informational | DComp | SimpleEvent |
| `UpdateFocus` | 2 | Start, Stop | Informational | Input | ElementIdData, SimpleEvent |
| `UpdateInputScope` | 2 | Info | Informational | (none) | IKSkin, InputScope |
| `UpdateLogicalScrollData` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `VideoCaptureFrame` | 1 | Info | Informational | Media | SimpleEvent |
| `VideoStreamSize` | 1 | Info | Informational | Media | SimpleElementWidthHeight |
| `VirtualizationAdd` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `VirtualizationCleanup` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `VirtualizationIsEnabledByLayout` | 2 | Info | Informational | Controls | EnabledWithElementData, VirtualizationEnabledStateData |
| `VirtualizationIsEnabledByModernPanelUsage` | 2 | Info | Informational | Controls | EnabledWithElementData, VirtualizationEnabledStateData |
| `VirtualizationMeasure` | 2 | Start, Stop | Informational | Layout | SimpleEvent |
| `VirtualizedCollectionBounds` | 1 | Info | Informational | Input | VirtualizedCollectionBoundsData |
| `VirtualizedCollectionUpdated` | 1 | Info | Informational | Input | VirtualizedCollectionUpdatedData |
| `VirtualizedItemAdded` | 1 | Info | Verbose | Input | VirtualizedItemAddedData |
| `VirtualizedItemRemoved` | 1 | Info | Verbose | Input | VirtualizedItemRemovedData |
| `VirtualizedItemUpdated` | 1 | Info | Verbose | Input | VirtualizedItemUpdatedData |
| `VirtualSurfaceImageSourceUpdatePriority` | 1 | Info | Verbose | Rendering | VirtualSurfaceImageSourceUpdatePriorityData |
| `WindowSizeChanged` | 1 | Info | Informational | Rendering | SimpleWidthHeight |
| `XYFocusCandidateCacheHit` | 1 | Info | Informational | Input | XYFocusWalk |
| `XYFocusEntered` | 2 | Start, Stop | Informational | Input | SimpleEvent, XYFocusWalk |
| `XYFocusNotFound` | 1 | Info | Informational | Input | XYFocusNotFoundData |
| `XYFocusWalk` | 2 | Start, Stop | Informational | Input | SimpleEvent, XYFocusWalk |

## Microsoft-Windows-XAML-Diagnostics

| Family | Events | Opcodes | Levels | Keywords | Payload templates |
|---|---:|---|---|---|---|
| `AppBarClosed` | 2 | Start, Stop | Verbose | (none) | AppBarData, SimpleEvent |
| `AppBarOpen` | 2 | Start, Stop | Verbose | (none) | AppBarData, SimpleEvent |
| `AppWindowReadyForPresentation` | 1 | Info | Informational | DesignerAppManager | SimpleEvent |
| `ArrangeOverride` | 2 | Start, Stop | Verbose | (none) | ElementIdData |
| `AssociateActivationContext` | 1 | Info | Informational | DesignerAppManager | ActivationContext |
| `BeginStoryboardWithSource` | 1 | Info | Verbose | (none) | BeginStoryboardSourceInfoData |
| `ClearAnimation` | 2 | Start, Stop | Verbose | (none) | PropertyData |
| `CueRemoved` | 1 | Info | Informational | (none) | SimpleEvent |
| `DesignerActivation` | 2 | Start, Stop | Informational | DesignerAppManager | ActivationResult, SimpleEvent |
| `DesignerAppViewClose` | 1 | Info | Informational | DesignerAppManager | ViewCloseData |
| `DoubleTapped` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `DragEnter` | 2 | Start, Stop | Verbose | Input | DragHandlerData, HandledData |
| `DragLeave` | 2 | Start, Stop | Verbose | Input | DragHandlerData, HandledData |
| `DragOver` | 2 | Start, Stop | Verbose | Input | DragHandlerData, HandledData |
| `Drop` | 2 | Start, Stop | Verbose | Input | DragHandlerData, HandledData |
| `ElementAccessibility` | 1 | Info | Verbose | (none) | ElementAndParentWithNameAndTypeData |
| `ElementAdded` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `ElementCreatedWithSource` | 2 | Info | Verbose | (none) | ElementCreatedSourceInfoData, ElementWithTypeAndSourceInfoData |
| `ElementRemoved` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `FrameworkElementLoading` | 2 | Start, Stop | Verbose | (none) | SimpleEvent |
| `GetActivationContext` | 1 | Stop | Informational | DesignerAppManager | ActivationContext |
| `Holding` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `ImageSourceRelation` | 1 | Info | Verbose | (none) | ElementAndParentWithNameData |
| `Initialize` | 1 | Stop | Informational | DesignerAppManager | InitializeData |
| `InputEvent` | 2 | Start, Stop | Verbose | Input | SimpleEvent |
| `InvalidateArrange` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `InvalidateMeasure` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `ManipulationCompleted` | 2 | Start, Stop | Verbose | Input | HandledData, ManipulationEventData |
| `ManipulationDelta` | 2 | Start, Stop | Verbose | Input | HandledData, ManipulationEventData |
| `ManipulationInertiaStarting` | 2 | Start, Stop | Verbose | Input | HandledData, ManipulationInertiaEventData |
| `ManipulationStarted` | 2 | Start, Stop | Verbose | Input | HandledData, ManipulationInertiaEventData |
| `ManipulationStarting` | 2 | Start, Stop | Verbose | Input | HandledData, ManipulationStartingEventData |
| `MeasureOverride` | 2 | Start, Stop | Verbose | (none) | ElementIdData |
| `PeerCreated` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `PointerCanceled` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerCaptureLost` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerEntered` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerExited` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerMoved` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerPressed` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerReleased` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PointerWheelChanged` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `PropertyChanged` | 2 | Info | Verbose | (none) | PropertyChangedData, PropertyChangedWithValueData |
| `ResourceDictionaryAddWithSource` | 1 | Info | Verbose | (none) | ResourceDictionaryAddSourceInfoData |
| `ResourceUsingXName` | 1 | Info | Verbose | (none) | ElementAndParentWithNameAndTypeData |
| `RightTapped` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `SetAnimation` | 2 | Start, Stop | Verbose | (none) | PropertyData |
| `SetHostedApp` | 1 | Info | Informational | DesignerAppManager | SimpleEvent |
| `SetHostedAppWindow` | 1 | Info | Informational | DesignerAppManager | HostedWindowData |
| `Tapped` | 2 | Start, Stop | Verbose | Input | HandledData, PointerHandlerData |
| `TextFormatterCreated` | 1 | Info | Informational | (none) | SimpleEvent |
| `TimedTextCue` | 2 | Start, Stop | Informational | (none) | SimpleEvent |
| `TimedTextTrace` | 1 | Info | Informational | (none) | TimedTextData |
| `TimedTextTrack` | 2 | Start, Stop | Informational | (none) | SimpleEvent |
| `UnusedTextFormatterDeleted` | 1 | Info | Informational | (none) | SimpleEvent |
| `UpdateLayout` | 1 | Info | Verbose | (none) | ElementAndParentIdData |
| `UpdateSourceBinding` | 2 | Start, Stop | Verbose | (none) | PropertyBindingData, PropertyData |
| `UpdateTargetBinding` | 3 | Start, Stop | Verbose | (none) | PropertyBindingData, PropertyBindingWithSourceData, PropertyData |
| `UpdateViewSize` | 1 | Info | Informational | DesignerAppManager | UpdateViewSize |
| `UpdateViewState` | 1 | Info | Informational | DesignerAppManager | UpdateViewState |
| `VisualStateManagerGoToState` | 2 | Start, Stop | Verbose | (none) | PropertyData |
