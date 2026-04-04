## Picture-Book Workbench

This Next.js app wraps the original Python scripts from the root of the repository so you can generate the same PDFs from a browser. It re-implements the shared layout engine (`book_layout.py`), the stacked-facts renderer, the dictionary layout, and the image-only flow with `pdf-lib`. Drop in the same JSON/text files and the UI will call the corresponding renderers.

### Supported layouts

| Mode | Python equivalent | Notes |
| --- | --- | --- |
| Facts (Even) | `generate_book.py` | Even pages carry numbered overlays. |
| Facts (All) | `book_both.py` | Overlays on both odd and even pages. |
| Simple List | `book_list.py` | Short overlays on every page. |
| Title + Description | `book_list_description.py` | Title/description on all pages. |
| Title + Description (Even) | `book_list_description_even.py` | Copy on even pages only. |
| Image Only | `book_empty.py` | Mimics the image sequencer. |
| Stacked Facts | `full_fact_book.py` | Multi-card stacks on even spreads. |
| Dictionary Style | `book_dictionary_kids.py` | Centered 7.7″ squares on white. |

> The separate-description template flow is still handled in Python; everything else ships in this UI.

### File expectations

The app preloads `../data/facts.json`, `../data/list.json`, and `../data/list_description.json` so you can paste/adjust without leaving the browser. The image path defaults to `../images`, but you can point it to any folder relative to the Next.js project root (for example `../COVER` or an absolute path).

### Running locally

1. Install dependencies once:

   ```bash
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Visit [http://localhost:3000](http://localhost:3000) and select the layout mode you want.

### API

The UI calls `POST /api/generate` with a payload like:

```json
{
  "mode": "facts",
  "facts": "[{\"title\": \"The Rocket\", \"summary\": \"...\"}]",
  "imageLibrary": "../images",
  "overlayOpacity": 0.75
}
```

The route returns a PDF buffer with `application/pdf` and a download filename so you can integrate this endpoint elsewhere if needed.
