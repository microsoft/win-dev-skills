---
name: winui3-ai-ml
description: "Local AI and machine learning for WinUI 3 — Windows ML, ONNX Runtime, execution providers, model loading, streaming responses, GenAI API. Use when adding local AI inference, running ONNX models, building chat interfaces, or integrating LLM features into a desktop app."
---

### Overview

Local AI inference runs models entirely on-device — no cloud API needed.

**Windows ML** (part of Windows App SDK) provides:
- A shared system-wide **ONNX Runtime** — no need to bundle your own
- **Dynamic execution provider (EP) download** — automatically gets the latest hardware-optimized EPs for the user's CPU, GPU, or NPU
- Smaller app downloads — EPs are downloaded on-demand, not shipped with your app

> ⚠️ Do NOT use the legacy `Windows.AI.MachineLearning` namespace (Windows 10 inbox API). Use the new **Windows App SDK** APIs (`Microsoft.Windows.AI.MachineLearning`) and/or the `Microsoft.ML.OnnxRuntimeGenAI.WinML` NuGet package.

### Setup

#### For generative AI (LLMs, text generation)

```powershell
dotnet add package Microsoft.ML.OnnxRuntimeGenAI.WinML
```

This uses Windows ML as the execution provider, which **automatically selects the best available hardware** (NPU → GPU → CPU). No need to choose between DirectML/QNN packages — WinML handles it.

#### For traditional ML (vision, classification, custom ONNX models)

Use the Windows ML APIs directly via Windows App SDK:

```csharp
using Microsoft.Windows.AI.MachineLearning;
using Microsoft.ML.OnnxRuntime;

// Create ORT environment
var envOptions = new EnvironmentCreationOptions { logId = "MyApp" };
using var ortEnv = OrtEnv.CreateInstanceWithOptions(ref envOptions);

// Download and register the best available execution providers
var catalog = ExecutionProviderCatalog.GetDefault();
await catalog.EnsureAndRegisterCertifiedAsync();
```

#### Alternative: Specific hardware targeting (GenAI only)
```powershell
# GPU only (DirectML): dotnet add package Microsoft.ML.OnnxRuntimeGenAI.DirectML
# NPU only (QNN):      dotnet add package Microsoft.ML.OnnxRuntimeGenAI.QNN
# CPU only (base):     dotnet add package Microsoft.ML.OnnxRuntimeGenAI
```
Use these only if you need to target a specific execution provider. **Do NOT reference more than one** — they ship conflicting `onnxruntime.dll` files. Prefer `.WinML` for automatic hardware selection.

### Model Loading (GenAI)

```csharp
var modelPath = Path.Combine(AppContext.BaseDirectory, "Models", "phi-3-mini");

// Load model and tokenizer
using var model = new Model(modelPath);
using var tokenizer = new Tokenizer(model);
```

Model directory must contain `genai_config.json`, tokenizer files, and the `.onnx` model file.

### Streaming Responses

```csharp
public async IAsyncEnumerable<string> GenerateStreamAsync(string prompt)
{
    using var tokens = tokenizer.Encode(prompt);
    using var parameters = new GeneratorParams(model);
    parameters.SetSearchOption("max_length", 2048);
    parameters.SetSearchOption("temperature", 0.7);
    parameters.SetInputSequences(tokens);

    using var generator = new Generator(model, parameters);
    using var stream = new TokenizerStream(tokenizer);

    while (!generator.IsDone())
    {
        generator.ComputeLogits();
        generator.GenerateNextToken();

        var token = stream.Decode(generator.GetSequence(0)[^1]);
        if (!string.IsNullOrEmpty(token))
            yield return token;
    }
}
```

Update UI from the stream:
```csharp
await foreach (var token in service.GenerateStreamAsync(prompt))
{
    dispatcherQueue.TryEnqueue(() =>
    {
        ResponseText += token;
    });
}
```

### Execution Provider Selection

Windows ML handles EP selection automatically:

1. **Hardware detection** — Windows ML identifies compatible EPs for the user's hardware
2. **EP download** — `EnsureAndRegisterCertifiedAsync()` downloads the latest compatible EPs
3. **Automatic selection** — ONNX Runtime picks the best registered EP for each model operation

| Provider | Hardware | Availability |
|----------|----------|-------------|
| Vendor-optimized NPU EP | NPUs (Qualcomm, Intel, AMD) | Windows 11 24H2+ |
| DirectML | GPUs (NVIDIA, AMD, Intel) | All supported Windows versions |
| CPU | Any | Always available (fallback) |

With the `.WinML` GenAI package, this is handled for you. With specific EP packages (DirectML/QNN), configure the EP in `genai_config.json`.

### Common Pitfalls

#### Package Conflicts
**Critical:** GenAI packages ship `onnxruntime.dll` with different implementations. You cannot reference more than one in the same project. Pick one based on target hardware.

```xml
<!-- Wrong: both referenced -->
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.WinML" />
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.DirectML" />

<!-- Correct: one EP per build configuration -->
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.WinML"
                  Condition="'$(RuntimeIdentifier)' != 'win-arm64'" />
```

#### API Version Mismatches
ONNX Runtime GenAI versions must match across packages. Don't mix 0.4.x model configs with 0.5.x runtime — the `genai_config.json` schema changes between versions.

#### EP Availability
Always check if the execution provider is available before using it. Fall back gracefully:
```csharp
try
{
    // Try preferred EP
    var model = new Model(modelPath); // Uses EP from genai_config.json
}
catch (OnnxRuntimeException ex) when (ex.Message.Contains("provider"))
{
    // Fall back to CPU
    // Modify genai_config.json or use CPU-specific model
}
```

#### Memory Management
- Models consume significant RAM (2-8 GB for small LLMs)
- Dispose `Model`, `Tokenizer`, `Generator` with `using` statements
- Run inference on background thread — never block UI
- Consider `x:Load` to defer UI until model is ready

### References

- [Windows ML overview](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/overview)
- [Get started with Windows ML](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/get-started)
- [Run GenAI models with Windows ML](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/run-genai-onnx-models)
- [Windows ML code samples](https://github.com/microsoft/WindowsAppSDK-Samples/tree/main/Samples/WindowsML)
- [ONNX Runtime GenAI](https://github.com/microsoft/onnxruntime-genai)
- For model-specific configurations, see `references/` directory.