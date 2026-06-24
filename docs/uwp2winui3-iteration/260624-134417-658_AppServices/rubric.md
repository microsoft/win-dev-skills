# Parity Rubric — App service client sample (`AppServices`)

Ground truth derived from the original UWP app (launched in Release, window
"App Service Client C# sample") and its source under
`uwp-samples-standalone/Samples/AppServices/cs/AppServicesClient`.

## Scenario 1 — Open/Close Connection
Open a connection to an app service that generates a random number between a
minimum and maximum value, generate the number, then dispose the connection.

UI elements:
- `MinValue` (TextBox, default `0`)
- `MaxValue` (TextBox, default `10`)
- `GenerateRandomNumber` (Button) — opens connection, requests a random number,
  shows it in `Result`, then closes the connection.
- `Result` (TextBlock) — output.
- `StatusBlock` (shared status TextBlock).

## Scenario 2 — Keep Connection Open
Open a long-lived `AppServiceConnection`, generate random numbers reusing the
same connection, and close it explicitly.

UI elements:
- `OpenConnection` (Button) — opens and keeps the connection open.
- `CloseConnection` (Button) — closes the connection.
- `MinValue` (TextBox, default `0`)
- `MaxValue` (TextBox, default `10`)
- `GenerateRandomNumber` (Button) — requests a random number over the open
  connection and shows it in `Result`.
- `Result` (TextBlock) — output.
- `StatusBlock` (shared status TextBlock).
