Use makefile to run:

```bash
make build && make start
```

Put your API keys in an `.env` file:

```md
GOOGLE_CSE_KEY=your_google_key
GOOGLE_CSE_CX=your_google_cx
PIXABAY_API_KEY=your_pixabay_key
PEXELS_API_KEY=your_pexels_key
```

## PDF compression

The compressor defaults to **High res 300dpi** in both the UI and API (including
missing or invalid quality values). This preset preserves source image resolution
by disabling color, grayscale, and monochrome downsampling. It uses Prepress's
automatic image compression (including lossy JPEG when appropriate), rather than
forcing lossless encoding, and allows existing JPEG/JPX images to pass through.
Preserving resolution does not guarantee lossless image quality or the same file
size as lower-resolution presets.

This preserves 300 DPI or higher images; it does not upscale lower-resolution
images or restore missing detail. Effective print DPI depends on the original
image dimensions and their physical size on the PDF page. The existing Printer,
Prepress, eBook, and Screen presets remain available. If Ghostscript is unavailable,
the qpdf fallback recompresses streams without downsampling images.

## PDF metadata

Every PDF output (book generation, uploaded image/PDF pages, browser merging,
ebook conversion, compression, resizing, and metadata removal) uses `PDF Creator`
for both Creator and Producer. CreationDate and ModDate are set to the export
time; original document info fields (including Title, Author, Subject, Keywords,
and custom fields), XMP metadata streams, and trailer document IDs are removed.

This standardizes document metadata, not the complete file: page content, fonts,
images, annotations, and attachments can still contain identifying information.
It does not make files byte-identical or guarantee anonymity. The metadata-removal
tool additionally rebuilds PDFs and strips annotations, attachments, and forms.
