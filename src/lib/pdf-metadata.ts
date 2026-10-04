import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRef, PDFStream, type SaveOptions } from "pdf-lib";

export async function savePdfWithGenericMetadata(pdf: PDFDocument, options?: SaveOptions): Promise<Uint8Array> {
  await pdf.flush();

  const infoRef = pdf.context.trailerInfo.Info;
  const info = infoRef ? pdf.context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) {
    for (const key of info.keys()) {
      info.delete(key);
    }
  }
  pdf.context.trailerInfo.ID = undefined;

  const metadataKey = PDFName.of("Metadata");
  const metadataRefs = new Set<PDFRef>();
  const visited = new Set<PDFObject>();

  function removeMetadata(object: PDFObject) {
    if (visited.has(object)) return;
    visited.add(object);

    if (object instanceof PDFStream) {
      removeMetadata(object.dict);
    } else if (object instanceof PDFDict) {
      const metadata = object.get(metadataKey);
      if (metadata instanceof PDFRef) metadataRefs.add(metadata);
      object.delete(metadataKey);
      for (const [, value] of object.entries()) {
        removeMetadata(value);
      }
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) {
        removeMetadata(value);
      }
    }
  }

  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (object instanceof PDFStream && object.dict.get(PDFName.of("Type")) === metadataKey) {
      metadataRefs.add(ref);
    }
    removeMetadata(object);
  }
  for (const ref of metadataRefs) {
    pdf.context.delete(ref);
  }

  const now = new Date();
  pdf.setCreator("PDF Creator");
  pdf.setProducer("PDF Creator");
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  return pdf.save(options);
}

export async function normalizePdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  return savePdfWithGenericMetadata(pdf, { updateFieldAppearances: false, useObjectStreams: true });
}
