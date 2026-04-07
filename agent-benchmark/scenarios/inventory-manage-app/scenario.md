---
name: inventory-manage-app
description: "Build a WinUI 3 warehouse inventory management LOB app with a dynamic table, CRUD operations, and PDF export"
type: new
app_name: InventoryManager
requirements:
  - "A DataGrid or table view must display inventory items with at least these default columns: Name, SKU, Category, Quantity, Unit Price, and Location"
  - "An Add Row button must append a new blank entry to the table that the user can fill in inline or via a form"
  - "Selecting one or more rows and clicking a Delete button must remove those entries from the table with a confirmation dialog"
  - "An Add Column button must let the user specify a column name and type (text, number, date, or yes/no) and append it to the table"
  - "A Remove Column button or context menu on the column header must let the user delete a user-added column (default columns cannot be removed)"
  - "Double-clicking or right-clicking a column header must allow the user to rename that column inline or via a dialog"
  - "Each column header must support click-to-sort ascending/descending"
  - "A search or filter box must narrow the visible rows by matching across all columns as the user types"
  - "An Export to PDF button must generate a PDF file of the current table contents (respecting any active filters) and open a Save File dialog"
  - "The exported PDF must contain a formatted table with all visible columns and rows, plus a title and export timestamp"
  - "The app must persist inventory data across sessions using a local file (JSON, SQLite, or similar)"
  - "Inline cell editing must work: clicking a cell allows the user to modify its value directly in the table"
---

Build me a warehouse inventory management app. Our warehouse team currently tracks everything in spreadsheets and it's a mess — I need a proper desktop app for it.

The main view should be a big table showing our stock: name, SKU, category, quantity, unit price, and location. Users need to be able to add new items, delete old ones, edit cells right in the table, and sort by clicking column headers. Also need a search box to quickly find stuff.

The key thing is that every warehouse is different, so users need to be able to customize the table — add their own columns (like "Expiry Date" or "Fragile yes/no"), rename columns, and remove ones they added. The default columns should stay though.

We also need a PDF export so managers can print the current view for stocktake meetings. And obviously the data needs to persist between sessions — nobody wants to re-enter hundreds of items every time they open the app.
