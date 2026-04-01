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

### 4. Research and documentation
For EVERY web search, MCP server query, or documentation lookup you performed:
- What did you search for? (exact query or topic)
- What source did you use? (web_search, mslearn docs search, mslearn code samples, GitHub MCP, etc.)
- What did you find? (brief description of results)
- Was it useful? (yes/partially/no)
- If not useful, what was wrong? (outdated, missing, incorrect, truncated, irrelevant, etc.)

### 5. APIs and patterns that failed
List EVERY API, method, class, or code pattern you tried that did NOT work:
- What did you try? (specific API name, method signature, or pattern)
- Why did you think it would work? (training data, docs, web search result, MCP result, copy from example, etc.)
- Why did it fail? (doesn't exist, wrong signature, runtime crash, deprecated, wrong namespace, etc.)
- How did you discover it was wrong? (build error, runtime error, docs, source code inspection, etc.)
- What did you use instead? (the working alternative)

### 6. Time analysis
- What phase took the longest? (understanding requirements, writing code, fixing build errors, UI verification, etc.)
- Were there any time sinks that could have been avoided?

### 7. Quality self-assessment
- How confident are you in the final result?
- What corners did you cut or what would you improve with more time?
- Are there any known issues you didn't fix?

### 8. Suggestions for improvement
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
  "research_queries": [
    {
      "query": "<what you searched for>",
      "source": "<web_search | mslearn_docs_search | mslearn_code_samples | mslearn_docs_fetch | github_mcp | web_fetch | other>",
      "found": "<brief description of what you found>",
      "useful": "<yes | partially | no>",
      "issue": "<if not useful: what was wrong — outdated | missing | incorrect | truncated | irrelevant | too_broad | null>"
    }
  ],
  "failed_apis": [
    {
      "api": "<specific API, method, class, or pattern you tried>",
      "origin": "<why you thought it would work — training_data | docs | web_search | mcp_result | example_code | stackoverflow | guess | other>",
      "reason": "<why it failed — doesnt_exist | wrong_signature | runtime_crash | deprecated | wrong_namespace | version_mismatch | other>",
      "discovery": "<how you found out — build_error | runtime_error | docs | source_inspection | web_search | other>",
      "alternative": "<what you used instead, or null if no alternative found>"
    }
  ],
  "time_sinks": ["<phase or task: why it was slow>"],
  "build_fix_cycles": <number>,
  "confidence_score": <1-10>,
  "known_issues": ["<issue>"],
  "suggestions": ["<suggestion>"],
  "summary": "<2-3 sentence overall assessment>"
}
```
