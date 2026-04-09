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

#### Option A: ONNX Runtime GenAI (recommended for LLMs)
```powershell
dotnet add package Microsoft.ML.OnnxRuntimeGenAI
# For GPU: dotnet add package Microsoft.ML.OnnxRuntimeGenAI.DirectML
# For NPU: dotnet add package Microsoft.ML.OnnxRuntimeGenAI.QNN
```

#### Option B: ONNX Runtime (for vision, classification, custom models)
```powershell
dotnet add package Microsoft.ML.OnnxRuntime
# For GPU: dotnet add package Microsoft.ML.OnnxRuntime.DirectML
```

#### Option C: WinML (Windows-native, simpler API)
Use `Windows.AI.MachineLearning` namespace — no NuGet needed. Good for simple image classification but limited model format support.

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

```csharp
// Check available EPs at runtime
bool hasDirectML = CheckDirectMLAvailability();
bool hasQNN = CheckQNNAvailability();

// Pick best available
var ep = hasQNN ? "qnn" : hasDirectML ? "dml" : "cpu";
```

| Provider | Hardware | Package Suffix | Notes |
|----------|----------|---------------|-------|
| CPU | Any | (base package) | Always available, slowest |
| DirectML | GPU | `.DirectML` | NVIDIA/AMD/Intel GPUs |
| QNN | NPU | `.QNN` | Snapdragon X Elite/Plus only |

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