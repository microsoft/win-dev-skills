Build a WinUI 3 app that allows plugging in the path to an ONNX LLM model, enumerate and select the execution providers for the local device, load the LLM from path, and chat with the model.

Requirements:
- WinUI 3 desktop app with modern Fluent Design (Mica backdrop, custom title bar)
- Model setup panel: text field or Browse button to specify the path to an ONNX model file
- Enumerate available ONNX Runtime execution providers on the current device (CPU, DirectML, CUDA, etc.) and show them in a ComboBox
- Load Model button with a progress indicator (ProgressRing or ProgressBar) while loading
- Chat interface: scrollable message list with user and assistant messages visually distinct
- Text input box with a Send button to submit prompts
- Streaming token display — show tokens as they arrive, not after full generation
- Clear/New Chat button to reset conversation history
- Use Microsoft.ML.OnnxRuntimeGenAI for model inference
- Make sure the app builds and runs
