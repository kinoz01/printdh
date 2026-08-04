import {
  concatTransformationMatrix,
  PDFContentStream,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  type PDFPage,
} from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";

const POINTS_PER_INCH = 72;
const TARGET_WIDTH_IN = 8.625;
const TARGET_HEIGHT_IN = 11.25;
const TARGET_WIDTH_POINTS = TARGET_WIDTH_IN * POINTS_PER_INCH;
const TARGET_HEIGHT_POINTS = TARGET_HEIGHT_IN * POINTS_PER_INCH;
const MAX_PDF_SIZE = 500 * 1024 * 1024;
const MAX_SOURCE_SIZE_IN = 100;

class RequestValidationError extends Error {}

export const runtime = "nodejs";

function toResponseArrayBuffer(bytes: Uint8Array) {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  const outputBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(outputBuffer).set(bytes);
  return outputBuffer;
}

function getPageSizeInches(page: PDFPage) {
  const cropBox = page.getCropBox();
  const widthIn = cropBox.width / POINTS_PER_INCH;
  const heightIn = cropBox.height / POINTS_PER_INCH;

  if (
    !Number.isFinite(widthIn) ||
    !Number.isFinite(heightIn) ||
    widthIn <= 0 ||
    heightIn <= 0 ||
    widthIn > MAX_SOURCE_SIZE_IN ||
    heightIn > MAX_SOURCE_SIZE_IN
  ) {
    throw new RequestValidationError(`PDF page size must be between 0 and ${MAX_SOURCE_SIZE_IN} inches`);
  }

  return { widthIn, heightIn };
}

function getValidatedCropBox(page: PDFPage) {
  const cropBox = page.getCropBox();
  getPageSizeInches(page);
  return cropBox;
}

function formatHeaderInches(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function pageHasContent(page: PDFPage) {
  return Boolean(page.node.normalizedEntries().Contents);
}

function wrapPageContentWithTransform(page: PDFPage, xScale: number, yScale: number, xOffset: number, yOffset: number) {
  page.node.normalize();
  const startStream = PDFContentStream.of(page.doc.context.obj({}), [
    pushGraphicsState(),
    concatTransformationMatrix(xScale, 0, 0, yScale, xOffset, yOffset),
  ]);
  const endStream = PDFContentStream.of(page.doc.context.obj({}), [popGraphicsState()]);
  const startRef = page.doc.context.register(startStream);
  const endRef = page.doc.context.register(endStream);
  page.node.wrapContentStreams(startRef, endRef);
}

function stretchPageToTarget(page: PDFPage) {
  const cropBox = getValidatedCropBox(page);
  const xScale = TARGET_WIDTH_POINTS / cropBox.width;
  const yScale = TARGET_HEIGHT_POINTS / cropBox.height;

  if (pageHasContent(page)) {
    wrapPageContentWithTransform(page, xScale, yScale, -cropBox.x * xScale, -cropBox.y * yScale);
  }

  page.setMediaBox(0, 0, TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS);
  page.setCropBox(0, 0, TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS);
  page.setBleedBox(0, 0, TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS);
  page.setTrimBox(0, 0, TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS);
  page.setArtBox(0, 0, TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF upload (field name: file)" }, { status: 400 });
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "PDF is too large (max 500MB)" }, { status: 413 });
    }

    const filename = typeof file.name === "string" ? file.name : "upload.pdf";
    if (!filename.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const sourcePdf = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
    const sourcePages = sourcePdf.getPages();

    if (sourcePages.length === 0) {
      return NextResponse.json({ error: "PDF has no pages" }, { status: 400 });
    }

    const sourceSize = getPageSizeInches(sourcePages[0]);
    for (const sourcePage of sourcePages) {
      stretchPageToTarget(sourcePage);
    }

    sourcePdf.setTitle(`Stretched to ${TARGET_WIDTH_IN}x${TARGET_HEIGHT_IN} in`);
    sourcePdf.setCreator("printdh");
    sourcePdf.setProducer("printdh");

    const outputBytes = await sourcePdf.save({
      updateFieldAppearances: false,
      useObjectStreams: true,
    });

    return new NextResponse(toResponseArrayBuffer(outputBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="stretched-${TARGET_WIDTH_IN}x${TARGET_HEIGHT_IN}.pdf"`,
        "X-Page-Count": String(sourcePages.length),
        "X-Source-Size-In": `${formatHeaderInches(sourceSize.widthIn)}x${formatHeaderInches(sourceSize.heightIn)}`,
        "X-Target-Size-In": `${TARGET_WIDTH_IN}x${TARGET_HEIGHT_IN}`,
      },
    });
  } catch (error) {
    if (!(error instanceof RequestValidationError)) {
      console.error("Failed to stretch PDF to US Letter bleed size", error);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: error instanceof RequestValidationError ? 400 : 500 });
  }
}
