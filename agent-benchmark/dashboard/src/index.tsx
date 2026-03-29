import React from "react";
import { render } from "ink";
import { App } from "./app.js";

const args = process.argv.slice(2);
const showResults = args.includes("--results");
const runNameIdx = args.indexOf("--run");
const runName = runNameIdx >= 0 ? args[runNameIdx + 1] : undefined;
const maxBuildIdx = args.indexOf("--max-build-minutes");
const maxBuildMinutes = maxBuildIdx >= 0 ? parseInt(args[maxBuildIdx + 1]) : 60;
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1]) : 3;

render(<App showResultsOnly={showResults} runName={runName} maxBuildMinutes={maxBuildMinutes} concurrency={concurrency} />);
