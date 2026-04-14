import { discoverScenarios, discoverAgentSetups, AVAILABLE_MODELS } from "../src/runner/config.js";
const scenarios = discoverScenarios();
const agents = discoverAgentSetups();
console.log(`Scenarios (${scenarios.length}): ${scenarios.map(s => s.name).join(", ")}`);
console.log(`Agents (${agents.length}): ${agents.map(a => a.name).join(", ")}`);
console.log(`Models (${AVAILABLE_MODELS.length}): ${AVAILABLE_MODELS.join(", ")}`);
console.log(`Full matrix: ${scenarios.length} × ${agents.length} × ${AVAILABLE_MODELS.length} = ${scenarios.length * agents.length * AVAILABLE_MODELS.length} trials`);
