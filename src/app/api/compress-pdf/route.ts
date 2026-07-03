import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";

type QualityPreset = "prepress" | "printer" | "ebook" | "screen";

const MAX_UPLOAD_SIZE_MB = 500;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

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

function normalizeQuality(value: FormDataEntryValue | null): QualityPreset {
  if (typeof value !== "string") {
    return "printer";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "prepress" || normalized === "printer" || normalized === "ebook" || normalized === "screen") {
    return normalized;
  }
  return "printer";
}

async function compressWithGhostscript(inputPath: string, outputPath: string, quality: QualityPreset) {
  // Ghostscript quality presets: /prepress (best), /printer (print), /ebook, /screen (smallest).
  const gsQuality = `/${quality}`;
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.6",
    `-dPDFSETTINGS=${gsQuality}`,
    "-dDetectDuplicateImages=true",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  await execFileAsync("gs", args);
}

async function compressWithQpdf(inputPath: string, outputPath: string) {
  // qpdf can recompress streams/object streams. It won't downsample images like Ghostscript.
  const args = ["--stream-data=compress", "--object-streams=generate", inputPath, outputPath];
  await execFileAsync("qpdf", args);
}

export async function POST(request: NextRequest) {
  let tmpDir: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const quality = normalizeQuality(formData.get("quality"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF upload (field name: file)" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: `PDF is too large (max ${MAX_UPLOAD_SIZE_MB}MB)` }, { status: 413 });
    }

    const filename = typeof file.name === "string" ? file.name : "upload.pdf";
    if (!filename.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "printdh-compress-"));
    const inputPath = path.join(tmpDir, "input.pdf");
    const outputPath = path.join(tmpDir, "output.pdf");
    const inputBytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, inputBytes);

    try {
      await compressWithGhostscript(inputPath, outputPath, quality);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        await compressWithQpdf(inputPath, outputPath);
      } else {
        throw error;
      }
    }

    const outputBytes = await fs.readFile(outputPath);
    const outputBuffer = new ArrayBuffer(outputBytes.byteLength);
    new Uint8Array(outputBuffer).set(outputBytes);
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"compressed.pdf\"",
      },
    });
  } catch (error) {
    console.error("Failed to compress PDF", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
        hint: "Server needs Ghostscript (gs) or qpdf installed to compress PDFs.",
      },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
