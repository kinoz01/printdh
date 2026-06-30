import { execFile } from "child_process";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";

const MAX_PDF_SIZE = 200 * 1024 * 1024;

const DICTIONARY_KEYS_TO_REMOVE = [
  "AA",
  "AcroForm",
  "AF",
  "Annots",
  "Collection",
  "EmbeddedFiles",
  "JavaScript",
  "Lang",
  "LastModified",
  "MarkInfo",
  "Metadata",
  "Names",
  "OCProperties",
  "OpenAction",
  "Outlines",
  "PageLabels",
  "Perms",
  "PieceInfo",
  "SpiderInfo",
  "StructTreeRoot",
  "Threads",
  "Thumb",
  "ViewerPreferences",
  "XFA",
] as const;

function execFileAsync(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function toArrayBuffer(bytes: Uint8Array) {
  const outputBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(outputBuffer).set(bytes);
  return outputBuffer;
}

function createRandomPdfName() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return `${Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join("")}.pdf`;
}

async function removeMetadataWithGhostscript(inputPath: string, outputPath: string, pdfmarkPath: string) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    "-dSAFER",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-dShowAnnots=false",
    "-dPreserveAnnots=false",
    "-dParseDSCComments=false",
    "-dParseDSCCommentsForDocInfo=false",
    "-dPreserveEPSInfo=false",
    "-dPreserveOPIComments=false",
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
    "-dEmbedAllFonts=true",
    `-sOutputFile=${outputPath}`,
    inputPath,
    pdfmarkPath,
  ];
  await execFileAsync("gs", args);
}

async function writePdfmarkFile(pdfmarkPath: string) {
  await fs.writeFile(
    pdfmarkPath,
    [
      "[ /Title ()",
      "  /Author ()",
      "  /Subject ()",
      "  /Keywords ()",
      "  /Creator ()",
      "  /Producer ()",
      "  /CreationDate ()",
      "  /ModDate ()",
      "  /Trapped /False",
      "  /DOCINFO pdfmark",
      "[{Catalog} <<",
      "  /Metadata null",
      "  /PieceInfo null",
      "  /Names null",
      "  /OpenAction null",
      "  /AA null",
      ">> /PUT pdfmark",
      "",
    ].join("\n"),
    "utf-8"
  );
}

async function scrubPdfMetadata(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const infoRef = pdf.context.trailerInfo.Info;
  if (infoRef) {
    const info = pdf.context.lookup(infoRef);
    if (info instanceof PDFDict) {
      for (const key of info.keys()) {
        info.delete(key);
      }
    }
  }
  pdf.context.trailerInfo.Info = undefined;
  pdf.context.trailerInfo.ID = undefined;

  const keysToRemove = DICTIONARY_KEYS_TO_REMOVE.map((key) => PDFName.of(key));
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) {
      continue;
    }
    for (const key of keysToRemove) {
      object.delete(key);
    }
  }

  return pdf.save({
    updateFieldAppearances: false,
    useObjectStreams: true,
  });
}

export async function POST(request: NextRequest) {
  let tmpDir: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF upload (field name: file)" }, { status: 400 });
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "PDF is too large (max 200MB)" }, { status: 413 });
    }

    const filename = typeof file.name === "string" ? file.name : "upload.pdf";
    if (!filename.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "printdh-rmpdf-"));
    const inputPath = path.join(tmpDir, "input.pdf");
    const ghostscriptPath = path.join(tmpDir, "ghostscript.pdf");
    const pdfmarkPath = path.join(tmpDir, "strip-metadata.ps");
    const inputBytes = new Uint8Array(await file.arrayBuffer());

    await fs.writeFile(inputPath, inputBytes);
    await writePdfmarkFile(pdfmarkPath);
    await removeMetadataWithGhostscript(inputPath, ghostscriptPath, pdfmarkPath);

    const ghostscriptBytes = await fs.readFile(ghostscriptPath);
    const scrubbedBytes = await scrubPdfMetadata(ghostscriptBytes);

    return new NextResponse(toArrayBuffer(scrubbedBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${createRandomPdfName()}"`,
      },
    });
  } catch (error) {
    console.error("Failed to remove PDF metadata", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
        hint: "Server needs Ghostscript (gs) to aggressively rebuild PDFs before metadata cleanup.",
      },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
