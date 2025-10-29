"use client";

import { Draggable } from "@/features/uploads/components/file-upload/draggable";

const buildAssetPath = (relativePath: string): string => {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;
  return `${normalizedBase}${normalizedPath}`;
};

export function Examples() {
  return (
    <div data-drag-constraint className="mb-4 flex flex-wrap gap-4 p-4">
      <Draggable
        name="image.jpeg"
        type="image/jpeg"
        fileIconType="image"
        size={1024 * 1024 * 0.5}
        localPath={buildAssetPath("image.jpeg")}
        sourceUrl="https://pbs.twimg.com/media/FzrIJFkWcAE-LIZ?format=jpg&name=small"
      />
      <Draggable
        name="photo.png"
        type="image/png"
        fileIconType="png"
        size={1024 * 1024 * 2.2}
        localPath={buildAssetPath("example2.jpg")}
        sourceUrl="https://i.ibb.co/gM07Z32r/edited-23xxesym0e9w18z2904frnpgy7.jpg"
      />
      <Draggable
        name="Invoice.pdf"
        type="application/pdf"
        fileIconType="application/pdf"
        size={1024 * 1024 * 1.2}
        localPath={buildAssetPath("examples/invoice.pdf")}
        sourceUrl="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
      />
    </div>
  );
}

export default Examples;
