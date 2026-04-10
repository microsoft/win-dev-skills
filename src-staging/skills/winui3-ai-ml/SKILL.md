---
name: winui3-ai-ml
description: "Local AI and machine learning for WinUI 3 — ONNX Runtime, WinML, DirectML (GPU), QNN (NPU), model loading, streaming responses, GenAI API, execution provider selection. Use when adding local AI inference, running ONNX models, building chat interfaces, or integrating LLM features into a desktop app. Based on lessons from benchmark experiments with local LLM chat apps."
---

### Overview

Local AI inference runs models entirely on-device — no cloud API needed. The stack:
- **ONNX Runtime** — cross-platform inference engine
- **DirectML** — GPU acceleration (NVIDIA, AMD, Intel)
- **QNN** — Qualcomm NPU acceleration (Snapdragon devices)
- **WinML** — Windows-native ML API (simpler but less flexible)

### Setup

#### Recommended: OnnxRuntimeGenAI.WinML (for LLMs)
```powershell
dotnet add package Microsoft.ML.OnnxRuntimeGenAI.WinML
```
This uses Windows ML as the execution provider, which **automatically selects the best available hardware** (NPU → GPU → CPU). No need to choose between DirectML/QNN packages — WinML handles it. Works on any Windows 11 device.

#### Alternative: Specific hardware targeting
```powershell
# GPU only (DirectML): dotnet add package Microsoft.ML.OnnxRuntimeGenAI.DirectML
# NPU only (QNN):      dotnet add package Microsoft.ML.OnnxRuntimeGenAI.QNN
# CPU only (base):     dotnet add package Microsoft.ML.OnnxRuntimeGenAI
```
Use these only if you need to target a specific execution provider. **Do NOT reference more than one** — they ship conflicting `onnxruntime.dll` files.

#### For vision/classification (non-LLM)
```powershell
dotnet add package Microsoft.ML.OnnxRuntime.DirectML
```

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

With the `.WinML` package, the provider is selected automatically. To check what's being used:

| Provider | Hardware | Package | Auto-selected by WinML? |
|----------|----------|---------|------------------------|
| NPU | Qualcomm NPU | `.WinML` | ✅ Preferred when available |
| DirectML | GPU | `.WinML` | ✅ Fallback from NPU |
| CPU | Any | `.WinML` | ✅ Last resort |

If using a specific package instead of `.WinML`, configure the EP in `genai_config.json`.

### Common Pitfalls

#### Package Conflicts
**Critical:** QNN and DirectML packages both ship `onnxruntime.dll` with different implementations. You cannot reference both in the same project. Pick one based on target hardware.

```xml
<!-- Wrong: both referenced -->
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.DirectML" />
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.QNN" />

<!-- Correct: one EP per build configuration -->
<PackageReference Include="Microsoft.ML.OnnxRuntimeGenAI.DirectML"
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

Based on lessons from benchmark experiments with local LLM chat apps. For model-specific configurations, see `references/` directory.