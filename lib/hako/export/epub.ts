import JSZip from "jszip";
import type { ChapterPayload, NovelData, VolumeInfo } from "@/lib/types";
import {
  escapeXml,
  formatFilename,
  htmlFragmentToXhtml,
  STYLE_CSS,
  summaryToText,
} from "@/lib/hako/utils";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function exportVolumeEpub(
  volume: VolumeInfo,
  novel: NovelData,
  chapters: ChapterPayload[],
): Promise<{ filename: string; blob: Blob }> {
  const zip = new JSZip();
  const bookId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}`;
  const summaryHtml = htmlFragmentToXhtml(novel.summary);
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const manifestItems: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="style" href="styles/style.css" media-type="text/css"/>',
    '<item id="intro" href="text/intro.xhtml" media-type="application/xhtml+xml"/>',
  ];
  const spineItems: string[] = ['<itemref idref="intro"/>'];
  const navPoints: string[] = [
    '<navPoint id="navPoint-intro" playOrder="1"><navLabel><text>Giới thiệu</text></navLabel><content src="text/intro.xhtml"/></navPoint>',
  ];
  const navLinks: string[] = [
    '<li><a href="text/intro.xhtml">Giới thiệu</a></li>',
  ];

  const introXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
  <head>
    <title>${escapeXml(novel.title)} - ${escapeXml(volume.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  </head>
  <body>
    <h1>${escapeXml(novel.title)}</h1>
    <h3>${escapeXml(volume.title)}</h3>
    <div class="intro-box">
      <p><strong>Tác giả:</strong> ${escapeXml(novel.author)}</p>
      <p><strong>Thể loại:</strong> ${escapeXml(novel.genres)}</p>
    </div>
    <div class="summary-box">${summaryHtml}</div>
  </body>
</html>`;

  const chapterFiles: Array<{ path: string; content: string }> = [];
  let playOrder = 2;
  chapters.forEach((chap, index) => {
    const idx = index + 1;
    const chapterId = `chapter_${idx}`;
    const chapterFile = `text/chapter_${String(idx).padStart(3, "0")}.xhtml`;
    const chapterTitle = chap.title || `Chương ${idx}`;
    const chapterBody = htmlFragmentToXhtml(chap.html);
    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
  <head>
    <title>${escapeXml(chapterTitle)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  </head>
  <body>
    <div class="chapter-header">${escapeXml(chapterTitle)}</div>
    ${chapterBody}
  </body>
</html>`;
    chapterFiles.push({ path: chapterFile, content: chapterXhtml });
    manifestItems.push(
      `<item id="${chapterId}" href="${chapterFile}" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`<itemref idref="${chapterId}"/>`);
    navPoints.push(
      `<navPoint id="navPoint-${idx}" playOrder="${playOrder}"><navLabel><text>${escapeXml(chapterTitle)}</text></navLabel><content src="${chapterFile}"/></navPoint>`,
    );
    navLinks.push(
      `<li><a href="${chapterFile}">${escapeXml(chapterTitle)}</a></li>`,
    );
    playOrder += 1;
  });

  const addedImages = new Set<string>();
  let imageId = 1;
  const imageFiles: Array<{ name: string; data: Uint8Array; media: string }> =
    [];
  for (const chap of chapters) {
    for (const img of chap.images) {
      if (addedImages.has(img.name)) continue;
      addedImages.add(img.name);
      const ext = img.name.split(".").pop()?.toLowerCase() || "jpg";
      const mediaType =
        {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
        }[ext] || "image/jpeg";
      imageFiles.push({
        name: img.name,
        data: base64ToUint8Array(img.dataBase64),
        media: mediaType,
      });
      manifestItems.push(
        `<item id="image_${imageId}" href="images/${img.name}" media-type="${mediaType}"/>`,
      );
      imageId += 1;
    }
  }

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(novel.title)} - ${escapeXml(volume.title)}</dc:title>
    <dc:creator>${escapeXml(novel.author)}</dc:creator>
    <dc:language>vi</dc:language>
    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>
    <dc:description>${escapeXml(summaryToText(novel.summary))}</dc:description>
    <dc:date>${createdAt}</dc:date>
  </metadata>
  <manifest>${manifestItems.join(" ")}</manifest>
  <spine toc="ncx">${spineItems.join(" ")}</spine>
</package>`;

  const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(novel.title)} - ${escapeXml(volume.title)}</text></docTitle>
  <navMap>${navPoints.join("")}</navMap>
</ncx>`;

  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
  <head>
    <title>Mục lục</title>
    <link rel="stylesheet" type="text/css" href="styles/style.css"/>
  </head>
  <body>
    <h1>Mục lục</h1>
    <ol>${navLinks.join("")}</ol>
  </body>
</html>`;

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );
  zip.file("OEBPS/content.opf", contentOpf);
  zip.file("OEBPS/toc.ncx", tocNcx);
  zip.file("OEBPS/nav.xhtml", navXhtml);
  zip.file("OEBPS/styles/style.css", STYLE_CSS);
  zip.file("OEBPS/text/intro.xhtml", introXhtml);
  for (const ch of chapterFiles) {
    zip.file(`OEBPS/${ch.path}`, ch.content);
  }
  for (const img of imageFiles) {
    zip.file(`OEBPS/images/${img.name}`, img.data);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const filename =
    formatFilename(`${novel.title} - ${volume.title}`) + ".epub";
  return { filename, blob };
}
