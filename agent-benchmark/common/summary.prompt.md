You are analyzing benchmark results from testing different AI agent configurations for building WinUI 3 apps.

IMPORTANT: Do NOT create any files. Do NOT use any tools. Just analyze the data below and respond with your analysis as text followed by a JSON block.

## Benchmark Data

{results_data}

## Analysis Required

Analyze ALL the results above and provide:

### 1. Overall Rankings
Rank each condition by average score, noting the trade-off between quality and speed.

### 2. Per-Condition Analysis
For each condition tested:
- Average score across scenarios/models
- Strengths (what it consistently does well)
- Weaknesses (what it consistently fails at)
- Best model pairing

### 3. Common Issues
- Problems that appear across multiple conditions
- Model-specific issues (Opus vs Sonnet patterns)

### 4. Recommendations
- Which approach to use for different goals (speed vs quality vs reliability)
- Specific improvements to try next

## Output Format

After your analysis text, output EXACTLY this JSON block (do NOT write it to a file):

```json
{
  "rankings": [{"condition": "...", "avg_score": 0, "avg_time_minutes": 0, "summary": "..."}],
  "condition_analysis": [{"condition": "...", "strengths": ["..."], "weaknesses": ["..."], "best_model": "...", "notes": "..."}],
  "common_issues": ["..."],
  "model_comparison": {"opus": "...", "sonnet": "..."},
  "recommendations": ["..."],
  "overall_summary": "2-3 sentence takeaway"
}
```
