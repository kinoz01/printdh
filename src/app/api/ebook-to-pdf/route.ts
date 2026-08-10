import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { MissingChromeError, convertEpubToPdfWithChrome } from "@/lib/ebook/epub-to-pdf";

const MAX_EBOOK_SIZE_MB = 300;
const MAX_EBOOK_SIZE_BYTES = MAX_EBOOK_SIZE_MB * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 5 * 60 * 1000;

const LOCAL_EBOOK_CONVERT_CANDIDATES = [
  path.join(process.cwd(), "tools", "calibre", "ebook-convert"),
  path.join(process.cwd(), "tools", "calibre", "calibre", "ebook-convert"),
  path.join(process.cwd(), "vendor", "calibre", "ebook-convert"),
  path.join(process.cwd(), "vendor", "calibre", "calibre", "ebook-convert"),
];

const SUPPORTED_EBOOK_EXTENSIONS = new Set([
  ".epub",
  ".mobi",
  ".azw",
  ".azw3",
  ".fb2",
  ".lit",
  ".lrf",
  ".pdb",
  ".pml",
  ".rb",
  ".rtf",
  ".txt",
  ".html",
  ".htm",
  ".docx",
  ".odt",
]);

type ExecFileFailure = NodeJS.ErrnoException & {
  stderr?: string;
  stdout?: string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

export const runtime = "nodejs";

function getLocalLibraryPath() {
  return path.join(process.cwd(), "tools", "calibre-libs", "usr", "lib", "x86_64-linux-gnu");
}

function createProcessEnv() {
  const localLibraryPath = getLocalLibraryPath();
  const existingLibraryPath = process.env.LD_LIBRARY_PATH;

  return {
    ...process.env,
    LD_LIBRARY_PATH: existingLibraryPath ? `${localLibraryPath}:${existingLibraryPath}` : localLibraryPath,
  };
}

function execFileAsync(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        env: createProcessEnv(),
        maxBuffer: 2 * 1024 * 1024,
        timeout: CONVERSION_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error) {
          const execError = error as ExecFileFailure;
          execError.stdout = stdout;
          execError.stderr = stderr;
          reject(execError);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

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

function getSupportedExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return SUPPORTED_EBOOK_EXTENSIONS.has(extension) ? extension : null;
}

function toSafeBasename(name: string) {
  const trimmed = name.trim() || "ebook";
  const withoutExtension = trimmed.slice(0, trimmed.length - path.extname(trimmed).length) || "ebook";
  return withoutExtension
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "ebook";
}

function cleanProcessOutput(value: string | undefined) {
  return (value || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join(" ")
    .slice(0, 1400);
}

function isMissingExecutableError(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function findEbookConvertCommand() {
  if (process.env.EBOOK_CONVERT_PATH) {
    return process.env.EBOOK_CONVERT_PATH;
  }

  for (const candidate of LOCAL_EBOOK_CONVERT_CANDIDATES) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep looking for a repo-local Calibre install.
    }
  }

  return "ebook-convert";
}

function createConversionArgs(inputPath: string, outputPath: string) {
  return [
    inputPath,
    outputPath,
    "--paper-size",
    "letter",
    "--pdf-page-margin-left",
    "54",
    "--pdf-page-margin-right",
    "54",
    "--pdf-page-margin-top",
    "54",
    "--pdf-page-margin-bottom",
    "54",
    "--pdf-default-font-size",
    "12",
    "--pdf-mono-font-size",
    "11",
    "--preserve-cover-aspect-ratio",
    "--subset-embedded-fonts",
  ];
}

function createErrorResponse(error: unknown) {
  const execError = error as ExecFileFailure | undefined;

  if (error instanceof MissingChromeError) {
    return NextResponse.json(
      {
        error: "Chrome is not available for EPUB fallback conversion.",
        hint: "Install Google Chrome or Chromium, or install Calibre and make ebook-convert available on PATH.",
      },
      { status: 500 }
    );
  }

  if (isMissingExecutableError(error)) {
    return NextResponse.json(
      {
        error: "Calibre ebook-convert is not installed.",
        hint: "Install Calibre into tools/calibre, make ebook-convert available on PATH, or set EBOOK_CONVERT_PATH to the full executable path.",
      },
      { status: 500 }
    );
  }

  if (execError?.killed || execError?.signal === "SIGTERM") {
    return NextResponse.json(
      {
        error: "Conversion timed out.",
        hint: "Try a smaller ebook or run the conversion on a server with a longer request timeout.",
      },
      { status: 504 }
    );
  }

  const output = cleanProcessOutput(execError?.stderr || execError?.stdout);
  const drmHint = /drm|encrypted|locked|rights/i.test(output)
    ? "DRM-protected or encrypted ebooks cannot be converted by this tool."
    : "Calibre could not convert this ebook. Try validating the file in Calibre desktop if the problem persists.";

  return NextResponse.json(
    {
      error: output || (error instanceof Error ? error.message : "Unable to convert ebook to PDF."),
      hint: drmHint,
    },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  let tmpDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing ebook upload (field name: file)" }, { status: 400 });
    }

    if (file.size > MAX_EBOOK_SIZE_BYTES) {
      return NextResponse.json({ error: `Ebook is too large (max ${MAX_EBOOK_SIZE_MB}MB)` }, { status: 413 });
    }

    const filename = typeof file.name === "string" ? file.name : "upload.epub";
    const extension = getSupportedExtension(filename);
    if (!extension) {
      return NextResponse.json(
        {
          error: "Unsupported ebook format.",
          hint: "Use EPUB, MOBI, AZW3, AZW, FB2, LIT, LRF, PDB, PML, RB, RTF, TXT, HTML, DOCX, or ODT.",
        },
        { status: 400 }
      );
    }

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "printdh-ebook2pdf-"));
    const inputPath = path.join(tmpDir, `input${extension}`);
    const outputPath = path.join(tmpDir, "output.pdf");
    const inputBytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, inputBytes);

    let converter = "calibre";
    try {
      const ebookConvertCommand = await findEbookConvertCommand();
      await execFileAsync(ebookConvertCommand, createConversionArgs(inputPath, outputPath));
    } catch (error) {
      if (!isMissingExecutableError(error) || extension !== ".epub") {
        throw error;
      }

      converter = "chrome-epub-fallback";
      await convertEpubToPdfWithChrome(inputPath, outputPath, tmpDir);
    }

    const outputBytes = await fs.readFile(outputPath);
    if (outputBytes.byteLength === 0) {
      return NextResponse.json({ error: "Converted PDF was empty." }, { status: 500 });
    }

    const downloadName = `${toSafeBasename(filename)}.pdf`;
    return new NextResponse(toResponseArrayBuffer(outputBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "X-Output-Settings": `converter=${converter};paper-size=letter;margin=54pt;font-size=12px`,
      },
    });
  } catch (error) {
    console.error("Failed to convert ebook to PDF", error);
    return createErrorResponse(error);
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
