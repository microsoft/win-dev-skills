You just finished building a WinUI 3 app. Now step back and reflect on the entire session.

## What to Analyze

Look back at everything you did in this session and provide an honest retrospective:

### 1. What went well
- Which parts of the build were smooth and efficient?
- What did you get right on the first try?

### 2. What went wrong
- Where did you get stuck or spend excessive time?
- What errors or failures did you encounter?
- How many build/fix cycles did you need?

### 3. Tools, Skills, and MCP usage
- Which tools did you use most? (shell commands, file edits, web search, etc.)
- Did you use any MCP servers? If so, which ones and for what? If not, why?
- Were there skills/instructions available that you used? Which ones helped most?
- Were there skills/instructions you ignored? Why?
- Were there moments you wished you had a tool or reference you didn't have?

### 4. Time analysis
- What phase took the longest? (understanding requirements, writing code, fixing build errors, UI verification, etc.)
- Were there any time sinks that could have been avoided?

### 5. Quality self-assessment
- How confident are you in the final result?
- What corners did you cut or what would you improve with more time?
- Are there any known issues you didn't fix?

### 6. Suggestions for improvement
- What knowledge, tools, or instructions would have helped you work faster?
- What patterns or templates would have saved time?
- If you could change how you were set up for this task, what would you change?

## Output

After your analysis, output EXACTLY this JSON block:

```json
{
  "what_went_well": ["<item 1>", "<item 2>"],
  "what_went_wrong": ["<item 1>", "<item 2>"],
  "tools_used": ["<tool: description of use>"],
  "tools_not_used": ["<tool: reason not used>"],
  "mcp_servers_used": ["<server: what for>"],
  "skills_used": ["<skill: how it helped>"],
  "skills_ignored": ["<skill: why ignored>"],
  "missing_tools_or_knowledge": ["<what was missing>"],
  "time_sinks": ["<phase or task: why it was slow>"],
  "build_fix_cycles": <number>,
  "confidence_score": <1-10>,
  "known_issues": ["<issue>"],
  "suggestions": ["<suggestion>"],
  "summary": "<2-3 sentence overall assessment>"
}
```
